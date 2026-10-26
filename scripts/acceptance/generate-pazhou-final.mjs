import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createPresentationDocument, inspectPresentation, sourceNotes, validateEvidenceLedger } from "../../packages/core/dist/index.js";
import { PptxRendererAdapter } from "../../apps/api/dist/export/pptx-exporter.js";
import { brief, blueprint as baselineBlueprint } from "./generate-pazhou-baseline.mjs";

const intents = [
  "cover-claim", "decision-ask", "opportunity-map", "risk-heatmap", "comparison", "system-loop",
  "scenario-timeline", "stakeholder-network", "data-stack", "agent-architecture", "agent-roster",
  "decision-window", "flow-map", "facility-section", "coordination-matrix", "control-room", "human-gate",
  "kpi-framework", "pilot-roadmap", "governance-matrix", "summary-action",
];

const pointOverrides = new Map([
  [1, ["试点范围：一座场馆", "输入边界：一组授权数据", "验收门槛：一条事件链闭环"]],
  [7, ["园区指挥", "场馆运营", "交通调度", "应急保障", "通信服务", "活动主办方"]],
  [8, ["气象信号", "人流趋势", "交通运力", "场馆状态", "能源与备用系统"]],
  [9, ["任务拆解与优先级", "证据与时间窗聚合", "专业智能体路由", "人工审批门控", "结果与责任汇总", "事件记录与复盘"]],
  [10, ["气象风险", "人流交通", "场馆能源", "通信资源", "渲染审校"]],
  [14, ["统一通知：对象、时间与渠道", "统一资源：物资、运力与位置", "统一责任：负责人、时限与回执"]],
]);

const blueprint = {
  ...baselineBlueprint,
  title: `${baselineBlueprint.title} · 验收版`,
  slides: baselineBlueprint.slides.map((slide, index) => ({
    ...slide,
    visualIntent: intents[index],
    layoutFamily: `government-policy.${intents[index]}`,
    keyPoints: pointOverrides.get(index) ?? slide.keyPoints,
    notes: index === 6
      ? `[Simulation] 本页为流程演练，时间点与动作不是已发生事实。\n\n${slide.notes}`
      : index === 17
        ? `[Target framework] 本页只定义指标，不声称已实现收益。\n\n${slide.notes}`
        : slide.notes,
  })),
};

const accessedAt = "2026-08-23T00:00:00.000Z";
const ledger = validateEvidenceLedger([
  { id: "pazhou-plan", claim: "理解计划的数字、会展与总部经济发展背景", title: "理解计划地区 2019—2035 发展规划", url: brief.sources.find(({ id }) => id === "pazhou").url, locator: "广州市政府规划公开页", accessedAt, license: "官方网页链接引用；未声明内容再分发权", status: "manual-review" },
  { id: "climate-2035", claim: "极端天气风险与适应气候变化的长期要求", title: "国家适应气候变化战略 2035", url: brief.sources.find(({ id }) => id === "climate").url, locator: "生态环境部政策页", accessedAt, license: "官方网页链接引用；未声明内容再分发权", status: "manual-review" },
  { id: "resilient-city", claim: "城市韧性建设、跨系统协同与治理要求", title: "关于推进新型城市基础设施建设打造韧性城市的意见", url: brief.sources.find(({ id }) => id === "resilience").url, locator: "生态环境部政策文件页", accessedAt, license: "官方网页链接引用；未声明内容再分发权", status: "manual-review" },
]);

const output = resolve(process.argv[2] ?? "artifacts/acceptance/pazhou-2035/final/pazhou-2035-final.pptx");
const document = createPresentationDocument({ projectId: "pazhou-2035-final", presentationId: "pazhou-2035-final-deck", brief, blueprint, now: "2026-08-23T00:00:00.000Z" });
document.sources = ledger.map((record) => ({ id: record.id, title: record.title, url: record.url, note: `${record.claim} · ${record.locator} · 抓取 ${record.accessedAt}`, kind: "citation", license: record.license, authorized: true }));
document.slides.forEach((slide, index) => {
  const original = baselineBlueprint.slides[index]?.notes ?? "";
  const related = ledger.filter((record) => original.includes(record.url));
  const disclosure = index === 6 ? "[Simulation] 本页为流程演练，时间点与动作不是已发生事实。" : index === 17 ? "[Target framework] 本页只定义指标，不声称已实现收益。" : undefined;
  slide.notes = sourceNotes(related, disclosure);
});
const heroPath = resolve("apps/web/public/observatory/pazhou-night-horizon.png");
document.slides[0].elements.unshift({ id: "pazhou-hero", type: "image", src: heroPath, alt: "琶洲夜间城市天际线视觉", fit: "cover", x: 0, y: 0, width: 13.333, height: 7.5, rotation: 0, opacity: .5, locked: true });
document.slides[0].elements.splice(1, 0, { id: "pazhou-overlay", type: "shape", shape: "rect", x: 0, y: 0, width: 13.333, height: 7.5, rotation: 0, opacity: .38, locked: true, fill: "#09110D", stroke: "#09110D", strokeWidth: 0 });
document.assets.push({ id: "pazhou-night-horizon", kind: "image", uri: heroPath, source: "project-approved-local-asset", license: "workspace asset" });
const quality = inspectPresentation(document);
const bytes = await new PptxRendererAdapter().render(document, { branding: "none" });
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
await writeFile(resolve(dirname(output), "presentation-document.json"), JSON.stringify(document, null, 2));
await writeFile(resolve(dirname(output), "quality-report.json"), JSON.stringify(quality, null, 2));
await writeFile(resolve(dirname(output), "evidence-ledger.json"), JSON.stringify(ledger, null, 2));
console.log(JSON.stringify({ output, slides: document.slides.length, bytes: bytes.length, quality: quality.summary }));
