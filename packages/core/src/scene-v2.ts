import { createHash } from "node:crypto";
import { presentationDocumentSchema, presentationElementSchema, type PresentationDocument, type PresentationElement, type Slide } from "./document.js";
import type { CreationBrief } from "./generation.js";
import type { EvidenceRecord } from "./evidence.js";

export interface SceneStorySlide {
  id: string;
  order: number;
  role: "cover" | "context" | "problem" | "insight" | "evidence" | "solution" | "comparison" | "process" | "roadmap" | "decision" | "closing" | "appendix";
  section: string;
  assertion: string;
  evidenceIds: string[];
  transition: string;
  timingSeconds: number;
  visualIntent: string;
  keyPoints: string[];
}

export interface SceneVisualDirection {
  name: string;
  headingFont: string;
  bodyFont: string;
  palette: { background: string; foreground: string; primary: string; accent: string; muted: string };
  spacingUnit: number;
  cornerRadius: number;
  imageLanguage: string;
  chartLanguage: string;
  rhythm: Array<"light" | "balanced" | "strong">;
}

export interface SceneLayoutAssignment { slideId: string; layoutId: string; fallbackLayoutIds: string[]; slotCapacities: Record<string, number> }
export interface SceneSlideAsset { id: string; src: string; alt: string; provider: "openverse" | "wikimedia" | "pexels" | "openai"; sourceUrl: string; license: string; attribution?: string | undefined; width: number; height: number; generated: boolean }
export interface SceneSlideCopy { slideId: string; title: string; slots: Record<string, string>; speakerNotes: string; evidenceIds: string[]; asset?: SceneSlideAsset | undefined }
export interface SceneChart { slideId: string; chartType: "bar" | "column" | "line" | "area" | "pie" | "doughnut"; categories: string[]; series: Array<{ name: string; values: number[] }>; unit: string; evidenceId: string }

export interface CompilePresentationSceneInput {
  projectId: string;
  presentationId: string;
  brief: CreationBrief;
  title: string;
  story: SceneStorySlide[];
  visual: SceneVisualDirection;
  layouts: SceneLayoutAssignment[];
  copy: SceneSlideCopy[];
  charts: SceneChart[];
  evidenceLedger: EvidenceRecord[];
  mode: "standard" | "html" | "image";
  now?: string;
}

const common = (id: string, type: PresentationElement["type"], x: number, y: number, width: number, height: number, readingOrder: number, semanticRole: PresentationElement["semanticRole"], evidenceRefs: string[] = [], decorative = false) => ({ id, type, x, y, width, height, rotation: 0, opacity: 1, locked: false, semanticRole, readingOrder, decorative, evidenceRefs, overlapPolicy: decorative ? "intentional" as const : "none" as const });

function textElement(input: { id: string; text: string; x: number; y: number; width: number; height: number; fontSize: number; color: string; fontFamily: string; readingOrder: number; semanticRole: "title" | "subtitle" | "body" | "caption" | "source"; evidenceRefs?: string[]; bold?: boolean; align?: "left" | "center" | "right" }): PresentationElement {
  return presentationElementSchema.parse({
    ...common(input.id, "text", input.x, input.y, input.width, input.height, input.readingOrder, input.semanticRole, input.evidenceRefs),
    text: input.text, fontFamily: input.fontFamily, fontSize: input.fontSize, color: input.color, bold: input.bold ?? false, italic: false,
    align: input.align ?? "left", verticalAlign: "top",
  });
}

function shapeElement(input: { id: string; x: number; y: number; width: number; height: number; fill: string; stroke?: string; shape?: "rect" | "roundRect" | "ellipse" | "line" | "arrow" }): PresentationElement {
  return presentationElementSchema.parse({
    ...common(input.id, "shape", input.x, input.y, input.width, input.height, 0, "decorative", [], true),
    shape: input.shape ?? "roundRect", fill: input.fill, stroke: input.stroke ?? input.fill, strokeWidth: input.shape === "line" ? 2 : 0,
  });
}

function imageElement(input: { id: string; asset: SceneSlideAsset; alt: string; x: number; y: number; width: number; height: number; readingOrder: number; evidenceRefs: string[] }): PresentationElement {
  return presentationElementSchema.parse({ ...common(input.id, "image", input.x, input.y, input.width, input.height, input.readingOrder, "image", input.evidenceRefs), src: input.asset.src, alt: input.alt, fit: "cover", intrinsicWidth: input.asset.width, intrinsicHeight: input.asset.height, provenance: { provider: input.asset.provider, sourceUrl: input.asset.sourceUrl, license: input.asset.license, ...(input.asset.attribution ? { author: input.asset.attribution } : {}), generated: input.asset.generated } });
}

function slot(copy: SceneSlideCopy, keys: string[], fallback = ""): string {
  for (const key of keys) if (copy.slots[key]?.trim()) return copy.slots[key]!.trim();
  return fallback;
}

function points(copy: SceneSlideCopy, story: SceneStorySlide): string[] {
  const preferred = Object.entries(copy.slots).filter(([key, value]) => key !== "title" && key !== "source" && value.trim()).map(([, value]) => value.trim());
  return (preferred.length ? preferred : story.keyPoints).filter(Boolean).slice(0, 4);
}

function sourceLabel(evidenceIds: string[]): string { return evidenceIds.length ? `来源：${evidenceIds.join(" · ")}` : "本页不含需外部验证的事实性数据"; }

function compileSlide(input: { story: SceneStorySlide; copy: SceneSlideCopy; layout: SceneLayoutAssignment; chart?: SceneChart; visual: SceneVisualDirection; index: number }): Slide {
  const { story, copy, layout, chart, visual, index } = input;
  const { palette } = visual;
  const body = points(copy, story);
  const evidenceRefs = [...new Set([...story.evidenceIds, ...copy.evidenceIds, ...(chart ? [chart.evidenceId] : [])])];
  let order = 1;
  const title = (fontSize = index === 0 ? 50 : 35, x = .78, y = .58, width = 11.75, height = index === 0 ? 1.45 : 1.05) => textElement({ id: `title-${index + 1}`, text: copy.title || story.assertion, x, y, width, height, fontSize, color: palette.foreground, fontFamily: visual.headingFont, readingOrder: order++, semanticRole: "title", evidenceRefs, bold: true });
  const source = () => textElement({ id: `source-${index + 1}`, text: sourceLabel(evidenceRefs), x: .82, y: 6.76, width: 11.65, height: .34, fontSize: 18, color: palette.foreground, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "source", evidenceRefs });
  const bodyText = (id: string, value: string, x: number, y: number, width: number, height: number, fontSize = 18, bold = false, align: "left" | "center" | "right" = "left") => textElement({ id, text: value, x, y, width, height, fontSize, color: palette.foreground, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "body", evidenceRefs, bold, align });
  const elements: PresentationElement[] = [];

  switch (layout.layoutId) {
    case "core.cover-hero":
      elements.push(shapeElement({ id: `cover-field-${index}`, x: 8.55, y: .45, width: 4.1, height: 6.6, fill: palette.primary }), title(50, .8, 1.1, 7.2, 1.65), textElement({ id: `subtitle-${index}`, text: slot(copy, ["subtitle", "assertion", "body"], body[0] ?? story.transition), x: .84, y: 3.2, width: 6.8, height: 1.4, fontSize: 24, color: palette.foreground, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "subtitle", evidenceRefs }), source());
      break;
    case "core.cover-minimal":
    case "core.section-break":
      elements.push(shapeElement({ id: `accent-${index}`, x: .82, y: 1.05, width: 1.35, height: .12, fill: palette.accent, shape: "rect" }), title(layout.layoutId === "core.section-break" ? 44 : 50, .84, 2.05, 10.8, 1.65), textElement({ id: `subtitle-${index}`, text: slot(copy, ["subtitle", "body"], body[0] ?? story.transition), x: .88, y: 4.2, width: 9.6, height: .95, fontSize: 24, color: palette.foreground, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "subtitle", evidenceRefs }), source());
      break;
    case "core.metric-trio":
    case "core.three-card":
      elements.push(title());
      for (let i = 0; i < 3; i += 1) {
        const value = body[i] ?? story.keyPoints[i] ?? story.assertion;
        const x = .8 + i * 4.18;
        elements.push(shapeElement({ id: `card-${index}-${i}`, x, y: 2.05, width: 3.7, height: 4.2, fill: i === 0 ? palette.primary : palette.muted }));
        elements.push(bodyText(`card-copy-${index}-${i}`, value, x + .38, 2.75, 2.94, 2.55, layout.layoutId === "core.metric-trio" ? 24 : 18, i === 0));
      }
      elements.push(source());
      break;
    case "core.split-compare":
    case "core.two-column":
      elements.push(title(), shapeElement({ id: `left-panel-${index}`, x: .8, y: 2, width: 5.85, height: 4.35, fill: palette.muted }), shapeElement({ id: `right-panel-${index}`, x: 6.95, y: 2, width: 5.55, height: 4.35, fill: palette.primary }), bodyText(`left-copy-${index}`, body[0] ?? story.assertion, 1.2, 2.55, 4.95, 2.8, 20), textElement({ id: `right-copy-${index}`, text: body[1] ?? body[0] ?? story.assertion, x: 7.35, y: 2.55, width: 4.75, height: 2.8, fontSize: 20, color: palette.background, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "body", evidenceRefs, bold: true }), source());
      break;
    case "core.quote-proof":
      elements.push(title(), textElement({ id: `quote-${index}`, text: `“${slot(copy, ["quote", "assertion", "body"], body[0] ?? story.assertion)}”`, x: 1.35, y: 2.35, width: 10.5, height: 2.5, fontSize: 24, color: palette.foreground, fontFamily: visual.headingFont, readingOrder: order++, semanticRole: "body", evidenceRefs, bold: true, align: "center" }), source());
      break;
    case "core.timeline":
    case "core.process":
      elements.push(title(), shapeElement({ id: `rail-${index}`, x: 1.05, y: 3.18, width: 11.05, height: .05, fill: palette.primary, shape: "line" }));
      for (let i = 0; i < Math.min(4, Math.max(3, body.length)); i += 1) {
        const x = 1.05 + i * 3.05;
        elements.push(shapeElement({ id: `node-${index}-${i}`, x, y: 2.85, width: .65, height: .65, fill: i === 1 ? palette.accent : palette.primary, shape: "ellipse" }));
        elements.push(bodyText(`step-${index}-${i}`, body[i] ?? story.keyPoints[i] ?? story.assertion, x - .15, 4.05, 2.55, 1.35, 18, i === 1));
      }
      elements.push(source());
      break;
    case "core.data-chart":
      elements.push(title());
      if (chart) elements.push(presentationElementSchema.parse({ ...common(`chart-${index}`, "chart", .82, 1.95, 8.15, 4.65, order++, "data-visual", [chart.evidenceId]), chartType: chart.chartType, categories: chart.categories, series: chart.series, unit: chart.unit, sourceEvidenceId: chart.evidenceId, showLegend: true, showValues: true, colorScheme: [palette.primary, palette.accent] }));
      else elements.push(shapeElement({ id: `chart-fallback-${index}`, x: .82, y: 1.95, width: 8.15, height: 4.65, fill: palette.muted }), bodyText(`framework-${index}`, body[0] ?? story.assertion, 1.3, 3.2, 7.15, 1.5, 22, true, "center"));
      elements.push(bodyText(`insight-${index}`, body.at(-1) ?? story.assertion, 9.45, 2.25, 2.75, 3.5, 18, true), source());
      break;
    case "core.data-table": {
      elements.push(title());
      const rows = body.slice(0, 4).map((value, rowIndex) => ({ item: `0${rowIndex + 1}`, detail: value }));
      const evidenceId = evidenceRefs[0];
      if (evidenceId) elements.push(presentationElementSchema.parse({ ...common(`table-${index}`, "table", .82, 1.95, 11.65, 4.65, order++, "data-table", [evidenceId]), columns: [{ key: "item", label: "序号", width: 1.3 }, { key: "detail", label: "内容" }], rows: rows.length ? rows : [{ item: "01", detail: story.assertion }], headerColor: palette.primary, bodyColor: palette.background, textColor: palette.foreground, sourceEvidenceId: evidenceId }));
      else elements.push(bodyText(`table-fallback-${index}`, body.join("\n") || story.assertion, 1.1, 2.35, 10.9, 3.7, 20));
      elements.push(source());
      break;
    }
    case "core.stakeholder-map":
      elements.push(title(), shapeElement({ id: `hub-${index}`, x: 5.2, y: 2.75, width: 2.9, height: 1.45, fill: palette.primary }), textElement({ id: `hub-copy-${index}`, text: slot(copy, ["center", "assertion"], story.assertion), x: 5.55, y: 3.1, width: 2.2, height: .75, fontSize: 20, color: palette.background, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "body", evidenceRefs, bold: true, align: "center" }));
      body.slice(0, 4).forEach((value, i) => { const x = i % 2 === 0 ? .85 : 9.25; const y = i < 2 ? 2.15 : 4.65; elements.push(shapeElement({ id: `peer-${index}-${i}`, x, y, width: 3.2, height: 1.15, fill: palette.muted }), bodyText(`peer-copy-${index}-${i}`, value, x + .28, y + .25, 2.65, .65, 18, false, "center")); });
      elements.push(source());
      break;
    case "core.action-summary":
      elements.push(shapeElement({ id: `action-field-${index}`, x: .45, y: .42, width: 12.43, height: 6.65, fill: palette.primary }), textElement({ id: `title-${index + 1}`, text: copy.title || story.assertion, x: 1.05, y: 1.05, width: 10.8, height: 1.25, fontSize: 38, color: palette.background, fontFamily: visual.headingFont, readingOrder: order++, semanticRole: "title", evidenceRefs, bold: true }), textElement({ id: `action-copy-${index}`, text: slot(copy, ["action", "body", "assertion"], body.join("\n") || story.assertion), x: 1.08, y: 3, width: 8.9, height: 2.2, fontSize: 22, color: palette.background, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "body", evidenceRefs }), textElement({ id: `source-${index + 1}`, text: sourceLabel(evidenceRefs), x: 1.08, y: 6.25, width: 10.8, height: .35, fontSize: 18, color: palette.background, fontFamily: visual.bodyFont, readingOrder: order++, semanticRole: "source", evidenceRefs }));
      break;
    case "core.image-caption":
      if (copy.asset) elements.push(title(), imageElement({ id: `image-${index}`, asset: copy.asset, alt: copy.asset.alt || story.assertion, x: .82, y: 1.95, width: 7.55, height: 4.65, readingOrder: order++, evidenceRefs }), bodyText(`caption-${index}`, slot(copy, ["caption", "body", "assertion"], body.join("\n") || story.assertion), 8.85, 2.2, 3.45, 3.9, 18, true), source());
      else elements.push(title(), shapeElement({ id: `visual-panel-${index}`, x: .82, y: 1.95, width: 5.1, height: 4.65, fill: palette.primary }), bodyText(`evidence-copy-${index}`, body.join("\n") || story.assertion, 6.55, 2.25, 5.25, 3.6, 20), source());
      break;
    case "core.assertion-evidence":
    default:
      elements.push(title(), shapeElement({ id: `visual-panel-${index}`, x: .82, y: 1.95, width: 5.1, height: 4.65, fill: palette.primary }), textElement({ id: `visual-claim-${index}`, text: story.section || String(index + 1).padStart(2, "0"), x: 1.2, y: 4.75, width: 4.25, height: .9, fontSize: 28, color: palette.background, fontFamily: visual.headingFont, readingOrder: order++, semanticRole: "body", evidenceRefs, bold: true }), bodyText(`evidence-copy-${index}`, body.join("\n") || story.assertion, 6.55, 2.25, 5.25, 3.6, 20), source());
      break;
  }

  return { id: story.id, title: copy.title || story.assertion, background: palette.background, notes: `${copy.speakerNotes}\n\n${sourceLabel(evidenceRefs)}`, elements };
}

export function compilePresentationScene(input: CompilePresentationSceneInput): { document: PresentationDocument; artifactHash: string } {
  const now = input.now ?? new Date().toISOString();
  const layoutBySlide = new Map(input.layouts.map((layout) => [layout.slideId, layout]));
  const copyBySlide = new Map(input.copy.map((copy) => [copy.slideId, copy]));
  const chartBySlide = new Map(input.charts.map((chart) => [chart.slideId, chart]));
  const slides = input.story.map((story, index) => compileSlide({
    story,
    copy: copyBySlide.get(story.id) ?? { slideId: story.id, title: story.assertion, slots: Object.fromEntries(story.keyPoints.map((point, pointIndex) => [`body-${pointIndex + 1}`, point])), speakerNotes: story.transition, evidenceIds: story.evidenceIds },
    layout: layoutBySlide.get(story.id) ?? { slideId: story.id, layoutId: index === 0 ? "core.cover-minimal" : index === input.story.length - 1 ? "core.action-summary" : "core.assertion-evidence", fallbackLayoutIds: [], slotCapacities: {} },
    ...(chartBySlide.get(story.id) ? { chart: chartBySlide.get(story.id)! } : {}), visual: input.visual, index,
  }));
  const document = presentationDocumentSchema.parse({
    schemaVersion: "2.0.0", id: input.presentationId, projectId: input.projectId, title: input.title, aspectRatio: "16:9", mode: input.mode,
    brief: { originalPrompt: input.brief.originalPrompt ?? input.brief.topic, topic: input.brief.topic, pageCount: input.brief.slideCount, sourceFileIds: input.brief.sources.map(({ id }) => id), scenario: input.brief.scenario, goal: input.brief.goal ?? "", audience: input.brief.audience, durationMinutes: input.brief.durationMinutes, language: input.brief.language, desiredAction: input.brief.desiredAction ?? "", constraints: Object.values(input.brief.answers) },
    theme: { name: input.visual.name, headingFont: input.visual.headingFont, bodyFont: input.visual.bodyFont, colors: input.visual.palette },
    sources: input.brief.sources, evidenceLedger: input.evidenceLedger, storyboard: input.story.map((story) => ({ id: `story-${story.id}`, section: story.section, conclusion: story.assertion, evidence: story.evidenceIds, visualIntent: story.visualIntent, notes: story.transition, slideId: story.id })),
    slides, frames: slides.map((slide, index) => ({ id: `frame-${slide.id}`, name: slide.title, x: (index % 4) * 1400, y: Math.floor(index / 4) * 850, width: 1280, height: 720, slideId: slide.id })),
    path: slides.map((slide, index) => ({ frameId: `frame-${slide.id}`, order: index, durationMs: 800, easing: "ease-in-out" })), assets: input.copy.flatMap((copy) => copy.asset ? [{ id: copy.asset.id, kind: "image" as const, uri: copy.asset.src, source: copy.asset.provider, license: copy.asset.license, checksum: createHash("sha256").update(copy.asset.src).digest("hex") }] : []),
    revisions: [{ id: "revision-0", at: now, actor: "generation-workflow-v2", summary: "Initial V2 generated presentation" }], revision: 0, createdAt: now, updatedAt: now,
  });
  return { document, artifactHash: createHash("sha256").update(JSON.stringify(document)).digest("hex") };
}
