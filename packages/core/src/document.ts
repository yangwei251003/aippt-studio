import { z } from "zod";
import { evidenceRecordSchema } from "./evidence.js";

const idSchema = z.string().min(1).max(128);
const unitSchema = z.number().finite();
const colorSchema = z.string().min(1).max(64);

const elementBaseSchema = z.object({
  id: idSchema,
  x: unitSchema,
  y: unitSchema,
  width: unitSchema.positive(),
  height: unitSchema.positive(),
  rotation: unitSchema.default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  name: z.string().max(200).optional(),
  semanticRole: z.enum(["title", "subtitle", "body", "caption", "source", "decorative", "data-visual", "data-table", "image", "shape"]).default("body"),
  readingOrder: z.number().int().nonnegative().default(0),
  decorative: z.boolean().default(false),
  evidenceRefs: z.array(idSchema).default([]),
  overlapPolicy: z.enum(["none", "container", "intentional"]).default("none"),
});

export const textElementSchema = elementBaseSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  fontFamily: z.string().min(1).default("Aptos"),
  fontSize: z.number().positive().max(400).default(24),
  color: colorSchema.default("#17231F"),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: z.enum(["left", "center", "right"]).default("left"),
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
});

export const imageElementSchema = elementBaseSchema.extend({
  type: z.literal("image"),
  src: z.string().min(1),
  alt: z.string().default(""),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
  intrinsicWidth: z.number().int().positive().optional(),
  intrinsicHeight: z.number().int().positive().optional(),
  provenance: z.object({
    provider: z.string().min(1),
    sourceUrl: z.string().url().optional(),
    license: z.string().min(1),
    author: z.string().optional(),
    generated: z.boolean().default(false),
    prompt: z.string().optional(),
  }).optional(),
});

export const shapeElementSchema = elementBaseSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rect", "roundRect", "ellipse", "line", "arrow"]),
  fill: colorSchema.default("#D7E4DC"),
  stroke: colorSchema.default("#6F7E76"),
  strokeWidth: z.number().min(0).max(40).default(1),
});

export const chartElementSchema = elementBaseSchema.extend({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "column", "line", "area", "pie", "doughnut"]),
  categories: z.array(z.string()).min(1),
  series: z.array(z.object({ name: z.string().min(1), values: z.array(z.number().finite()).min(1) })).min(1),
  unit: z.string().default(""),
  sourceEvidenceId: idSchema,
  showLegend: z.boolean().default(true),
  showValues: z.boolean().default(false),
  colorScheme: z.array(colorSchema).min(1).default(["#426B57", "#F28B50"]),
}).superRefine((chart, context) => {
  for (const [index, series] of chart.series.entries()) {
    if (series.values.length !== chart.categories.length) context.addIssue({ code: "custom", path: ["series", index, "values"], message: "Chart values must match category count" });
  }
  if (!chart.evidenceRefs.includes(chart.sourceEvidenceId)) context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Chart sourceEvidenceId must be present in evidenceRefs" });
});

export const tableElementSchema = elementBaseSchema.extend({
  type: z.literal("table"),
  columns: z.array(z.object({ key: idSchema, label: z.string().min(1), width: z.number().positive().optional() })).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1),
  headerColor: colorSchema.default("#426B57"),
  bodyColor: colorSchema.default("#F6F5EF"),
  textColor: colorSchema.default("#17231F"),
  sourceEvidenceId: idSchema,
}).superRefine((table, context) => {
  const keys = new Set(table.columns.map(({ key }) => key));
  table.rows.forEach((row, rowIndex) => Object.keys(row).forEach((key) => {
    if (!keys.has(key)) context.addIssue({ code: "custom", path: ["rows", rowIndex, key], message: `Unknown table column ${key}` });
  }));
  if (!table.evidenceRefs.includes(table.sourceEvidenceId)) context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Table sourceEvidenceId must be present in evidenceRefs" });
});

export const presentationElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  chartElementSchema,
  tableElementSchema,
]);

export const slideSchema = z.object({
  id: idSchema,
  title: z.string().max(300).default(""),
  background: colorSchema.default("#F6F5EF"),
  elements: z.array(presentationElementSchema).default([]),
  notes: z.string().default(""),
}).superRefine((slide, context) => {
  const seen = new Set<string>();
  slide.elements.forEach((element, index) => {
    if (seen.has(element.id)) context.addIssue({ code: "custom", path: ["elements", index, "id"], message: `Duplicate element id ${element.id}` });
    seen.add(element.id);
  });
});

export const presentationThemeSchema = z.object({
  name: z.string().min(1).default("AIPPT Sage"),
  headingFont: z.string().min(1).default("Aptos Display"),
  bodyFont: z.string().min(1).default("Aptos"),
  colors: z.object({
    background: colorSchema.default("#F6F5EF"),
    foreground: colorSchema.default("#17231F"),
    primary: colorSchema.default("#426B57"),
    accent: colorSchema.default("#F28B50"),
    muted: colorSchema.default("#D7E4DC"),
  }),
});

export const presentationSourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  url: z.string().url().optional(),
  note: z.string().optional(),
  kind: z.enum(["upload", "web", "fact", "citation"]).default("upload"),
  license: z.string().optional(),
  authorized: z.boolean().default(true),
});

export const presentationBriefSchema = z.object({
  originalPrompt: z.string().optional(),
  topic: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  sourceFileIds: z.array(idSchema).optional(),
  scenario: z.string().optional(),
  goal: z.string().default(""),
  audience: z.array(z.string()).default([]),
  durationMinutes: z.number().positive().default(15),
  language: z.string().default("zh-CN"),
  desiredAction: z.string().default(""),
  constraints: z.array(z.string()).default([]),
});

export const storyboardItemSchema = z.object({
  id: idSchema,
  section: z.string().default(""),
  conclusion: z.string().default(""),
  evidence: z.array(z.string()).default([]),
  visualIntent: z.string().default(""),
  notes: z.string().default(""),
  slideId: idSchema.optional(),
});

export const canvasFrameSchema = z.object({
  id: idSchema,
  name: z.string().default(""),
  x: unitSchema,
  y: unitSchema,
  width: unitSchema.positive(),
  height: unitSchema.positive(),
  slideId: idSchema.optional(),
});

export const cameraPathStepSchema = z.object({
  frameId: idSchema,
  order: z.number().int().nonnegative(),
  durationMs: z.number().int().positive().default(800),
  easing: z.string().default("ease-in-out"),
});

export const assetRecordSchema = z.object({
  id: idSchema,
  kind: z.enum(["image", "svg", "video", "audio", "font", "template"]),
  uri: z.string().min(1),
  source: z.string().default("user"),
  model: z.string().optional(),
  prompt: z.string().optional(),
  license: z.string().optional(),
  checksum: z.string().optional(),
});

export const revisionRecordSchema = z.object({
  id: idSchema,
  at: z.string().datetime(),
  actor: z.string().default("system"),
  summary: z.string().default(""),
  parentRevision: z.number().int().nonnegative().optional(),
});

export const presentationDocumentSchema = z.object({
  schemaVersion: z.enum(["1.0.0", "2.0.0"]).default("2.0.0"),
  id: idSchema,
  projectId: idSchema,
  title: z.string().min(1).max(300),
  aspectRatio: z.literal("16:9").default("16:9"),
  mode: z.enum(["standard", "html", "image", "canvas"]).default("standard"),
  brief: presentationBriefSchema.default({ goal: "", audience: [], durationMinutes: 15, language: "zh-CN", desiredAction: "", constraints: [] }),
  theme: presentationThemeSchema,
  sources: z.array(presentationSourceSchema).default([]),
  evidenceLedger: z.array(evidenceRecordSchema).default([]),
  storyboard: z.array(storyboardItemSchema).default([]),
  slides: z.array(slideSchema).min(1),
  frames: z.array(canvasFrameSchema).default([]),
  path: z.array(cameraPathStepSchema).default([]),
  assets: z.array(assetRecordSchema).default([]),
  revisions: z.array(revisionRecordSchema).default([]),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((document, context) => {
  const seen = new Set<string>();
  document.slides.forEach((slide, index) => {
    if (seen.has(slide.id)) context.addIssue({ code: "custom", path: ["slides", index, "id"], message: `Duplicate slide id ${slide.id}` });
    seen.add(slide.id);
  });
});

export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type ChartElement = z.infer<typeof chartElementSchema>;
export type TableElement = z.infer<typeof tableElementSchema>;
export type PresentationElement = z.infer<typeof presentationElementSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type PresentationTheme = z.infer<typeof presentationThemeSchema>;
export type PresentationSource = z.infer<typeof presentationSourceSchema>;
export type PresentationBrief = z.infer<typeof presentationBriefSchema>;
export type StoryboardItem = z.infer<typeof storyboardItemSchema>;
export type CanvasFrame = z.infer<typeof canvasFrameSchema>;
export type CameraPathStep = z.infer<typeof cameraPathStepSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type RevisionRecord = z.infer<typeof revisionRecordSchema>;
export type PresentationDocument = z.infer<typeof presentationDocumentSchema>;

export type PresentationDocumentV2 = PresentationDocument & { schemaVersion: "2.0.0" };

export function createPresentationDocumentV2(input: { id: string; projectId: string; title: string; now?: string }): PresentationDocumentV2 {
  const now = input.now ?? new Date().toISOString();
  return presentationDocumentSchema.parse({
    schemaVersion: "2.0.0",
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    aspectRatio: "16:9",
    mode: "standard",
    brief: {},
    theme: {
      name: "AIPPT Signal",
      headingFont: "Aptos Display",
      bodyFont: "Aptos",
      colors: { background: "#0A0A0A", foreground: "#F4F4EF", primary: "#B7F34A", accent: "#FF725E", muted: "#272927" },
    },
    sources: [],
    evidenceLedger: [],
    storyboard: [],
    slides: [{ id: "slide-1", title: input.title, background: "#0A0A0A", elements: [], notes: "" }],
    frames: [],
    path: [],
    assets: [],
    revisions: [],
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }) as PresentationDocumentV2;
}

export function cloneDocument(document: PresentationDocument): PresentationDocument {
  return presentationDocumentSchema.parse(structuredClone(document));
}
