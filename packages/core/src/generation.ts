import { z } from "zod";
import { presentationDocumentSchema, type PresentationDocument, type PresentationElement, type Slide } from "./document.js";
import { executableTemplateCatalog } from "./resource-ecosystem.js";

export const creationBriefSchema = z.object({
  topic: z.string().min(1), originalPrompt: z.string().min(1).optional(), goal: z.string().optional(), audience: z.array(z.string()).default([]),
  durationMinutes: z.number().positive().default(15), desiredAction: z.string().optional(),
  answers: z.record(z.string(), z.string()).default({}),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().url().optional(), note: z.string().optional() })).default([]),
  language: z.string().default("zh-CN"), slideCount: z.number().int().min(3).max(60).default(8),
  scenario: z.enum(["consulting-strategy", "business-fundraising", "sales-proposal", "product-launch", "operating-review", "project-report", "data-report", "academic-research", "education-training", "government-policy", "technology-rd", "brand-marketing"]).default("consulting-strategy"),
  visualDirectionId: z.string().optional(),
  creationMode: z.enum(["standard", "html", "image"]).default("standard"),
  templateId: z.string().min(1).optional(),
  templateVersion: z.string().min(1).optional(),
  skillIds: z.array(z.string().min(1)).max(12).default([]),
  assetPolicy: z.object({
    providers: z.array(z.enum(["seed", "openverse", "wikimedia", "pexels", "pixabay", "unsplash-preview", "openai", "stability"])).default(["seed"]),
    licenseAllowlist: z.array(z.enum(["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "generated", "platform-distribution"])).default(["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "generated"]),
    allowAiGeneration: z.boolean().default(false),
    requireAttribution: z.boolean().default(true),
  }).default({ providers: ["seed"], licenseAllowlist: ["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "generated"], allowAiGeneration: false, requireAttribution: true }),
});

const paletteSchema = z.object({ background: z.string(), foreground: z.string(), primary: z.string(), accent: z.string(), muted: z.string() });
const visualDirectionSchema = z.object({ id: z.string().default("signal-dark"), name: z.string(), density: z.string(), tone: z.array(z.string()), palette: paletteSchema.default({ background: "#0A0A0A", foreground: "#F4F4EF", primary: "#B7F34A", accent: "#FF725E", muted: "#272927" }) });

export const blueprintSchema = z.object({
  schemaVersion: z.enum(["1.0.0", "2.0.0"]).default("2.0.0"), title: z.string().min(1),
  taskSummary: z.object({ goal: z.string(), audience: z.array(z.string()), desiredAction: z.string() }), coreClaim: z.string().min(1),
  slides: z.array(z.object({ order: z.number().int().min(1), section: z.string().default(""), purpose: z.string().min(1), title: z.string().min(1), layoutFamily: z.string().min(1), keyPoints: z.array(z.string()).default([]), evidence: z.array(z.string()).default([]), visualIntent: z.string().default(""), notes: z.string().default("") })).min(3).max(60),
  evidencePlan: z.array(z.object({ claim: z.string(), status: z.enum(["available", "missing"]), source: z.string().optional(), handling: z.string().optional() })).default([]),
  visualDirection: visualDirectionSchema, visualDirections: z.array(visualDirectionSchema).length(3).optional(),
});

export type CreationBrief = z.infer<typeof creationBriefSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
export type PresentationGenerationMode = CreationBrief["creationMode"];

export interface PresentationModelAdapter {
  readonly name: string;
  generateQuestions(brief: CreationBrief): Promise<string[]>;
  generateBlueprint(brief: CreationBrief): Promise<Blueprint>;
  generatePresentation(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode }): Promise<PresentationDocument>;
  editCurrentSlide(input: { document: PresentationDocument; slideId: string; instruction: string }): Promise<unknown[]>;
}

const storyBeats = [["开场", "建立主张", "cover-claim"], ["背景", "界定机会窗口", "metric-dashboard"], ["洞察", "揭示关键问题", "problem-triad"], ["判断", "比较可选路径", "comparison"], ["方案", "解释核心方案", "visual-hero"], ["证据", "用事实支持结论", "data-evidence"], ["实施", "给出推进路线", "process-roadmap"], ["行动", "推动下一步", "summary-action"], ["附录", "补充关键依据", "quote-proof"], ["收束", "重申价值主张", "section-divider"]] as const;
const directionOptions = [
  { id: "signal-dark", name: "Signal Dark", density: "business", tone: ["克制", "高对比", "决策感"], palette: { background: "#0A0A0A", foreground: "#F4F4EF", primary: "#B7F34A", accent: "#FF725E", muted: "#272927" } },
  { id: "editorial-light", name: "Editorial Light", density: "editorial", tone: ["理性", "留白", "杂志感"], palette: { background: "#F4F4EF", foreground: "#111311", primary: "#315C47", accent: "#FF725E", muted: "#D9DDD7" } },
  { id: "coral-tech", name: "Coral Tech", density: "visual", tone: ["科技", "鲜明", "未来感"], palette: { background: "#121516", foreground: "#F8F5EE", primary: "#FF725E", accent: "#B7F34A", muted: "#34393A" } },
] as const;

function slideTitle(brief: CreationBrief, index: number, action: string): string {
  const titles = [brief.topic, `现在是推进${brief.topic}的关键窗口`, "真正需要解决的，不止一个问题", "从选择动作，转向选择增长机制", `${brief.topic}的核心方案`, "让证据支持每一个关键判断", "把方案拆成可执行的阶段", `下一步：${action}`, "关键事实与判断依据", `${brief.topic}，从共识走向结果`];
  return titles[index % titles.length] ?? `${brief.topic} · ${index + 1}`;
}

export function createPresentationBlueprint(briefInput: CreationBrief): Blueprint {
  const brief = creationBriefSchema.parse(briefInput); const goal = brief.goal ?? `清晰介绍${brief.topic}`; const action = brief.desiredAction ?? "确认下一步行动";
  const selected = directionOptions.find(({ id }) => id === brief.visualDirectionId) ?? directionOptions[0];
  const slides = Array.from({ length: brief.slideCount }, (_, index) => {
    const beat = storyBeats[index === brief.slideCount - 1 ? 7 : index % storyBeats.length] ?? storyBeats[0]; const source = brief.sources[index % Math.max(brief.sources.length, 1)];
    return { order: index + 1, section: beat[0], purpose: beat[1], title: slideTitle(brief, index, action), layoutFamily: `${brief.scenario}.${beat[2]}`, keyPoints: index === 0 ? [goal] : index === brief.slideCount - 1 ? [action] : [`围绕“${beat[1]}”形成一页一结论`, "优先使用已提供资料，不编造数字", "将结论落到清晰的行动或判断"], evidence: source ? [source.title] : [], visualIntent: beat[2], notes: `${beat[1]}。${source ? `依据：${source.title}` : "缺少外部证据时，不使用未经证实的数字。"}` };
  });
  return blueprintSchema.parse({ schemaVersion: "2.0.0", title: brief.topic, taskSummary: { goal, audience: brief.audience, desiredAction: action }, coreClaim: `${brief.topic}应以清晰目标、可信依据和可执行路径推进。`, slides, evidencePlan: brief.sources.map((source) => ({ claim: source.title, status: "available", source: source.title })), visualDirection: selected, visualDirections: directionOptions });
}

export function createFiveSlideBlueprint(briefInput: CreationBrief): Blueprint { return createPresentationBlueprint(creationBriefSchema.parse({ ...briefInput, slideCount: 5 })); }

function text(id: string, value: string, x: number, y: number, width: number, height: number, fontSize: number, bold = false, color = "#F4F4EF", align: "left" | "center" | "right" = "left") { return { id, type: "text" as const, x, y, width, height, rotation: 0, opacity: 1, locked: false, semanticRole: id.startsWith("title-") ? "title" as const : "body" as const, readingOrder: 0, decorative: false, evidenceRefs: [], overlapPolicy: "none" as const, text: value, fontFamily: "Aptos", fontSize, color, bold, italic: false, align, verticalAlign: "top" as const }; }
function shape(id: string, x: number, y: number, width: number, height: number, fill: string, rounded = false) { return { id, type: "shape" as const, shape: rounded ? "roundRect" as const : "rect" as const, x, y, width, height, rotation: 0, opacity: 1, locked: false, semanticRole: "shape" as const, readingOrder: 0, decorative: true, evidenceRefs: [], overlapPolicy: "intentional" as const, fill, stroke: fill, strokeWidth: 0 }; }
function bodyText(points: string[]): string { return points.filter(Boolean).map((point) => `• ${point}`).join("\n"); }

/** Layouts below are executable scene builders, not catalogue-only metadata. */
export const EXECUTABLE_LAYOUT_REGISTRY = [
  "cover-claim", "decision-ask", "opportunity-map", "risk-heatmap", "system-loop", "scenario-timeline",
  "stakeholder-network", "data-stack", "agent-architecture", "agent-roster", "decision-window", "flow-map",
  "facility-section", "coordination-matrix", "control-room", "human-gate", "kpi-framework", "pilot-roadmap",
  "governance-matrix", "summary-action", "metric-dashboard", "problem-triad", "comparison", "visual-hero",
  "data-evidence", "process-roadmap", "quote-proof", "section-divider",
] as const;

function numberedCards(item: Blueprint["slides"][number], n: number, palette: Blueprint["visualDirection"]["palette"], labels?: string[]): PresentationElement[] {
  return item.keyPoints.slice(0, 3).flatMap((point, i) => [
    shape(`card-${n}-${i}`, .8 + i * 4.08, 2.2, 3.62, 3.92, i === 0 ? palette.primary : palette.muted, true),
    text(`card-no-${n}-${i}`, labels?.[i] ?? `0${i + 1}`, 1.15 + i * 4.08, 2.6, 2.8, .55, 17, true, i === 0 ? palette.background : palette.accent),
    text(`card-copy-${n}-${i}`, point, 1.15 + i * 4.08, 3.5, 2.85, 1.75, 19, i === 0, i === 0 ? palette.background : palette.foreground),
  ]);
}

function layoutElements(item: Blueprint["slides"][number], index: number, palette: Blueprint["visualDirection"]["palette"]): PresentationElement[] {
  const n = index + 1; const body = bodyText(item.keyPoints); const intent = item.visualIntent || item.layoutFamily.split(".").at(-1);
  const title = text(`title-${n}`, item.title, 0.75, 0.62, 11.75, 1.15, index === 0 ? 38 : 35, true, palette.foreground);
  if (intent === "cover-claim") return [shape(`bar-${n}`, .75, .55, 1.25, .1, palette.primary), title, text(`body-${n}`, item.keyPoints[0] ?? item.purpose, .8, 2.35, 7.6, 1.65, 22, false, palette.foreground), shape(`hero-${n}`, 9.25, 1.15, 3.05, 5.25, palette.primary, true), text(`number-${n}`, "01", 9.7, 4.75, 2.1, .9, 44, true, palette.background, "right")];
  if (intent === "decision-ask") return [shape(`panel-${n}`, .65, .55, 12.03, 6.4, palette.primary, true), text(`eyebrow-${n}`, "90 DAY PILOT · 决策请求", 1.1, .95, 5.5, .4, 14, true, palette.background), text(`title-${n}`, item.title, 1.1, 1.48, 10.5, 1.15, 35, true, palette.background), ...item.keyPoints.slice(0, 3).flatMap((point, i) => [shape(`card-${n}-${i}`, .8 + i * 4.08, 3.05, 3.62, 2.85, i === 0 ? palette.background : palette.foreground, true), text(`card-no-${n}-${i}`, `0${i + 1}`, 1.15 + i * 4.08, 3.42, 2.8, .45, 15, true, i === 0 ? palette.primary : palette.background), text(`card-copy-${n}-${i}`, point, 1.15 + i * 4.08, 4.22, 2.85, 1.05, 17, i === 0, i === 0 ? palette.foreground : palette.background)])];
  if (intent === "opportunity-map") return [title, shape(`map-${n}`, .75, 2.05, 7.55, 4.55, palette.muted, true), ...([[1.5, 4.8], [3.35, 3.15], [5.6, 4.15], [6.85, 2.75]] as Array<[number, number]>).flatMap(([x, y], i) => [shape(`node-${n}-${i}`, x, y, .38, .38, i === 3 ? palette.accent : palette.primary, true), text(`node-label-${n}-${i}`, ["会展", "数字", "总部", "韧性试验场"][i]!, x + .48, y - .02, 1.2, .35, 13, i === 3, palette.foreground)]), text(`body-${n}`, body, 8.85, 2.2, 3.7, 3.9, 18, false, palette.foreground)];
  if (intent === "risk-heatmap") return [title, ...Array.from({ length: 12 }, (_, i) => shape(`cell-${n}-${i}`, .85 + (i % 4) * 1.52, 2.15 + Math.floor(i / 4) * 1.3, 1.22, .96, [palette.muted, palette.primary, palette.accent][Math.min(2, (i + Math.floor(i / 4)) % 4)] ?? palette.muted, true)), text(`axis-${n}`, "概率  ↑      →  影响", 1, 6.25, 5.8, .35, 14, true, palette.foreground), text(`body-${n}`, body, 7.55, 2.2, 4.7, 3.7, 19, false, palette.foreground)];
  if (intent === "system-loop") return [title, ...["感知", "预测", "决策", "协同", "复盘"].flatMap((label, i) => [shape(`loop-${n}-${i}`, .8 + i * 2.48, 3, 1.75, 1.2, i === 2 ? palette.accent : palette.muted, true), text(`loop-label-${n}-${i}`, label, .8 + i * 2.48, 3.38, 1.75, .35, 18, true, i === 2 ? palette.background : palette.foreground, "center"), ...(i < 4 ? [text(`arrow-${n}-${i}`, "→", 2.62 + i * 2.48, 3.28, .55, .5, 24, true, palette.primary, "center")] : [])]), text(`body-${n}`, item.keyPoints[0] ?? item.purpose, 1.3, 5.15, 10.7, .8, 18, false, palette.foreground, "center")];
  if (intent === "scenario-timeline") return [title, shape(`line-${n}`, 1, 3.5, 11.1, .08, palette.primary), ...["T−120", "T−60", "T−30", "T0", "T+30"].flatMap((label, i) => [shape(`dot-${n}-${i}`, 1.1 + i * 2.7, 3.18, .7, .7, i === 3 ? palette.accent : palette.primary, true), text(`time-${n}-${i}`, label, .75 + i * 2.7, 2.55, 1.4, .4, 15, true, palette.foreground, "center"), text(`event-${n}-${i}`, item.keyPoints[i % Math.max(1, item.keyPoints.length)] ?? item.purpose, .55 + i * 2.7, 4.35, 1.85, 1.2, 14, false, palette.foreground, "center")]), text(`simulation-${n}`, "SIMULATION · 模拟场景", 9.6, 6.3, 2.55, .35, 12, true, palette.accent, "right")];
  if (intent === "stakeholder-network" || intent === "agent-architecture") return [title, shape(`hub-${n}`, 5.35, 2.75, 2.6, 1.35, palette.primary, true), text(`hub-label-${n}`, intent === "agent-architecture" ? "主智能体\nORCHESTRATOR" : "共享事实底座", 5.55, 3.02, 2.2, .8, 18, true, palette.background, "center"), ...item.keyPoints.slice(0, 6).flatMap((point, i) => { const left = i % 2 === 0; const row = Math.floor(i / 2); const x = left ? .85 : 9.35; const y = 2.05 + row * 1.45; return [shape(`peer-${n}-${i}`, x, y, 3.1, .95, palette.muted, true), text(`peer-copy-${n}-${i}`, point, x + .25, y + .22, 2.6, .5, 15, i < 2, palette.foreground), shape(`link-${n}-${i}`, left ? 3.95 : 7.95, y + .45, 1.4, .05, palette.accent)]; })];
  if (intent === "data-stack" || intent === "facility-section") return [title, ...item.keyPoints.slice(0, 5).flatMap((point, i) => [shape(`layer-${n}-${i}`, 1.05 + i * .42, 5.65 - i * .78, 8.1 - i * .84, .62, i === 4 ? palette.primary : palette.muted, true), text(`layer-copy-${n}-${i}`, point, 1.3 + i * .42, 5.82 - i * .78, 7.35 - i * .84, .28, 14, i === 4, i === 4 ? palette.background : palette.foreground)]), text(`body-${n}`, item.purpose, 9.55, 2.4, 2.7, 2.7, 20, true, palette.foreground)];
  if (intent === "agent-roster") return [title, ...item.keyPoints.slice(0, 5).flatMap((point, i) => [shape(`agent-${n}-${i}`, .75 + i * 2.5, 2.15, 2.15, 3.9, i === 0 ? palette.primary : palette.muted, true), text(`agent-code-${n}-${i}`, ["RISK", "FLOW", "OPS", "COMMS", "QA"][i]!, 1.05 + i * 2.5, 2.55, 1.55, .4, 13, true, i === 0 ? palette.background : palette.accent), text(`agent-copy-${n}-${i}`, point, 1.05 + i * 2.5, 3.45, 1.55, 1.65, 15, i === 0, i === 0 ? palette.background : palette.foreground)]), text(`footer-${n}`, item.purpose, .85, 6.35, 11.6, .3, 13, false, palette.accent)];
  if (intent === "coordination-matrix" || intent === "governance-matrix") return [title, ...numberedCards(item, n, palette), text(`footer-${n}`, item.purpose, .85, 6.35, 11.6, .3, 13, false, palette.accent)];
  if (intent === "decision-window" || intent === "human-gate") return [title, shape(`window-${n}`, .8, 2.15, 7.15, 4.05, palette.muted, true), text(`signal-${n}`, intent === "decision-window" ? "120'" : "HUMAN", 1.25, 2.55, 5.9, 1.05, 50, true, palette.primary), text(`window-copy-${n}`, item.keyPoints[0] ?? item.purpose, 1.28, 4.2, 5.85, 1.25, 20, false, palette.foreground), shape(`gate-${n}`, 8.55, 2.15, 3.85, 4.05, palette.primary, true), text(`gate-label-${n}`, intent === "human-gate" ? "审批\n可撤回\n留痕" : "信号\n↓\n行动", 9.05, 2.8, 2.85, 2.5, 27, true, palette.background, "center")];
  if (intent === "flow-map") return [title, shape(`field-${n}`, .8, 2.05, 8.1, 4.35, palette.muted, true), ...[1.35, 2.75, 4.25, 5.8, 7.2].flatMap((x, i) => [shape(`stop-${n}-${i}`, x, 3.35 + (i % 2) * 1.35, .55, .55, i === 4 ? palette.accent : palette.primary, true), ...(i < 4 ? [shape(`route-${n}-${i}`, x + .55, 3.6 + (i % 2) * 1.35, 1.15, .06, palette.primary)] : [])]), text(`body-${n}`, body, 9.35, 2.2, 3.05, 3.9, 17, false, palette.foreground)];
  if (intent === "control-room") return [title, shape(`screen-${n}`, .8, 2.05, 8.25, 4.45, palette.muted, true), shape(`alert-${n}`, 1.15, 2.45, 3.15, 1.2, palette.accent, true), text(`alert-copy-${n}`, "当前决策\n窗口 38 分钟", 1.45, 2.7, 2.55, .75, 18, true, palette.background), ...[0, 1, 2].map((i) => shape(`chart-${n}-${i}`, 1.2 + i * 2.45, 4.25, 1.85, 1.65 - i * .22, i === 2 ? palette.primary : palette.foreground, true)), text(`body-${n}`, body, 9.55, 2.25, 2.75, 3.7, 17, false, palette.foreground)];
  if (intent === "kpi-framework") return [title, ...numberedCards(item, n, palette, ["基线", "响应", "恢复"]), text(`target-${n}`, "不虚构收益 · 只定义可验证指标", 8.15, 6.35, 4.15, .3, 13, true, palette.accent, "right")];
  if (intent === "pilot-roadmap") return [title, shape(`line-${n}`, 1.15, 3.62, 10.8, .1, palette.primary), ...item.keyPoints.slice(0, 3).flatMap((point, i) => [shape(`phase-${n}-${i}`, 1 + i * 4.15, 2.85, 1.55, 1.55, i === 1 ? palette.accent : palette.primary, true), text(`day-${n}-${i}`, [`01–30`, `31–60`, `61–90`][i]!, 1.05 + i * 4.15, 3.2, 1.45, .45, 17, true, palette.background, "center"), text(`phase-copy-${n}-${i}`, point, .8 + i * 4.15, 4.75, 3.15, 1.05, 16, i === 1, palette.foreground, "center")])];
  if (intent === "metric-dashboard") return [title, ...["01", "02", "03"].flatMap((metric, i) => [shape(`card-${n}-${i}`, .8 + i * 4.05, 2.35, 3.55, 3.75, i === 1 ? palette.primary : palette.muted, true), text(`metric-${n}-${i}`, metric, 1.1 + i * 4.05, 2.75, 2.9, .85, 32, true, i === 1 ? palette.background : palette.foreground), text(`body-${n}-${i}`, item.keyPoints[i] ?? item.purpose, 1.1 + i * 4.05, 4.05, 2.8, 1.3, 15, false, i === 1 ? palette.background : palette.foreground)])];
  if (intent === "problem-triad") return [title, shape(`rail-${n}`, .8, 2.2, .08, 3.8, palette.accent), ...item.keyPoints.slice(0, 3).map((point, i) => text(`body-${n}-${i}`, `${i + 1}. ${point}`, 1.2, 2.2 + i * 1.35, 10.6, .85, 20, i === 0, palette.foreground))];
  if (intent === "comparison") return [title, shape(`left-${n}`, .8, 2.05, 5.65, 4.3, palette.muted, true), shape(`right-${n}`, 6.85, 2.05, 5.65, 4.3, palette.primary, true), text(`left-label-${n}`, "现状", 1.2, 2.45, 4.8, .55, 17, true, palette.foreground), text(`body-${n}`, item.keyPoints[0] ?? item.purpose, 1.2, 3.35, 4.65, 1.8, 20, false, palette.foreground), text(`right-label-${n}`, "目标", 7.25, 2.45, 4.8, .55, 17, true, palette.background), text(`body2-${n}`, item.keyPoints[1] ?? item.purpose, 7.25, 3.35, 4.65, 1.8, 20, true, palette.background)];
  if (intent === "visual-hero") return [shape(`hero-${n}`, .65, .55, 5.2, 6.35, palette.accent, true), text(`hero-num-${n}`, `0${n}`, 1.05, 4.9, 3.8, 1, 50, true, palette.background), text(`title-${n}`, item.title, 6.5, 1.05, 5.5, 1.55, 29, true, palette.foreground), text(`body-${n}`, body, 6.55, 3.05, 5.25, 2.45, 19, false, palette.foreground)];
  if (intent === "data-evidence") return [title, ...item.keyPoints.slice(0, 3).flatMap((point, i) => [shape(`evidence-${n}-${i}`, .8 + i * 4.08, 2.3, 3.62, 3.75, i === 0 ? palette.primary : palette.muted, true), text(`evidence-label-${n}-${i}`, ["主张", "来源", "状态"][i]!, 1.15 + i * 4.08, 2.7, 2.8, .4, 14, true, i === 0 ? palette.background : palette.accent), text(`evidence-copy-${n}-${i}`, point, 1.15 + i * 4.08, 3.55, 2.85, 1.6, 18, i === 0, i === 0 ? palette.background : palette.foreground)]), text(`evidence-note-${n}`, "只呈现有来源的事实；无数据时使用框架，不生成装饰性柱形。", .85, 6.35, 11.6, .3, 13, false, palette.accent)];
  if (intent === "process-roadmap") return [title, shape(`line-${n}`, 1.05, 3.8, 10.9, .08, palette.muted), ...item.keyPoints.slice(0, 3).flatMap((point, i) => [shape(`node-${n}-${i}`, 1 + i * 4.25, 3.45, .75, .75, i === 1 ? palette.accent : palette.primary, true), text(`body-${n}-${i}`, point, .85 + i * 4.25, 4.55, 3.2, 1.25, 16, i === 1, palette.foreground)])];
  if (intent === "summary-action") return [shape(`panel-${n}`, .65, .55, 12.03, 6.4, palette.primary, true), text(`title-${n}`, item.title, 1.15, 1.15, 10.85, 1.25, 32, true, palette.background), text(`body-${n}`, body, 1.2, 3, 8.4, 2.1, 21, false, palette.background), text(`arrow-${n}`, "→", 10.5, 4.9, 1.2, .8, 46, true, palette.background, "right")];
  if (intent === "quote-proof") return [text(`quote-${n}`, "“", .75, 1.55, 1.2, 1.2, 72, true, palette.primary), text(`title-${n}`, item.title, 2, 1.25, 9.8, 1.2, 29, true, palette.foreground), text(`body-${n}`, item.keyPoints[0] ?? item.purpose, 2.05, 3, 8.75, 1.8, 24, false, palette.foreground), text(`source-${n}`, item.evidence[0] ? `来源：${item.evidence[0]}` : "待补充可验证来源", 2.05, 5.3, 6.5, .45, 13, false, palette.accent)];
  return [shape(`stripe-${n}`, 0, 0, 13.333, .18, palette.accent), title, text(`body-${n}`, body || item.purpose, .8, 2.35, 10.8, 2.7, 22, false, palette.foreground), text(`section-${n}`, item.section.toUpperCase(), 10.35, 6.3, 2.15, .35, 11, true, palette.primary, "right")];
}

export function createPresentationDocument(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode; now?: string }): PresentationDocument {
  const brief = creationBriefSchema.parse(input.brief); const blueprint = blueprintSchema.parse(input.blueprint); const now = input.now ?? new Date().toISOString();
  const selectedTemplate = brief.templateId ? executableTemplateCatalog.find((candidate) => candidate.id === brief.templateId && (!brief.templateVersion || candidate.version === brief.templateVersion)) : undefined;
  const templateIsDark = selectedTemplate ? [1, 3, 5].map((offset) => Number.parseInt(selectedTemplate.themeTokens.background.slice(offset, offset + 2), 16)).reduce((sum, value) => sum + value, 0) < 360 : false;
  const palette = selectedTemplate ? { background: selectedTemplate.themeTokens.background, foreground: selectedTemplate.themeTokens.foreground, primary: selectedTemplate.themeTokens.primary, accent: selectedTemplate.themeTokens.accent, muted: templateIsDark ? "#303A3D" : "#D9DDD7" } : blueprint.visualDirection.palette;
  const sourceBlock = brief.sources.length
    ? `[Sources]\n${brief.sources.map((source) => `- ${source.title}${source.url ? ` | ${source.url}` : ""}`).join("\n")}\n[/Sources]`
    : "[Source Status] 未提供外部来源；不得把数字、事实或模拟结果标记为已验证。";
  const resourceBlock = `[Resources]\n- template: ${brief.templateId ?? "builtin.default"}@${brief.templateVersion ?? "1.0.0"}\n- skills: ${brief.skillIds.join(", ") || "builtin.default"}\n- mode: ${input.mode ?? brief.creationMode}\n[/Resources]`;
  const slides: Slide[] = blueprint.slides.map((item, index) => ({ id: `slide-${index + 1}`, title: item.title, background: palette.background, notes: `${item.notes || item.purpose}\n\n${sourceBlock}\n\n${resourceBlock}`, elements: layoutElements(item, index, palette).map((element) => element.type === "text" && selectedTemplate ? { ...element, fontFamily: selectedTemplate.themeTokens.fontBody } : element) }));
  return presentationDocumentSchema.parse({
    schemaVersion: "2.0.0", id: input.presentationId, projectId: input.projectId, title: blueprint.title, aspectRatio: "16:9", mode: input.mode ?? brief.creationMode,
    brief: { originalPrompt: brief.originalPrompt ?? brief.topic, topic: brief.topic, pageCount: brief.slideCount, sourceFileIds: brief.sources.map((source) => source.id), scenario: brief.scenario, goal: blueprint.taskSummary.goal, audience: brief.audience, durationMinutes: brief.durationMinutes, language: brief.language, desiredAction: blueprint.taskSummary.desiredAction, constraints: Object.values(brief.answers) },
    theme: { name: selectedTemplate?.name ?? blueprint.visualDirection.name, headingFont: selectedTemplate?.themeTokens.fontHeading ?? "Aptos Display", bodyFont: selectedTemplate?.themeTokens.fontBody ?? "Aptos", colors: palette }, sources: brief.sources,
    storyboard: blueprint.slides.map((item, index) => ({ id: `story-${index + 1}`, section: item.section, conclusion: item.title, evidence: item.evidence, visualIntent: item.visualIntent, notes: item.notes, slideId: `slide-${index + 1}` })), slides,
    frames: slides.map((slide, index) => ({ id: `frame-${index + 1}`, name: slide.title, x: (index % 4) * 1400, y: Math.floor(index / 4) * 850, width: 1280, height: 720, slideId: slide.id })),
    path: slides.map((_slide, index) => ({ frameId: `frame-${index + 1}`, order: index, durationMs: 800, easing: "ease-in-out" })), assets: [], revisions: [{ id: "revision-0", at: now, actor: "generator", summary: "Initial generated presentation" }], revision: 0, createdAt: now, updatedAt: now,
  });
}

export function createFiveSlideDocument(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode; now?: string }): PresentationDocument { return createPresentationDocument(input); }
