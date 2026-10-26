import { z } from "zod";

const jsonSchemaRef = z.object({
  schemaId: z.string().min(1),
  version: z.string().min(1),
});

export const skillManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  purpose: z.string().min(1),
  input: jsonSchemaRef,
  output: jsonSchemaRef,
  allowedModels: z.array(z.string()).min(1),
  allowedTools: z.array(z.string()).default([]),
  permissions: z.object({ shell: z.literal(false), secrets: z.literal(false), network: z.literal(false) }),
  stopConditions: z.array(z.string()).min(1),
  failureStrategy: z.enum(["fail", "retry", "fallback"]),
  evaluationSet: z.string().min(1),
});

const skillDefinitions = [
  ["ppt-orchestrator", "演示任务编排", "管理阶段、重试、停止条件与版本"],
  ["brief-and-research", "任务理解与研究", "把资料、答案、事实和引用整理成可追溯 Brief"],
  ["story-architect", "叙事架构", "生成章节、逐页结论、证据计划和演讲节奏"],
  ["slide-copywriter", "逐页文案", "把结论和证据压缩为可展示的短文案"],
  ["visual-director", "视觉导演", "输出主题令牌、图像语言和三组样稿方向"],
  ["semantic-layout-router", "语义版式路由", "根据页面意图、密度和素材选择确定性版式"],
  ["data-storytelling", "数据叙事", "把数据转为可解释图表、重点和口径说明"],
  ["asset-generator", "视觉资源生成", "生成具有来源、许可和版本记录的视觉资源任务"],
  ["content-fit", "内容适配", "执行字数容量、字号、换行和候补版式策略"],
  ["render-critic", "渲染审校", "执行内容、几何、渲染三段式质量检查"],
  ["template-ingest", "模板导入", "清理并识别 PPTX 主题、母版、字体、占位符和对象"],
  ["technical-deck", "技术演示", "组织代码、Mermaid、PlantUML、LaTeX 与逐步讲解"],
  ["pptx-exporter", "可编辑 PPTX 导出", "将 Scene 映射为原生 PPTX 对象并完成结构校验"],
  ["html-exporter", "HTML 演示导出", "从同一 Scene 输出 Reveal 运行时和可维护资源包"],
] as const;

export const skillCatalog = skillDefinitions.map(([id, name, purpose]) => skillManifestSchema.parse({
  id,
  name,
  version: "1.0.0",
  purpose,
  input: { schemaId: `aippt://${id}/input`, version: "1.0.0" },
  output: { schemaId: `aippt://${id}/output`, version: "1.0.0" },
  allowedModels: ["configured-structured-model"],
  allowedTools: [],
  permissions: { shell: false, secrets: false, network: false },
  stopConditions: ["schema-valid", "quality-gate-reached", "retry-budget-exhausted"],
  failureStrategy: id === "ppt-orchestrator" ? "fail" : "fallback",
  evaluationSet: `golden/${id}/v1`,
}));

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const templateManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  scenario: z.string().min(1),
  intent: z.string().min(1),
  name: z.string().min(1),
  slots: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["title", "body", "metric", "image", "chart", "table", "quote", "timeline"]),
    maxCharacters: z.number().int().positive(),
    aspectRatio: z.string().optional(),
  })).min(1),
  themeTokens: z.record(z.string(), z.string()),
  fallbackLayoutIds: z.array(z.string()).min(1),
  exportCompatibility: z.object({ pptx: z.boolean(), html: z.boolean(), image: z.boolean(), canvas: z.boolean() }),
  license: z.string().min(1),
});

const scenarios = [
  ["consulting-strategy", "咨询战略"], ["business-fundraising", "商业计划与融资"],
  ["sales-proposal", "销售提案"], ["product-launch", "产品发布"],
  ["operating-review", "经营复盘"], ["project-report", "项目汇报"],
  ["data-report", "数据报告"], ["academic-research", "学术研究"],
  ["education-training", "教育培训"], ["government-policy", "政企政策与党建"],
  ["technology-rd", "科技研发"], ["brand-marketing", "品牌营销"],
] as const;

const layoutIntents = [
  ["cover-claim", "主张封面", "body"], ["section-divider", "章节转场", "body"],
  ["problem-triad", "三项问题", "body"], ["comparison", "对照判断", "body"],
  ["metric-dashboard", "指标仪表盘", "metric"], ["data-evidence", "数据证据", "chart"],
  ["process-roadmap", "流程与路线图", "timeline"], ["visual-hero", "核心视觉", "image"],
  ["quote-proof", "观点与证言", "quote"], ["summary-action", "总结与行动", "body"],
] as const;

export const templateCatalog = scenarios.flatMap(([scenario, scenarioName], scenarioIndex) =>
  layoutIntents.map(([intent, intentName, contentKind], layoutIndex) => {
    const id = `${scenario}.${intent}`;
    const fallbackIntent = layoutIntents[(layoutIndex + 1) % layoutIntents.length]?.[0] ?? "cover-claim";
    return templateManifestSchema.parse({
      id,
      version: "1.0.0",
      scenario,
      intent,
      name: `${scenarioName}｜${intentName}`,
      slots: [
        { id: "title", kind: "title", maxCharacters: 36 },
        { id: "content", kind: contentKind, maxCharacters: contentKind === "body" ? 180 : 80, ...(contentKind === "image" ? { aspectRatio: "16:9" } : {}) },
      ],
      themeTokens: {
        background: scenarioIndex % 3 === 0 ? "#0A0A0A" : scenarioIndex % 3 === 1 ? "#F4F4EF" : "#151818",
        foreground: scenarioIndex % 3 === 1 ? "#111311" : "#F4F4EF",
        primary: "#B7F34A",
        accent: "#FF725E",
        grid: layoutIndex % 2 === 0 ? "asymmetric-12" : "editorial-8",
      },
      fallbackLayoutIds: [`${scenario}.${fallbackIntent}`],
      exportCompatibility: { pptx: true, html: true, image: true, canvas: true },
      license: "AIPPT-ORIGINAL",
    });
  }),
);

export type TemplateManifest = z.infer<typeof templateManifestSchema>;

export const thirdPartyManifestSchema = z.object({
  id: z.string().min(1),
  repository: z.string().url(),
  version: z.string().min(1),
  strategy: z.enum(["adopt", "wrap", "port", "borrow", "reject"]),
  license: z.string().min(1),
  notice: z.string().min(1),
  checksum: z.string().min(1),
  modifications: z.array(z.string()).default([]),
});

const thirdPartyDefinitions = [
  ["pptxgenjs", "https://github.com/gitbrent/PptxGenJS", "4.0.1", "adopt", "MIT"],
  ["pptx-automizer", "https://github.com/singerla/pptx-automizer", "0.9.0", "adopt", "MIT"],
  ["pptxtojson", "https://github.com/pipipi-pikachu/pptxtojson", "audited-commit-required", "wrap", "MIT"],
  ["revealjs", "https://github.com/hakimel/reveal.js", "6.0.1", "adopt", "MIT"],
  ["decktape", "https://github.com/astefanutti/decktape", "3.16.1", "wrap", "MIT"],
  ["konva", "https://github.com/konvajs/konva", "10.3.0", "adopt", "MIT"],
  ["react-konva", "https://github.com/konvajs/react-konva", "19.2.5", "adopt", "MIT"],
  ["open-xml-sdk", "https://github.com/dotnet/Open-XML-SDK", "sidecar-lock-required", "wrap", "MIT"],
  ["gotenberg", "https://github.com/gotenberg/gotenberg", "container-digest-required", "wrap", "MIT"],
  ["presenton", "https://github.com/presenton/presenton", "audited-commit-required", "port", "Apache-2.0"],
  ["pptagent", "https://github.com/icip-cas/PPTAgent", "audited-commit-required", "port", "MIT"],
  ["presentation-skill", "https://github.com/siril9/presentation-skill", "audited-commit-required", "port", "MIT"],
  ["codex-ppt-skill", "https://github.com/ningzimu/codex-ppt-skill", "audited-commit-required", "port", "MIT"],
  ["pptist", "https://github.com/pipipi-pikachu/PPTist", "research-only", "borrow", "AGPL-3.0"],
  ["tldraw", "https://github.com/tldraw/tldraw", "research-only", "reject", "Commercial"],
] as const;

export const thirdPartyCatalog = thirdPartyDefinitions.map(([id, repository, version, strategy, license]) => thirdPartyManifestSchema.parse({
  id, repository, version, strategy, license,
  notice: `See optional/licenses/THIRD_PARTY_NOTICES.md#${id}`,
  checksum: version.includes("required") ? "PENDING_AUDIT" : `${id}@${version}`,
  modifications: strategy === "port" ? ["Rewritten as a restricted JSON-Schema workflow"] : [],
}));

export type ThirdPartyManifest = z.infer<typeof thirdPartyManifestSchema>;

// Public catalog is always schema-validated; the tuple above stays private implementation data.
