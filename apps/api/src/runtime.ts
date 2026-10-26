import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import {
  commandEnvelopeSchema,
  advanceImageDeckWorkflow,
  blueprintSchema,
  createImageDeckWorkflow,
  creationBriefSchema,
  inspectPresentation,
  GENERATION_WORKFLOW_VERSION,
  generationInputHash,
  generationRunInputSchema,
  qualityProfileSchema,
  presentationDocumentSchema,
  skillCatalog,
  templateCatalog,
  thirdPartyCatalog,
  executableTemplateCatalog,
  executableSkillCatalog,
  seedAssetCatalog,
  RevisionConflictError,
  ScopeViolationError,
  type CommandEnvelope,
  type Blueprint,
  type CreationBrief,
  type PresentationDocument,
  type PresentationModelAdapter,
  type ImageDeckWorkflow,
} from "@aippt/core";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { MockBillingProvider } from "./billing/mock-provider.js";
import { BillingProviderUnavailableError, UnavailableBillingProvider, type BillingProvider } from "./billing/provider.js";
import { COMMERCIAL_PLANS } from "./commercial/config.js";
import { CommercialError, CommercialService } from "./commercial/service.js";
import type { AnalyticsEventName, CheckoutRecord, PlanEntitlements, ResumeAction } from "./commercial/types.js";
import { CreatorMessageService } from "./creator/messages.js";
import type { AppStore, ExportFormat, ExportRecord, JobRecord, ProductionPostgresAdapter, QualityReportRecord } from "./contracts.js";
import { PGliteAppStore } from "./db/pglite-store.js";
import { PptxExportService } from "./export/pptx-exporter.js";
import { HttpSlideRenderService, type SlideRenderService } from "./export/slide-renderer.js";
import { JobProcessor, QualityGateFailedError } from "./jobs/processor.js";
import { GenerationWorkflowStepExecutor, PresentationGenerationModule, structuredModelPort } from "./generation/module.js";
import { LicensedAssetPort, ObjectArtifactStorePort, PersistedEvidencePort, PngArchiveRenderPort, RoutingVisualReviewPort, TransportStructuredModelPort, type StructuredModelPort } from "./generation/ports.js";
import { createModelAdapter } from "./model/index.js";
import { OpenAICompatibleTransport } from "./model/openai-compatible.js";
import { OpenAIResponsesTransport } from "./model/openai-responses.js";
import { createObjectStore, type ObjectStore } from "./storage/object-store.js";
import { createResourceModule, InMemoryResourceStore, type ResourceRecord, type SkillPackageManifestV2 } from "./resources/index.js";
import { parseUpload, UploadParseError } from "./upload/index.js";
import { CapabilityModelRouter } from "./workflow/model-router.js";
import { AGENT_DEFINITIONS, DeterministicWorkflowStepExecutor, PresentationWorkflow, UnavailableWorkflowStepExecutor, type WorkflowStepExecutor } from "./workflow/presentation-workflow.js";

class ResourceNotFoundError extends Error {
  readonly statusCode = 404;
}
class FeatureDisabledError extends Error { readonly statusCode = 409; }
class AuthenticationError extends Error { readonly statusCode = 401; readonly code = "AUTHENTICATION_REQUIRED"; }

const idParamsSchema = z.object({ id: z.string().min(1) });
const projectParamsSchema = z.object({ projectId: z.string().min(1) });

export interface BackendServices {
  store: AppStore;
  model: PresentationModelAdapter;
  objects: ObjectStore;
  jobs: JobProcessor;
  commercial: CommercialService;
  billing: BillingProvider;
  workflow: PresentationWorkflow;
  generation: PresentationGenerationModule;
  assets: LicensedAssetPort;
  close(): Promise<void>;
}

export interface BackendOptions {
  env?: NodeJS.ProcessEnv;
  store?: AppStore;
  model?: PresentationModelAdapter;
  objects?: ObjectStore;
  slideRenderer?: SlideRenderService;
  postgres?: ProductionPostgresAdapter;
  billingProvider?: BillingProvider;
  workflowExecutor?: WorkflowStepExecutor;
}

function v2QualityGateEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.AIPPT_ENFORCE_QUALITY_GATE_V2 !== undefined) return env.AIPPT_ENFORCE_QUALITY_GATE_V2 !== "false";
  if (env.NODE_ENV === "production") return true;
  return env.FEATURE_GENERATION_WORKFLOW_V2 === "true";
}

function assertProductionAuthConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const header = env.AUTH_TRUSTED_USER_HEADER?.toLowerCase();
  if (!header || !/^[a-z0-9-]{3,64}$/.test(header) || header === "x-user-id" || header === "x-aippt-user-id") throw new Error("Production requires AUTH_TRUSTED_USER_HEADER from a trusted authentication proxy");
  if (!env.AUTH_PROXY_SHARED_SECRET || env.AUTH_PROXY_SHARED_SECRET.length < 16) throw new Error("Production requires AUTH_PROXY_SHARED_SECRET (minimum 16 characters)");
}

export async function createBackendServices(options: BackendOptions = {}): Promise<BackendServices> {
  const env = options.env ?? process.env;
  assertProductionAuthConfig(env);
  let store = options.store;
  if (!store) {
    if (env.DATABASE_MODE === "pg") {
      if (!options.postgres) throw new Error("DATABASE_MODE=pg requires a ProductionPostgresAdapter");
      store = await options.postgres.createStore();
    } else {
      store = new PGliteAppStore(env.PGLITE_PATH ?? resolve(env.INIT_CWD ?? process.cwd(), ".data/aippt-db"));
    }
  }
  await store.init();
  const objects = options.objects ?? createObjectStore(env);
  const slideRenderer = options.slideRenderer ?? new HttpSlideRenderService(env.WEB_ORIGIN ?? "http://localhost:3000");
  const billing = env.NODE_ENV === "production"
    ? options.billingProvider?.mode === "production" ? options.billingProvider : new UnavailableBillingProvider()
    : options.billingProvider ?? new MockBillingProvider();
  const model = options.model ?? createModelAdapter(env);
  const defaultStructuredModel = structuredModelPort(model);
  const structuredModels: Record<string, StructuredModelPort> = {};
  if (defaultStructuredModel) structuredModels[model.name] = defaultStructuredModel;
  const configuredModelIds = [...new Set([env.OPENAI_MODEL, env.AIPPT_REASONING_MODEL, env.AIPPT_FAST_MODEL, env.AIPPT_VISION_MODEL].filter((value): value is string => Boolean(value?.trim())))];
  for (const modelId of configuredModelIds) {
    const port = env.OPENAI_API_KEY
      ? new TransportStructuredModelPort(new OpenAIResponsesTransport({ apiKey: env.OPENAI_API_KEY, model: modelId }))
      : env.OPENAI_COMPATIBLE_API_KEY && env.OPENAI_COMPATIBLE_BASE_URL
        ? new TransportStructuredModelPort(new OpenAICompatibleTransport({ apiKey: env.OPENAI_COMPATIBLE_API_KEY, baseUrl: env.OPENAI_COMPATIBLE_BASE_URL, model: modelId }))
        : undefined;
    if (port) { structuredModels[modelId] = port; structuredModels[port.name] = port; }
  }
  const artifacts = new ObjectArtifactStorePort(objects);
  const render = new PngArchiveRenderPort(slideRenderer, artifacts);
  const assets = new LicensedAssetPort(globalThis.fetch, env.PEXELS_API_KEY, env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY, model: env.AIPPT_IMAGE_MODEL || env.OPENAI_MODEL || "gpt-5.6-terra" } : undefined);
  const visualReview = new RoutingVisualReviewPort(structuredModels, defaultStructuredModel);
  const generationExecutor = new GenerationWorkflowStepExecutor({ model, ...(defaultStructuredModel ? { structuredModel: defaultStructuredModel } : {}), structuredModels, evidence: new PersistedEvidencePort(store), assets, render, artifacts, visualReview });
  const workflowExecutor = options.workflowExecutor ?? (env.FEATURE_GENERATION_WORKFLOW_V2 === "true" ? generationExecutor : env.NODE_ENV === "production" ? new UnavailableWorkflowStepExecutor() : new DeterministicWorkflowStepExecutor());
  const workflow = new PresentationWorkflow(store, new CapabilityModelRouter(env, model.name), workflowExecutor);
  const generation = new PresentationGenerationModule(workflow);
  const commercial = new CommercialService(store);
  const jobs = new JobProcessor(store, objects, new PptxExportService(), slideRenderer, undefined, generation, commercial, v2QualityGateEnabled(env), render, visualReview);
  return { store, model, objects, jobs, commercial, billing, workflow, generation, assets, close: () => store.close() };
}

export interface ApiOptions extends BackendOptions {
  inlineJobs?: boolean;
  logger?: boolean;
}

function bodyOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function commandList(value: unknown): CommandEnvelope[] {
  const body = bodyOrEmpty(value);
  if (Array.isArray(body.commands)) return body.commands.map((item) => commandEnvelopeSchema.parse(item));
  if (body.command) return [commandEnvelopeSchema.parse(body.command)];
  return [commandEnvelopeSchema.parse(value)];
}

function publicJob(job: JobRecord): JobRecord {
  return job;
}

function publicExport(record: ExportRecord): ExportRecord {
  return record;
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left); const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function resolveRequestUserId(request: { headers: Record<string, string | string[] | undefined> }, env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === "production") {
    const providedSecret = request.headers["x-aippt-auth-proxy-secret"];
    const secret = Array.isArray(providedSecret) ? providedSecret[0] : providedSecret;
    if (!secret || !env.AUTH_PROXY_SHARED_SECRET || !secureEqual(secret, env.AUTH_PROXY_SHARED_SECRET)) throw new AuthenticationError("A trusted authentication proxy is required");
    const trustedHeader = env.AUTH_TRUSTED_USER_HEADER!.toLowerCase();
    const value = request.headers[trustedHeader];
    const userId = Array.isArray(value) ? value[0] : value;
    if (typeof userId !== "string" || !/^[A-Za-z0-9._:@-]{1,128}$/.test(userId)) throw new AuthenticationError("The trusted authentication proxy did not provide a valid user");
    return userId;
  }
  const value = request.headers["x-aippt-user-id"] ?? request.headers["x-user-id"];
  const userId = Array.isArray(value) ? value[0] : value;
  return typeof userId === "string" && /^[A-Za-z0-9._:@-]{1,128}$/.test(userId) ? userId : "local-demo-user";
}

export function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) return false;
  const address = value.toLowerCase().split("%")[0];
  return address === "127.0.0.1" || address === "::1" || address === "0:0:0:0:0:0:0:1" || address === "::ffff:127.0.0.1";
}

function publicEntitlements(value: PlanEntitlements) {
  return {
    ...value,
    maxPages: value.maxPagesPerPresentation,
    textModel: value.textModels.includes("advanced") ? "advanced" : "standard",
    imageModel: value.imageModels.includes("advanced") ? "advanced" : "standard",
    brandedPptx: !value.unbrandedPptx,
    pdf: value.exportFormats.includes("pdf"),
    png: value.exportFormats.includes("png"),
  };
}

function resourceHash(id: string, version: string): string { return createHash("sha256").update(`${id}@${version}`).digest("hex"); }

function builtinResourceRecords(): ResourceRecord[] {
  const now = "2026-08-23T00:00:00.000Z";
  const templates: ResourceRecord[] = executableTemplateCatalog.map((item) => ({
    manifest: { schemaVersion: 2, id: item.id, version: item.version, kind: item.type === "native-pptx" ? "native-pptx" : item.type === "html" ? "html-deck" : "image-style", name: item.name, summary: item.description, author: { name: item.author.name }, license: "MIT", access: item.accessTier, ...(item.priceCny ? { priceCny: item.priceCny } : {}), tags: item.tags, industries: [], previewKeys: [item.previewPath.replace("assets/resource-library", "/resource-library")], contentSha256: resourceHash(item.id, item.version), capabilities: Object.entries(item.capabilities).filter(([, enabled]) => enabled).map(([name]) => name), createdAt: now },
    ownerId: "aippt-studio", visibility: "public", status: "auto-reviewed", rightsAttestedAt: now, moderationReasons: [], installedBy: [], updatedAt: now,
  }));
  const skills: ResourceRecord[] = executableSkillCatalog.map((item) => ({
    manifest: { schemaVersion: 2, id: item.id, version: item.version, kind: "skill", name: item.name, summary: item.description, author: { name: "AIPPT Studio" }, license: "MIT", access: item.accessTier, tags: ["skill", item.id.split(".").at(-1) ?? "ppt"], industries: [], previewKeys: [], contentSha256: resourceHash(item.id, item.version), capabilities: ["declarative", "one-shot-agent", ...item.allowedTools], createdAt: now },
    ownerId: "aippt-studio", visibility: "public", status: "auto-reviewed", rightsAttestedAt: now, moderationReasons: [], installedBy: [], updatedAt: now,
  }));
  const assets: ResourceRecord[] = seedAssetCatalog.map((item) => ({
    manifest: { schemaVersion: 2, id: item.id, version: item.version, kind: "media", name: item.name, summary: `${item.category} · 1600×900 离线原创种子视觉`, author: { name: "AIPPT Studio" }, license: "MIT", access: "free", tags: [item.category, "offline", "16:9"], industries: [item.category], previewKeys: [item.previewPath.replace("assets/resource-library", "/resource-library")], contentSha256: resourceHash(item.id, item.version), capabilities: ["offline", "crop-safe", "hero"], createdAt: now },
    ownerId: "aippt-studio", visibility: "public", status: "auto-reviewed", rightsAttestedAt: now, moderationReasons: [], installedBy: [], updatedAt: now,
  }));
  const editorialResources = [
    { id: "showcase-pazhou-native", kind: "showcase" as const, name: "琶洲 2035 · 原生可编辑版", summary: "10 页城市韧性试点决策案例；图形、文字与备注可编辑。", sourceUrl: "https://www.gz.gov.cn/gzszfcwhy/2019ngzszfcwhy/cwhy/2019n/11y/15j090ccwhy/xgbd/content/post_5556988.html", tags: ["城市韧性", "决策稿", "pptx"], preview: "/resource-library/previews/tpl-native-civic-city.svg" },
    { id: "showcase-pazhou-html", kind: "showcase" as const, name: "琶洲 2035 · 网页地图叙事", summary: "同一 Brief 的离线 Reveal HTML 版本，用于跨设备演示。", sourceUrl: "https://revealjs.com/", tags: ["地图故事", "离线 HTML", "reveal"], preview: "/resource-library/previews/tpl-html-map-story.svg" },
    { id: "showcase-pazhou-image", kind: "showcase" as const, name: "琶洲 2035 · 图片混合版", summary: "AI 主视觉与可编辑关键文字叠加的混合式 PPTX。", sourceUrl: "https://openai.com/image-generation/", tags: ["AI 主视觉", "混合编辑", "城市"], preview: "/resource-library/previews/tpl-image-future-architecture.svg" },
    { id: "website-openverse", kind: "website" as const, name: "Openverse", summary: "开放许可图片搜索；导入前仍需核对单项作品的许可证与署名。", sourceUrl: "https://openverse.org/", tags: ["开放许可", "图片搜索"], preview: "" },
    { id: "website-wikimedia-commons", kind: "website" as const, name: "Wikimedia Commons", summary: "公共领域及自由许可媒体库，适合事实性与历史性视觉素材。", sourceUrl: "https://commons.wikimedia.org/", tags: ["公共领域", "百科图片"], preview: "" },
    { id: "website-pexels", kind: "website" as const, name: "Pexels", summary: "商业图库搜索适配器；按请求导入并保留摄影师与来源链接。", sourceUrl: "https://www.pexels.com/api/", tags: ["摄影", "API"], preview: "" },
    { id: "website-pixabay", kind: "website" as const, name: "Pixabay", summary: "图片和插画搜索接口；使用时遵循平台 API 与内容许可证。", sourceUrl: "https://pixabay.com/api/docs/", tags: ["图片", "插画", "API"], preview: "" },
    { id: "website-unsplash", kind: "website" as const, name: "Unsplash", summary: "仅用于搜索预览与按需调用，不批量镜像为离线图库。", sourceUrl: "https://unsplash.com/developers", tags: ["摄影", "搜索预览"], preview: "" },
    { id: "website-reveal", kind: "website" as const, name: "Reveal.js", summary: "MIT 许可的 HTML 演示框架，本网站离线网页 PPT 的基础能力之一。", sourceUrl: "https://revealjs.com/", tags: ["HTML PPT", "MIT"], preview: "" },
    { id: "website-marp", kind: "website" as const, name: "Marp", summary: "基于 Markdown 的演示生态，用于研究内容到幻灯片的可移植工作流。", sourceUrl: "https://marp.app/", tags: ["Markdown", "演示"], preview: "" },
    { id: "website-presenton", kind: "website" as const, name: "Presenton", summary: "Apache-2.0 开源演示生成项目；仅借鉴合规的模型配置与导出思想。", sourceUrl: "https://github.com/presenton/presenton", tags: ["开源", "Apache-2.0"], preview: "" },
  ].map((item): ResourceRecord => ({
    manifest: { schemaVersion: 2, id: item.id, version: "1.0.0", kind: item.kind, name: item.name, summary: item.summary, author: { name: "AIPPT Editorial" }, source: { url: item.sourceUrl }, license: "Proprietary-Platform-License", access: "free", tags: item.tags, industries: [], previewKeys: item.preview ? [item.preview] : [], contentSha256: resourceHash(item.id, "1.0.0"), capabilities: item.kind === "website" ? ["external-link", "official-source"] : ["self-generated", "acceptance-evidence"], createdAt: now },
    ownerId: "aippt-studio", visibility: "public", status: "auto-reviewed", rightsAttestedAt: now, moderationReasons: [], installedBy: [], updatedAt: now,
  }));
  return [...templates, ...skills, ...assets, ...editorialResources];
}

export async function createApi(options: ApiOptions = {}): Promise<FastifyInstance> {
  const services = await createBackendServices(options);
  const runtimeEnv = options.env ?? process.env;
  const inlineJobsEnabled = options.inlineJobs ?? runtimeEnv.NODE_ENV !== "production";
  const enforceV2QualityGate = v2QualityGateEnabled(runtimeEnv);
  const requestUserId = (request: { headers: Record<string, string | string[] | undefined> }) => resolveRequestUserId(request, runtimeEnv);
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 30 * 1024 * 1024 });
  const resourceStore = new InMemoryResourceStore();
  for (const record of builtinResourceRecords()) await resourceStore.putResource(record);
  const seedAssets = seedAssetCatalog.map((item) => ({ provider: "seed", providerAssetId: item.id, title: item.name, previewUrl: item.previewPath.replace("assets/resource-library", "/resource-library"), sourceUrl: item.previewPath, author: { name: "AIPPT Studio" }, license: "MIT" as const, width: item.width, height: item.height, requiresAttribution: true, importable: true }));
  const resourceModule = createResourceModule({ store: resourceStore, objects: services.objects, seedAssets });
  const creatorMessages = new CreatorMessageService();
  const allowedToolMap = { "brief.read": "presentation.read", "evidence.search": "research.search", "assets.search": "assets.search", "presentation.read": "presentation.read", "presentation.patch": "presentation.patch", "render.inspect": "presentation.read" } as const;
  for (const item of executableSkillCatalog) {
    const manifest: SkillPackageManifestV2 = { schemaVersion: 2, id: item.id, version: item.version, name: item.name, description: item.description, allowedTools: [...new Set(item.allowedTools.map((tool) => allowedToolMap[tool]))], execution: "declarative", inputSchema: { type: "object" }, outputSchema: { type: "object" } };
    resourceModule.skills.register(manifest, async (payload, context) => ({ skillId: item.id, status: "completed", allowedTools: context.allowedTools, payload, summary: `${item.name} 已在一次性声明式上下文中执行；未开放宿主 Shell、文件系统或密钥。` }));
  }
  if (runtimeEnv.NODE_ENV === "production") app.addHook("onRequest", async (request) => { if (request.url.startsWith("/api/")) requestUserId(request); });
  const templateCandidates = new Map<string, { id: string; status: "awaiting_confirmation" | "confirmed"; filename: string; analysis: Record<string, unknown>; manifest: Record<string, unknown> }>();
  const imageDeckWorkflows = new Map<string, ImageDeckWorkflow>();
  const origin = (options.env ?? process.env).WEB_ORIGIN ?? "http://localhost:3000";
  const recordServerEvent = async (...args: Parameters<CommercialService["recordEvent"]>): Promise<void> => {
    try { await services.commercial.recordEvent(...args); } catch { /* Analytics must not corrupt the primary transaction. */ }
  };
  const requireOwnedProject = async (request: { headers: Record<string, string | string[] | undefined> }, projectId: string) => {
    const project = await services.store.getProject(projectId);
    if (!project || project.ownerUserId !== requestUserId(request)) throw new ResourceNotFoundError(`Project ${projectId} was not found`);
    return project;
  };
  const requireOwnedPresentation = async (request: { headers: Record<string, string | string[] | undefined> }, presentationId: string) => {
    const presentation = await services.store.getPresentation(presentationId);
    if (!presentation) throw new ResourceNotFoundError(`Presentation ${presentationId} was not found`);
    await requireOwnedProject(request, presentation.projectId);
    return presentation;
  };
  const requireOwnedJob = async (request: { headers: Record<string, string | string[] | undefined> }, jobId: string) => {
    const job = await services.store.getJob(jobId);
    if (!job) throw new ResourceNotFoundError(`Job ${jobId} was not found`);
    await requireOwnedProject(request, job.projectId);
    return job;
  };
  const requireOwnedExport = async (request: { headers: Record<string, string | string[] | undefined> }, exportId: string) => {
    const record = await services.store.getExport(exportId);
    if (!record || record.userId !== requestUserId(request)) throw new ResourceNotFoundError(`Export ${exportId} was not found`);
    await requireOwnedProject(request, record.projectId);
    return record;
  };
  const requireOwnedWorkflowRun = async (request: { headers: Record<string, string | string[] | undefined> }, runId: string) => {
    const run = await services.workflow.getRun(runId);
    if (!run || run.ownerUserId !== requestUserId(request)) throw new ResourceNotFoundError(`Workflow run ${runId} was not found`);
    await requireOwnedProject(request, run.projectId);
    return run;
  };
  const publicAccountEntitlements = async (userId: string, entitlements: PlanEntitlements) => {
    if (entitlements.unbrandedPptx) return publicEntitlements(entitlements);
    const used = await services.store.countBrandedPptxExportsForUser(userId);
    return publicEntitlements({ ...entitlements, freeBrandedPptxExports: Math.max(0, entitlements.freeBrandedPptxExports - used) });
  };

  const executeGenerationJob = async (jobId: string): Promise<PresentationDocument | undefined> => {
    const job = await services.store.claimJob(jobId);
    if (!job) {
      const existingJob = await services.store.getJob(jobId);
      const presentationId = existingJob?.result?.presentationId;
      return typeof presentationId === "string" ? services.store.getPresentation(presentationId) : undefined;
    }
    try {
      const payload = z.object({ presentationId: z.string().min(1), brief: creationBriefSchema, blueprint: blueprintSchema, mode: z.enum(["standard", "html", "image"]).default("standard"), sourceRevision: z.number().int().nonnegative().optional(), creditReservationId: z.string().optional(), userId: z.string().optional() }).parse(job.payload);
      const project = await services.store.getProject(job.projectId);
      if (!project) throw new ResourceNotFoundError(`Project ${job.projectId} was not found`);
      const sourceRevision = payload.sourceRevision ?? project.sourceRevision;
      const recovered = await services.store.getPresentation(payload.presentationId);
      if (recovered) {
        if (recovered.projectId !== job.projectId || recovered.revision !== job.revision) throw new Error("Recovered generation result does not match its project revision");
        const completed = await services.store.commitGenerationResult(job.id, sourceRevision, recovered);
        if (!completed) {
          await services.store.updateJob(job.id, { status: "stale", error: `Generation v${job.revision} is stale` });
          if (payload.creditReservationId) await services.commercial.refundCredits(payload.creditReservationId);
          return undefined;
        }
        if (payload.creditReservationId) await services.commercial.settleCredits(payload.creditReservationId);
        return recovered;
      }
      await services.store.updateJob(job.id, { progress: 15 });
      const document = await services.model.generatePresentation({ projectId: job.projectId, presentationId: payload.presentationId, brief: payload.brief, blueprint: payload.blueprint, mode: payload.mode });
      if (document.projectId !== job.projectId || document.id !== payload.presentationId || document.revision !== job.revision) throw new Error("Generation result does not match its project revision");
      if (!await services.store.getProject(job.projectId)) {
        await services.store.updateJob(job.id, { status: "cancelled", error: "Project was deleted while generation was running" });
        return undefined;
      }
      const completed = await services.store.commitGenerationResult(job.id, sourceRevision, document);
      if (!completed) {
        await services.store.updateJob(job.id, { status: "stale", error: `Generation v${job.revision} is stale` });
        if (payload.creditReservationId) await services.commercial.refundCredits(payload.creditReservationId);
        return undefined;
      }
      if (payload.creditReservationId) await services.commercial.settleCredits(payload.creditReservationId);
      if (payload.userId) await recordServerEvent(payload.userId, "deck_generated", { projectId: document.projectId, presentationId: document.id, metadata: { jobId: job.id, revision: document.revision }, idempotencyKey: `job:${job.id}:deck_generated` });
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await services.store.updateJob(job.id, { status: "failed", error: message });
      const reservationId = typeof job.payload.creditReservationId === "string" ? job.payload.creditReservationId : undefined;
      if (reservationId) await services.commercial.refundCredits(reservationId);
      throw error;
    }
  };

  const executeQualityJob = async (jobId: string): Promise<QualityReportRecord | undefined> => {
    const job = await services.store.claimJob(jobId);
    if (!job) return undefined;
    try {
      const payload = z.object({ presentationId: z.string().min(1), reportId: z.string().min(1) }).parse(job.payload);
      const document = await services.store.getPresentation(payload.presentationId);
      if (!document) throw new ResourceNotFoundError(`Presentation ${payload.presentationId} was not found`);
      if (document.projectId !== job.projectId || document.revision !== job.revision) {
        await services.store.updateJob(job.id, { status: "stale", error: `Quality check v${job.revision} is stale` });
        return undefined;
      }
      await services.store.updateJob(job.id, { progress: 25 });
      const report = inspectPresentation(document);
      const current = await services.store.getPresentation(payload.presentationId);
      if (!current || current.projectId !== job.projectId || current.revision !== job.revision) {
        await services.store.updateJob(job.id, { status: "stale", error: `Quality check v${job.revision} is stale` });
        return undefined;
      }
      const now = new Date().toISOString();
      const record: QualityReportRecord = { id: payload.reportId, projectId: job.projectId, presentationId: document.id, revision: job.revision, status: "success", jobId: job.id, report, createdAt: now, updatedAt: now };
      const saved = await services.store.createQualityReport(record);
      if (saved.status === "stale") {
        await services.store.updateJob(job.id, { status: "stale", error: `Quality check v${job.revision} is stale` });
        return saved;
      }
      const completed = await services.store.updateJob(job.id, { status: "success", progress: 100, result: { qualityReportId: saved.id, projectId: saved.projectId, revision: saved.revision } });
      if (!completed) {
        await services.store.updateJob(job.id, { status: "stale", error: `Quality check v${job.revision} is stale` });
        const latest = await services.store.getLatestQualityReport(document.id);
        return latest ?? { ...saved, status: "stale", report: { ...saved.report, status: "stale" } };
      }
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await services.store.updateJob(job.id, { status: "failed", error: message });
      throw error;
    }
  };
  const recoverPendingJobs = async (): Promise<void> => {
    const projects = await services.store.listProjects();
    const pending = (await Promise.all(projects.map(({ id }) => services.store.listJobs(id)))).flat().filter(({ status }) => status === "queued");
    for (const job of pending) {
      if (job.type === "export" || (job.type === "quality-check" && enforceV2QualityGate) || (job.type === "generate" && runtimeEnv.FEATURE_GENERATION_WORKFLOW_V2 === "true")) services.jobs.kick(job.id);
      else if (job.type === "generate") queueMicrotask(() => { void executeGenerationJob(job.id).catch(() => undefined); });
      else queueMicrotask(() => { void executeQualityJob(job.id).catch(() => undefined); });
    }
  };
  if (inlineJobsEnabled) queueMicrotask(() => { void recoverPendingJobs().catch(() => undefined); });
  await app.register(cors, { origin: [origin, "http://localhost:3000", "http://127.0.0.1:3000"], methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });

  app.setErrorHandler((error, _request, reply) => {
    const exception = error instanceof Error ? error : new Error(String(error));
    if (error instanceof RevisionConflictError) {
      void reply.status(409).send({ error: { code: error.code, message: error.message, expectedRevision: error.expectedRevision, actualRevision: error.actualRevision } });
      return;
    }
    if (error instanceof ScopeViolationError) {
      void reply.status(422).send({ error: { code: error.code, message: error.message, scopeSlideId: error.scopeSlideId } });
      return;
    }
    if (error instanceof z.ZodError) {
      void reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "Request validation failed", issues: error.issues } });
      return;
    }
    if (error instanceof UploadParseError) {
      void reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof CommercialError || error instanceof BillingProviderUnavailableError) {
      void reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error instanceof CommercialError ? error.details : {}) } });
      return;
    }
    const statusCode = "statusCode" in exception && typeof exception.statusCode === "number" ? exception.statusCode : 500;
    const code = "code" in exception && typeof exception.code === "string" ? exception.code : statusCode === 404 ? "NOT_FOUND" : "INTERNAL_ERROR";
    void reply.status(statusCode).send({ error: { code, message: exception.message } });
  });

  app.addHook("onClose", async () => { await services.close(); });

  app.get("/health", async () => ({ ok: true, generationReady: services.model.name !== "unconfigured", service: "aippt-api", model: services.model.name }));
  app.get("/api/integrations/status", async () => ({
    research: { tavily: Boolean(runtimeEnv.TAVILY_API_KEY), brave: Boolean(runtimeEnv.BRAVE_SEARCH_API_KEY) },
    images: {
      seed: true, openverse: true, wikimedia: true,
      pexels: Boolean(runtimeEnv.PEXELS_API_KEY), pixabay: Boolean(runtimeEnv.PIXABAY_API_KEY),
      unsplashPreview: Boolean(runtimeEnv.UNSPLASH_ACCESS_KEY), openai: Boolean(runtimeEnv.OPENAI_API_KEY), stability: Boolean(runtimeEnv.STABILITY_API_KEY),
    },
    storage: runtimeEnv.OBJECT_STORE === "s3" ? "s3" : "local",
    skillSandbox: { runner: runtimeEnv.SKILL_SANDBOX_RUNNER ?? "declarative", scriptExecutionAvailable: Boolean(runtimeEnv.SKILL_SANDBOX_IMAGE) },
  }));
  app.get("/api/creator/messages", async (request) => {
    const messages = creatorMessages.list(requestUserId(request));
    return { messages, unreadCount: messages.filter(({ readAt }) => !readAt).length };
  });
  app.patch("/api/creator/messages/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = z.object({ read: z.boolean() }).parse(request.body);
    const message = creatorMessages.markRead(requestUserId(request), id, body.read);
    if (!message) throw new ResourceNotFoundError(`Creator message ${id} was not found`);
    return { message };
  });
  app.post("/api/creator/messages/read-all", async (request) => ({ messages: creatorMessages.markAllRead(requestUserId(request)), unreadCount: 0 }));
  app.get("/api/resources", async (request) => {
    const query = z.object({ kind: z.enum(["native-pptx", "html-deck", "image-style", "skill", "media", "showcase", "website"]).optional(), access: z.enum(["free", "pro", "single-purchase"]).optional(), tag: z.string().optional(), industry: z.string().optional(), search: z.string().optional(), limit: z.coerce.number().int().min(1).max(240).default(180) }).parse(request.query);
    const userId = requestUserId(request); const plan = await services.commercial.getCurrentPlan(userId);
    const records = (await resourceModule.catalog.list({ includeUnlistedOwnedBy: userId, ...(query.kind ? { kind: query.kind } : {}), ...(query.access ? { access: query.access } : {}), ...(query.tag ? { tag: query.tag } : {}), ...(query.industry ? { industry: query.industry } : {}), ...(query.search ? { search: query.search } : {}) })).slice(0, query.limit);
    const resources = await Promise.all(records.map(async (record) => ({ ...record, installed: record.installedBy.includes(userId), entitled: record.ownerId === userId || record.manifest.access === "free" || (record.manifest.access === "pro" && plan.id === "pro") || Boolean(await resourceStore.getEntitlement(userId, record.manifest.id, record.manifest.version)) })));
    return { resources, total: resources.length };
  });
  app.get("/api/resources/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params); const userId = requestUserId(request); const record = await resourceModule.catalog.getVisible(id, userId);
    if (!record) throw new ResourceNotFoundError(`Resource ${id} was not found`);
    const plan = await services.commercial.getCurrentPlan(userId); const entitled = record.ownerId === userId || record.manifest.access === "free" || (record.manifest.access === "pro" && plan.id === "pro") || Boolean(await resourceStore.getEntitlement(userId, id, record.manifest.version));
    return { resource: { ...record, installed: record.installedBy.includes(userId), entitled } };
  });
  app.post("/api/resources/uploads", async (request, reply) => {
    const userId = requestUserId(request); const body = z.object({ filename: z.string().min(1), contentType: z.string().min(1), dataBase64: z.string().min(1), id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/), name: z.string().min(1), summary: z.string().min(1).default("用户上传资源"), kind: z.enum(["native-pptx", "html-deck", "image-style", "skill", "media", "showcase"]), license: z.enum(["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "MIT", "Apache-2.0", "Proprietary-Platform-License"]), access: z.enum(["free", "pro", "single-purchase"]).default("free"), priceCny: z.number().positive().optional(), publish: z.boolean().default(false), rightsAttested: z.boolean().default(false) }).parse(request.body);
    const data = new Uint8Array(Buffer.from(body.dataBase64, "base64"));
    let resource = await resourceModule.resources.upload({ userId, filename: body.filename, contentType: body.contentType, data, manifest: { id: body.id, version: "1.0.0", kind: body.kind, name: body.name, summary: body.summary, author: { name: userId }, license: body.license, access: body.access, ...(body.priceCny ? { priceCny: body.priceCny } : {}), tags: [body.kind, "community"], industries: [], previewKeys: [], capabilities: [body.kind === "skill" ? "declarative" : "imported"] } });
    if (body.publish) resource = await resourceModule.resources.publish(userId, resource.manifest.id, { rightsAttested: body.rightsAttested });
    return reply.status(201).send({ resource, scan: { status: resource.status, findings: resource.moderationReasons } });
  });
  app.post("/api/resources/:id/publish", async (request) => { const { id } = idParamsSchema.parse(request.params); const body = z.object({ rightsAttested: z.boolean() }).parse(request.body); return { resource: await resourceModule.resources.publish(requestUserId(request), id, body) }; });
  app.post("/api/resources/:id/install", async (request) => { const { id } = idParamsSchema.parse(request.params); const userId = requestUserId(request); const plan = await services.commercial.getCurrentPlan(userId); return { entitlement: await resourceModule.resources.install(userId, id, plan.id === "pro"), installed: true }; });
  app.post("/api/resources/:id/report", async (request, reply) => { const { id } = idParamsSchema.parse(request.params); const body = z.object({ reason: z.enum(["copyright", "malware", "misleading", "other"]), detail: z.string().max(2000).default("") }).parse(request.body); await resourceModule.catalog.report(id, requestUserId(request), body.reason, body.detail); return reply.status(204).send(); });
  app.patch("/api/admin/resources/:id", async (request) => { const { id } = idParamsSchema.parse(request.params); const body = z.object({ action: z.enum(["block", "takedown", "restore"]), reason: z.string().max(500).default("") }).parse(request.body); const userId = requestUserId(request); const admins = new Set((runtimeEnv.ADMIN_USER_IDS ?? runtimeEnv.DEMO_ADMIN_USER_ID ?? "local-demo-user").split(",").map((value) => value.trim())); return { resource: await resourceModule.resources.moderate(admins.has(userId), id, body.action, body.reason) }; });
  app.post("/api/resource-checkouts", async (request) => { const body = z.object({ resourceId: z.string().min(1), idempotencyKey: z.string().min(1) }).parse(request.body); return resourceModule.resources.checkout(requestUserId(request), body.resourceId, body.idempotencyKey, runtimeEnv); });
  app.get("/api/assets/search", async (request) => { const query = z.object({ query: z.string().default(""), orientation: z.enum(["landscape", "portrait", "square"]).optional(), limit: z.coerce.number().int().min(1).max(96).default(24) }).parse(request.query); return resourceModule.assets.search({ query: query.query, limit: query.limit, ...(query.orientation ? { orientation: query.orientation } : {}) }); });
  app.post("/api/assets/import", async (request) => { const body = z.object({ provider: z.string().min(1), providerAssetId: z.string().min(1) }).parse(request.body); return { asset: await resourceModule.assets.import(requestUserId(request), body.provider, body.providerAssetId) }; });
  app.post("/api/assets/generate", async (request, reply) => {
    const body = z.object({ prompt: z.string().min(3).max(800) }).parse(request.body); const asset = await services.assets.generate(body.prompt);
    if (!asset) return reply.status(501).send({ error: { code: "IMAGE_PROVIDER_NOT_CONFIGURED", message: "Configure OPENAI_API_KEY and a compatible image model before generating assets" } });
    return reply.status(201).send({ asset });
  });
  app.post("/api/skills/:id/runs", async (request, reply) => { const { id } = idParamsSchema.parse(request.params); const body = z.object({ version: z.string().default("1.0.0"), payload: z.unknown().default({}) }).parse(request.body); return reply.status(202).send({ run: await resourceModule.skills.start({ userId: requestUserId(request), skillId: id, version: body.version, payload: body.payload }) }); });
  app.get("/api/skill-runs/:id/events", async (request) => { const { id } = idParamsSchema.parse(request.params); return { events: await resourceModule.skills.events(id, requestUserId(request)) }; });
  app.post("/api/skill-runs/:id/cancel", async (request) => { const { id } = idParamsSchema.parse(request.params); return { run: await resourceModule.skills.cancel(id, requestUserId(request)) }; });
  app.get("/api/billing/plans", async () => ({
    plans: [
      { ...COMMERCIAL_PLANS.free, credits: 300, maxPages: 10, maxProjects: 3 },
      { ...COMMERCIAL_PLANS.pro, monthlyCredits: 3000, maxPages: 30, maxProjects: 30, monthlyPrice: 29, yearlyPrice: 268 },
    ],
  }));
  app.get("/api/account", async (request) => {
    const userId = requestUserId(request);
    const [account, subscription, entitlements] = await Promise.all([services.commercial.getAccount(userId), services.store.getSubscription(userId), services.commercial.getEntitlements(userId)]);
    return { account: { ...account, subscriptionStatus: subscription?.status ?? "none", ...(subscription ? { billingInterval: subscription.interval } : {}) }, entitlements: await publicAccountEntitlements(userId, entitlements) };
  });
  app.get("/api/account/usage", async (request) => {
    const userId = requestUserId(request);
    const [account, subscription, entitlements, ledger] = await Promise.all([services.commercial.getAccount(userId), services.store.getSubscription(userId), services.commercial.getEntitlements(userId), services.store.listCreditLedger(userId)]);
    const granted = ledger.filter(({ type }) => type === "grant").reduce((sum, item) => sum + item.amount, 0);
    const spent = -ledger.filter(({ type }) => type === "reserve").reduce((sum, item) => sum + item.amount, 0);
    const refunded = ledger.filter(({ type }) => type === "refund").reduce((sum, item) => sum + item.amount, 0);
    const reserved = ledger.filter(({ type }) => type === "reserve").reduce((sum, item) => sum + Math.abs(item.amount), 0) - ledger.filter(({ type }) => type === "settle" || type === "refund").reduce((sum, item) => sum + item.amount, 0);
    const usage = { planId: account.planId, balance: account.creditBalance, creditBalance: account.creditBalance, granted, spent, refunded, reserved: Math.max(0, reserved), entitlements: await publicAccountEntitlements(userId, entitlements) };
    return { account: { ...account, subscriptionStatus: subscription?.status ?? "none" }, entitlements: usage.entitlements, usage, ledger };
  });
  app.post("/api/credits/estimate", async (request) => {
    const userId = requestUserId(request);
    const input = z.object({ action: z.literal("generate"), pageCount: z.number().int().positive(), textModel: z.enum(["standard", "advanced"]).optional(), imageModel: z.enum(["standard", "advanced"]).optional(), projectId: z.string().optional() }).parse(request.body);
    return { estimate: await services.commercial.estimateCreditCost(userId, input) };
  });
  app.post("/api/credits/reserve", async (request, reply) => {
    const userId = requestUserId(request);
    const input = z.object({ action: z.literal("generate"), pageCount: z.number().int().positive(), textModel: z.enum(["standard", "advanced"]).optional(), imageModel: z.enum(["standard", "advanced"]).optional(), projectId: z.string().min(1), jobId: z.string().min(1), idempotencyKey: z.string().min(1).max(200) }).parse(request.body);
    await requireOwnedProject(request, input.projectId);
    const existing = (await services.store.listCreditLedger(userId)).find(({ idempotencyKey }) => idempotencyKey === `reserve:${input.idempotencyKey}`);
    const reservation = await services.commercial.reserveCredits({ userId, action: input.action, pageCount: input.pageCount, ...(input.textModel ? { textModel: input.textModel } : {}), ...(input.imageModel ? { imageModel: input.imageModel } : {}), projectId: input.projectId, jobId: input.jobId, idempotencyKey: input.idempotencyKey });
    return reply.status(existing ? 200 : 201).send({ reservation });
  });
  app.post("/api/credits/:id/settle", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const current = await services.store.getCreditReservation(id);
    if (!current || current.userId !== requestUserId(request)) throw new CommercialError("RESERVATION_NOT_FOUND", `Credit reservation ${id} was not found`, 404);
    const reservation = await services.commercial.settleCredits(id);
    return { reservation };
  });
  app.post("/api/credits/:id/refund", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const current = await services.store.getCreditReservation(id);
    if (!current || current.userId !== requestUserId(request)) throw new CommercialError("RESERVATION_NOT_FOUND", `Credit reservation ${id} was not found`, 404);
    throw new CommercialError("REFUND_INTERNAL_ONLY", "Credit refunds are completed only by failed or invalidated server jobs", 403);
  });
  const resumeActionSchema = z.object({ type: z.string().min(1), projectId: z.string().optional(), presentationId: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() });
  const checkoutStartSchema = z.object({ planId: z.literal("pro"), interval: z.enum(["monthly", "yearly"]), returnTo: z.string().regex(/^\/(?!\/)/), resumeAction: resumeActionSchema.optional() });
  const startCheckout = async (userId: string, input: z.infer<typeof checkoutStartSchema>) => {
    await services.commercial.getAccount(userId);
    const id = randomUUID();
    const session = await services.billing.startCheckout({ checkoutId: id, userId, interval: input.interval, returnTo: input.returnTo, ...(input.resumeAction ? { resumeAction: input.resumeAction } : {}) });
    const now = new Date().toISOString();
    const checkout: CheckoutRecord = { id, userId, planId: "pro", interval: input.interval, status: "pending", provider: session.provider, mode: session.mode, returnTo: input.returnTo, ...(input.resumeAction ? { resumeAction: input.resumeAction } : {}), providerCheckoutId: session.providerCheckoutId, createdAt: now, updatedAt: now };
    await services.store.createCheckout(checkout);
    await recordServerEvent(userId, "checkout_started", { metadata: { checkoutId: id, interval: input.interval } });
    return { checkout: { ...checkout, completeUrl: session.completeUrl, cancelUrl: session.cancelUrl }, completeUrl: session.completeUrl, cancelUrl: session.cancelUrl };
  };
  const completeCheckout = async (userId: string, checkoutId: string) => {
    const checkout = await services.store.getCheckout(checkoutId);
    if (!checkout || checkout.userId !== userId) throw new ResourceNotFoundError(`Checkout ${checkoutId} was not found`);
    const result = await services.billing.completeCheckout(checkout.providerCheckoutId ?? checkout.id);
    if (!result.paid) throw new CommercialError("CHECKOUT_NOT_PAID", "Checkout has not been paid", 409);
    const completed = await services.store.completeCheckout(checkoutId, checkout.providerCheckoutId);
    if (!completed) throw new ResourceNotFoundError(`Checkout ${checkoutId} was not found`);
    await recordServerEvent(userId, "checkout_completed", { metadata: { checkoutId, interval: checkout.interval }, idempotencyKey: `checkout:${checkoutId}:completed` });
    return { ...completed, entitlements: publicEntitlements(await services.commercial.getEntitlements(userId)), redirectTo: checkout.returnTo };
  };
  app.post("/api/checkout/start", async (request, reply) => reply.status(201).send(await startCheckout(requestUserId(request), checkoutStartSchema.parse(request.body))));
  app.post("/api/checkout/complete", async (request) => {
    const { checkoutId } = z.object({ checkoutId: z.string().min(1) }).parse(request.body);
    return completeCheckout(requestUserId(request), checkoutId);
  });
  app.post("/api/checkout", async (request) => {
    const body = z.object({ plan: z.literal("pro"), interval: z.enum(["month", "year"]), returnTo: z.string().regex(/^\/(?!\/)/), resumeAction: z.union([z.string().min(1), resumeActionSchema]).optional() }).parse(request.body);
    const resumeAction: ResumeAction | undefined = typeof body.resumeAction === "string" ? { type: body.resumeAction } : body.resumeAction;
    const interval = body.interval === "month" ? "monthly" : "yearly";
    const started = await startCheckout(requestUserId(request), { planId: "pro", interval, returnTo: body.returnTo, ...(resumeAction ? { resumeAction } : {}) });
    const completed = await completeCheckout(requestUserId(request), started.checkout.id);
    const completeUrl = `/checkout/success?returnTo=${encodeURIComponent(body.returnTo)}`;
    return { provider: "MockBillingProvider", mode: started.checkout.mode, plan: "pro", interval: body.interval, checkout: { ...completed.checkout, completeUrl, cancelUrl: "/checkout/cancel" }, completeUrl, account: completed.account, entitlements: completed.entitlements, returnTo: body.returnTo, ...(resumeAction ? { resumeAction } : {}) };
  });
  app.post("/api/analytics/events", async (request, reply) => {
    const eventNames = ["landing_view", "create_click", "generation_started", "deck_generated", "editor_opened", "export_clicked", "pricing_viewed", "upgrade_modal_viewed", "upgrade_clicked", "checkout_started", "checkout_completed", "checkout_cancelled", "credits_exhausted"] as const satisfies readonly AnalyticsEventName[];
    const body = z.object({ event: z.enum(eventNames), projectId: z.string().optional(), presentationId: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(), idempotencyKey: z.string().min(1).max(200).optional() }).parse(request.body);
    const event = await services.commercial.recordEvent(requestUserId(request), body.event, body);
    return reply.status(201).send({ event, accepted: true });
  });
  app.get("/api/presentation-ecosystem", async () => ({
    schemaVersion: "2.0.0",
    skills: skillCatalog,
    templates: templateCatalog,
    thirdParties: thirdPartyCatalog,
    featureFlags: {
      deckV2: (options.env ?? process.env).FEATURE_DECK_V2 !== "false",
      imageDeck: (options.env ?? process.env).FEATURE_IMAGE_DECK === "true",
      infiniteCanvas: (options.env ?? process.env).FEATURE_INFINITE_CANVAS === "true",
    },
  }));
  app.get("/api/templates", async () => ({ templates: [...templateCatalog, ...[...templateCandidates.values()].filter(({ status }) => status === "confirmed").map(({ manifest }) => manifest)] }));

  app.get("/api/projects", async (request) => ({ projects: (await services.store.listProjects()).filter(({ ownerUserId }) => ownerUserId === requestUserId(request)) }));
  app.post("/api/projects", async (request, reply) => {
    const userId = requestUserId(request);
    await services.commercial.assertCanCreateProject(userId);
    const input = z.object({ name: z.string().min(1), topic: z.string().min(1).optional() }).parse(request.body);
    const project = await services.store.createProject({ name: input.name, ...(input.topic ? { topic: input.topic } : {}), ownerUserId: userId });
    return reply.status(201).send({ project });
  });
  app.get("/api/projects/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { project: await requireOwnedProject(request, id) };
  });
  app.patch("/api/projects/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedProject(request, id);
    const input = z.object({ name: z.string().min(1).optional(), topic: z.string().min(1).optional() }).parse(request.body);
    const patch: { name?: string; topic?: string } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.topic !== undefined) patch.topic = input.topic;
    const project = await services.store.updateProject(id, patch);
    if (!project) throw new ResourceNotFoundError(`Project ${id} was not found`);
    return { project };
  });
  app.delete("/api/projects/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedProject(request, id);
    if (!await services.store.deleteProject(id)) throw new ResourceNotFoundError(`Project ${id} was not found`);
    return reply.status(204).send();
  });

  app.post("/api/projects/:id/workflow-runs", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const project = await requireOwnedProject(request, id);
    const body = z.object({
      presentationId: z.string().min(1).optional(),
      source: z.enum(["api", "generation"]).default("api"),
      idempotencyKey: z.string().min(1).max(200).optional(),
    }).parse(bodyOrEmpty(request.body));
    if (body.presentationId) {
      const presentation = await services.store.getPresentation(body.presentationId);
      if (!presentation || presentation.projectId !== id) throw new ResourceNotFoundError(`Presentation ${body.presentationId} was not found`);
    }
    const run = await services.workflow.start({
      projectId: id, ownerUserId: project.ownerUserId, source: body.source,
      ...(body.presentationId ? { presentationId: body.presentationId } : {}),
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    });
    return reply.status(201).send({ run, events: await services.store.listAgentEvents(run.id), agents: AGENT_DEFINITIONS });
  });

  app.get("/api/projects/:id/workflow-runs/latest", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedProject(request, id);
    const run = await services.store.getLatestWorkflowRun(id);
    if (!run) throw new ResourceNotFoundError(`Workflow run for project ${id} was not found`);
    return { run, events: await services.store.listAgentEvents(run.id) };
  });

  app.get("/api/workflow-runs/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const run = await requireOwnedWorkflowRun(request, id);
    return { run, events: await services.store.listAgentEvents(id) };
  });

  app.post("/api/workflow-runs/:id/continue", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedWorkflowRun(request, id);
    z.object({}).strict().parse(bodyOrEmpty(request.body));
    const run = await services.workflow.execute(id);
    return { run, events: await services.store.listAgentEvents(id) };
  });

  app.post("/api/workflow-runs/:id/execute", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedWorkflowRun(request, id);
    z.object({}).strict().parse(bodyOrEmpty(request.body));
    const run = await services.workflow.execute(id);
    return { run, events: await services.store.listAgentEvents(id) };
  });

  app.post("/api/workflow-runs/:id/retry", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedWorkflowRun(request, id);
    const run = await services.workflow.retry(id);
    return { run, events: await services.store.listAgentEvents(id) };
  });

  app.post("/api/workflow-runs/:id/cancel", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedWorkflowRun(request, id);
    const run = await services.workflow.cancel(id);
    return { run, events: await services.store.listAgentEvents(id) };
  });

  app.get("/api/workflow-runs/:id/events", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedWorkflowRun(request, id);
    const { afterSequence } = z.object({ afterSequence: z.coerce.number().int().nonnegative().default(0) }).parse(request.query);
    let events = await services.store.listAgentEvents(id, afterSequence);
    const waitMs = Math.max(0, Math.min(10_000, Number(runtimeEnv.WORKFLOW_SSE_WAIT_MS ?? 1_500)));
    const deadline = Date.now() + waitMs;
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
      events = await services.store.listAgentEvents(id, afterSequence);
    }
    const stream = events.length
      ? events.map((event) => `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("")
      : `: heartbeat ${new Date().toISOString()}\n\n`;
    return reply.header("content-type", "text/event-stream; charset=utf-8").header("cache-control", "no-cache, no-transform").header("connection", "keep-alive").send(`retry: 1000\n${stream}`);
  });

  if (runtimeEnv.NODE_ENV === "development" && runtimeEnv.ENABLE_CODEX_TEST_BRIDGE === "true") {
    app.post("/api/dev/codex-test-bridge/projects/:id/presentations", async (request, reply) => {
      const hostname = request.hostname.toLowerCase();
      if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) || !isLoopbackAddress(request.raw.socket.remoteAddress)) throw new ResourceNotFoundError("Codex Test Bridge was not found");
      const { id } = idParamsSchema.parse(request.params);
      const project = await requireOwnedProject(request, id);
      const body = z.object({ document: z.unknown(), idempotencyKey: z.string().min(1).max(200).optional() }).parse(request.body);
      const document = presentationDocumentSchema.parse(body.document);
      if (document.projectId !== id) throw new ResourceNotFoundError(`Project ${document.projectId} was not found`);
      const existing = await services.store.getPresentation(document.id);
      if (existing && existing.projectId !== id) throw new ResourceNotFoundError(`Presentation ${document.id} was not found`);
      const presentation = existing ?? await services.store.createPresentation(document);
      const run = await services.workflow.start({
        projectId: id, ownerUserId: project.ownerUserId, presentationId: presentation.id, source: "manual-codex-test",
        idempotencyKey: body.idempotencyKey ?? `manual-codex-test:${presentation.id}`,
      });
      return reply.status(existing ? 200 : 201).send({ presentation, run, provenance: "manual-codex-test", events: await services.store.listAgentEvents(run.id) });
    });
  }

  app.post("/api/projects/:id/questions", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const project = await requireOwnedProject(request, id);
    const brief = creationBriefSchema.parse({ topic: project.topic, ...(project.brief ?? {}), ...bodyOrEmpty(request.body) });
    await Promise.all(brief.sources.map(({ id: sourceId }) => services.store.bindUpload(sourceId, id, project.ownerUserId)));
    await services.store.updateProject(id, { brief });
    return { questions: await services.model.generateQuestions(brief), brief };
  });
  app.post("/api/projects/:id/blueprint", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const project = await requireOwnedProject(request, id);
    const blueprintInput = bodyOrEmpty(request.body);
    if ((options.env ?? process.env).FEATURE_GENERATION_WORKFLOW_V2 === "true" && blueprintInput.confirmed !== true) throw new FeatureDisabledError("需求追问答案尚未由用户确认，不能提前建立蓝图");
    const brief = creationBriefSchema.parse({ topic: project.topic, ...(project.brief ?? {}), ...blueprintInput });
    const blueprint = await services.model.generateBlueprint(brief);
    const sourceProject = await services.store.updateProject(id, { brief, blueprint });
    if (!sourceProject) throw new ResourceNotFoundError(`Project ${id} was not found`);
    return { blueprint, brief };
  });
  app.put("/api/projects/:id/resource-binding", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const project = await requireOwnedProject(request, id);
    const binding = z.object({
      creationMode: z.enum(["standard", "html", "image"]),
      templateId: z.string().min(1),
      templateVersion: z.string().min(1).default("1.0.0"),
      skillIds: z.array(z.string().min(1)).max(12).default([]),
      assetPolicy: creationBriefSchema.shape.assetPolicy.optional(),
    }).parse(request.body);
    const brief = creationBriefSchema.parse({ topic: project.topic, ...(project.brief ?? {}), ...binding });
    const updated = await services.store.updateProject(id, { brief });
    if (!updated) throw new ResourceNotFoundError(`Project ${id} was not found`);
    return { project: updated, binding: { creationMode: brief.creationMode, templateId: brief.templateId, templateVersion: brief.templateVersion, skillIds: brief.skillIds, assetPolicy: brief.assetPolicy } };
  });
  app.post("/api/projects/:id/generate", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = requestUserId(request);
    const project = await requireOwnedProject(request, id);
    const rawBody = bodyOrEmpty(request.body);
    const idempotencyKey = typeof rawBody.idempotencyKey === "string" && rawBody.idempotencyKey ? rawBody.idempotencyKey : undefined;
    const brief = creationBriefSchema.parse({ topic: project.topic, ...(project.brief ?? {}), ...rawBody, creationMode: rawBody.creationMode ?? rawBody.mode });
    const mode = brief.creationMode;
    const reusable = await services.store.findReusableJob({ projectId: id, revision: 0, type: "generate", ...(idempotencyKey ? { idempotencyKey } : {}) });
    if (reusable) {
      if ((options.env ?? process.env).FEATURE_GENERATION_WORKFLOW_V2 === "true") {
        const generationInput = generationRunInputSchema.safeParse(reusable.payload.generationInput);
        if (!generationInput.success || generationInput.data.sourceRevision !== project.sourceRevision) return reply.status(409).send({ error: { code: "IDEMPOTENCY_SOURCE_MISMATCH", message: "该幂等键属于旧需求版本，请使用当前 sourceRevision 创建新生成任务。" } });
        const workflowRun = generationInput.success ? await services.workflow.getRun(generationInput.data.runId) : undefined;
        return reply.status(202).send({ job: reusable, ...(workflowRun ? { workflowRun } : {}), qualityProfile: workflowRun?.qualityProfile ?? "standard", reused: true });
      }
      const blueprint = project.blueprint ?? await services.model.generateBlueprint(brief);
      const presentationId = reusable.result?.presentationId ?? reusable.presentationId;
      const presentation = typeof presentationId === "string" ? await services.store.getPresentation(presentationId) : undefined;
      return reply.status(presentation ? 200 : 202).send({ ...(presentation ? { presentation } : {}), blueprint, job: reusable, reused: true });
    }
    if ((options.env ?? process.env).FEATURE_GENERATION_WORKFLOW_V2 === "true") {
      if (!project.blueprint) return reply.status(409).send({ error: { code: "BRIEF_NOT_CONFIRMED", message: "请先确认追问答案并建立蓝图，再启动生成。" } });
      const qualityProfile = qualityProfileSchema.parse(rawBody.qualityProfile ?? "standard");
      const presentationId = randomUUID(); const jobId = randomUUID(); const runId = randomUUID();
      const textModel = qualityProfile === "premium" ? "advanced" : rawBody.textModel === "advanced" ? "advanced" : "standard";
      const imageModel = qualityProfile === "premium" ? "advanced" : rawBody.imageModel === "advanced" ? "advanced" : "standard";
      if (qualityProfile === "premium") { await services.commercial.assertFeature(userId, "advanced_text_model"); await services.commercial.assertFeature(userId, "advanced_image_model"); }
      const reservation = await services.commercial.reserveCredits({ userId, action: "generate", pageCount: brief.slideCount, textModel, imageModel, projectId: id, jobId, idempotencyKey: idempotencyKey ?? `generate:${jobId}` });
      const sourceProject = await services.store.updateProject(id, { brief });
      if (!sourceProject) { await services.commercial.refundCredits(reservation.id); throw new ResourceNotFoundError(`Project ${id} was not found`); }
      const defaultV2AssetPolicy: CreationBrief["assetPolicy"] = brief.assetPolicy.providers.length === 1 && brief.assetPolicy.providers[0] === "seed" ? { providers: ["openverse", "wikimedia", "pexels", "openai"], licenseAllowlist: ["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "generated", "platform-distribution"], allowAiGeneration: Boolean((options.env ?? process.env).OPENAI_API_KEY), requireAttribution: true } : brief.assetPolicy;
      const resourceBindingSnapshot = { creationMode: mode, templateId: brief.templateId ?? "builtin.core", templateVersion: brief.templateVersion ?? "2.0.0", skillIds: brief.skillIds, assetPolicy: defaultV2AssetPolicy };
      const hashInput = { runId, jobId, projectId: id, presentationId, ownerUserId: userId, sourceRevision: sourceProject.sourceRevision, briefSnapshot: brief, resourceBindingSnapshot, qualityProfile, workflowVersion: GENERATION_WORKFLOW_VERSION } as const;
      const generationInput = generationRunInputSchema.parse({ ...hashInput, inputHash: generationInputHash(hashInput) });
      const workflowRun = await services.workflow.start({ id: runId, projectId: id, ownerUserId: userId, presentationId, source: "generation", idempotencyKey: idempotencyKey ? `generation:${idempotencyKey}:s${sourceProject.sourceRevision}` : `generation:${jobId}`, workflowVersion: GENERATION_WORKFLOW_VERSION, qualityProfile, sourceRevision: sourceProject.sourceRevision, inputHash: generationInput.inputHash, generationInput });
      const now = new Date().toISOString();
      const job: JobRecord = { id: jobId, projectId: id, presentationId, revision: 0, type: "generate", status: "queued", progress: 0, attempts: 0, maxAttempts: 3, ...(idempotencyKey ? { idempotencyKey } : {}), payload: { generationInput, creditReservationId: reservation.id, userId, qualityProfile, textModel, imageModel }, createdAt: now, updatedAt: now };
      try { await services.store.createJob(job); } catch (error) { await services.commercial.refundCredits(reservation.id); await services.workflow.cancel(workflowRun.id).catch(() => undefined); throw error; }
      await recordServerEvent(userId, "generation_started", { projectId: id, metadata: { jobId, workflowRunId: workflowRun.id, qualityProfile, estimatedCost: reservation.amount }, idempotencyKey: `job:${jobId}:generation_started` });
      if (inlineJobsEnabled) services.jobs.kick(jobId);
      return reply.status(202).send({ job, workflowRun, jobId, workflowRunId: workflowRun.id, presentationId, qualityProfile });
    }
    const blueprint = project.blueprint ?? await services.model.generateBlueprint(brief);
    const presentationId = randomUUID();
    const jobId = randomUUID();
    const textModel = rawBody.textModel === "advanced" ? "advanced" : "standard";
    const imageModel = rawBody.imageModel === "advanced" ? "advanced" : "standard";
    if (rawBody.templateTier === "advanced") await services.commercial.assertFeature(userId, "advanced_template");
    const reservation = await services.commercial.reserveCredits({ userId, action: "generate", pageCount: brief.slideCount, textModel, imageModel, projectId: id, jobId, idempotencyKey: idempotencyKey ?? `generate:${jobId}` });
    const sourceProject = await services.store.updateProject(id, { brief, blueprint });
    if (!sourceProject) throw new ResourceNotFoundError(`Project ${id} was not found`);
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: jobId, projectId: id, presentationId, revision: 0, type: "generate", status: "queued", progress: 0,
      attempts: 0, maxAttempts: 3, ...(idempotencyKey ? { idempotencyKey } : {}),
      payload: { presentationId, brief, blueprint, mode, sourceRevision: sourceProject.sourceRevision, userId, creditReservationId: reservation.id, textModel, imageModel }, createdAt: now, updatedAt: now,
    };
    try {
      await services.store.createJob(job);
    } catch (error) {
      await services.commercial.refundCredits(reservation.id);
      throw error;
    }
    await recordServerEvent(userId, "generation_started", { projectId: id, metadata: { jobId: job.id, estimatedCost: reservation.amount }, idempotencyKey: `job:${job.id}:generation_started` });
    const document = await executeGenerationJob(job.id);
    if (!document) return reply.status(202).send({ blueprint, job: await services.store.getJob(job.id) });
    return reply.status(201).send({ presentation: document, blueprint, job: await services.store.getJob(job.id) });
  });

  app.get("/api/presentations", async (request) => {
    const query = z.object({ projectId: z.string().optional() }).parse(request.query);
    if (query.projectId) {
      await requireOwnedProject(request, query.projectId);
      return { presentations: await services.store.listPresentations(query.projectId) };
    }
    const ownedProjectIds = new Set((await services.store.listProjects()).filter(({ ownerUserId }) => ownerUserId === requestUserId(request)).map(({ id }) => id));
    return { presentations: (await services.store.listPresentations()).filter(({ projectId }) => ownedProjectIds.has(projectId)) };
  });
  app.get("/api/projects/:projectId/presentations", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    await requireOwnedProject(request, projectId);
    return { presentations: await services.store.listPresentations(projectId) };
  });
  app.get("/api/projects/:projectId/workbench", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const project = await requireOwnedProject(request, projectId);
    const presentations = await services.store.listPresentations(projectId);
    const presentation = presentations[0];
    const [quality, exports, jobs] = presentation
      ? await Promise.all([
          services.store.getLatestQualityReport(presentation.id),
          services.store.listExports(projectId, presentation.id),
          services.store.listJobs(projectId, presentation.id),
        ])
      : [undefined, await services.store.listExports(projectId), await services.store.listJobs(projectId)];
    return { project, presentations, presentation, latestPresentation: presentation, quality: quality?.report, qualityReport: quality, exports: exports.map(publicExport), jobs: jobs.map(publicJob) };
  });
  app.post("/api/projects/:projectId/presentations", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const userId = requestUserId(request);
    const project = await requireOwnedProject(request, projectId);
    const body = bodyOrEmpty(request.body);
    if (body.document) {
      const document = presentationDocumentSchema.parse({ ...(body.document as object), projectId });
      const entitlements = await services.commercial.getEntitlements(userId);
      if (document.slides.length > entitlements.maxPagesPerPresentation) throw new CommercialError("PAGE_LIMIT_REACHED", `This plan allows ${entitlements.maxPagesPerPresentation} pages per presentation`, 403, { requiredPlan: "pro", maxPages: entitlements.maxPagesPerPresentation });
      await services.store.createPresentation(document);
      return reply.status(201).send({ presentation: document });
    }
    const brief = creationBriefSchema.parse({ topic: project.topic, ...(project.brief ?? {}), ...body, creationMode: body.creationMode ?? body.mode });
    const mode = brief.creationMode;
    const blueprint = project.blueprint ?? await services.model.generateBlueprint(brief);
    const presentationId = randomUUID();
    const jobId = randomUUID();
    const textModel = body.textModel === "advanced" ? "advanced" : "standard";
    const imageModel = body.imageModel === "advanced" ? "advanced" : "standard";
    const reservation = await services.commercial.reserveCredits({ userId, action: "generate", pageCount: brief.slideCount, textModel, imageModel, projectId, jobId, idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : `generate:${jobId}` });
    const now = new Date().toISOString();
    const job: JobRecord = { id: jobId, projectId, presentationId, revision: 0, type: "generate", status: "queued", progress: 0, attempts: 0, maxAttempts: 3, payload: { presentationId, brief, blueprint, mode, sourceRevision: project.sourceRevision, userId, creditReservationId: reservation.id, textModel, imageModel }, createdAt: now, updatedAt: now };
    try { await services.store.createJob(job); } catch (error) { await services.commercial.refundCredits(reservation.id); throw error; }
    await recordServerEvent(userId, "generation_started", { projectId, metadata: { jobId, estimatedCost: reservation.amount }, idempotencyKey: `job:${jobId}:generation_started` });
    const document = await executeGenerationJob(jobId);
    return reply.status(document ? 201 : 202).send({ ...(document ? { presentation: document } : {}), blueprint, job: await services.store.getJob(jobId) });
  });
  app.get("/api/presentations/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { presentation: await requireOwnedPresentation(request, id) };
  });
  app.get("/api/presentations/:id/history", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedPresentation(request, id);
    const entitlements = await services.commercial.getEntitlements(requestUserId(request));
    const cutoff = Date.now() - entitlements.versionHistoryDays * 24 * 60 * 60 * 1000;
    return { history: (await services.store.listCommandHistory(id)).filter(({ createdAt }) => new Date(createdAt).getTime() >= cutoff), versionHistoryDays: entitlements.versionHistoryDays };
  });
  app.patch("/api/presentations/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedPresentation(request, id);
    const body = z.object({ baseRevision: z.number().int().nonnegative(), title: z.string().min(1) }).parse(request.body);
    const command = commandEnvelopeSchema.parse({ id: randomUUID(), baseRevision: body.baseRevision, command: { type: "presentation.update", patch: { title: body.title } } });
    return { presentation: await services.store.applyCommands(id, [command]) };
  });
  app.put("/api/presentations/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = z.object({ baseRevision: z.number().int().nonnegative(), document: z.unknown() }).parse(request.body);
    const current = await requireOwnedPresentation(request, id);
    const presentation = presentationDocumentSchema.parse({
      ...(body.document as object),
      id,
      projectId: current.projectId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      revision: body.baseRevision + 1,
    });
    return { presentation: await services.store.replacePresentation(presentation, body.baseRevision) };
  });
  app.delete("/api/presentations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedPresentation(request, id);
    if (!await services.store.deletePresentation(id)) throw new ResourceNotFoundError(`Presentation ${id} was not found`);
    return reply.status(204).send();
  });
  app.post("/api/presentations/:id/commands", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedPresentation(request, id);
    return { presentation: await services.store.applyCommands(id, commandList(request.body)) };
  });
  app.post("/api/presentations/:id/undo", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedPresentation(request, id);
    const { baseRevision } = z.object({ baseRevision: z.number().int().nonnegative() }).parse(request.body);
    return { presentation: await services.store.undo(id, baseRevision) };
  });
  app.post("/api/presentations/:id/ai-edit", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = z.object({ slideId: z.string().min(1), elementId: z.string().min(1).optional(), scope: z.enum(["element", "page", "section", "deck"]).default("page"), instruction: z.string().min(1), baseRevision: z.number().int().nonnegative() }).parse(request.body);
    let presentation = await requireOwnedPresentation(request, id);
    if (body.baseRevision !== presentation.revision) throw new RevisionConflictError(body.baseRevision, presentation.revision);
    const activeSlide = presentation.slides.find(({ id: slideId }) => slideId === body.slideId);
    if (!activeSlide) throw new ResourceNotFoundError(`Slide ${body.slideId} was not found`);
    if (body.scope === "element" && (!body.elementId || !activeSlide.elements.some(({ id: elementId }) => elementId === body.elementId))) throw new ResourceNotFoundError(`Element ${body.elementId ?? ""} was not found`);
    const activeSection = presentation.storyboard.find(({ slideId }) => slideId === body.slideId)?.section;
    const targetSlideIds = body.scope === "deck"
      ? presentation.slides.map(({ id: slideId }) => slideId)
      : body.scope === "section" && activeSection
        ? presentation.storyboard.filter(({ section, slideId }) => section === activeSection && Boolean(slideId)).map(({ slideId }) => slideId!)
        : [body.slideId];
    const appliedCommands: CommandEnvelope[] = [];
    for (const slideId of [...new Set(targetSlideIds)]) {
      let commands = (await services.model.editCurrentSlide({ document: presentation, slideId, instruction: body.instruction })).map((value) => commandEnvelopeSchema.parse(value));
      if (body.scope === "element") commands = commands.filter(({ command }) => command.type === "element.update").map((command) => commandEnvelopeSchema.parse({ ...command, command: { ...command.command, elementId: body.elementId } }));
      if (!commands.length) continue;
      presentation = await services.store.applyCommands(id, commands, slideId);
      appliedCommands.push(...commands);
    }
    return { presentation, commands: appliedCommands, scope: body.scope, affectedSlideIds: [...new Set(targetSlideIds)] };
  });
  app.get("/api/presentations/:id/quality", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const document = await requireOwnedPresentation(request, id);
    let record = await services.store.getLatestQualityReport(id); let qualityJob: JobRecord | undefined;
    if (!record) {
      const now = new Date().toISOString();
      const job: JobRecord = {
        id: randomUUID(), projectId: document.projectId, presentationId: id, revision: document.revision,
        type: "quality-check", status: "queued", progress: 0, attempts: 0, maxAttempts: 3,
        payload: { presentationId: id, reportId: randomUUID() }, createdAt: now, updatedAt: now,
      };
      await services.store.createJob(job);
      qualityJob = job;
      if (enforceV2QualityGate) { if (inlineJobsEnabled) await services.jobs.processJob(job.id); record = await services.store.getLatestQualityReport(id); }
      else record = await executeQualityJob(job.id);
    }
    return { quality: record?.report, job: record ? await services.store.getJob(record.jobId) : qualityJob ? await services.store.getJob(qualityJob.id) : undefined, currentRevision: document.revision };
  });
  app.post("/api/presentations/:id/quality", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const document = await requireOwnedPresentation(request, id);
    const body = z.object({ revision: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(1).max(200).optional() }).parse(bodyOrEmpty(request.body));
    const revision = body.revision ?? document.revision;
    if (revision !== document.revision) throw new RevisionConflictError(revision, document.revision);
    const reusable = await services.store.findReusableJob({ projectId: document.projectId, presentationId: id, revision, type: "quality-check", ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}) });
    if (reusable) {
      const record = await services.store.getLatestQualityReport(id);
      return reply.status(record?.jobId === reusable.id ? 200 : 202).send({ quality: record?.jobId === reusable.id ? record.report : undefined, job: reusable, reused: true });
    }
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: randomUUID(), projectId: document.projectId, presentationId: id, revision, type: "quality-check", status: "queued", progress: 0,
      attempts: 0, maxAttempts: 3, ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      payload: { presentationId: id, reportId: randomUUID() }, createdAt: now, updatedAt: now,
    };
    await services.store.createJob(job);
    let record: QualityReportRecord | undefined;
    if (enforceV2QualityGate) { if (inlineJobsEnabled) await services.jobs.processJob(job.id); record = await services.store.getLatestQualityReport(id); }
    else record = await executeQualityJob(job.id);
    return reply.status(record ? 200 : 202).send({ quality: record?.report, job: await services.store.getJob(job.id) });
  });
  app.post("/api/presentations/:id/image-deck", async (request, reply) => {
    if ((options.env ?? process.env).FEATURE_IMAGE_DECK !== "true") throw new FeatureDisabledError("Image-deck generation is behind FEATURE_IMAGE_DECK until PPTX/HTML quality gates pass");
    const { id } = idParamsSchema.parse(request.params); const document = await requireOwnedPresentation(request, id);
    const workflow = createImageDeckWorkflow({ presentationId: id, slideIds: document.slides.map((slide) => slide.id) }); imageDeckWorkflows.set(id, workflow);
    return reply.status(201).send({ workflow, providerConfigured: Boolean((options.env ?? process.env).IMAGE_MODEL_ENDPOINT), editingContract: "整页重做、局部重绘、扩图、裁切和排序；不承诺图片内部对象级编辑。" });
  });
  app.post("/api/presentations/:id/image-deck/actions", async (request) => {
    const { id } = idParamsSchema.parse(request.params); await requireOwnedPresentation(request, id); const workflow = imageDeckWorkflows.get(id);
    if (!workflow) throw new ResourceNotFoundError(`Image-deck workflow ${id} was not found`);
    const action = z.discriminatedUnion("type", [z.object({ type: z.literal("approve-outline") }), z.object({ type: z.literal("select-direction"), directionId: z.string().min(1) }), z.object({ type: z.literal("approve-sample"), assetId: z.string().min(1) })]).parse(request.body);
    const next = advanceImageDeckWorkflow(workflow, action); imageDeckWorkflows.set(id, next); return { workflow: next };
  });

  app.post("/api/uploads/parse", async (request, reply) => {
    const body = z.object({ filename: z.string().min(1).max(255), mime: z.string().min(1).max(200), dataBase64: z.string().min(1).max(28_000_000) }).parse(request.body);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64)) throw new UploadParseError("CORRUPT_FILE", "Upload payload is not valid base64");
    const parsed = await parseUpload(Buffer.from(body.dataBase64, "base64"), body.filename, body.mime);
    const id = randomUUID(); const createdAt = new Date().toISOString(); const fileHash = createHash("sha256").update(Buffer.from(body.dataBase64, "base64")).digest("hex");
    await services.store.createUpload({ id, ownerUserId: requestUserId(request), filename: parsed.filename, mime: parsed.mime, size: parsed.size, fileHash, parsed, createdAt });
    return reply.status(201).send({ upload: { ...parsed, id, fileHash } });
  });

  app.post("/api/templates/ingest", async (request, reply) => {
    const body = z.object({ filename: z.string().min(1).max(255), dataBase64: z.string().min(1).max(28_000_000) }).parse(request.body);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64)) throw new UploadParseError("CORRUPT_FILE", "Upload payload is not valid base64");
    const parsed = await parseUpload(Buffer.from(body.dataBase64, "base64"), body.filename, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    if (parsed.kind !== "pptx" || !parsed.template) throw new UploadParseError("UNSUPPORTED_TYPE", "Template ingestion requires a PPTX file");
    const id = randomUUID();
    const manifest = {
      id: `uploaded.${id}`, version: "1.0.0", scenario: "uploaded", intent: "imported-template", name: body.filename,
      slots: [{ id: "title", kind: "title", maxCharacters: 36 }, { id: "content", kind: "body", maxCharacters: 180 }],
      themeTokens: Object.fromEntries(parsed.template.themeColors.slice(0, 5).map((color, index) => [`importedColor${index + 1}`, color])),
      fallbackLayoutIds: ["consulting-strategy.cover-claim"], exportCompatibility: { pptx: true, html: true, image: true, canvas: true }, license: "USER_PROVIDED_PENDING_CONFIRMATION",
    };
    const candidate = { id, status: "awaiting_confirmation" as const, filename: body.filename, analysis: parsed.template as unknown as Record<string, unknown>, manifest };
    templateCandidates.set(id, candidate);
    return reply.status(201).send({ candidate, warning: "外链、OLE、宏和未知扩展不会进入模板库；不支持对象仅保留锁定预览。请确认授权与字体许可。" });
  });
  app.post("/api/templates/:id/confirm", async (request) => {
    const { id } = idParamsSchema.parse(request.params); const candidate = templateCandidates.get(id);
    if (!candidate) throw new ResourceNotFoundError(`Template candidate ${id} was not found`);
    z.object({ rightsConfirmed: z.literal(true), fontsConfirmed: z.literal(true) }).parse(request.body);
    const confirmed = { ...candidate, status: "confirmed" as const, manifest: { ...candidate.manifest, license: "USER_CONFIRMED" } };
    templateCandidates.set(id, confirmed); return { template: confirmed };
  });

  app.post("/api/presentations/:id/exports", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = requestUserId(request);
    const document = await requireOwnedPresentation(request, id);
    if (enforceV2QualityGate) {
      const quality = await services.store.getLatestQualityReport(id);
      const report = quality?.report as { version?: string; status?: string } | undefined;
      if (!quality || quality.revision !== document.revision || report?.version !== GENERATION_WORKFLOW_VERSION || report.status !== "passed") throw new QualityGateFailedError("当前版本尚未通过 V2 硬质量门禁；请在质量中心查看失败项后重新生成或修复。 ");
    }
    const body = z.object({ format: z.enum(["pptx", "pdf", "png", "html", "html-zip"]), branding: z.enum(["aippt", "none"]).optional(), revision: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(1).max(200).optional() }).parse(request.body);
    const { format } = body;
    const revision = body.revision ?? document.revision;
    if (revision !== document.revision) throw new RevisionConflictError(revision, document.revision);
    if (format === "pdf") await services.commercial.assertFeature(userId, "pdf_export");
    if (format === "png") await services.commercial.assertFeature(userId, "png_export");
    if (format === "html" || format === "html-zip") await services.commercial.assertFeature(userId, "html_export");
    const plan = await services.commercial.getCurrentPlan(userId);
    let branding: "aippt" | "none" = "none";
    if (format === "pptx" && plan.id === "free") {
      if (body.branding === "none") await services.commercial.assertFeature(userId, "unbranded_pptx");
      branding = "aippt";
    }
    const reusable = await services.store.findReusableExport({ projectId: document.projectId, presentationId: id, revision, format, userId, branding });
    if (reusable) {
      const job = await services.store.getJob(reusable.jobId);
      const createdAt = new Date(reusable.createdAt).toISOString();
      return reply.status(202).send({ export: { ...publicExport(reusable), status: "queued", createdAt, updatedAt: createdAt }, job: job ? publicJob(job) : undefined, reused: true });
    }
    if (format === "pptx" && plan.id === "free") {
      const used = await services.store.countBrandedPptxExportsForUser(userId);
      if (used >= plan.entitlements.freeBrandedPptxExports) throw new CommercialError("FREE_PPTX_LIMIT_REACHED", "Free includes one branded editable PPTX export", 403, { feature: "unbranded_pptx", requiredPlan: "pro" });
    }
    const now = new Date().toISOString();
    const exportId = randomUUID();
    const jobId = randomUUID();
    const job: JobRecord = {
      id: jobId, projectId: document.projectId, presentationId: id, revision, type: "export", status: "queued", progress: 0,
      attempts: 0, maxAttempts: 3, ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      payload: { exportId, projectId: document.projectId, presentationId: id, revision, format, branding, userId }, createdAt: now, updatedAt: now,
    };
    const exportRecord: ExportRecord = { id: exportId, projectId: document.projectId, presentationId: id, revision, format: format as ExportFormat, status: "queued", jobId, userId, branding, createdAt: now, updatedAt: now };
    await services.store.createJob(job);
    await services.store.createExport(exportRecord);
    await recordServerEvent(userId, "export_clicked", { projectId: document.projectId, presentationId: id, metadata: { exportId, format, branding }, idempotencyKey: body.idempotencyKey ? `export:${body.idempotencyKey}:clicked` : `export:${exportId}:clicked` });
    if (inlineJobsEnabled) services.jobs.kick(jobId);
    return reply.status(202).send({ export: publicExport(exportRecord), job: publicJob(job) });
  });
  app.get("/api/jobs/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { job: publicJob(await requireOwnedJob(request, id)) };
  });
  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await requireOwnedJob(request, id);
    const queued = await services.store.retryJob(id);
    if (!queued) {
      const current = await services.store.getJob(id);
      if (!current) throw new ResourceNotFoundError(`Job ${id} was not found`);
      return reply.status(409).send({ error: { code: "JOB_NOT_RETRYABLE", message: `Job ${id} is ${current.status} or exhausted its retry limit` }, job: current });
    }
    if ((queued.type === "quality-check" && enforceV2QualityGate) || (queued.type === "generate" && runtimeEnv.FEATURE_GENERATION_WORKFLOW_V2 === "true")) {
      if (inlineJobsEnabled) services.jobs.kick(queued.id);
    } else if (queued.type === "export") {
      if (inlineJobsEnabled) services.jobs.kick(queued.id);
    } else if (queued.type === "generate") {
      queueMicrotask(() => { void executeGenerationJob(queued.id).catch(() => undefined); });
    } else {
      queueMicrotask(() => { void executeQualityJob(queued.id).catch(() => undefined); });
    }
    return reply.status(202).send({ job: publicJob(queued) });
  });
  app.get("/api/exports/:id/status", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { export: publicExport(await requireOwnedExport(request, id)) };
  });
  app.get("/api/exports/:id/download", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const record = await requireOwnedExport(request, id);
    if (!record.objectKey || record.status !== "success") throw new ResourceNotFoundError(`Successful export ${id} was not found`);
    const object = await services.objects.get(record.objectKey);
    const extension = record.format === "png" || record.format === "html-zip" ? "zip" : record.format;
    return reply.header("content-type", object.contentType).header("content-disposition", `attachment; filename=\"${id}.${extension}\"`).send(Buffer.from(object.data));
  });

  app.decorate("backendServices", services);
  return app;
}
