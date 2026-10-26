import { createHash, randomUUID } from "node:crypto";
import {
  CORE_LAYOUT_CONTRACTS,
  GENERATION_WORKFLOW_VERSION,
  compilePresentationScene,
  generationOutcomeSchema,
  generationRunInputSchema,
  inspectPresentationV2,
  presentationDocumentSchema,
  workflowArtifactSchema,
  type GenerationOutcome,
  type GenerationRunInput,
  type LayoutContract,
  type PresentationDocument,
  type PresentationElement,
  type PresentationModelAdapter,
  type QualityReportV2,
  type WorkflowArtifact,
} from "@aippt/core";
import { z } from "zod";
import type { ModelAssignment, WorkflowArtifacts, WorkflowRunRecord, WorkflowStep } from "../workflow/types.js";
import type { WorkflowStepExecution, WorkflowStepExecutor } from "../workflow/presentation-workflow.js";
import { PresentationWorkflow } from "../workflow/presentation-workflow.js";
import type { ArtifactStorePort, AssetPort, EvidencePort, RenderBundle, RenderPort, StructuredModelPort, StructuredRequest, VisualReviewPort, VisualReviewResult } from "./ports.js";
import { StructuredVisualReviewPort, visualReviewUnavailable } from "./ports.js";

type V2Artifact<S extends WorkflowStep> = Extract<WorkflowArtifact, { step: S }>;
const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 } as const;

function artifact<S extends WorkflowStep>(step: S, summary: string, data: V2Artifact<S>["data"]): WorkflowStepExecution {
  const artifactHash = createHash("sha256").update(JSON.stringify({ step, data })).digest("hex");
  return { artifact: workflowArtifactSchema.parse({ schemaVersion: GENERATION_WORKFLOW_VERSION, step, summary, artifactHash, data }), usage };
}

function requireArtifact<S extends WorkflowStep>(artifacts: WorkflowArtifacts, step: S): V2Artifact<S> {
  const parsed = workflowArtifactSchema.parse(artifacts[step]);
  if (parsed.step !== step) throw new Error(`Workflow artifact ${step} is missing`);
  return parsed as V2Artifact<S>;
}

function storyRole(index: number, count: number, purpose: string): V2Artifact<"story-architecture">["data"]["slides"][number]["role"] {
  if (index === 0) return "cover";
  if (index === count - 1) return "closing";
  const value = purpose.toLowerCase();
  if (/数据|证据|evidence|metric|fact/.test(value)) return "evidence";
  if (/对比|选择|compare|option/.test(value)) return "comparison";
  if (/流程|实施|roadmap|process|阶段/.test(value)) return "roadmap";
  if (/问题|风险|problem|risk/.test(value)) return "problem";
  if (/方案|solution|机制/.test(value)) return "solution";
  return index % 3 === 1 ? "context" : "insight";
}

function sentenceClip(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max);
  const boundary = Math.max(clipped.lastIndexOf("。"), clipped.lastIndexOf("；"), clipped.lastIndexOf("，"), clipped.lastIndexOf(" "));
  return `${(boundary > max * .55 ? clipped.slice(0, boundary) : clipped.slice(0, max - 1)).trim()}…`;
}

function locatorLabel(location: V2Artifact<"brief-research">["data"]["sourceChunks"][number]["location"]): string {
  if (location.kind === "page") return `page ${location.page}`;
  if (location.kind === "paragraph") return `paragraph ${location.paragraph}`;
  if (location.kind === "cell") return `${location.sheet}!${location.cell}`;
  if (location.kind === "slide") return `slide ${location.slide}`;
  return location.locator;
}

function evidenceRelevance(claim: string, evidence: string): number {
  const terms = claim.toLowerCase().split(/[\s，。；、：:,.!?！？()（）]+/).filter((term) => term.length >= 2);
  const normalized = evidence.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function readableColor(background: string, preferred: string, inverse: string): string {
  const rgb = (value: string) => { const match = /^#([\da-f]{6})$/i.exec(value); return match ? [0, 2, 4].map((offset) => Number.parseInt(match[1]!.slice(offset, offset + 2), 16)) : undefined; };
  const luminance = (value: string) => { const channels = rgb(value); if (!channels) return undefined; const linear = channels.map((channel) => { const normalized = channel / 255; return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; }); return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722; };
  const back = luminance(background); if (back === undefined) return preferred;
  const ratio = (value: string) => { const front = luminance(value); return front === undefined ? 0 : (Math.max(front, back) + .05) / (Math.min(front, back) + .05); };
  return ratio(preferred) >= ratio(inverse) ? preferred : inverse;
}

function isNonRegressiveQuality(candidate: QualityReportV2, current: QualityReportV2): boolean {
  const currentFailures = current.hardGates.filter(({ status }) => status === "failed").length;
  const candidateFailures = candidate.hardGates.filter(({ status }) => status === "failed").length;
  const currentErrors = current.issues.filter(({ severity }) => severity === "error").length;
  const candidateErrors = candidate.issues.filter(({ severity }) => severity === "error").length;
  const currentDimensions = new Map(current.dimensions.map(({ id, score }) => [id, score]));
  const noDimensionDeclined = candidate.dimensions.every(({ id, score }) => score >= (currentDimensions.get(id) ?? 0));
  const improved = candidate.status === "passed" && current.status !== "passed" || candidateFailures < currentFailures || candidateErrors < currentErrors || candidate.score > current.score || candidate.dimensions.some(({ id, score }) => score > (currentDimensions.get(id) ?? 0));
  return candidateFailures <= currentFailures && candidateErrors <= currentErrors && candidate.score >= current.score && noDimensionDeclined && improved;
}

function selectLayout(slide: V2Artifact<"story-architecture">["data"]["slides"][number], index: number, count: number, hasChart: boolean): LayoutContract {
  const wantsImage = /(?:图片|照片|人物|地点|产品|案例|现场|建筑|城市|photo|image|portrait|place|product|case)/i.test(slide.visualIntent);
  const candidates = hasChart ? ["core.data-chart"] : slide.role === "cover" ? ["core.cover-hero", "core.cover-minimal"] : slide.role === "closing" || slide.role === "decision" ? ["core.action-summary"] : wantsImage ? ["core.image-caption"] : slide.role === "comparison" ? ["core.split-compare"] : slide.role === "roadmap" || slide.role === "process" ? [index % 2 ? "core.timeline" : "core.process"] : slide.role === "evidence" ? ["core.assertion-evidence", "core.quote-proof", "core.data-table"] : ["core.assertion-evidence", "core.three-card", "core.two-column", "core.stakeholder-map"];
  const requested = candidates[index % candidates.length]!;
  return CORE_LAYOUT_CONTRACTS.find(({ id }) => id === requested) ?? CORE_LAYOUT_CONTRACTS[index === 0 ? 1 : count - 1 === index ? 15 : 2]!;
}

function structuredCapable(model: PresentationModelAdapter): model is PresentationModelAdapter & { generateStructured<T>(input: StructuredRequest<T>): Promise<T> } {
  return typeof (model as { generateStructured?: unknown }).generateStructured === "function";
}

export function structuredModelPort(model: PresentationModelAdapter): StructuredModelPort | undefined {
  if (!structuredCapable(model)) return undefined;
  const capable = model;
  return { name: capable.name, complete: <T>(request: StructuredRequest<T>) => capable.generateStructured<T>(request) };
}

export interface PresentationGenerationDependencies {
  model: PresentationModelAdapter;
  structuredModel?: StructuredModelPort;
  structuredModels?: Readonly<Record<string, StructuredModelPort>>;
  evidence: EvidencePort;
  assets: AssetPort;
  render: RenderPort;
  artifacts: ArtifactStorePort;
  visualReview?: VisualReviewPort;
}

export interface PresentationGenerationModuleInterface {
  run(input: GenerationRunInput): Promise<GenerationOutcome>;
}

export class GenerationWorkflowStepExecutor implements WorkflowStepExecutor {
  constructor(private readonly dependencies: PresentationGenerationDependencies) {}

  async execute({ run, definition, assignment, artifacts }: { run: WorkflowRunRecord; definition: { step: WorkflowStep }; assignment: ModelAssignment; artifacts: WorkflowArtifacts }): Promise<WorkflowStepExecution> {
    if (run.workflowVersion !== GENERATION_WORKFLOW_VERSION || !run.generationInput) throw new Error("Generation V2 requires a persisted GenerationRunInput");
    const input = generationRunInputSchema.parse(run.generationInput);
    switch (definition.step) {
      case "brief-research": return this.briefResearch(input);
      case "evidence-ledger": return this.evidenceLedger(input, artifacts);
      case "story-architecture": return this.storyArchitecture(input, artifacts, assignment);
      case "data-narrative": return this.dataNarrative(artifacts);
      case "visual-direction": return this.visualDirection(input, artifacts, assignment);
      case "layout-routing": return this.layoutRouting(artifacts);
      case "slide-copy": return this.slideCopy(input, artifacts, assignment);
      case "scene-compile": return this.sceneCompile(input, artifacts);
      case "render-review": return this.renderReview(input, artifacts, assignment);
      case "bounded-repair": return this.boundedRepair(input, artifacts, assignment);
      case "delivery": return this.delivery(artifacts);
    }
  }

  private async complete<T>(input: StructuredRequest<T>, fallback: () => Promise<T> | T, modelId?: string): Promise<{ value: T; fallback: boolean }> {
    const model = (modelId ? this.dependencies.structuredModels?.[modelId] : undefined) ?? this.dependencies.structuredModel ?? structuredModelPort(this.dependencies.model);
    if (!model) return { value: await fallback(), fallback: true };
    try { return { value: await model.complete<T>(input), fallback: false }; }
    catch { return { value: await fallback(), fallback: true }; }
  }

  private async briefResearch(input: GenerationRunInput): Promise<WorkflowStepExecution> {
    const sourceChunks = await this.dependencies.evidence.load(input);
    const brief = input.briefSnapshot;
    const mustCover = [brief.topic, brief.goal, brief.desiredAction, ...Object.values(brief.answers)].filter((value): value is string => Boolean(value?.trim()));
    const assumptions = [brief.audience.length ? undefined : "受众未明确", brief.goal ? undefined : "演示目标未明确", brief.desiredAction ? undefined : "期望行动未明确"].filter((value): value is string => Boolean(value));
    return artifact("brief-research", `Brief 已冻结；读取 ${sourceChunks.length} 个可定位资料片段`, { brief, mustCover, assumptions, openQuestions: [], sourceChunks });
  }

  private evidenceLedger(input: GenerationRunInput, artifacts: WorkflowArtifacts): WorkflowStepExecution {
    const brief = requireArtifact(artifacts, "brief-research").data;
    const accessedAt = new Date().toISOString();
    const sourceById = new Map(input.briefSnapshot.sources.map((source) => [source.id, source]));
    const records = brief.sourceChunks.map((chunk, index) => {
      const source = sourceById.get(chunk.sourceId);
      return { id: `evidence-chunk-${index + 1}`, claim: sentenceClip(chunk.text.trim(), 600), title: source?.title ?? chunk.sourceId, sourceId: chunk.sourceId, ...(source?.url ? { url: source.url } : {}), locator: locatorLabel(chunk.location), accessedAt, license: "user-provided source; reuse not asserted", status: "manual-review" as const };
    });
    const cellGroups = new Map<string, typeof brief.sourceChunks>();
    for (const chunk of brief.sourceChunks) if (chunk.location.kind === "cell") { const key = `${chunk.sourceId}\u0000${chunk.location.sheet}`; cellGroups.set(key, [...(cellGroups.get(key) ?? []), chunk]); }
    for (const [key, chunks] of cellGroups) {
      const [sourceId = "source", sheet = "Sheet"] = key.split("\u0000"); const source = sourceById.get(sourceId); const first = chunks[0]; const last = chunks.at(-1);
      if (!first || !last || first.location.kind !== "cell" || last.location.kind !== "cell") continue;
      records.push({ id: `evidence-sheet-${records.length + 1}`, claim: sentenceClip(chunks.map((chunk) => `${chunk.location.kind === "cell" ? chunk.location.cell : "?"}=${chunk.text}`).join("; "), 1200), title: `${source?.title ?? sourceId} · ${sheet}`, sourceId, ...(source?.url ? { url: source.url } : {}), locator: `${sheet}!${first.location.cell}:${last.location.cell}`, accessedAt, license: "user-provided source; reuse not asserted", status: "manual-review" as const });
    }
    for (const source of input.briefSnapshot.sources) if (!records.some(({ sourceId }) => sourceId === source.id)) records.push({ id: `evidence-source-${records.length + 1}`, claim: source.note?.trim() || source.title, title: source.title, sourceId: source.id, ...(source.url ? { url: source.url } : {}), locator: "source record", accessedAt, license: "linked citation; reuse not asserted", status: "manual-review" as const });
    const claimCoverage = brief.mustCover.map((claim) => { const matches = records.map((record) => ({ id: record.id, score: evidenceRelevance(claim, record.claim) })).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score).slice(0, 3).map(({ id }) => id); return { claim, evidenceIds: matches, status: matches.length ? "supported" as const : "assumption" as const }; });
    return artifact("evidence-ledger", `${records.length} 条证据已建立 claim → source → locator 映射`, { records, claimCoverage });
  }

  private async storyArchitecture(input: GenerationRunInput, artifacts: WorkflowArtifacts, assignment: ModelAssignment): Promise<WorkflowStepExecution> {
    const ledger = requireArtifact(artifacts, "evidence-ledger").data;
    const blueprintFallback = async () => {
      const blueprint = await this.dependencies.model.generateBlueprint(input.briefSnapshot);
      return { title: blueprint.title, coreClaim: blueprint.coreClaim, slides: blueprint.slides.map((slide, index) => { const slideClaims = `${slide.title} ${slide.purpose} ${slide.keyPoints.join(" ")}`; const evidenceIds = ledger.records.map((record) => ({ id: record.id, direct: slide.evidence.includes(record.title) || slide.evidence.includes(record.id), score: evidenceRelevance(slideClaims, record.claim) })).filter(({ direct, score }) => direct || score > 0).sort((left, right) => Number(right.direct) - Number(left.direct) || right.score - left.score).slice(0, 3).map(({ id }) => id); return { id: `slide-${index + 1}`, order: index + 1, role: storyRole(index, blueprint.slides.length, `${slide.purpose} ${slide.visualIntent}`), section: slide.section, assertion: slide.title, evidenceIds, transition: slide.notes, timingSeconds: Math.max(30, Math.round(input.briefSnapshot.durationMinutes * 60 / blueprint.slides.length)), visualIntent: slide.visualIntent, keyPoints: slide.keyPoints.filter(Boolean).slice(0, 6) }; }), alternativesConsidered: 1, selectedReason: "兼容模型仅提供一套故事；按受众行动目标、证据覆盖和页面容量校验" };
    };
    const schema = z.object({ title: z.string().min(1), coreClaim: z.string().min(1), slides: z.array(z.object({ id: z.string(), order: z.number().int().positive(), role: z.enum(["cover", "context", "problem", "insight", "evidence", "solution", "comparison", "process", "roadmap", "decision", "closing", "appendix"]), section: z.string(), assertion: z.string().min(1), evidenceIds: z.array(z.string()), transition: z.string(), timingSeconds: z.number().int().positive(), visualIntent: z.string(), keyPoints: z.array(z.string()).max(6) })).length(input.briefSnapshot.slideCount), alternativesConsidered: z.number().int().min(1).max(2), selectedReason: z.string().min(1) });
    const result = await this.complete({ system: `你是演示故事架构师。生成严格 ${input.briefSnapshot.slideCount} 页，一页一个主导结论。只能引用给定 evidenceId；没有证据的事实必须改写为假设或框架。${input.qualityProfile === "premium" ? "先在内部比较两套故事路径，只输出更优方案及选择理由。" : "输出一套最清晰方案。"}`, prompt: JSON.stringify({ brief: input.briefSnapshot, evidence: ledger }), schemaName: "aippt_story_architecture_v2", jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>, parse: (value) => schema.parse(value) }, blueprintFallback, assignment.modelId);
    return artifact("story-architecture", `故事架构完成；${result.value.slides.length} 页${result.fallback ? "（使用兼容模型回退）" : `（${assignment.modelId}）`}`, result.value);
  }

  private dataNarrative(artifacts: WorkflowArtifacts): WorkflowStepExecution {
    const story = requireArtifact(artifacts, "story-architecture").data;
    const ledger = requireArtifact(artifacts, "evidence-ledger").data;
    const chunks = requireArtifact(artifacts, "brief-research").data.sourceChunks;
    const grouped = new Map<string, typeof chunks>();
    for (const chunk of chunks) if (chunk.location.kind === "cell") { const key = `${chunk.sourceId}\u0000${chunk.location.sheet}`; grouped.set(key, [...(grouped.get(key) ?? []), chunk]); }
    const chartTargets = story.slides.filter(({ role }) => role === "evidence" || role === "insight").concat(story.slides.filter(({ role }) => !["cover", "closing"].includes(role)));
    const usedTargets = new Set<string>();
    const charts: V2Artifact<"data-narrative">["data"]["charts"] = [];
    for (const [key, sheetChunks] of grouped) {
      const [sourceId = "source", sheet = "Sheet"] = key.split("\u0000");
      const cells = sheetChunks.filter((chunk): chunk is typeof chunk & { location: { kind: "cell"; sheet: string; cell: string } } => chunk.location.kind === "cell").map((chunk) => ({ ...chunk, match: /^([A-Z]+)(\d+)$/i.exec(chunk.location.cell) }));
      const numericCells = cells.flatMap((cell) => { const normalized = cell.text.replaceAll(",", "").trim(); const match = /^([-+]?\d+(?:\.\d+)?)\s*(%|亿|万|千|百)?$/.exec(normalized); return match ? [{ ...cell, value: Number(match[1]), unit: match[2] ?? "" }] : []; });
      if (numericCells.length < 2) continue;
      const pairs = numericCells.slice(0, 8).map((cell) => { const row = cell.match?.[2]; const label = [...cells].reverse().find((candidate) => candidate.match?.[2] === row && candidate.location.cell !== cell.location.cell && !/^[-+]?\d/.test(candidate.text.trim()))?.text; return { label: sentenceClip(label?.trim() || cell.location.cell, 18), value: cell.value, unit: cell.unit }; });
      const target = chartTargets.find(({ id }) => !usedTargets.has(id)); const evidence = ledger.records.find((record) => record.sourceId === sourceId && record.title.endsWith(`· ${sheet}`));
      if (!target || !evidence) continue;
      usedTargets.add(target.id); const commonUnit = pairs.every(({ unit }) => unit === pairs[0]?.unit) ? pairs[0]?.unit ?? "" : "";
      charts.push({ slideId: target.id, chartType: "column", categories: pairs.map(({ label }) => label), series: [{ name: sheet, values: pairs.map(({ value }) => value) }], unit: commonUnit, evidenceId: evidence.id });
      if (charts.length >= 3) break;
    }
    return artifact("data-narrative", charts.length ? `${charts.length} 个图表已绑定结构化数据` : "未发现可安全结构化的数值序列；不生成装饰性图表", { skipped: charts.length === 0, charts });
  }

  private async visualDirection(input: GenerationRunInput, artifacts: WorkflowArtifacts, assignment: ModelAssignment): Promise<WorkflowStepExecution> {
    const story = requireArtifact(artifacts, "story-architecture").data;
    const schema = z.object({ name: z.string().min(1), headingFont: z.string().min(1), bodyFont: z.string().min(1), palette: z.object({ background: z.string(), foreground: z.string(), primary: z.string(), accent: z.string(), muted: z.string() }), spacingUnit: z.number().positive(), cornerRadius: z.number().nonnegative(), imageLanguage: z.string().min(1), chartLanguage: z.string().min(1), rhythm: z.array(z.enum(["light", "balanced", "strong"])).length(story.slides.length) });
    const fallback = () => ({ name: "AIPPT Signal V2", headingFont: "Aptos Display", bodyFont: "Aptos", palette: { background: "#0A0A0A", foreground: "#F4F4EF", primary: "#B7F34A", accent: "#FF725E", muted: "#303530" }, spacingUnit: .2, cornerRadius: .18, imageLanguage: "真实图片优先，抽象概念使用克制插画", chartLanguage: "二维原生图表、直接标注、统一单位", rhythm: story.slides.map((slide, index) => slide.role === "cover" || slide.role === "closing" || index % 4 === 2 ? "strong" as const : index % 2 ? "light" as const : "balanced" as const) });
    const result = await this.complete({ system: "你是整稿视觉导演。只输出设计令牌、图像/图表语言和跨页节奏，不生成坐标。确保普通文字与背景 4.5:1，大字与关键图形 3:1。", prompt: JSON.stringify({ brief: input.briefSnapshot, story }), schemaName: "aippt_visual_direction_v2", jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>, parse: (value) => schema.parse(value) }, fallback, assignment.modelId);
    return artifact("visual-direction", `全稿视觉方向已冻结${result.fallback ? "（确定性回退）" : `（${assignment.modelId}）`}`, result.value);
  }

  private layoutRouting(artifacts: WorkflowArtifacts): WorkflowStepExecution {
    const story = requireArtifact(artifacts, "story-architecture").data;
    const charts = requireArtifact(artifacts, "data-narrative").data.charts;
    const assignments = story.slides.map((slide, index) => {
      const contract = selectLayout(slide, index, story.slides.length, charts.some(({ slideId }) => slideId === slide.id));
      return { slideId: slide.id, layoutId: contract.id, fallbackLayoutIds: contract.fallbackLayoutIds, slotCapacities: Object.fromEntries(contract.slots.map(({ id, maxCharacters }) => [id, maxCharacters])) };
    });
    return artifact("layout-routing", `${assignments.length} 页已路由到可执行 LayoutContract`, { assignments });
  }

  private async slideCopy(input: GenerationRunInput, artifacts: WorkflowArtifacts, assignment: ModelAssignment): Promise<WorkflowStepExecution> {
    const story = requireArtifact(artifacts, "story-architecture").data;
    const layouts = requireArtifact(artifacts, "layout-routing").data;
    const schema = z.object({ slides: z.array(z.object({ slideId: z.string(), title: z.string().min(1), slots: z.record(z.string(), z.string()), speakerNotes: z.string(), evidenceIds: z.array(z.string()) })).length(story.slides.length) });
    const fallback = () => ({ slides: story.slides.map((slide) => { const assignmentForSlide = layouts.assignments.find(({ slideId }) => slideId === slide.id)!; const slotKeys = Object.keys(assignmentForSlide.slotCapacities).filter((key) => !["title", "image", "chart", "table", "source"].includes(key)); const values = slide.keyPoints.length ? slide.keyPoints : [slide.assertion]; return { slideId: slide.id, title: slide.assertion, slots: Object.fromEntries(slotKeys.map((key, index) => [key, values[index % values.length] ?? slide.assertion])), speakerNotes: slide.transition, evidenceIds: slide.evidenceIds }; }) });
    const result = await this.complete({ system: "你是演示文案编辑。标题必须是结论句；严格按 layout slot 输出，不能增加槽位。每条文案必须在给定字符上限内，不编造事实或数字。", prompt: JSON.stringify({ brief: input.briefSnapshot, story, layouts }), schemaName: "aippt_slide_copy_v2", jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>, parse: (value) => schema.parse(value) }, fallback, assignment.modelId);
    const assetEntries = await Promise.all(layouts.assignments.filter(({ layoutId }) => layoutId === "core.image-caption").map(async ({ slideId }) => {
      const storySlide = story.slides.find(({ id }) => id === slideId); if (!storySlide) return undefined;
      const factual = /(?:真实|人物|地点|产品|历史|事件|公司|品牌|person|place|product|history|event|company|brand)/i.test(`${storySlide.role} ${storySlide.visualIntent}`);
      const candidates = await this.dependencies.assets.find({ query: sentenceClip(storySlide.visualIntent || storySlide.assertion, 120), factual, allowGeneration: !factual && input.resourceBindingSnapshot.assetPolicy.allowAiGeneration, providers: input.resourceBindingSnapshot.assetPolicy.providers, licenseAllowlist: input.resourceBindingSnapshot.assetPolicy.licenseAllowlist, requireAttribution: input.resourceBindingSnapshot.assetPolicy.requireAttribution });
      const candidate = candidates.find(({ dataUrl, width, height }) => Boolean(dataUrl && width && height));
      return candidate?.dataUrl && candidate.width && candidate.height ? [slideId, { id: `asset-${slideId}-${candidate.id}`, src: candidate.dataUrl, alt: storySlide.assertion, provider: candidate.provider, sourceUrl: candidate.sourceUrl ?? candidate.url, license: candidate.license, ...(candidate.attribution ? { attribution: candidate.attribution } : {}), width: candidate.width, height: candidate.height, generated: candidate.generated }] as const : undefined;
    }));
    const assets = new Map(assetEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
    const slides = result.value.slides.map((copy) => {
      const assignmentForSlide = layouts.assignments.find(({ slideId }) => slideId === copy.slideId) ?? layouts.assignments[0]!;
      const storySlide = story.slides.find(({ id }) => id === copy.slideId) ?? story.slides[0]!;
      const slots = Object.fromEntries(Object.entries(assignmentForSlide.slotCapacities).filter(([key]) => !["title", "image", "chart", "table"].includes(key)).map(([key, capacity], index) => [key, sentenceClip(copy.slots[key]?.trim() || storySlide.keyPoints[index % Math.max(1, storySlide.keyPoints.length)] || storySlide.assertion, capacity)]));
      return { ...copy, title: sentenceClip(copy.title, 52), slots, evidenceIds: copy.evidenceIds.filter((id) => storySlide.evidenceIds.includes(id)), ...(assets.get(copy.slideId) ? { asset: assets.get(copy.slideId)! } : {}) };
    });
    return artifact("slide-copy", `文案已按槽位容量完成；${assets.size} 项图片素材已托管${result.fallback ? "（确定性回退）" : `（${assignment.modelId}）`}`, { slides });
  }

  private async sceneCompile(input: GenerationRunInput, artifacts: WorkflowArtifacts): Promise<WorkflowStepExecution> {
    const story = requireArtifact(artifacts, "story-architecture").data;
    const visual = requireArtifact(artifacts, "visual-direction").data;
    const layouts = requireArtifact(artifacts, "layout-routing").data;
    const copy = requireArtifact(artifacts, "slide-copy").data;
    const data = requireArtifact(artifacts, "data-narrative").data;
    const evidence = requireArtifact(artifacts, "evidence-ledger").data;
    const compiled = compilePresentationScene({ projectId: input.projectId, presentationId: input.presentationId, brief: input.briefSnapshot, title: story.title, story: story.slides, visual, layouts: layouts.assignments, copy: copy.slides, charts: data.charts, evidenceLedger: evidence.records, mode: input.resourceBindingSnapshot.creationMode });
    const artifactId = randomUUID();
    await this.dependencies.artifacts.putJson({ key: `generation/${input.runId}/scene/${artifactId}.json`, value: compiled.document });
    return artifact("scene-compile", "结构化内容已编译为可编辑 PresentationDocument", { document: compiled.document, artifactId, artifactHash: compiled.artifactHash });
  }

  private visionReview(input: GenerationRunInput, document: PresentationDocument, bundle: RenderBundle, assignment: ModelAssignment, deterministic: QualityReportV2): Promise<VisualReviewResult> {
    const reviewer = this.dependencies.visualReview ?? new StructuredVisualReviewPort(this.dependencies.structuredModel ?? structuredModelPort(this.dependencies.model));
    return reviewer.review({ document, bundle, profile: input.qualityProfile, deterministic, reviewerModel: assignment.modelId });
  }

  private async renderReview(input: GenerationRunInput, artifacts: WorkflowArtifacts, assignment: ModelAssignment): Promise<WorkflowStepExecution> {
    const document = requireArtifact(artifacts, "scene-compile").data.document;
    const bundle = await this.dependencies.render.render({ runId: input.runId, document, round: 0 });
    const renderRefs = bundle.slides.map(({ data: _data, dataUrl: _dataUrl, ...ref }) => ref);
    const deterministic = inspectPresentationV2(document, { renderedSlides: renderRefs });
    const visualReview = await this.visionReview(input, document, bundle, assignment, deterministic);
    const visualIssues = visualReview.completed ? visualReview.findings : [visualReviewUnavailable(visualReview.fallbackReason ?? "Vision review did not complete")];
    const qualityReport = inspectPresentationV2(document, { renderedSlides: renderRefs, visualFindings: visualIssues });
    const summary = visualReview.completed ? qualityReport.status === "passed" ? "真实渲染与视觉审稿通过" : `发现 ${qualityReport.issues.length} 个可定位问题` : "视觉模型不可用（回退为不合格草稿，已阻断门禁）";
    return artifact("render-review", summary, { renderedSlides: bundle.slides.map((ref) => ({ slideId: ref.slideId, width: 1920 as const, height: 1080 as const, artifactKey: ref.artifactKey!, sha256: ref.sha256! })), contactSheetArtifactKey: bundle.contactSheet.artifactKey, findings: visualIssues.map((issue) => ({ severity: issue.severity, slideId: issue.slideId ?? document.slides[0]!.id, ruleId: issue.ruleId, ...(issue.bbox ? { bbox: issue.bbox } : {}), evidence: issue.evidence, repairHint: issue.repairHint })), reviewedSlideIds: visualReview.reviewedSlideIds, qualityReport });
  }

  private repairDocument(document: PresentationDocument, report: QualityReportV2): PresentationDocument {
    const errorIssues = report.issues.filter(({ severity }) => severity === "error");
    const failedSlides = new Set(errorIssues.map(({ slideId }) => slideId).filter((value): value is string => Boolean(value)));
    const slides = document.slides.map((slide, slideIndex) => {
      if (!failedSlides.has(slide.id)) return slide;
      const slideIssues = errorIssues.filter(({ slideId: issueSlideId }) => issueSlideId === slide.id); const rulesByElement = new Map<string, string[]>();
      slideIssues.forEach(({ elementId, ruleId }) => { if (elementId) rulesByElement.set(elementId, [...(rulesByElement.get(elementId) ?? []), ruleId]); });
      const titleRule = slideIssues.some(({ ruleId }) => ruleId === "structure.title-required" || ruleId === "accessibility.title-unique");
      const nextTitle = titleRule ? `${slide.title.trim() || "核心结论"} · ${String(slideIndex + 1).padStart(2, "0")}` : slide.title;
      let readingOrder = 1;
      const elements = slide.elements.map((element): PresentationElement => {
        const rules = rulesByElement.get(element.id) ?? []; const x = Math.max(0, Math.min(13.333 - element.width, element.x)); const y = Math.max(0, Math.min(7.5 - element.height, element.y)); const order = element.decorative ? 0 : readingOrder++;
        if (element.type === "text") {
          const minimum = element.semanticRole === "title" ? slideIndex === 0 ? 50 : 35 : element.semanticRole === "subtitle" ? 24 : 18;
          const capacity = Math.max(1, Math.floor(Math.floor(element.width * 72 / Math.max(8, Math.max(element.fontSize, minimum) * .62)) * Math.floor(element.height * 72 / Math.max(10, Math.max(element.fontSize, minimum) * 1.45)) * .85));
          let text = titleRule && element.semanticRole === "title" ? nextTitle : element.text.replace(/\b(?:TODO|TBD|placeholder)\b/gi, "需补充的信息").replace(/待(?:填写|补充|确认)/g, "需补充");
          if (rules.includes("evidence.numeric-claim") && !/(?:假设|模拟|情景|示例)/.test(text)) text = `假设情景：${text}`;
          if (rules.includes("geometry.overflow")) text = sentenceClip(text, capacity);
          const background = slideIssues.find(({ elementId, ruleId }) => elementId === element.id && ruleId === "contrast.text")?.evidence.match(/ on (#[\da-f]{3,6})$/i)?.[1];
          const color = background ? readableColor(background, document.theme.colors.foreground, document.theme.colors.background) : element.color;
          return { ...element, x, y, readingOrder: order, fontSize: Math.max(element.fontSize, minimum), color, text };
        }
        if (element.type === "image") return { ...element, x, y, readingOrder: order, alt: element.alt || nextTitle };
        return { ...element, x, y, readingOrder: order };
      });
      return { ...slide, title: nextTitle, elements };
    });
    return presentationDocumentSchema.parse({ ...document, slides });
  }

  private async boundedRepair(input: GenerationRunInput, artifacts: WorkflowArtifacts, assignment: ModelAssignment): Promise<WorkflowStepExecution> {
    const scene = requireArtifact(artifacts, "scene-compile").data;
    const reviewed = requireArtifact(artifacts, "render-review").data;
    let bestDocument = scene.document; let bestReport = reviewed.qualityReport as QualityReportV2; let bestArtifactId = scene.artifactId; let bestHash = scene.artifactHash; let rounds = 0; let rolledBack = false;
    const repairedSlideIds = [...new Set(bestReport.issues.filter(({ severity }) => severity === "error").map(({ slideId }) => slideId).filter((value): value is string => Boolean(value)))];
    const limit = input.qualityProfile === "premium" ? 2 : 1;
    while (bestReport.status !== "passed" && rounds < limit) {
      const candidate = this.repairDocument(bestDocument, bestReport); rounds += 1;
      const bundle = await this.dependencies.render.render({ runId: input.runId, document: candidate, round: rounds });
      const refs = bundle.slides.map(({ data: _data, dataUrl: _dataUrl, ...ref }) => ref);
      const deterministic = inspectPresentationV2(candidate, { renderedSlides: refs, autoFixRounds: rounds }); const visualReview = await this.visionReview(input, candidate, bundle, assignment, deterministic); const visualIssues = visualReview.completed ? visualReview.findings : [visualReviewUnavailable(visualReview.fallbackReason ?? "Vision review did not complete")];
      const candidateReport = inspectPresentationV2(candidate, { renderedSlides: refs, visualFindings: visualIssues, autoFixRounds: rounds });
      if (isNonRegressiveQuality(candidateReport, bestReport)) {
        bestDocument = candidate; bestReport = candidateReport; bestArtifactId = randomUUID(); bestHash = createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
        await this.dependencies.artifacts.putJson({ key: `generation/${input.runId}/repair/${bestArtifactId}.json`, value: candidate });
      } else { rolledBack = true; break; }
    }
    return artifact("bounded-repair", bestReport.status === "passed" ? `修复 ${rounds} 轮后通过质量门禁` : `完成 ${rounds} 轮受限修复，保留最佳可编辑草稿`, { document: bestDocument, rounds, repairedSlideIds, rolledBack, artifactId: bestArtifactId, artifactHash: bestHash, qualityReport: bestReport });
  }

  private delivery(artifacts: WorkflowArtifacts): WorkflowStepExecution {
    const repaired = requireArtifact(artifacts, "bounded-repair").data;
    const review = requireArtifact(artifacts, "render-review").data;
    const qualityReport = repaired.qualityReport as QualityReportV2;
    const fallbackLog = Object.values(artifacts).filter((entry) => entry?.summary.includes("回退")).map((entry) => entry!.summary);
    return artifact("delivery", qualityReport.status === "passed" ? "通过硬门禁，可进入交付" : "硬门禁未通过；仅保留为可编辑草稿", { document: repaired.document, qualityStatus: qualityReport.status === "passed" ? "passed" : "needs_review", bestArtifactId: repaired.artifactId, renderArtifactKeys: [review.contactSheetArtifactKey, ...review.renderedSlides.map(({ artifactKey }) => artifactKey)], fallbackLog, qualityReport });
  }
}

export class PresentationGenerationModule implements PresentationGenerationModuleInterface {
  constructor(private readonly workflow: PresentationWorkflow) {}

  async run(rawInput: GenerationRunInput): Promise<GenerationOutcome> {
    const startedAt = Date.now(); const input = generationRunInputSchema.parse(rawInput);
    let run = await this.workflow.getRun(input.runId);
    if (!run) throw new Error(`Workflow run ${input.runId} was not found`);
    if (run.inputHash !== input.inputHash || run.projectId !== input.projectId || run.presentationId !== input.presentationId) throw new Error("Generation input does not match the persisted workflow run");
    while (run.status === "running") run = await this.workflow.execute(run.id);
    if (run.status !== "completed") throw new Error(`Workflow run ${run.id} ended as ${run.status}: ${run.error ?? "unknown error"}`);
    const delivery = requireArtifact(run.artifacts, "delivery").data;
    await this.workflow.setBestArtifact(run.id, delivery.bestArtifactId);
    const modelAssignments = Object.fromEntries(Object.entries(run.modelAssignments).map(([step, assignment]) => [step, { modelId: assignment!.modelId, promptVersion: assignment!.promptVersion ?? GENERATION_WORKFLOW_VERSION }]));
    return generationOutcomeSchema.parse({ presentation: delivery.document, qualityReport: delivery.qualityReport, qualityStatus: delivery.qualityStatus, bestArtifactId: delivery.bestArtifactId, workflowRunId: run.id, modelAssignments, usage: run.usage, durationMs: Date.now() - startedAt, fallbackLog: delivery.fallbackLog }) as GenerationOutcome;
  }
}
