import type { PresentationDocument, PresentationElement, Slide } from "./document.js";
import { z } from "zod";

export type QualityIssueCode = "EMPTY_TEXT" | "OVERFLOW_RISK" | "MISSING_ALT" | "MISSING_SOURCE" | "UNVERIFIABLE_SOURCE" | "UNVERIFIABLE_FACT" | "OUT_OF_BOUNDS" | "TEXT_OVERLAP" | "PLACEHOLDER_TEXT" | "LOW_VISIBILITY" | "LOW_READABILITY" | "MISSING_SLIDE_TITLE" | "TITLE_REQUIREMENT_MISMATCH" | "THEME_INCONSISTENCY" | "CROSS_PROJECT_CONTENT" | "DUPLICATE_SLIDE" | "DUPLICATE_VIEWPOINT" | "INCOMPLETE_CONTENT";
export type QualityVerificationStatus = "verified" | "risk" | "unverifiable" | "manual";
export type QualityStage = "content" | "geometry" | "render";
export type QualitySeverity = "info" | "warning";

export interface QualityIssue {
  code: QualityIssueCode;
  severity: QualitySeverity;
  stage: QualityStage;
  /** The confidence state of this finding; manual never means automatically passed. */
  verification: QualityVerificationStatus;
  slideId?: string | undefined;
  elementId?: string | undefined;
  message: string;
}

export interface QualityCheck {
  id: "theme" | "titles" | "placeholders" | "cross-project" | "duplication" | "completeness" | "sources" | "facts" | "copyright" | "overflow" | "readability";
  label: string;
  status: QualityVerificationStatus;
  message: string;
  issueCodes: QualityIssueCode[];
}

export interface QualityDeduction {
  code: QualityIssueCode;
  points: number;
  reason: string;
  slideId?: string | undefined;
  elementId?: string | undefined;
}

export interface PageQualityResult {
  slideId: string;
  score: number;
  stages: Record<QualityStage, "pass" | "warning">;
  issues: QualityIssue[];
}

export interface QualityReport {
  projectId: string;
  presentationId: string;
  revision: number;
  /** @deprecated Use revision. Kept for older clients. */
  checkedRevision: number;
  status: "valid" | "stale";
  score: number;
  issues: QualityIssue[];
  pages: PageQualityResult[];
  /** Score is 100 minus the sum of this transparent breakdown. */
  deductions: QualityDeduction[];
  majorDeductions: QualityDeduction[];
  /** Facts and copyright are intentionally never auto-verified. */
  checks: QualityCheck[];
  autoFixRounds: number;
}

const CANVAS_WIDTH = 13.333;
const CANVAS_HEIGHT = 7.5;
const PLACEHOLDER_TEXT = /(?:\bTODO\b|\bTBD\b|\bplaceholder\b|\blorem ipsum\b|\bsample text\b|待(?:填写|补充|确认)|请在此(?:输入|填写)|点击此处|\{\{[^}]+\}\}|\[[^\]\n]{2,}\]|<[^>\n]{2,}>)/i;
const SOURCE_TEXT = /(?:\[sources\]|https?:\/\/|(?:来源|source|参考资料|reference|据[：:]|data source)[：:])/i;
const FACTUAL_NUMBER = /(?:\d+(?:[,.]\d+)?\s*%|(?:19|20)\d{2}|\d{3,}\s*(?:亿元?|万(?:元|人|户)?|人|家|个))/;

type Domain = "academic" | "business" | "technology" | "government";
const domainSignals: Record<Domain, readonly string[]> = {
  academic: ["毕业答辩", "论文", "导师", "研究方法", "实验结果", "电气工程"],
  business: ["经营分析", "增长规划", "营收", "销售", "管理层", "市场份额"],
  technology: ["技术架构", "研发", "算法", "系统设计", "代码", "软件工程"],
  government: ["政府", "政策", "财政", "公共服务", "行政", "专项资金"],
};

function intersectionRatio(a: PresentationElement, b: PresentationElement): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height / Math.max(0.0001, Math.min(a.width * a.height, b.width * b.height));
}

function addIssue(target: QualityIssue[], input: Omit<QualityIssue, "severity" | "verification"> & Partial<Pick<QualityIssue, "severity" | "verification">>): void {
  target.push({ severity: "warning", verification: "risk", ...input });
}

function normalized(value: string): string { return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
function numericTokens(value: string): string[] { return (value.match(/[-+]?\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => token.replaceAll(",", "").replace(/^\+/, "")); }
function slideText(slide: Slide): string { return [slide.title, slide.notes, ...slide.elements.filter((element) => element.type === "text").map((element) => element.text)].join("\n"); }
function textCapacity(element: Extract<PresentationElement, { type: "text" }>): number {
  const perLine = Math.floor(element.width * 72 / Math.max(8, element.fontSize * .62));
  const lines = Math.floor(element.height * 72 / Math.max(10, element.fontSize * 1.45));
  return Math.max(1, Math.floor(perLine * lines * .85));
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const matched = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!matched) return undefined;
  const hex = matched[1]!.length === 3 ? matched[1]!.split("").map((part) => part + part).join("") : matched[1]!;
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}
function luminance(rgb: [number, number, number]): number {
  const linear = rgb.map((channel) => { const value = channel / 255; return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722;
}
function contrastRatio(foreground: string, background: string): number | undefined {
  const front = parseHexColor(foreground); const back = parseHexColor(background);
  if (!front || !back) return undefined;
  const [lighter, darker] = [luminance(front), luminance(back)].sort((left, right) => right - left);
  return (lighter! + .05) / (darker! + .05);
}
function effectiveBackground(slide: Slide, element: PresentationElement, elementIndex: number): string {
  const containers = slide.elements.slice(0, elementIndex).filter((candidate) => candidate.type === "shape" && candidate.shape !== "line" &&
    candidate.x <= element.x && candidate.y <= element.y && candidate.x + candidate.width >= element.x + element.width && candidate.y + candidate.height >= element.y + element.height);
  const nearest = containers.at(-1);
  return nearest?.type === "shape" ? nearest.fill : slide.background;
}
function matchingDomains(value: string): Set<Domain> {
  const found = new Set<Domain>();
  for (const [domain, signals] of Object.entries(domainSignals) as Array<[Domain, readonly string[]]>) if (signals.some((signal) => value.includes(signal))) found.add(domain);
  return found;
}
function makeCheck(id: QualityCheck["id"], label: string, status: QualityVerificationStatus, message: string, issueCodes: QualityIssueCode[]): QualityCheck { return { id, label, status, message, issueCodes }; }

function deductionsFor(issues: QualityIssue[]): QualityDeduction[] {
  const defaultPoints: Record<QualitySeverity, number> = { warning: 8, info: 3 };
  const overrides: Partial<Record<QualityIssueCode, number>> = { CROSS_PROJECT_CONTENT: 16, DUPLICATE_SLIDE: 12, PLACEHOLDER_TEXT: 10, OUT_OF_BOUNDS: 10, UNVERIFIABLE_FACT: 6, MISSING_SOURCE: 6, LOW_READABILITY: 5 };
  return issues.map((entry) => ({ code: entry.code, points: overrides[entry.code] ?? defaultPoints[entry.severity], reason: entry.message, slideId: entry.slideId, elementId: entry.elementId }));
}

/**
 * Inspects deterministic document properties only. It deliberately does not
 * assert that facts are accurate or that copyright/authorization is cleared.
 */
export function inspectPresentation(document: PresentationDocument): QualityReport {
  const issues: QualityIssue[] = [];
  const expectedDomains = matchingDomains(`${document.title}\n${document.brief.goal}`);
  const slideFingerprints = new Map<string, Slide>();
  const viewpointFingerprints = new Map<string, Slide>();

  const pages = document.slides.map((slide): PageQualityResult => {
    const pageIssues: QualityIssue[] = [];
    const wholeSlideText = slideText(slide);
    const textElements = slide.elements.filter((element): element is Extract<PresentationElement, { type: "text" }> => element.type === "text");
    if (!slide.title.trim()) addIssue(pageIssues, { code: "MISSING_SLIDE_TITLE", stage: "content", slideId: slide.id, message: "页面缺少标题，无法确认其是否服务于当前需求" });
    if (PLACEHOLDER_TEXT.test(slide.title)) addIssue(pageIssues, { code: "TITLE_REQUIREMENT_MISMATCH", stage: "content", slideId: slide.id, message: "页面标题仍是模板占位内容，未与项目需求对齐" });
    if (slide.elements.length === 0 || (textElements.length > 0 && textElements.every((element) => !element.text.trim()))) addIssue(pageIssues, { code: "INCOMPLETE_CONTENT", stage: "content", slideId: slide.id, message: "页面没有可交付的正文内容" });

    const slideDomains = matchingDomains(wholeSlideText);
    const conflictingDomain = [...slideDomains].some((domain) => expectedDomains.size > 0 && !expectedDomains.has(domain));
    const hasExpectedDomain = [...slideDomains].some((domain) => expectedDomains.has(domain));
    const titleDomains = matchingDomains(slide.title);
    const titleConflictsWithRequirement = [...titleDomains].some((domain) => expectedDomains.size > 0 && !expectedDomains.has(domain)) && ![...titleDomains].some((domain) => expectedDomains.has(domain));
    if (titleConflictsWithRequirement) addIssue(pageIssues, { code: "TITLE_REQUIREMENT_MISMATCH", stage: "content", slideId: slide.id, message: "页面标题包含与当前项目需求明显冲突的领域内容" });
    if (conflictingDomain && !hasExpectedDomain) {
      addIssue(pageIssues, { code: "CROSS_PROJECT_CONTENT", stage: "content", slideId: slide.id, message: "页面包含与当前项目主题明显冲突的领域内容，请确认不是其他项目的残留" });
      addIssue(pageIssues, { code: "THEME_INCONSISTENCY", severity: "info", stage: "content", slideId: slide.id, message: "页面主题与项目需求存在明显不一致，需人工确认叙事意图" });
    }

    const slideFingerprint = normalized([slide.title, ...textElements.map((element) => element.text)].join("\n"));
    if (slideFingerprint.length >= 16) {
      const original = slideFingerprints.get(slideFingerprint);
      if (original) addIssue(pageIssues, { code: "DUPLICATE_SLIDE", stage: "content", slideId: slide.id, message: `页面内容与 ${original.id} 完全重复` });
      else slideFingerprints.set(slideFingerprint, slide);
    }
    const viewpointFingerprint = normalized(slide.title);
    if (viewpointFingerprint.length >= 6) {
      const original = viewpointFingerprints.get(viewpointFingerprint);
      if (original && original.id !== slide.id) addIssue(pageIssues, { code: "DUPLICATE_VIEWPOINT", severity: "info", stage: "content", slideId: slide.id, message: `页面标题与 ${original.id} 重复，可能重复表达同一观点` });
      else viewpointFingerprints.set(viewpointFingerprint, slide);
    }

    for (const [elementIndex, element] of slide.elements.entries()) {
      if (element.type === "text" && !element.text.trim()) addIssue(pageIssues, { code: "EMPTY_TEXT", stage: "content", slideId: slide.id, elementId: element.id, message: "文本框为空" });
      if (element.type === "text" && PLACEHOLDER_TEXT.test(element.text)) addIssue(pageIssues, { code: "PLACEHOLDER_TEXT", stage: "content", slideId: slide.id, elementId: element.id, message: "仍包含模板占位文本" });
      if (element.type === "text" && element.text.length > Math.max(80, textCapacity(element))) addIssue(pageIssues, { code: "OVERFLOW_RISK", stage: "geometry", slideId: slide.id, elementId: element.id, message: "文本密度超过该文本框的保守容量，可能溢出" });
      if (element.type === "text" && element.fontSize < 12) addIssue(pageIssues, { code: "LOW_READABILITY", severity: "info", stage: "render", slideId: slide.id, elementId: element.id, message: "字号小于 12pt，投屏时可能难以阅读" });
      if (element.type === "text") { const contrast = contrastRatio(element.color, effectiveBackground(slide, element, elementIndex)); if (contrast !== undefined && contrast < 2.4) addIssue(pageIssues, { code: "LOW_READABILITY", severity: "info", stage: "render", slideId: slide.id, elementId: element.id, message: "文字与其实际承载背景对比度过低，可能影响可读性" }); }
      if (element.type === "image" && !element.alt.trim()) addIssue(pageIssues, { code: "MISSING_ALT", severity: "info", stage: "content", slideId: slide.id, elementId: element.id, message: "图片缺少替代文本" });
      if (element.x < 0 || element.y < 0 || element.x + element.width > CANVAS_WIDTH || element.y + element.height > CANVAS_HEIGHT) addIssue(pageIssues, { code: "OUT_OF_BOUNDS", stage: "geometry", slideId: slide.id, elementId: element.id, message: "对象超出演示画布边界" });
      if (element.opacity < .12) addIssue(pageIssues, { code: "LOW_VISIBILITY", severity: "info", stage: "render", slideId: slide.id, elementId: element.id, message: "对象透明度过低，渲染后可能不可见" });
    }
    for (let left = 0; left < textElements.length; left += 1) for (let right = left + 1; right < textElements.length; right += 1) {
      const a = textElements[left]; const b = textElements[right];
      if (a && b && intersectionRatio(a, b) > .7) addIssue(pageIssues, { code: "TEXT_OVERLAP", stage: "geometry", slideId: slide.id, elementId: b.id, message: "两个文本对象大面积重叠" });
    }
    const hasUnattributedFact = FACTUAL_NUMBER.test(wholeSlideText) && (document.sources.length === 0 || !SOURCE_TEXT.test(wholeSlideText));
    if (hasUnattributedFact) addIssue(pageIssues, { code: "UNVERIFIABLE_FACT", severity: "info", stage: "content", verification: "unverifiable", slideId: slide.id, message: "页面包含数值性陈述，但没有可定位的来源；自动检查无法确认其准确性" });
    issues.push(...pageIssues);
    const deductions = deductionsFor(pageIssues);
    const stage = (name: QualityStage) => pageIssues.some((entry) => entry.stage === name) ? "warning" as const : "pass" as const;
    return { slideId: slide.id, score: Math.max(0, 100 - deductions.reduce((sum, entry) => sum + entry.points, 0)), stages: { content: stage("content"), geometry: stage("geometry"), render: stage("render") }, issues: pageIssues };
  });

  const firstSlide = document.slides[0];
  const addressableSources = document.sources.filter((source) => Boolean(source.url));
  if (document.sources.length === 0) addIssue(issues, { code: "MISSING_SOURCE", severity: "info", stage: "content", verification: "unverifiable", slideId: firstSlide?.id, message: "当前演示未附资料来源；事实准确性和版权均无法自动确认" });
  else if (addressableSources.length === 0) addIssue(issues, { code: "UNVERIFIABLE_SOURCE", severity: "info", stage: "content", verification: "unverifiable", slideId: firstSlide?.id, message: "已附资料没有可验证链接；自动检查无法核对来源内容" });

  const deductions = deductionsFor(issues);
  const has = (code: QualityIssueCode) => issues.some((entry) => entry.code === code);
  const codes = (predicate: (entry: QualityIssue) => boolean) => issues.filter(predicate).map((entry) => entry.code);
  const hasAny = (...codesToFind: QualityIssueCode[]) => codesToFind.some(has);
  const checks: QualityCheck[] = [
    makeCheck("theme", "项目主题一致性", has("THEME_INCONSISTENCY") ? "risk" : "verified", has("THEME_INCONSISTENCY") ? "发现明显跨领域内容，需确认页面叙事" : "未发现明显跨领域残留", codes((entry) => entry.code === "THEME_INCONSISTENCY")),
    makeCheck("titles", "页面标题与需求", hasAny("MISSING_SLIDE_TITLE", "TITLE_REQUIREMENT_MISMATCH") ? "risk" : "verified", hasAny("MISSING_SLIDE_TITLE", "TITLE_REQUIREMENT_MISMATCH") ? "存在空标题或模板标题" : "标题结构完整；语义相关性仍需人工判断", codes((entry) => entry.code === "MISSING_SLIDE_TITLE" || entry.code === "TITLE_REQUIREMENT_MISMATCH")),
    makeCheck("placeholders", "模板占位符残留", has("PLACEHOLDER_TEXT") ? "risk" : "verified", has("PLACEHOLDER_TEXT") ? "发现可识别的模板占位文本" : "未发现可识别的模板占位文本", codes((entry) => entry.code === "PLACEHOLDER_TEXT")),
    makeCheck("cross-project", "跨项目内容污染", has("CROSS_PROJECT_CONTENT") ? "risk" : "verified", has("CROSS_PROJECT_CONTENT") ? "发现与项目主题明显冲突的领域内容" : "未发现明显跨项目残留", codes((entry) => entry.code === "CROSS_PROJECT_CONTENT")),
    makeCheck("duplication", "重复页面和观点", hasAny("DUPLICATE_SLIDE", "DUPLICATE_VIEWPOINT") ? "risk" : "verified", hasAny("DUPLICATE_SLIDE", "DUPLICATE_VIEWPOINT") ? "发现完全重复页面或相同标题观点" : "未发现完全重复页面或相同标题观点", codes((entry) => entry.code === "DUPLICATE_SLIDE" || entry.code === "DUPLICATE_VIEWPOINT")),
    makeCheck("completeness", "内容完整性", hasAny("INCOMPLETE_CONTENT", "EMPTY_TEXT") ? "risk" : "verified", hasAny("INCOMPLETE_CONTENT", "EMPTY_TEXT") ? "存在没有可交付正文的页面或空文本框" : "每页均有可交付的正文内容", codes((entry) => entry.code === "INCOMPLETE_CONTENT" || entry.code === "EMPTY_TEXT")),
    makeCheck("sources", "来源可验证性", document.sources.length === 0 || addressableSources.length === 0 ? "unverifiable" : "verified", document.sources.length === 0 ? "未提供来源，无法自动核对引用" : addressableSources.length === 0 ? "来源没有可验证链接，无法自动核对内容" : "发现可定位来源链接；自动检查仅确认引用可定位，不确认事实正确性", codes((entry) => entry.code === "MISSING_SOURCE" || entry.code === "UNVERIFIABLE_SOURCE" || entry.code === "UNVERIFIABLE_FACT")),
    makeCheck("facts", "事实准确性", "manual", "自动检查不能确认事实准确性；所有事实性结论均需人工核对来源原文", codes((entry) => entry.code === "UNVERIFIABLE_FACT")),
    makeCheck("copyright", "版权与授权", "manual", "自动检查不能确认版权或授权范围；请人工确认每项素材和来源的使用权", []),
    makeCheck("overflow", "文本溢出", hasAny("OVERFLOW_RISK", "OUT_OF_BOUNDS", "TEXT_OVERLAP") ? "risk" : "verified", hasAny("OVERFLOW_RISK", "OUT_OF_BOUNDS", "TEXT_OVERLAP") ? "发现可能溢出、越界或文本重叠" : "未发现可确定的文本溢出、越界或重叠", codes((entry) => entry.code === "OVERFLOW_RISK" || entry.code === "OUT_OF_BOUNDS" || entry.code === "TEXT_OVERLAP")),
    makeCheck("readability", "版式可读性", hasAny("LOW_READABILITY", "LOW_VISIBILITY") ? "risk" : "verified", hasAny("LOW_READABILITY", "LOW_VISIBILITY") ? "发现过小字号、低对比度或低可见度对象" : "未发现可确定的字号、对比度或可见度风险", codes((entry) => entry.code === "LOW_READABILITY" || entry.code === "LOW_VISIBILITY")),
  ];
  return { projectId: document.projectId, presentationId: document.id, revision: document.revision, checkedRevision: document.revision, status: "valid", score: Math.max(0, 100 - deductions.reduce((sum, entry) => sum + entry.points, 0)), issues, pages, deductions, majorDeductions: [...deductions].sort((left, right) => right.points - left.points).slice(0, 5), checks, autoFixRounds: 0 };
}

export function qualityReportForRevision(report: QualityReport, currentRevision: number): QualityReport {
  return report.revision === currentRevision ? { ...report, status: "valid" } : { ...report, status: "stale" };
}

export type QualityDimensionId = "narrative" | "layout" | "visuals" | "accessibility" | "consistency" | "evidence" | "speakerFit";
export type QualityGateStatus = "passed" | "failed" | "warning";

export interface QualityIssueV2 {
  severity: "info" | "warning" | "error";
  slideId?: string | undefined;
  elementId?: string | undefined;
  ruleId: string;
  message: string;
  bbox?: { x: number; y: number; width: number; height: number } | undefined;
  evidence: string;
  repairHint: string;
}

export interface QualityHardGate {
  id: "structure" | "evidence" | "typography" | "contrast" | "geometry" | "assets" | "render" | "accessibility";
  status: QualityGateStatus;
  issueIds: string[];
}

export interface QualityDimension {
  id: QualityDimensionId;
  label: string;
  weight: number;
  score: number;
}

export interface RenderedSlideReference {
  slideId: string;
  width: number;
  height: number;
  artifactKey?: string | undefined;
  sha256?: string | undefined;
}

export interface QualityManualReview {
  id: "facts" | "copyright";
  label: string;
  status: "manual";
  message: string;
}

export interface QualityReportV2 {
  version: "2.0.0";
  projectId: string;
  presentationId: string;
  revision: number;
  status: "passed" | "needs_review" | "stale";
  score: number;
  hardGates: QualityHardGate[];
  dimensions: QualityDimension[];
  issues: QualityIssueV2[];
  /** These are deliberately never represented as automatically verified. */
  manualReviews: QualityManualReview[];
  worstSlides: Array<{ slideId: string; score: number; issueCount: number }>;
  renderRefs: RenderedSlideReference[];
  autoFixRounds: number;
  checkedAt: string;
}

export const qualityReportV2Schema: z.ZodType<QualityReportV2> = z.object({
  version: z.literal("2.0.0"), projectId: z.string().min(1), presentationId: z.string().min(1), revision: z.number().int().nonnegative(), status: z.enum(["passed", "needs_review", "stale"]), score: z.number().min(0).max(100),
  hardGates: z.array(z.object({ id: z.enum(["structure", "evidence", "typography", "contrast", "geometry", "assets", "render", "accessibility"]), status: z.enum(["passed", "failed", "warning"]), issueIds: z.array(z.string()) })),
  dimensions: z.array(z.object({ id: z.enum(["narrative", "layout", "visuals", "accessibility", "consistency", "evidence", "speakerFit"]), label: z.string().min(1), weight: z.number().positive(), score: z.number().min(0).max(100) })),
  issues: z.array(z.object({ severity: z.enum(["info", "warning", "error"]), slideId: z.string().optional(), elementId: z.string().optional(), ruleId: z.string().min(1), message: z.string(), bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), evidence: z.string(), repairHint: z.string() })),
  manualReviews: z.array(z.object({ id: z.enum(["facts", "copyright"]), label: z.string().min(1), status: z.literal("manual"), message: z.string().min(1) })).length(2),
  worstSlides: z.array(z.object({ slideId: z.string().min(1), score: z.number().min(0).max(100), issueCount: z.number().int().nonnegative() })),
  renderRefs: z.array(z.object({ slideId: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive(), artifactKey: z.string().optional(), sha256: z.string().optional() })),
  autoFixRounds: z.number().int().min(0).max(2), checkedAt: z.string().datetime(),
});

type QualityReportV2Options = { renderedSlides?: RenderedSlideReference[]; visualFindings?: QualityIssueV2[]; autoFixRounds?: number; checkedAt?: string };

const dimensionWeights: Array<[QualityDimensionId, string, number]> = [
  ["narrative", "叙事与内容", 25], ["layout", "版式层级", 20], ["visuals", "视觉与图表", 15],
  ["accessibility", "字体、色彩与无障碍", 15], ["consistency", "跨页一致性", 10],
  ["evidence", "事实引用", 10], ["speakerFit", "演讲适配", 5],
];

function issueV2(target: QualityIssueV2[], input: QualityIssueV2): void { target.push(input); }
function issueBox(element: PresentationElement) { return { x: element.x, y: element.y, width: element.width, height: element.height }; }

function expectedFontSize(element: PresentationElement, slideIndex: number): number | undefined {
  if (element.type !== "text") return undefined;
  if (element.semanticRole === "title") return slideIndex === 0 ? 50 : 35;
  if (element.semanticRole === "subtitle") return 24;
  if (["body", "caption", "data-visual", "data-table"].includes(element.semanticRole)) return 18;
  return undefined;
}

function qualityDimensionFor(ruleId: string): QualityDimensionId {
  if (/evidence|source|chart-data|table-data/.test(ruleId)) return "evidence";
  if (/font|contrast|reading-order|alt|color-only/.test(ruleId)) return "accessibility";
  if (/render|asset|image|crop/.test(ruleId)) return "visuals";
  if (/geometry|overflow|overlap|bounds|alignment/.test(ruleId)) return "layout";
  if (/theme|rhythm|duplicate-layout/.test(ruleId)) return "consistency";
  if (/timing|speaker/.test(ruleId)) return "speakerFit";
  return "narrative";
}

function gateFor(ruleId: string): QualityHardGate["id"] {
  if (/evidence|source|chart-data|table-data/.test(ruleId)) return "evidence";
  if (/font|wrap/.test(ruleId)) return "typography";
  if (/contrast|color-only/.test(ruleId)) return "contrast";
  if (/geometry|overflow|overlap|bounds|alignment/.test(ruleId)) return "geometry";
  if (/asset|image|crop|watermark/.test(ruleId)) return "assets";
  if (/render/.test(ruleId)) return "render";
  if (/reading-order|alt|title-unique/.test(ruleId)) return "accessibility";
  return "structure";
}

/**
 * V2 quality contract. Deterministic gates are authoritative; model findings
 * may add issues but can never turn a failed deterministic gate into a pass.
 */
export function inspectPresentationV2(document: PresentationDocument, options: QualityReportV2Options = {}): QualityReportV2 {
  const issues: QualityIssueV2[] = [...(options.visualFindings ?? [])];
  const evidenceIds = new Set(document.evidenceLedger.map(({ id }) => id));
  const evidenceById = new Map(document.evidenceLedger.map((record) => [record.id, record]));
  const sourceIds = new Set(document.sources.map(({ id }) => id));
  const titleSet = new Set<string>();
  const layoutFingerprints = new Map<string, string>();
  const fontFamilies = new Set<string>();
  const rendered = new Map((options.renderedSlides ?? []).map((entry) => [entry.slideId, entry]));

  document.slides.forEach((slide, slideIndex) => {
    const title = normalized(slide.title);
    if (!title) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "structure.title-required", message: "页面缺少描述性标题", evidence: "slide.title is empty", repairHint: "根据本页主导结论补充唯一标题" });
    else if (titleSet.has(title)) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "accessibility.title-unique", message: "页面标题与其他页面重复", evidence: slide.title, repairHint: "把标题改写为本页独有的结论" });
    titleSet.add(title);
    if (slide.elements.length === 0) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "structure.empty-slide", message: "页面没有可交付元素", evidence: "slide.elements.length = 0", repairHint: "使用已批准布局重新编译本页" });

    const readingOrders = slide.elements.filter(({ decorative }) => !decorative).map(({ readingOrder }) => readingOrder);
    if (readingOrders.some((order) => order <= 0) || new Set(readingOrders).size !== readingOrders.length) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "accessibility.reading-order", message: "阅读顺序缺失或重复", evidence: JSON.stringify(readingOrders), repairHint: "按标题、正文、视觉、来源的顺序重新编号" });

    const fingerprint = slide.elements.map((element) => `${element.type}:${Math.round(element.x * 10)}:${Math.round(element.y * 10)}:${Math.round(element.width * 10)}:${Math.round(element.height * 10)}`).join("|");
    const previousLayout = layoutFingerprints.get(fingerprint);
    if (previousLayout && slideIndex > 0) issueV2(issues, { severity: "warning", slideId: slide.id, ruleId: "consistency.duplicate-layout", message: "相邻或跨页构图完全重复", evidence: `same geometry as ${previousLayout}`, repairHint: "在同一设计系统内切换到候补布局" });
    else layoutFingerprints.set(fingerprint, slide.id);

    slide.elements.forEach((element, elementIndex) => {
      if (element.x < 0 || element.y < 0 || element.x + element.width > CANVAS_WIDTH || element.y + element.height > CANVAS_HEIGHT) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "geometry.out-of-bounds", message: "对象超出 16:9 画布", bbox: issueBox(element), evidence: `x=${element.x}, y=${element.y}, w=${element.width}, h=${element.height}`, repairHint: "将对象限制在 13.333 × 7.5 画布内" });
      if (element.type === "text") {
        fontFamilies.add(element.fontFamily);
        if (!element.text.trim() || PLACEHOLDER_TEXT.test(element.text)) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "structure.placeholder-or-empty", message: "文本槽为空或仍含占位符", bbox: issueBox(element), evidence: element.text || "empty", repairHint: "依据 Story Plan 与槽位容量补全真实内容" });
        const minimum = expectedFontSize(element, slideIndex);
        if (minimum && element.fontSize < minimum) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "typography.font-minimum", message: `字号 ${element.fontSize}pt 低于 ${minimum}pt 底线`, bbox: issueBox(element), evidence: `${element.semanticRole}:${element.fontSize}pt`, repairHint: `将字号提高到至少 ${minimum}pt；容量不足时精简文案或更换布局` });
        if (element.text.length > textCapacity(element)) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "geometry.overflow", message: "文本超过保守槽位容量", bbox: issueBox(element), evidence: `${element.text.length} chars > ${textCapacity(element)}`, repairHint: "精简文案或路由到更高容量布局" });
        const contrast = contrastRatio(element.color, effectiveBackground(slide, element, elementIndex));
        const threshold = element.fontSize >= 24 || (element.fontSize >= 18.67 && element.bold) ? 3 : 4.5;
        if (contrast !== undefined && contrast < threshold) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "contrast.text", message: `文字对比度 ${contrast.toFixed(2)}:1 低于 ${threshold}:1`, bbox: issueBox(element), evidence: `${element.color} on ${effectiveBackground(slide, element, elementIndex)}`, repairHint: "改用设计令牌中的高对比前景色" });
        const scopedYearTitle = (element.semanticRole === "title" || element.semanticRole === "subtitle") && /(?:19|20)\d{2}/.test(element.text) && !/(?:\d+(?:[,.]\d+)?\s*%|\d{3,}\s*(?:亿元?|万(?:元|人|户)?|人|家|个))/.test(element.text);
        const disclosedAssumption = /(?:假设|模拟|情景|示例|illustrative|assumption|scenario)/i.test(element.text);
        if (FACTUAL_NUMBER.test(element.text) && !scopedYearTitle && !disclosedAssumption) {
          if (element.evidenceRefs.length === 0) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "evidence.numeric-claim", message: "数值性陈述没有绑定具体证据", bbox: issueBox(element), evidence: element.text, repairHint: "绑定 evidenceId 与 locator；否则标为假设或模拟" });
          else {
            const claimNumbers = new Set(element.evidenceRefs.flatMap((id) => numericTokens(evidenceById.get(id)?.claim ?? "")));
            const unsupported = numericTokens(element.text).filter((token) => !claimNumbers.has(token));
            if (unsupported.length) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "evidence.numeric-mismatch", message: "数值虽绑定证据，但对应证据中找不到同一数值", bbox: issueBox(element), evidence: `unsupported=${unsupported.join(",")}; refs=${element.evidenceRefs.join(",")}`, repairHint: "把该句绑定到真正包含该数值和口径的 claim-level evidenceId" });
          }
        }
      }
      if (element.type === "image" && !element.decorative) {
        if (!element.alt.trim()) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "accessibility.alt", message: "信息性图片缺少替代文本", bbox: issueBox(element), evidence: "alt is empty", repairHint: "描述图片传达的信息；纯装饰图片标为 decorative" });
        if (!element.provenance) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "assets.provenance", message: "图片缺少来源与许可记录", bbox: issueBox(element), evidence: "provenance is missing", repairHint: "记录 provider、sourceUrl 与 license" });
        if (element.intrinsicWidth && element.intrinsicHeight) {
          const coverage = Math.min(element.intrinsicWidth / (element.width / CANVAS_WIDTH * 1920), element.intrinsicHeight / (element.height / CANVAS_HEIGHT * 1080));
          if (coverage < 1) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "assets.resolution", message: "图片有效像素低于展示像素", bbox: issueBox(element), evidence: `coverage=${coverage.toFixed(2)}x`, repairHint: "替换为更高分辨率素材或缩小展示区域" });
          else if (coverage < 1.5) issueV2(issues, { severity: "warning", slideId: slide.id, elementId: element.id, ruleId: "assets.resolution-warning", message: "图片像素余量低于 1.5 倍", bbox: issueBox(element), evidence: `coverage=${coverage.toFixed(2)}x`, repairHint: "优先替换为更高分辨率素材" });
        }
      }
      if ((element.type === "chart" || element.type === "table") && !element.evidenceRefs.includes(element.sourceEvidenceId)) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: `${element.type}-data.evidence`, message: "数据对象没有绑定来源证据", bbox: issueBox(element), evidence: element.sourceEvidenceId, repairHint: "绑定结构化证据记录后重新编译" });
      if (element.type === "chart" || element.type === "table") {
        const evidenceNumbers = new Set(numericTokens(evidenceById.get(element.sourceEvidenceId)?.claim ?? ""));
        const dataNumbers = element.type === "chart" ? element.series.flatMap(({ values }) => values.map(String)) : element.rows.flatMap((row) => Object.values(row).flatMap((value) => typeof value === "number" || typeof value === "string" && FACTUAL_NUMBER.test(value) ? numericTokens(String(value)) : []));
        const unsupported = dataNumbers.filter((token) => !evidenceNumbers.has(token));
        if (unsupported.length) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: `${element.type}-data.value-mismatch`, message: "数据对象中的数值与绑定证据不一致", bbox: issueBox(element), evidence: `unsupported=${[...new Set(unsupported)].join(",")}; source=${element.sourceEvidenceId}`, repairHint: "仅使用该 evidenceId 定位的结构化数据重建图表或表格" });
      }
      for (const evidenceId of element.evidenceRefs) if (!evidenceIds.has(evidenceId)) issueV2(issues, { severity: "error", slideId: slide.id, elementId: element.id, ruleId: "evidence.reference-missing", message: "对象引用了不存在的证据记录", bbox: issueBox(element), evidence: evidenceId, repairHint: "绑定 evidence ledger 中存在且含有 source 与 locator 的记录" });
    });

    const independentlyPlaced = slide.elements.filter((element) => !element.decorative && element.overlapPolicy === "none");
    for (let left = 0; left < independentlyPlaced.length; left += 1) for (let right = left + 1; right < independentlyPlaced.length; right += 1) {
      const a = independentlyPlaced[left]; const b = independentlyPlaced[right];
      if (a && b && intersectionRatio(a, b) > .08) issueV2(issues, { severity: "error", slideId: slide.id, elementId: b.id, ruleId: "geometry.overlap", message: "对象发生非预期重叠", bbox: issueBox(b), evidence: `${a.id} intersects ${b.id}`, repairHint: "调整槽位或切换候补布局" });
    }

    const render = rendered.get(slide.id);
    if (!render) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "render.missing", message: "缺少本页实际渲染图", evidence: "no render reference", repairHint: "以 1920 × 1080 重新渲染并复检" });
    else if (render.width !== 1920 || render.height !== 1080) issueV2(issues, { severity: "error", slideId: slide.id, ruleId: "render.dimensions", message: "渲染图不是 1920 × 1080", evidence: `${render.width} × ${render.height}`, repairHint: "修正渲染器 viewport 与 deviceScaleFactor" });
  });

  if (fontFamilies.size > 2) issueV2(issues, { severity: "error", ruleId: "typography.font-families", message: "整稿使用超过两个字体家族", evidence: [...fontFamilies].join(", "), repairHint: "统一到标题与正文两个字体家族" });
  for (const record of document.evidenceLedger) {
    if (!record.locator.trim()) issueV2(issues, { severity: "error", ruleId: "evidence.locator-missing", message: "证据记录缺少可定位的 locator", evidence: record.id, repairHint: "保存页码、段落、单元格或网页定位信息" });
    if (record.sourceId && !sourceIds.has(record.sourceId)) issueV2(issues, { severity: "error", ruleId: "evidence.source-missing", message: "证据记录指向不存在的来源", evidence: `${record.id}:${record.sourceId}`, repairHint: "把 evidence sourceId 绑定到文档 sources 中的真实来源" });
    if (!record.sourceId && !record.url && record.status !== "assumption" && record.status !== "simulation") issueV2(issues, { severity: "error", ruleId: "evidence.source-missing", message: "证据记录既没有 sourceId 也没有 URL", evidence: record.id, repairHint: "补充可追溯来源，否则改标为假设或模拟" });
  }
  if (options.renderedSlides && options.renderedSlides.length !== document.slides.length) issueV2(issues, { severity: "error", ruleId: "render.coverage", message: "渲染页数与演示页数不一致", evidence: `${options.renderedSlides.length}/${document.slides.length}`, repairHint: "重新渲染整稿，不允许抽样替代硬门禁" });

  const hardGateIds: QualityHardGate["id"][] = ["structure", "evidence", "typography", "contrast", "geometry", "assets", "render", "accessibility"];
  const hardGates = hardGateIds.map((id): QualityHardGate => {
    const gateIssues = issues.filter((issue) => gateFor(issue.ruleId) === id);
    return { id, status: gateIssues.some(({ severity }) => severity === "error") ? "failed" : gateIssues.length ? "warning" : "passed", issueIds: gateIssues.map(({ ruleId }) => ruleId) };
  });
  const dimensions = dimensionWeights.map(([id, label, weight]): QualityDimension => {
    const dimensionIssues = issues.filter((issue) => qualityDimensionFor(issue.ruleId) === id);
    const deduction = dimensionIssues.reduce((sum, issue) => sum + (issue.severity === "error" ? 18 : issue.severity === "warning" ? 7 : 2), 0);
    return { id, label, weight, score: Math.max(0, 100 - deduction) };
  });
  const score = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight / 100, 0));
  const slideScores = document.slides.map(({ id }) => { const slideIssues = issues.filter(({ slideId }) => slideId === id); return { slideId: id, score: Math.max(0, 100 - slideIssues.reduce((sum, issue) => sum + (issue.severity === "error" ? 15 : issue.severity === "warning" ? 6 : 2), 0)), issueCount: slideIssues.length }; });
  const passed = hardGates.every(({ status }) => status !== "failed") && score >= 85 && dimensions.every(({ score: dimensionScore }) => dimensionScore >= 75);
  const manualReviews: QualityManualReview[] = [
    { id: "facts", label: "事实复核", status: "manual", message: document.evidenceLedger.length ? `已建立 ${document.evidenceLedger.length} 条可定位证据；交付前仍需人工核对原文、口径和时效性。` : "本稿没有可自动验证的外部证据；事实性陈述仍需人工复核。" },
    { id: "copyright", label: "版权与授权复核", status: "manual", message: "系统已记录素材 provider、source URL 与 license；对人物肖像、商标、内部材料及最终用途的授权范围仍需人工确认。" },
  ];
  return {
    version: "2.0.0", projectId: document.projectId, presentationId: document.id, revision: document.revision,
    status: passed ? "passed" : "needs_review", score, hardGates, dimensions, issues, manualReviews,
    worstSlides: slideScores.toSorted((left, right) => left.score - right.score).slice(0, 5),
    renderRefs: options.renderedSlides ?? [], autoFixRounds: options.autoFixRounds ?? 0, checkedAt: options.checkedAt ?? new Date().toISOString(),
  };
}

export function qualityReportV2ForRevision(report: QualityReportV2, currentRevision: number): QualityReportV2 {
  return report.revision === currentRevision ? report : { ...report, status: "stale" };
}
