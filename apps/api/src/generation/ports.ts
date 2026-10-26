import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { renderFindingSchema, type GenerationRunInput, type GenerationSourceChunk, type PresentationDocument, type QualityIssueV2, type QualityProfile, type QualityReportV2, type RenderedSlideReference } from "@aippt/core";
import JSZip from "jszip";
import sharp from "sharp";
import { z } from "zod";
import type { SlideRenderService } from "../export/slide-renderer.js";
import type { StructuredJsonTransport } from "../model/structured-model.js";
import type { ObjectStore } from "../storage/object-store.js";
import type { AppStore } from "../contracts.js";
import { assertSafeRemoteImageUrl, isPrivateAddress } from "../export/pptx-exporter.js";

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: (value: unknown) => T;
  images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>;
  webSearch?: boolean;
}

export interface StructuredModelPort {
  readonly name: string;
  complete<T>(input: StructuredRequest<T>): Promise<T>;
}

export interface EvidencePort {
  load(input: GenerationRunInput): Promise<GenerationSourceChunk[]>;
}

export interface AssetCandidate {
  id: string;
  /** Download URL used only by the server-side managed-asset ingress. */
  url: string;
  /** Human-readable landing page retained for attribution and provenance. */
  sourceUrl?: string;
  provider: "openverse" | "wikimedia" | "pexels" | "openai";
  license: string;
  attribution?: string;
  width?: number;
  height?: number;
  generated: boolean;
  dataUrl?: string;
}

export interface AssetPort {
  find(input: { query: string; factual: boolean; allowGeneration: boolean; providers?: string[]; licenseAllowlist?: string[]; requireAttribution?: boolean }): Promise<AssetCandidate[]>;
}

export interface RenderedSlide extends RenderedSlideReference {
  data: Uint8Array;
  dataUrl: string;
}

export interface RenderBundle {
  slides: RenderedSlide[];
  contactSheet: { artifactKey: string; data: Uint8Array; dataUrl: string; sha256: string };
}

export interface RenderPort {
  render(input: { runId: string; document: PresentationDocument; round: number }): Promise<RenderBundle>;
}

export interface VisualReviewResult {
  completed: boolean;
  findings: QualityIssueV2[];
  reviewedSlideIds: string[];
  fallbackReason?: string | undefined;
}

export interface VisualReviewPort {
  review(input: { document: PresentationDocument; bundle: RenderBundle; profile: QualityProfile; deterministic: QualityReportV2; reviewerModel?: string }): Promise<VisualReviewResult>;
}

export function visualReviewUnavailable(reason: string): QualityIssueV2 {
  return { severity: "error", ruleId: "render.visual-review-unavailable", message: "独立视觉审稿未完成", evidence: reason, repairHint: "配置支持图片输入和 Structured Outputs 的视觉模型后重新审稿" };
}

export class StructuredVisualReviewPort implements VisualReviewPort {
  constructor(private readonly model?: StructuredModelPort) {}

  async review(input: { document: PresentationDocument; bundle: RenderBundle; profile: QualityProfile; deterministic: QualityReportV2; reviewerModel?: string }): Promise<VisualReviewResult> {
    const highRisk = new Set(input.deterministic.worstSlides.filter(({ issueCount }) => issueCount > 0).map(({ slideId }) => slideId));
    const reviewed = input.profile === "premium" ? input.bundle.slides : input.bundle.slides.filter(({ slideId }) => highRisk.has(slideId)).slice(0, 4);
    const reviewedSlideIds = reviewed.map(({ slideId }) => slideId);
    if (!this.model) return { completed: false, findings: [], reviewedSlideIds, fallbackReason: "No vision-capable structured model is configured" };
    const schema = z.object({ findings: z.array(renderFindingSchema).max(40) });
    try {
      const value = await this.model.complete({
        system: "你是独立视觉审稿人。检查视觉层级、焦点、留白、裁切、图片相关性、泛化 AI 文案、跨页节奏与风格离群。不得把主观判断伪装成确定性事实；每条问题必须定位到 slideId，并给出可复验的 repairHint。",
        prompt: JSON.stringify({ profile: input.profile, deterministicIssues: input.deterministic.issues, renderedSlideIds: reviewedSlideIds, reviewerModel: input.reviewerModel ?? this.model.name }),
        schemaName: "aippt_render_review_v2", jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>, parse: (raw) => schema.parse(raw),
        images: [{ dataUrl: input.bundle.contactSheet.dataUrl, detail: "high" }, ...reviewed.map(({ dataUrl }) => ({ dataUrl, detail: "high" as const }))],
      });
      return { completed: true, findings: value.findings.map(modelFindingToQualityIssue), reviewedSlideIds };
    } catch (error) {
      return { completed: false, findings: [], reviewedSlideIds, fallbackReason: error instanceof Error ? error.message.slice(0, 300) : "Vision review failed" };
    }
  }
}

export class RoutingVisualReviewPort implements VisualReviewPort {
  constructor(private readonly models: Readonly<Record<string, StructuredModelPort>>, private readonly fallback?: StructuredModelPort) {}
  review(input: { document: PresentationDocument; bundle: RenderBundle; profile: QualityProfile; deterministic: QualityReportV2; reviewerModel?: string }): Promise<VisualReviewResult> {
    const model = input.reviewerModel ? this.models[input.reviewerModel] ?? this.fallback : this.fallback;
    return new StructuredVisualReviewPort(model).review(input);
  }
}

export interface ArtifactStorePort {
  put(input: { key: string; data: Uint8Array; contentType: string }): Promise<string>;
  putJson(input: { key: string; value: unknown }): Promise<{ key: string; sha256: string }>;
}

export class TransportStructuredModelPort implements StructuredModelPort {
  readonly name: string;
  constructor(private readonly transport: StructuredJsonTransport) { this.name = transport.name; }
  complete<T>(input: StructuredRequest<T>): Promise<T> { return this.transport.generate<T>(input); }
}

export class ObjectArtifactStorePort implements ArtifactStorePort {
  constructor(private readonly objects: ObjectStore) {}
  async put(input: { key: string; data: Uint8Array; contentType: string }): Promise<string> { await this.objects.put(input.key, input.data, input.contentType); return input.key; }
  async putJson(input: { key: string; value: unknown }): Promise<{ key: string; sha256: string }> {
    const data = new TextEncoder().encode(JSON.stringify(input.value));
    await this.put({ key: input.key, data, contentType: "application/json" });
    return { key: input.key, sha256: createHash("sha256").update(data).digest("hex") };
  }
}

export class BriefSourceEvidencePort implements EvidencePort {
  async load(input: GenerationRunInput): Promise<GenerationSourceChunk[]> {
    return input.briefSnapshot.sources.flatMap((source, sourceIndex) => {
      const text = source.note?.trim();
      if (!text) return [];
      return [{ id: `${source.id}:note`, sourceId: source.id, text, location: { kind: "web" as const, locator: source.url ?? `source ${sourceIndex + 1}` }, hash: createHash("sha256").update(text).digest("hex") }];
    });
  }
}

export class PersistedEvidencePort implements EvidencePort {
  constructor(private readonly store: AppStore) {}
  async load(input: GenerationRunInput): Promise<GenerationSourceChunk[]> {
    const inline = await new BriefSourceEvidencePort().load(input);
    const uploads = await Promise.all(input.briefSnapshot.sources.map(({ id }) => this.store.getUpload(id)));
    const queryTerms = [input.briefSnapshot.topic, input.briefSnapshot.goal, input.briefSnapshot.desiredAction, ...Object.values(input.briefSnapshot.answers)]
      .flatMap((value) => (value ?? "").toLowerCase().split(/[\s，。；、：:,.!?！？()（）]+/)).filter((term) => term.length >= 2);
    const limit = input.qualityProfile === "premium" ? 160 : 80;
    const located = uploads.flatMap((upload) => {
      if (upload?.ownerUserId !== input.ownerUserId) return [];
      return upload.parsed.chunks.map((chunk, index) => {
        const lower = chunk.text.toLowerCase();
        const relevance = queryTerms.reduce((score, term) => score + (lower.includes(term) ? 5 : 0), 0) + (chunk.location.kind === "cell" ? 3 : 0) + (/\d/.test(chunk.text) ? 2 : 0);
        return { id: `${upload.id}:chunk-${index + 1}`, sourceId: upload.id, text: chunk.text, location: chunk.location, hash: createHash("sha256").update(`${upload.fileHash}:${index}:${chunk.text}`).digest("hex"), relevance, index };
      }).sort((left, right) => right.relevance - left.relevance || left.index - right.index).slice(0, limit).sort((left, right) => left.index - right.index).map(({ relevance: _relevance, index: _index, ...chunk }) => chunk);
    });
    return [...located, ...inline.filter((chunk) => !located.some(({ sourceId }) => sourceId === chunk.sourceId))];
  }
}

export class LicensedAssetPort implements AssetPort {
  constructor(private readonly fetcher: typeof globalThis.fetch = globalThis.fetch, private readonly pexelsKey?: string, private readonly openai?: { apiKey: string; model: string }) {}

  private async managed(candidate: AssetCandidate): Promise<AssetCandidate | undefined> {
    try {
      const url = assertSafeRemoteImageUrl(candidate.url);
      const addresses = await lookup(url.hostname, { all: true }); if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return undefined;
      const response = await this.fetcher(url, { redirect: "error", signal: AbortSignal.timeout(8_000) });
      const length = Number(response.headers.get("content-length") ?? 0); const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || (length && length > 15 * 1024 * 1024) || !contentType.startsWith("image/")) return undefined;
      const source = new Uint8Array(await response.arrayBuffer()); if (source.byteLength > 15 * 1024 * 1024) return undefined;
      const data = await sharp(source).rotate().resize({ width: 2400, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer(); const metadata = await sharp(data).metadata();
      if (!metadata.width || !metadata.height) return undefined;
      return { ...candidate, width: metadata.width, height: metadata.height, dataUrl: `data:image/png;base64,${data.toString("base64")}` };
    } catch { return undefined; }
  }

  private async generated(query: string): Promise<AssetCandidate | undefined> {
    if (!this.openai) return undefined;
    try {
      const response = await this.fetcher("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${this.openai.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: this.openai.model, input: `Create a clean editorial 16:9 illustration for a professional presentation. No text, numbers, logos, watermarks, charts or UI. Subject: ${query}`, tools: [{ type: "image_generation" }] }), signal: AbortSignal.timeout(45_000) });
      if (!response.ok) return undefined;
      const payload = await response.json() as { id?: string; output?: Array<{ type?: string; result?: string }> }; const encoded = payload.output?.find(({ type, result }) => type === "image_generation_call" && result)?.result;
      if (!encoded) return undefined;
      const data = Buffer.from(encoded, "base64"); const metadata = await sharp(data).metadata(); if (!metadata.width || !metadata.height) return undefined;
      return { id: payload.id ?? createHash("sha256").update(data).digest("hex").slice(0, 16), url: "https://api.openai.com/v1/responses", provider: "openai", license: "AI-generated for this presentation; review required", width: metadata.width, height: metadata.height, generated: true, dataUrl: `data:${metadata.format === "jpeg" ? "image/jpeg" : "image/png"};base64,${encoded}` };
    } catch { return undefined; }
  }

  generate(query: string): Promise<AssetCandidate | undefined> { return this.generated(query); }

  async find(input: { query: string; factual: boolean; allowGeneration: boolean; providers?: string[]; licenseAllowlist?: string[]; requireAttribution?: boolean }): Promise<AssetCandidate[]> {
    const candidates: AssetCandidate[] = [];
    const providers = new Set(input.providers ?? ["openverse", "wikimedia", "pexels", "openai"]);
    const licenseAllowed = (candidate: AssetCandidate) => {
      const allowed = !input.licenseAllowlist?.length || input.licenseAllowlist.includes(candidate.license) || (candidate.generated && input.licenseAllowlist.includes("generated")) || (candidate.provider === "pexels" && input.licenseAllowlist.includes("platform-distribution"));
      const attributionSatisfied = !input.requireAttribution || candidate.generated || !["CC-BY-4.0", "Pexels-License"].includes(candidate.license) || Boolean(candidate.attribution?.trim() && candidate.sourceUrl);
      return allowed && attributionSatisfied;
    };
    const openverse = providers.has("openverse") ? await this.fetcher(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(input.query)}&license_type=commercial&page_size=5`, { signal: AbortSignal.timeout(6_000) }).catch(() => undefined) : undefined;
    if (openverse?.ok) {
      const payload = await openverse.json() as { results?: Array<{ id?: string; url?: string; foreign_landing_url?: string; license?: string; license_version?: string; creator?: string; width?: number; height?: number }> };
      for (const item of payload.results ?? []) { const normalizedLicense = item.license === "cc0" ? "CC0-1.0" : item.license === "pdm" ? "PDM-1.0" : item.license === "by" && item.license_version === "4.0" ? "CC-BY-4.0" : undefined; if (item.id && item.url && normalizedLicense) candidates.push({ id: item.id, url: item.url, ...(item.foreign_landing_url ? { sourceUrl: item.foreign_landing_url } : {}), provider: "openverse", license: normalizedLicense, ...(item.creator ? { attribution: item.creator } : {}), ...(item.width ? { width: item.width } : {}), ...(item.height ? { height: item.height } : {}), generated: false }); }
    }
    if (candidates.length === 0 && providers.has("wikimedia")) {
      const wikimedia = await this.fetcher(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(input.query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&format=json&origin=*`, { signal: AbortSignal.timeout(6_000) }).catch(() => undefined);
      if (wikimedia?.ok) {
        const payload = await wikimedia.json() as { query?: { pages?: Record<string, { pageid?: number; imageinfo?: Array<{ url?: string; descriptionurl?: string; width?: number; height?: number; extmetadata?: Record<string, { value?: string }> }> }> } };
        for (const page of Object.values(payload.query?.pages ?? {})) { const info = page.imageinfo?.[0]; const rawLicense = info?.extmetadata?.LicenseShortName?.value ?? ""; const license = /CC0/i.test(rawLicense) ? "CC0-1.0" : /public domain|PDM/i.test(rawLicense) ? "PDM-1.0" : /CC BY(?:\s|-)?4\.0/i.test(rawLicense) && !/SA/i.test(rawLicense) ? "CC-BY-4.0" : undefined; if (page.pageid && info?.url && license) candidates.push({ id: String(page.pageid), url: info.url, ...(info.descriptionurl ? { sourceUrl: info.descriptionurl } : {}), provider: "wikimedia", license, ...(info.extmetadata?.Artist?.value ? { attribution: info.extmetadata.Artist.value.replace(/<[^>]+>/g, "").trim() } : {}), ...(info.width ? { width: info.width } : {}), ...(info.height ? { height: info.height } : {}), generated: false }); }
      }
    }
    if (candidates.length === 0 && providers.has("pexels") && this.pexelsKey) {
      const pexels = await this.fetcher(`https://api.pexels.com/v1/search?query=${encodeURIComponent(input.query)}&per_page=5`, { headers: { authorization: this.pexelsKey }, signal: AbortSignal.timeout(6_000) }).catch(() => undefined);
      if (pexels?.ok) {
        const payload = await pexels.json() as { photos?: Array<{ id: number; url?: string; photographer?: string; width?: number; height?: number; src?: { large2x?: string; original?: string } }> };
        for (const item of payload.photos ?? []) { const url = item.src?.large2x ?? item.src?.original; if (url) candidates.push({ id: String(item.id), url, ...(item.url ? { sourceUrl: item.url } : {}), provider: "pexels", license: "Pexels-License", ...(item.photographer ? { attribution: item.photographer } : {}), ...(item.width ? { width: item.width } : {}), ...(item.height ? { height: item.height } : {}), generated: false }); }
      }
    }
    const managed = (await Promise.all(candidates.filter(licenseAllowed).slice(0, 3).map((candidate) => this.managed(candidate)))).filter((candidate): candidate is AssetCandidate => Boolean(candidate));
    if (managed.length || input.factual || !input.allowGeneration) return managed;
    const generated = providers.has("openai") ? await this.generated(input.query) : undefined; return generated && licenseAllowed(generated) ? [generated] : [];
  }
}

export class PngArchiveRenderPort implements RenderPort {
  constructor(private readonly renderer: SlideRenderService, private readonly artifacts: ArtifactStorePort) {}

  async render(input: { runId: string; document: PresentationDocument; round: number }): Promise<RenderBundle> {
    const archive = await this.renderer.renderPngArchive(input.document);
    const zip = await JSZip.loadAsync(archive);
    const slideBuffers: Uint8Array[] = [];
    const slides: RenderedSlide[] = [];
    for (let index = 0; index < input.document.slides.length; index += 1) {
      const slide = input.document.slides[index]!;
      const filename = `slide-${String(index + 1).padStart(2, "0")}.png`;
      const file = zip.file(filename);
      if (!file) throw new Error(`Renderer archive is missing ${filename}`);
      const data = await file.async("uint8array");
      const metadata = await sharp(data).metadata();
      if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`${filename} must be 1920x1080, received ${metadata.width ?? 0}x${metadata.height ?? 0}`);
      const sha256 = createHash("sha256").update(data).digest("hex");
      const artifactKey = `generation/${input.runId}/render-r${input.round}/${filename}`;
      await this.artifacts.put({ key: artifactKey, data, contentType: "image/png" });
      slideBuffers.push(data);
      slides.push({ slideId: slide.id, width: 1920, height: 1080, artifactKey, sha256, data, dataUrl: `data:image/png;base64,${Buffer.from(data).toString("base64")}` });
    }
    const columns = Math.min(4, Math.max(1, slides.length)); const rows = Math.ceil(slides.length / columns); const thumbWidth = 480; const thumbHeight = 270;
    const composites = await Promise.all(slideBuffers.map(async (data, index) => ({ input: await sharp(data).resize(thumbWidth, thumbHeight).png().toBuffer(), left: index % columns * thumbWidth, top: Math.floor(index / columns) * thumbHeight })));
    const contactData = new Uint8Array(await sharp({ create: { width: columns * thumbWidth, height: rows * thumbHeight, channels: 3, background: "#111511" } }).composite(composites).png().toBuffer());
    const contactHash = createHash("sha256").update(contactData).digest("hex");
    const artifactKey = `generation/${input.runId}/render-r${input.round}/contact-sheet.png`;
    await this.artifacts.put({ key: artifactKey, data: contactData, contentType: "image/png" });
    return { slides, contactSheet: { artifactKey, data: contactData, dataUrl: `data:image/png;base64,${Buffer.from(contactData).toString("base64")}`, sha256: contactHash } };
  }
}

export function modelFindingToQualityIssue(finding: { severity: "info" | "warning" | "error"; slideId: string; ruleId: string; bbox?: { x: number; y: number; width: number; height: number } | undefined; evidence: string; repairHint: string }): QualityIssueV2 {
  return { severity: finding.severity, slideId: finding.slideId, ruleId: finding.ruleId, ...(finding.bbox ? { bbox: finding.bbox } : {}), evidence: finding.evidence, repairHint: finding.repairHint, message: finding.evidence };
}
