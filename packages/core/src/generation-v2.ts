import { createHash } from "node:crypto";
import { z } from "zod";
import { presentationDocumentSchema } from "./document.js";
import { evidenceRecordSchema } from "./evidence.js";
import { creationBriefSchema } from "./generation.js";
import { qualityReportV2Schema } from "./quality.js";

export const GENERATION_WORKFLOW_VERSION = "2.0.0" as const;
export const qualityProfileSchema = z.enum(["standard", "premium"]);
export type QualityProfile = z.infer<typeof qualityProfileSchema>;

export const WORKFLOW_STEPS_V2 = [
  "brief-research",
  "evidence-ledger",
  "story-architecture",
  "data-narrative",
  "visual-direction",
  "layout-routing",
  "slide-copy",
  "scene-compile",
  "render-review",
  "bounded-repair",
  "delivery",
] as const;
export type WorkflowStepV2 = typeof WORKFLOW_STEPS_V2[number];

const sourceLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), page: z.number().int().positive() }),
  z.object({ kind: z.literal("paragraph"), paragraph: z.number().int().positive() }),
  z.object({ kind: z.literal("cell"), sheet: z.string().min(1), cell: z.string().min(1) }),
  z.object({ kind: z.literal("slide"), slide: z.number().int().positive() }),
  z.object({ kind: z.literal("web"), locator: z.string().min(1) }),
]);

export const generationSourceChunkSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  text: z.string().min(1),
  location: sourceLocationSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type GenerationSourceChunk = z.infer<typeof generationSourceChunkSchema>;

export const resourceBindingSnapshotSchema = z.object({
  creationMode: z.enum(["standard", "html", "image"]).default("standard"),
  templateId: z.string().min(1).default("builtin.core"),
  templateVersion: z.string().min(1).default("2.0.0"),
  skillIds: z.array(z.string().min(1)).max(12).default([]),
  assetPolicy: creationBriefSchema.shape.assetPolicy,
});

export const generationRunInputSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  presentationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  sourceRevision: z.number().int().nonnegative(),
  briefSnapshot: creationBriefSchema,
  resourceBindingSnapshot: resourceBindingSnapshotSchema,
  qualityProfile: qualityProfileSchema.default("standard"),
  workflowVersion: z.literal(GENERATION_WORKFLOW_VERSION),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type GenerationRunInput = z.infer<typeof generationRunInputSchema>;

export function generationInputHash(input: Omit<GenerationRunInput, "inputHash">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export const layoutSlotSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["title", "subtitle", "body", "metric", "image", "chart", "table", "caption", "source", "action"]),
  required: z.boolean().default(true),
  maxCharacters: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  minFontSize: z.number().positive(),
  preferredAspectRatio: z.number().positive().optional(),
});

export const layoutContractSchema = z.object({
  id: z.string().min(1),
  semanticUse: z.array(z.string().min(1)).min(1),
  slots: z.array(layoutSlotSchema).min(1),
  fallbackLayoutIds: z.array(z.string().min(1)).default([]),
  editable: z.boolean().default(true),
  titleMaxLines: z.number().int().min(1).max(3).default(2),
  visualWeight: z.enum(["light", "balanced", "strong"]),
});
export type LayoutContract = z.infer<typeof layoutContractSchema>;

const slot = (id: string, kind: z.infer<typeof layoutSlotSchema>["kind"], maxCharacters: number, maxLines: number, minFontSize: number, required = true, preferredAspectRatio?: number) => ({ id, kind, maxCharacters, maxLines, minFontSize, required, ...(preferredAspectRatio ? { preferredAspectRatio } : {}) });

export const CORE_LAYOUT_CONTRACTS: readonly LayoutContract[] = z.array(layoutContractSchema).min(15).parse([
  { id: "core.cover-hero", semanticUse: ["cover", "opening"], slots: [slot("title", "title", 44, 2, 50), slot("subtitle", "subtitle", 72, 2, 24), slot("hero", "image", 1, 1, 18, false, 1)], fallbackLayoutIds: ["core.cover-minimal"], visualWeight: "strong" },
  { id: "core.cover-minimal", semanticUse: ["cover", "opening"], slots: [slot("title", "title", 44, 2, 50), slot("subtitle", "subtitle", 72, 2, 24)], fallbackLayoutIds: [], visualWeight: "light" },
  { id: "core.assertion-evidence", semanticUse: ["argument", "evidence"], slots: [slot("title", "title", 42, 2, 35), slot("assertion", "body", 92, 4, 22), slot("evidence", "body", 120, 5, 18), slot("source", "source", 88, 2, 18, false)], fallbackLayoutIds: ["core.two-column"], visualWeight: "balanced" },
  { id: "core.metric-trio", semanticUse: ["metrics", "operating-review"], slots: [slot("title", "title", 42, 2, 35), slot("metric-1", "metric", 24, 2, 28), slot("metric-2", "metric", 24, 2, 28), slot("metric-3", "metric", 24, 2, 28), slot("caption", "caption", 72, 2, 18, false)], fallbackLayoutIds: ["core.three-card"], visualWeight: "strong" },
  { id: "core.split-compare", semanticUse: ["comparison", "decision"], slots: [slot("title", "title", 42, 2, 35), slot("left", "body", 96, 5, 18), slot("right", "body", 96, 5, 18)], fallbackLayoutIds: ["core.two-column"], visualWeight: "balanced" },
  { id: "core.quote-proof", semanticUse: ["quote", "proof"], slots: [slot("title", "title", 42, 2, 35), slot("quote", "body", 110, 4, 24), slot("source", "source", 88, 2, 18)], fallbackLayoutIds: ["core.assertion-evidence"], visualWeight: "light" },
  { id: "core.timeline", semanticUse: ["timeline", "roadmap"], slots: [slot("title", "title", 42, 2, 35), slot("phase-1", "body", 44, 3, 18), slot("phase-2", "body", 44, 3, 18), slot("phase-3", "body", 44, 3, 18), slot("phase-4", "body", 44, 3, 18, false)], fallbackLayoutIds: ["core.process"], visualWeight: "balanced" },
  { id: "core.process", semanticUse: ["process", "architecture"], slots: [slot("title", "title", 42, 2, 35), slot("step-1", "body", 42, 3, 18), slot("step-2", "body", 42, 3, 18), slot("step-3", "body", 42, 3, 18), slot("step-4", "body", 42, 3, 18, false)], fallbackLayoutIds: ["core.timeline"], visualWeight: "balanced" },
  { id: "core.two-column", semanticUse: ["explanation", "framework"], slots: [slot("title", "title", 42, 2, 35), slot("left", "body", 118, 6, 18), slot("right", "body", 118, 6, 18)], fallbackLayoutIds: ["core.assertion-evidence"], visualWeight: "light" },
  { id: "core.three-card", semanticUse: ["framework", "pillars"], slots: [slot("title", "title", 42, 2, 35), slot("card-1", "body", 68, 4, 18), slot("card-2", "body", 68, 4, 18), slot("card-3", "body", 68, 4, 18)], fallbackLayoutIds: ["core.two-column"], visualWeight: "balanced" },
  { id: "core.data-chart", semanticUse: ["data", "trend", "comparison"], slots: [slot("title", "title", 42, 2, 35), slot("chart", "chart", 1, 1, 18), slot("insight", "body", 82, 4, 18), slot("source", "source", 88, 2, 18)], fallbackLayoutIds: ["core.assertion-evidence"], visualWeight: "strong" },
  { id: "core.data-table", semanticUse: ["data", "detail", "appendix"], slots: [slot("title", "title", 42, 2, 35), slot("table", "table", 1, 1, 18), slot("source", "source", 88, 2, 18)], fallbackLayoutIds: ["core.two-column"], visualWeight: "balanced" },
  { id: "core.image-caption", semanticUse: ["case", "place", "product"], slots: [slot("title", "title", 42, 2, 35), slot("image", "image", 1, 1, 18, true, 1.5), slot("caption", "caption", 100, 3, 18), slot("source", "source", 88, 2, 18, false)], fallbackLayoutIds: ["core.assertion-evidence"], visualWeight: "strong" },
  { id: "core.section-break", semanticUse: ["section", "transition"], slots: [slot("title", "title", 52, 2, 44), slot("subtitle", "subtitle", 72, 2, 24)], fallbackLayoutIds: ["core.cover-minimal"], visualWeight: "strong" },
  { id: "core.stakeholder-map", semanticUse: ["stakeholder", "ecosystem", "architecture"], slots: [slot("title", "title", 42, 2, 35), slot("center", "body", 44, 3, 20), slot("node-1", "body", 34, 2, 18), slot("node-2", "body", 34, 2, 18), slot("node-3", "body", 34, 2, 18), slot("node-4", "body", 34, 2, 18, false)], fallbackLayoutIds: ["core.three-card"], visualWeight: "balanced" },
  { id: "core.action-summary", semanticUse: ["action", "closing", "decision"], slots: [slot("title", "title", 46, 2, 38), slot("action", "action", 108, 4, 22), slot("next-step", "body", 78, 3, 18)], fallbackLayoutIds: ["core.assertion-evidence"], visualWeight: "strong" },
]);

export const slideRoleSchema = z.enum(["cover", "context", "problem", "insight", "evidence", "solution", "comparison", "process", "roadmap", "decision", "closing", "appendix"]);
const storySlideSchema = z.object({
  id: z.string().min(1), order: z.number().int().positive(), role: slideRoleSchema, section: z.string(), assertion: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).default([]), transition: z.string().default(""), timingSeconds: z.number().int().positive(),
  visualIntent: z.string().default(""), keyPoints: z.array(z.string().min(1)).max(6).default([]),
});
const visualDirectionArtifactSchema = z.object({
  name: z.string().min(1), headingFont: z.string().min(1), bodyFont: z.string().min(1),
  palette: z.object({ background: z.string(), foreground: z.string(), primary: z.string(), accent: z.string(), muted: z.string() }),
  spacingUnit: z.number().positive(), cornerRadius: z.number().nonnegative(), imageLanguage: z.string().min(1), chartLanguage: z.string().min(1), rhythm: z.array(z.enum(["light", "balanced", "strong"])).min(1),
});
const layoutAssignmentSchema = z.object({ slideId: z.string().min(1), layoutId: z.string().min(1), fallbackLayoutIds: z.array(z.string()).default([]), slotCapacities: z.record(z.string(), z.number().int().positive()) });
const slideAssetSchema = z.object({
  id: z.string().min(1), src: z.string().min(1), alt: z.string().min(1), provider: z.enum(["openverse", "wikimedia", "pexels", "openai"]),
  sourceUrl: z.string().url(), license: z.string().min(1), attribution: z.string().optional(), width: z.number().int().positive(), height: z.number().int().positive(), generated: z.boolean(),
});
const slideCopySchema = z.object({ slideId: z.string().min(1), title: z.string().min(1), slots: z.record(z.string(), z.string()), speakerNotes: z.string().default(""), evidenceIds: z.array(z.string()).default([]), asset: slideAssetSchema.optional() });
export const renderFindingSchema = z.object({
  severity: z.enum(["info", "warning", "error"]), slideId: z.string().min(1), ruleId: z.string().min(1),
  bbox: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).optional(),
  evidence: z.string().min(1), repairHint: z.string().min(1),
});
export const renderedSlideReferenceSchema = z.object({ slideId: z.string().min(1), width: z.literal(1920), height: z.literal(1080), artifactKey: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) });

const artifactBase = <T extends WorkflowStepV2>(step: T) => z.object({ schemaVersion: z.literal(GENERATION_WORKFLOW_VERSION), step: z.literal(step), summary: z.string().min(1).max(500), artifactHash: z.string().regex(/^[a-f0-9]{64}$/) });
const workflowArtifactSchemas = [
  artifactBase("brief-research").extend({ data: z.object({ brief: creationBriefSchema, mustCover: z.array(z.string()), assumptions: z.array(z.string()), openQuestions: z.array(z.string()), sourceChunks: z.array(generationSourceChunkSchema) }) }),
  artifactBase("evidence-ledger").extend({ data: z.object({ records: z.array(evidenceRecordSchema), claimCoverage: z.array(z.object({ claim: z.string(), evidenceIds: z.array(z.string()), status: z.enum(["supported", "assumption", "simulation", "missing"]) })) }) }),
  artifactBase("story-architecture").extend({ data: z.object({ title: z.string().min(1), coreClaim: z.string().min(1), slides: z.array(storySlideSchema).min(3), alternativesConsidered: z.number().int().min(1).max(2), selectedReason: z.string().min(1) }) }),
  artifactBase("data-narrative").extend({ data: z.object({ skipped: z.boolean(), charts: z.array(z.object({ slideId: z.string(), chartType: z.enum(["bar", "column", "line", "area", "pie", "doughnut"]), categories: z.array(z.string()).min(1), series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1), unit: z.string(), evidenceId: z.string() })) }) }),
  artifactBase("visual-direction").extend({ data: visualDirectionArtifactSchema }),
  artifactBase("layout-routing").extend({ data: z.object({ assignments: z.array(layoutAssignmentSchema).min(3) }) }),
  artifactBase("slide-copy").extend({ data: z.object({ slides: z.array(slideCopySchema).min(3) }) }),
  artifactBase("scene-compile").extend({ data: z.object({ document: presentationDocumentSchema, artifactId: z.string().min(1), artifactHash: z.string().regex(/^[a-f0-9]{64}$/) }) }),
  artifactBase("render-review").extend({ data: z.object({ renderedSlides: z.array(renderedSlideReferenceSchema), contactSheetArtifactKey: z.string().min(1), findings: z.array(renderFindingSchema), reviewedSlideIds: z.array(z.string()), qualityReport: qualityReportV2Schema }) }),
  artifactBase("bounded-repair").extend({ data: z.object({ document: presentationDocumentSchema, rounds: z.number().int().min(0).max(2), repairedSlideIds: z.array(z.string()), rolledBack: z.boolean(), artifactId: z.string().min(1), artifactHash: z.string().regex(/^[a-f0-9]{64}$/), qualityReport: qualityReportV2Schema }) }),
  artifactBase("delivery").extend({ data: z.object({ document: presentationDocumentSchema, qualityStatus: z.enum(["passed", "needs_review"]), bestArtifactId: z.string().min(1), renderArtifactKeys: z.array(z.string()), fallbackLog: z.array(z.string()), qualityReport: qualityReportV2Schema }) }),
] as const;

export const workflowArtifactSchema = z.discriminatedUnion("step", workflowArtifactSchemas);
export type WorkflowArtifact = z.infer<typeof workflowArtifactSchema>;
export type WorkflowArtifactsV2 = Partial<Record<WorkflowStepV2, WorkflowArtifact>>;

export const generationOutcomeSchema = z.object({
  presentation: presentationDocumentSchema,
  qualityReport: z.unknown(),
  qualityStatus: z.enum(["passed", "needs_review"]),
  bestArtifactId: z.string().min(1),
  workflowRunId: z.string().min(1),
  modelAssignments: z.record(z.string(), z.object({ modelId: z.string(), promptVersion: z.string() })),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), costUsd: z.number().nonnegative() }),
  durationMs: z.number().int().nonnegative(),
  fallbackLog: z.array(z.string()),
});
export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;
