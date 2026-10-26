import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPresentationDocument } from "../../packages/core/dist/index.js";
import { PptxRendererAdapter } from "../../apps/api/dist/export/pptx-exporter.js";

const sources = {
  pazhou: "https://www.gz.gov.cn/gzszfcwhy/2019ngzszfcwhy/cwhy/2019n/11y/15j090ccwhy/xgbd/content/post_5556988.html",
  climate: "https://www.mee.gov.cn/ywgz/ydqhbh/syqhbh/202206/t20220613_985408.shtml",
  resilience: "https://www.mee.gov.cn/zcwj/zyygwj/202412/t20241206_1098168.shtml",
};

const notes = (...urls) => `[Sources]\n${urls.map((url) => `- ${url}`).join("\n")}\n[/Sources]`;

const pageSpecs = [
  ["开场", "建立主张", "琶洲 2035：AI 驱动的会展韧性操作系统", "cover-claim", ["面向园区与会展运营决策者", "用 90 天验证数据、场景与协同闭环"], notes(sources.pazhou, sources.resilience)],
  ["决策", "锁定试点", "现在要批准的，是一个 90 天可验证试点", "summary-action", ["锁定一座场馆、一组数据、一条典型事件链", "先验证闭环，再决定是否扩围"], notes(sources.resilience)],
  ["机会", "识别试验场", "“数字＋会展＋总部”让琶洲成为天然试验场", "visual-hero", ["产业、会展与城市运行高密度交汇", "数字基础能力可以直接服务真实运营场景"], notes(sources.pazhou)],
  ["风险", "理解系统风险", "极端天气会把局部故障放大为系统风险", "problem-triad", ["人流、交通与场馆负载同时变化", "多个部门看到不同版本的事实", "延迟的协同比单点设备故障更难恢复"], notes(sources.climate, sources.resilience)],
  ["现状", "识别断点", "当前不缺系统，缺的是跨系统闭环", "comparison", ["各平台分别监测，需要人工汇总和转译", "共享事实底座，让预警直接进入责任和行动"], notes(sources.resilience)],
  ["模式", "建立运行闭环", "新模式必须贯通感知、预测、决策、协同和复盘", "process-roadmap", ["感知趋势与异常", "给出可撤回的决策建议", "记录行动、结果与责任"], notes(sources.resilience)],
  ["模拟", "验证事件链", "模拟：暴雨前 120 分钟，每一次决策都应有下一个负责人", "process-roadmap", ["T-120：风险信号进入作战链", "T-60：人流、交通与场馆联合调度", "T+30：复盘响应时间与遗留风险"], notes(sources.climate, sources.resilience)],
  ["组织", "统一事实底座", "六类运营角色需要共享同一个事实底座", "quote-proof", ["园区指挥、场馆运营、交通调度、应急保障、通信服务与活动主办方必须在同一时间线上协作"], notes(sources.resilience)],
  ["数据", "构建数据底座", "数据底座统一天气、人流、交通、场馆和能源信号", "section-divider", ["不追求一次性搬迁所有数据", "以事件、时间和位置为共同语言"], notes(sources.resilience)],
  ["架构", "建立编排中枢", "主智能体负责拆解、路由和结果汇总", "visual-hero", ["根据风险类型分派专业任务", "在同一运行记录中汇总证据、建议和审批"], notes(sources.resilience)],
  ["协作", "设计专业分工", "五个专业智能体承担不同决策职责", "problem-triad", ["气象风险与人流交通预测", "场馆能源与通信资源协同", "渲染审校负责验证结果，不代替审批"], notes(sources.resilience)],
  ["预警", "把信号变成窗口", "气象风险智能体把预警转成可执行行动窗口", "comparison", ["输入：预报、监测与场景阈值", "输出：影响区域、有效时间与建议动作"], notes(sources.climate)],
  ["交通", "联动到达与疏散", "人流与交通智能体协调到达、疏散和运力", "process-roadmap", ["识别聚集与冲突趋势", "生成备选流线与运力建议", "将高风险调度交由人工批准"], notes(sources.resilience)],
  ["设施", "保护关键运行", "场馆与能源智能体保护关键设施连续运行", "metric-dashboard", ["场馆负载状态", "能源与备用系统", "关键设备巡检闭环"], notes(sources.resilience)],
  ["协同", "统一资源与通知", "通信与资源智能体统一通知、物资和责任人", "comparison", ["事件不再停留在群聊和口头通知", "每个动作都带责任人、时限和回执"], notes(sources.resilience)],
  ["驾驶舱", "只呈现需要决策的信息", "数字孪生驾驶舱不追求屏幕更多，只呈现需要决策的信息", "visual-hero", ["当前最大风险与事实根据", "待审批动作、可撤回方案和责任状态"], notes(sources.resilience)],
  ["边界", "保留人工审批", "高风险动作始终保留人工审批和撤回", "quote-proof", ["自动化的价值是缩短信息与决策之间的距离，不是取代高风险责任主体"], notes(sources.resilience)],
  ["度量", "建立可对照基线", "价值通过基线、响应时间和恢复能力衡量", "metric-dashboard", ["从信号到建议的时间", "从建议到责任确认的时间", "恢复后未闭环事项数"], notes(sources.resilience)],
  ["试点", "用三阶段完成验证", "90 天分三阶段验证数据、场景和运营闭环", "process-roadmap", ["1–30 天：数据与基线", "31–60 天：场景演练与人工审批", "61–90 天：真实运营与复盘"], notes(sources.resilience)],
  ["治理", "把安全与审计前置", "隐私、安全、审计和模型失效必须前置治理", "problem-triad", ["最小化使用个人与敏感数据", "对模型、人员与系统动作统一审计", "无法验证或服务不可用时安全降级"], notes(sources.resilience)],
  ["行动", "锁定七天内的三个输入", "下一步是在 7 天内锁定试点场馆、数据和负责人", "summary-action", ["确定试点场馆与业务负责人", "确认可接入数据与使用边界", "安排首次模拟事件链评审"], notes(sources.pazhou, sources.resilience)],
];

export const brief = {
  topic: "琶洲 2035：AI 驱动的会展韧性操作系统",
  originalPrompt: "为琶洲园区、会展场馆和城市运营决策者制作 21 页决策演示，推动批准 90 天试点。",
  goal: "批准一个 90 天可验证试点",
  audience: ["琶洲园区运营决策者", "会展场馆负责人", "城市运行管理者"],
  durationMinutes: 20,
  desiredAction: "确定试点场馆、数据和负责人",
  answers: {},
  sources: Object.entries(sources).map(([id, url]) => ({ id, title: id, url })),
  language: "zh-CN",
  slideCount: 21,
  scenario: "government-policy",
  visualDirectionId: "signal-dark",
};

export const blueprint = {
  schemaVersion: "2.0.0",
  title: brief.topic,
  taskSummary: { goal: brief.goal, audience: brief.audience, desiredAction: brief.desiredAction },
  coreClaim: "琶洲应先用 90 天试点验证一套可审批、可撤回、可复盘的会展韧性运行闭环。",
  slides: pageSpecs.map(([section, purpose, title, visualIntent, keyPoints, note], index) => ({
    order: index + 1,
    section,
    purpose,
    title,
    layoutFamily: `government-policy.${visualIntent}`,
    keyPoints,
    evidence: ["official-source"],
    visualIntent,
    notes: note,
  })),
  evidencePlan: Object.entries(sources).map(([claim, source]) => ({ claim, status: "available", source })),
  visualDirection: {
    id: "signal-dark",
    name: "Pazhou Signal Dark",
    density: "decision",
    tone: ["克制", "城市夜航", "决策感"],
    palette: { background: "#09110D", foreground: "#F4F4EF", primary: "#D2F235", accent: "#F28B50", muted: "#26322C" },
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? "artifacts/acceptance/pazhou-2035/baseline/pazhou-2035-baseline.pptx");
  const document = createPresentationDocument({ projectId: "pazhou-2035-baseline", presentationId: "pazhou-2035-baseline-deck", brief, blueprint, now: "2026-08-23T00:00:00.000Z" });
  const bytes = await new PptxRendererAdapter().render(document, { branding: "aippt" });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  await writeFile(resolve(dirname(output), "presentation-document.json"), JSON.stringify(document, null, 2));
  console.log(JSON.stringify({ output, slides: document.slides.length, bytes: bytes.length }));
}
