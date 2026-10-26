import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  blueprintSchema,
  createPresentationDocument,
  creationBriefSchema,
  type Blueprint,
  type PresentationDocument,
} from "@aippt/core";
import { createApi } from "../src/runtime.js";
import { FakePresentationModel } from "../src/model/fake-model.js";

const workspace = resolve(import.meta.dirname, "../../..");
const outputRoot = resolve(workspace, "output/acceptance/resource-ecosystem-10p");
const objectRoot = resolve(outputRoot, "object-store");
const heroPath = resolve(workspace, "assets/resource-library/generated/pazhou-resilience-hero.png");
const userHeaders = { "x-aippt-user-id": "local-demo-user", host: "localhost" };

const sources = [
  { id: "gz-plan", title: "琶洲地区发展规划（2019—2035年）", url: "https://www.gz.gov.cn/gzszfcwhy/2019ngzszfcwhy/cwhy/2019n/11y/15j090ccwhy/xgbd/content/post_5556988.html" },
  { id: "climate-2035", title: "国家适应气候变化战略2035", url: "https://www.mee.gov.cn/ywgz/ydqhbh/syqhbh/202206/t20220613_985408.shtml" },
  { id: "resilient-city", title: "关于推进新型城市基础设施建设打造韧性城市的意见", url: "https://www.mee.gov.cn/zcwj/zyygwj/202412/t20241206_1098168.shtml" },
];

const slideSpecs = [
  ["决策", "琶洲需要一套面向 2035 的会展韧性操作系统", "cover-claim", ["用 90 天验证跨系统协同，而不是再建一个孤立平台"]],
  ["决策", "本次需要批准的是一个 90 天可验证试点", "decision-ask", ["锁定 1 个试点场馆", "接通 5 类关键数据", "建立 1 套联动责任制"]],
  ["机会", "“数字＋会展＋总部”形成独特试验场", "opportunity-map", ["数字经济集聚", "会展事件密集", "总部决策链短"]],
  ["风险", "极端天气会把局部故障放大为系统风险", "risk-heatmap", ["天气信号与客流峰值叠加", "交通、场馆、能源相互耦合", "局部延迟可能沿责任链扩散"]],
  ["方案", "当前不缺系统，缺的是跨系统闭环", "system-loop", ["感知：统一信号", "预测：形成行动窗口", "决策：保留人工审批", "协同：同步资源与责任人", "复盘：沉淀可审计证据"]],
  ["模拟", "暴雨前 120 分钟：把预警转成可撤回行动", "scenario-timeline", ["气象风险升级", "客流与运力预估", "场馆设施预检", "人工批准联动", "恢复与复盘"]],
  ["架构", "数据底座与五个专业智能体共享同一事实", "agent-architecture", ["气象风险智能体", "人流交通智能体", "场馆能源智能体", "通信资源智能体", "审计复盘智能体"]],
  ["运营", "驾驶舱只呈现需要决策的信息，高风险动作始终人工审批", "human-gate", ["风险、证据、建议动作同屏", "批准、驳回、撤回全程留痕", "模型失效时回退到既有预案"]],
  ["实施", "90 天分三阶段验证数据、场景和运营闭环", "pilot-roadmap", ["01–30 天：数据与基线", "31–60 天：场景联调", "61–90 天：实战演练与 KPI 复盘"]],
  ["行动", "未来 7 天锁定试点场馆、数据和负责人", "summary-action", ["批准 90 天试点范围", "指定场馆与跨部门负责人", "确认数据清单与安全边界"]],
] as const;

function makeBlueprint(): Blueprint {
  return blueprintSchema.parse({
    schemaVersion: "2.0.0",
    title: "琶洲 2035：AI 驱动的会展韧性操作系统",
    taskSummary: {
      goal: "推动批准一个 90 天可验证试点",
      audience: ["琶洲园区运营者", "会展场馆管理者", "城市运营决策者"],
      desiredAction: "在 7 天内锁定试点场馆、数据和负责人",
    },
    coreClaim: "韧性来自跨系统可验证闭环，而不是系统数量。",
    slides: slideSpecs.map(([section, title, visualIntent, keyPoints], index) => ({
      order: index + 1,
      section,
      purpose: title,
      title,
      layoutFamily: `government-policy.${visualIntent}`,
      keyPoints: [...keyPoints],
      evidence: index === 5 ? ["明确标注为模拟场景"] : sources.map((source) => source.title),
      visualIntent,
      notes: index === 5 ? "[Simulation] 本页为验收模拟，不代表真实预测或已发生事件。" : "依据公开规划与韧性治理文件形成的方案判断。",
    })),
    evidencePlan: sources.map((source) => ({ claim: source.title, status: "available", source: source.url })),
    visualDirection: {
      id: "pazhou-resilience",
      name: "Pazhou Resilience",
      density: "executive",
      tone: ["城市", "决策", "韧性"],
      palette: { background: "#08181E", foreground: "#F4F7F2", primary: "#5DD6C0", accent: "#FFB45B", muted: "#27434A" },
    },
  });
}

function addImageHero(document: PresentationDocument, imageData: string): PresentationDocument {
  const first = document.slides[0]!;
  const foreground = first.elements
    .filter((element) => !element.id.startsWith("hero-") && !element.id.startsWith("number-"))
    .map((element) => element.type === "text" ? { ...element, color: "#FFFFFF" } : element);
  return {
    ...document,
    assets: [...document.assets, { id: "asset-pazhou-hero", kind: "image", uri: "embedded:data", source: "OpenAI image generation via Codex acceptance run", model: "OpenAI image generation", prompt: "Future Pazhou convention district before a rainstorm; no text or logos", license: "generated", checksum: "recorded-in-file-ledger" }],
    slides: [{
      ...first,
      background: "#07151C",
      notes: `${first.notes}\n\n[Media Credits]\n- AIPPT/Codex 原创 AI 视觉；仅用于本地验收。\n[/Media Credits]`,
      elements: [
        { id: "pazhou-hero", type: "image", src: imageData, alt: "AI 生成的琶洲会展韧性概念视觉", fit: "cover", x: 0, y: 0, width: 13.333, height: 7.5, rotation: 0, opacity: 0.78, locked: true },
        { id: "hero-overlay", type: "shape", shape: "rect", x: 0, y: 0, width: 13.333, height: 7.5, rotation: 0, opacity: 0.56, locked: true, fill: "#06151B", stroke: "#06151B", strokeWidth: 0 },
        ...foreground,
      ],
    }, ...document.slides.slice(1)],
  };
}

async function injectJson(app: Awaited<ReturnType<typeof createApi>>, method: "GET" | "POST" | "PUT", url: string, payload?: unknown) {
  const response = await app.inject({ method, url, headers: userHeaders, ...(payload === undefined ? {} : { payload }) });
  if (response.statusCode >= 400) throw new Error(`${method} ${url} failed (${response.statusCode}): ${response.body}`);
  return response.json<Record<string, any>>();
}

async function exportFile(app: Awaited<ReturnType<typeof createApi>>, presentationId: string, format: "pptx" | "html" | "html-zip", filename: string) {
  const started = await injectJson(app, "POST", `/api/presentations/${presentationId}/exports`, { format, branding: "none", idempotencyKey: `acceptance-${presentationId}-${format}` });
  const exportId = started.export.id as string;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await injectJson(app, "GET", `/api/exports/${exportId}/status`);
    if (status.export.status === "success") {
      const download = await app.inject({ method: "GET", url: `/api/exports/${exportId}/download`, headers: userHeaders });
      if (download.statusCode !== 200) throw new Error(`Download failed: ${download.body}`);
      await writeFile(resolve(outputRoot, filename), download.rawPayload);
      return status.export;
    }
    if (status.export.status === "failed") throw new Error(`Export failed: ${status.export.error}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Timed out exporting ${format}`);
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const app = await createApi({
    model: new FakePresentationModel(),
    env: {
      NODE_ENV: "development",
      ENABLE_CODEX_TEST_BRIDGE: "true",
      DATABASE_MODE: "pglite",
      PGLITE_PATH: "memory://",
      OBJECT_STORE: "local",
      LOCAL_OBJECT_STORE_PATH: objectRoot,
      DEMO_ADMIN_USER_ID: "local-demo-user",
      WEB_ORIGIN: "http://localhost:3000",
    },
    inlineJobs: true,
  });
  try {
    await injectJson(app, "POST", "/api/checkout", { plan: "pro", interval: "month", returnTo: "/resources" });
    const hero = `data:image/png;base64,${(await readFile(heroPath)).toString("base64")}`;
    const variants = [
      { slug: "native-pptx", mode: "standard" as const, templateId: "tpl.native.civic-city", skillIds: ["skill.brief-diagnosis", "skill.evidence-ledger", "skill.government-report", "skill.citation-notes"] },
      { slug: "html-map-story", mode: "html" as const, templateId: "tpl.html.map-story", skillIds: ["skill.story-architecture", "skill.layout-router", "skill.render-review"] },
      { slug: "image-hybrid", mode: "image" as const, templateId: "tpl.image.future-architecture", skillIds: ["skill.image-visual-director", "skill.layout-router", "skill.render-review"] },
    ];
    const report: Array<Record<string, unknown>> = [];
    for (const variant of variants) {
      const project = await injectJson(app, "POST", "/api/projects", { name: `琶洲 2035 · ${variant.slug}`, topic: "琶洲 2035：AI 驱动的会展韧性操作系统" });
      const projectId = project.project.id as string;
      await injectJson(app, "POST", `/api/projects/${projectId}/questions`, { slideCount: 10, audience: ["城市运营决策者"], goal: "批准 90 天试点" });
      await injectJson(app, "POST", `/api/projects/${projectId}/blueprint`, { slideCount: 10 });
      await injectJson(app, "PUT", `/api/projects/${projectId}/resource-binding`, {
        creationMode: variant.mode,
        templateId: variant.templateId,
        templateVersion: "1.0.0",
        skillIds: variant.skillIds,
        assetPolicy: { providers: ["seed"], licenseAllowlist: ["generated", "CC0-1.0", "PDM-1.0", "CC-BY-4.0"], allowAiGeneration: false, requireAttribution: true },
      });
      const brief = creationBriefSchema.parse({
        topic: "琶洲 2035：AI 驱动的会展韧性操作系统",
        originalPrompt: "为琶洲园区、会展场馆和城市运营决策者制作 10 页试点决策稿",
        goal: "推动批准一个 90 天可验证试点",
        audience: ["琶洲园区运营者", "会展场馆管理者", "城市运营决策者"],
        desiredAction: "在 7 天内锁定试点场馆、数据和负责人",
        slideCount: 10,
        scenario: "government-policy",
        creationMode: variant.mode,
        templateId: variant.templateId,
        templateVersion: "1.0.0",
        skillIds: variant.skillIds,
        sources,
      });
      const presentationId = randomUUID();
      let document = createPresentationDocument({ projectId, presentationId, brief, blueprint: makeBlueprint(), mode: variant.mode });
      if (variant.mode === "image") document = addImageHero(document, hero);
      const bridged = await injectJson(app, "POST", `/api/dev/codex-test-bridge/projects/${projectId}/presentations`, { document, idempotencyKey: `acceptance-${variant.slug}` });
      const quality = await injectJson(app, "POST", `/api/presentations/${presentationId}/quality`, { idempotencyKey: `quality-${variant.slug}` });
      const exports = [];
      if (variant.mode === "html") {
        exports.push(await exportFile(app, presentationId, "html", `${variant.slug}.html`));
        exports.push(await exportFile(app, presentationId, "html-zip", `${variant.slug}.zip`));
      } else {
        exports.push(await exportFile(app, presentationId, "pptx", `${variant.slug}.pptx`));
      }
      report.push({ variant, projectId, presentationId, provenance: bridged.provenance, slideCount: document.slides.length, qualityJob: quality.job?.id, exports });
    }
    await writeFile(resolve(outputRoot, "acceptance-report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), brief: "琶洲 2035 10 页精简 Brief", sources, results: report }, null, 2)}\n`, "utf8");
  } finally {
    await app.close();
  }
}

await main();
