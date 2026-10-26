import { z } from "zod";

const relativeAssetPathSchema = z.string().min(1).refine(
  (value) => value.startsWith("assets/resource-library/") && !value.includes("..") && !value.startsWith("/"),
  "Resource paths must stay inside assets/resource-library",
);

const licenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  redistributable: z.boolean(),
  commercialUse: z.boolean(),
  attributionRequired: z.boolean(),
  notice: z.string().min(1),
});

const sourceSchema = z.object({
  kind: z.enum(["aippt-original", "permissive-port", "external-link"]),
  title: z.string().min(1),
  url: z.string().url().optional(),
  retrievedAt: z.string().datetime().optional(),
});

const accessTierSchema = z.enum(["free", "pro", "single-purchase"]);

export const resourcePackageManifestV2Schema = z.object({
  schemaVersion: z.literal("2.0.0"),
  id: z.string().regex(/^tpl\.(native|html|image)\.[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  type: z.enum(["native-pptx", "html", "image-deck"]),
  name: z.string().min(1),
  description: z.string().min(1),
  author: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  source: sourceSchema,
  license: licenseSchema,
  accessTier: accessTierSchema,
  priceCny: z.number().positive().optional(),
  capabilities: z.object({
    executable: z.literal(true),
    sceneCompatible: z.literal(true),
    offline: z.boolean(),
    pptx: z.boolean(),
    html: z.boolean(),
    image: z.boolean(),
    editableText: z.boolean(),
    editableCharts: z.boolean(),
  }),
  runtime: z.object({
    engine: z.enum(["scene-native", "scene-html", "scene-image-hybrid"]),
    entrypoint: z.string().startsWith("aippt://"),
  }),
  previewPath: relativeAssetPathSchema,
  semanticLayouts: z.array(z.string().min(1)).min(4),
  themeTokens: z.object({
    background: z.string().regex(/^#[0-9A-F]{6}$/i),
    foreground: z.string().regex(/^#[0-9A-F]{6}$/i),
    primary: z.string().regex(/^#[0-9A-F]{6}$/i),
    accent: z.string().regex(/^#[0-9A-F]{6}$/i),
    fontHeading: z.string().min(1),
    fontBody: z.string().min(1),
  }),
  tags: z.array(z.string().min(1)).min(2),
});

export type ResourcePackageManifestV2 = z.infer<typeof resourcePackageManifestV2Schema>;

type TemplateDefinition = readonly [slug: string, name: string, description: string, background: string, foreground: string, primary: string, accent: string];

const nativeDefinitions = [
  ["strategy-minimal", "战略咨询极简", "高留白、结论先行的管理层决策版式", "#F6F3EA", "#171717", "#1C4B3F", "#D7A744"],
  ["boardroom-dark", "董事会深色", "适合董事会指标与风险决策的克制暗色系统", "#101820", "#F7F5EF", "#6EC6CA", "#F2B544"],
  ["civic-city", "政务城市", "城市治理、政策说明和公共项目汇报", "#F4F7FA", "#14273D", "#1F5A94", "#C84A45"],
  ["investor-pitch", "投资路演", "商业机会、增长证据和融资诉求的紧凑叙事", "#0E1525", "#F8FAFC", "#7C9DFF", "#7BE0B8"],
  ["product-launch", "产品发布", "突出产品主视觉、能力差异与上市节奏", "#F7F7F5", "#151515", "#5B4AE8", "#FF6B4A"],
  ["data-editorial", "数据新闻", "大数字、证据图表和编辑部式注释系统", "#F2EFE7", "#20201E", "#C13B2A", "#2E6C78"],
  ["academic-defense", "学术答辩", "研究问题、方法、证据和结论的严谨版式", "#F8FAFC", "#172033", "#315B96", "#8A5A44"],
  ["education-courseware", "教育课件", "适合教学目标、知识拆解和课堂练习", "#FFF9ED", "#293241", "#3D7EA6", "#E07A5F"],
  ["health-life-science", "医疗生命科学", "临床路径、科研证据与健康沟通", "#F2F8F7", "#143C3A", "#197C74", "#D36B5F"],
  ["climate-energy", "气候能源", "气候风险、能源转型和可持续行动", "#EEF5ED", "#17332B", "#287A55", "#E3A029"],
  ["industrial-chain", "智造供应链", "制造流程、供应网络与运营韧性", "#F2F3F5", "#20262D", "#3D586B", "#E67E22"],
  ["retail-growth", "零售增长", "消费洞察、渠道表现与增长实验", "#FFF4F0", "#3A2024", "#A63D55", "#F0A35E"],
  ["fintech-ledger", "金融科技", "金融指标、风控逻辑和数字化能力", "#101827", "#EAF1F8", "#35B5A4", "#E6B85C"],
  ["brand-magazine", "品牌杂志", "具有封面感、跨页感和强图文节奏的品牌表达", "#F4EFE8", "#241E1B", "#B54E3E", "#3A6570"],
  ["architectural-mono", "建筑黑白", "网格、尺度与结构感驱动的黑白展示", "#F5F5F3", "#111111", "#4C4C4C", "#A88A5D"],
  ["warm-narrative", "温暖叙事", "适合人物、组织文化与案例故事的自然暖调", "#FAF2E7", "#3C2D24", "#9B5C3E", "#D5A65A"],
] as const satisfies readonly TemplateDefinition[];

const htmlDefinitions = [
  ["editorial-grid", "编辑网格", "响应式网格和清晰的文章式层级", "#F6F4EE", "#191919", "#315F72", "#D85D3C"],
  ["dark-data", "暗色数据", "面向投屏的数据叙事和高对比可视化", "#0D1620", "#EAF2F7", "#36B7A5", "#F2C14E"],
  ["paper-notes", "纸张笔记", "纸张质感、边注和课堂笔记式结构", "#FBF6EA", "#302A24", "#536F50", "#C76B4A"],
  ["terminal-tech", "终端科技", "代码、架构和技术演示的终端语言", "#07120E", "#D8FBE8", "#4EE38A", "#79A8FF"],
  ["minimal-keynote", "极简演讲", "低密度、强标题和舞台式节奏", "#FAFAF8", "#111111", "#2B59C3", "#E85D3F"],
  ["museum-caption", "博物馆", "展签式注释、作品焦点和安静留白", "#EDE8DF", "#24221F", "#775C42", "#A53F35"],
  ["brutalist-web", "粗野主义", "大胆边界、强字号和网页原生感", "#E7FF55", "#111111", "#111111", "#FF4D00"],
  ["code-lab", "代码实验室", "代码对照、执行结果和逐步讲解", "#12131A", "#F0F2F5", "#8B7CFF", "#4AD7D1"],
  ["research-poster", "研究海报", "研究问题、证据图和方法的海报化组织", "#F7F5EF", "#1E2932", "#315D72", "#C77B30"],
  ["scroll-story", "滚动叙事", "长篇章节转场与纵向故事节奏", "#131313", "#F4F0E8", "#E0734F", "#5BB8A7"],
  ["product-demo", "产品演示", "产品截图、使用场景与演示步骤", "#F5F7FB", "#202638", "#5C63E6", "#FA7D55"],
  ["map-story", "地图故事", "区域比较、路线与空间关系表达", "#EEF3EF", "#18322B", "#39755F", "#E59A44"],
  ["live-dashboard", "实时仪表盘", "适合运营监控与实时演示的数据视图", "#0A1420", "#EEF6FA", "#00A6A6", "#FFB000"],
  ["timeline-motion", "时间轴", "里程碑、历史沿革和事件推进", "#F8F3EA", "#302924", "#6B5A9A", "#D8784B"],
  ["illustrated-cards", "插画卡片", "友好图卡、概念解释和轻量故事", "#FFF7E8", "#2A3543", "#448B7E", "#EF8354"],
  ["immersive-chapter", "沉浸章节", "全屏章节、深色影像和戏剧性过渡", "#080B11", "#F9F4EA", "#8CA6DB", "#E9A05B"],
] as const satisfies readonly TemplateDefinition[];

const imageDefinitions = [
  ["clean-professional", "专业清爽", "清晰主体图与可编辑结论文字的混合画面", "#F6F8FA", "#18202A", "#426B8A", "#E28C45"],
  ["magazine-collage", "杂志拼贴", "编辑拼贴、裁切影像和醒目标题", "#F3EDE4", "#231F20", "#B6443C", "#315D63"],
  ["eink-editorial", "电子墨水", "黑白颗粒、信息图与报刊式叙事", "#E8E7DF", "#171717", "#4C4C4C", "#A34232"],
  ["visual-dashboard", "数据驾驶舱", "主视觉背景与可编辑数据覆盖层", "#0C1621", "#E7F1F6", "#20B2AA", "#F2B84B"],
  ["retro-flat", "复古扁平", "复古色块和扁平插画语言", "#F2D6A2", "#3D352B", "#C6503E", "#2E7771"],
  ["handdrawn-tech", "手绘科技", "手绘线稿与现代技术概念融合", "#F7F1E5", "#263238", "#4169A1", "#D26A4A"],
  ["whiteboard-workshop", "白板推演", "工作坊草图、路径与可编辑批注", "#F8F7F1", "#242424", "#2C6E9B", "#D86D3E"],
  ["warm-craft", "温暖手作", "自然材质、柔和影像和人文故事", "#F5E9D8", "#402F26", "#9A6246", "#C89B55"],
  ["research-visual", "科研答辩", "科学影像与清晰注释的研究表达", "#EEF4F7", "#182B38", "#2A6F97", "#BC6C4A"],
  ["strategy-visual", "战略图解", "隐喻视觉与可编辑框架相结合", "#F4F2EC", "#1E2529", "#285B5A", "#CF8B3A"],
  ["civic-announcement", "政务发布", "城市影像、政策重点与庄重表达", "#F2F5F8", "#172A3A", "#205B8E", "#B8453F"],
  ["learning-cards", "教育图卡", "直观图解、知识卡和课堂引导", "#FFF7E5", "#283845", "#3B82A0", "#E7774D"],
  ["cinematic-documentary", "电影纪录", "纪实主视觉、字幕式标题和情绪节奏", "#0A0A0A", "#F1EEE8", "#C9A66B", "#7C8A94"],
  ["luxury-brand", "奢华品牌", "克制留白、材质特写和高端品牌感", "#171513", "#F3EEE5", "#B69B6C", "#735B4C"],
  ["scientific-atlas", "科学图谱", "图谱、标本式布局和精细编号", "#F1EFE7", "#23313B", "#426B65", "#B66A45"],
  ["future-architecture", "未来建筑", "建筑空间、城市系统和未来感影像", "#E9EFF2", "#19252D", "#39778A", "#D9854F"],
] as const satisfies readonly TemplateDefinition[];

const originalLicense = {
  id: "MIT",
  name: "MIT License",
  redistributable: true,
  commercialUse: true,
  attributionRequired: true,
  notice: "Original AIPPT resource released under MIT; retain the copyright and license notice.",
} as const;

const accessTierForIndex = (index: number) => index < 6 ? "free" as const : index < 14 ? "pro" as const : "single-purchase" as const;

function buildTemplateCatalog(
  kind: "native" | "html" | "image",
  type: "native-pptx" | "html" | "image-deck",
  definitions: readonly TemplateDefinition[],
): ResourcePackageManifestV2[] {
  return definitions.map(([slug, name, description, background, foreground, primary, accent], index) => {
    const accessTier = accessTierForIndex(index);
    const engine = kind === "native" ? "scene-native" : kind === "html" ? "scene-html" : "scene-image-hybrid";
    return resourcePackageManifestV2Schema.parse({
      schemaVersion: "2.0.0",
      id: `tpl.${kind}.${slug}`,
      version: "1.0.0",
      type,
      name,
      description,
      author: { id: "aippt-studio", name: "AIPPT Studio" },
      source: { kind: "aippt-original", title: `${name}原创设计系统` },
      license: originalLicense,
      accessTier,
      ...(accessTier === "single-purchase" ? { priceCny: kind === "html" ? 19.9 : 29.9 } : {}),
      capabilities: {
        executable: true,
        sceneCompatible: true,
        offline: true,
        pptx: kind !== "html",
        html: kind === "html",
        image: kind === "image",
        editableText: true,
        editableCharts: kind !== "image",
      },
      runtime: { engine, entrypoint: `aippt://resource-templates/${kind}/${slug}` },
      previewPath: `assets/resource-library/previews/templates/${kind}-${slug}.svg`,
      semanticLayouts: ["cover-hero", "section-divider", "claim-evidence", "data-proof", "process-roadmap", "summary-action"],
      themeTokens: { background, foreground, primary, accent, fontHeading: "Noto Sans SC", fontBody: "Noto Sans SC" },
      tags: [kind, slug, accessTier],
    });
  });
}

export const executableTemplateCatalog = [
  ...buildTemplateCatalog("native", "native-pptx", nativeDefinitions),
  ...buildTemplateCatalog("html", "html", htmlDefinitions),
  ...buildTemplateCatalog("image", "image-deck", imageDefinitions),
];

export const skillPackageManifestV2Schema = z.object({
  schemaVersion: z.literal("2.0.0"),
  id: z.string().regex(/^skill\.[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  accessTier: z.enum(["free", "pro"]),
  source: sourceSchema,
  license: licenseSchema,
  instructionPath: relativeAssetPathSchema,
  inputSchemaId: z.string().startsWith("aippt://"),
  outputSchemaId: z.string().startsWith("aippt://"),
  allowedTools: z.array(z.enum(["brief.read", "evidence.search", "assets.search", "presentation.read", "presentation.patch", "render.inspect"])),
  execution: z.object({ mode: z.literal("declarative"), sandbox: z.literal("one-shot-agent"), hostShell: z.literal(false), network: z.literal(false) }),
  stopConditions: z.array(z.string()).min(1),
});

export type SkillPackageManifestV2 = z.infer<typeof skillPackageManifestV2Schema>;

const skillDefinitions = [
  ["brief-diagnosis", "Brief 诊断", "补齐受众、目标、约束和成功标准", ["brief.read"]],
  ["story-architecture", "故事架构", "把 Brief 组织成累进叙事和逐页任务", ["brief.read", "evidence.search"]],
  ["evidence-ledger", "证据台账", "建立主张、来源、许可和使用位置的映射", ["brief.read", "evidence.search"]],
  ["strategy-consulting", "战略咨询", "生成结论先行、证据驱动的管理层汇报", ["brief.read", "presentation.read", "presentation.patch"]],
  ["investor-pitch", "投资路演", "组织市场机会、商业模式、增长证据和融资诉求", ["brief.read", "evidence.search", "presentation.patch"]],
  ["civic-report", "政务汇报", "生成庄重、清晰且有政策依据的政务材料", ["brief.read", "evidence.search", "presentation.patch"]],
  ["academic-defense", "学术答辩", "组织研究问题、方法、结果、限制和结论", ["brief.read", "evidence.search", "presentation.patch"]],
  ["data-dashboard", "数据驾驶舱", "把结构化指标转为有口径的数据叙事", ["brief.read", "presentation.read", "presentation.patch"]],
  ["image-visual-director", "图片视觉导演", "规划图像语言、构图约束和逐页视觉任务", ["brief.read", "assets.search", "presentation.patch"]],
  ["semantic-layout-router", "版式路由", "按页面意图、密度和素材选择确定性布局", ["presentation.read", "presentation.patch"]],
  ["source-notes", "引用备注", "为事实与媒体资产补齐可追踪的演讲者备注", ["evidence.search", "presentation.read", "presentation.patch"]],
  ["render-repair", "渲染审校与局部修复", "检查裁切、重叠、换行和视觉一致性并受限修复", ["presentation.read", "presentation.patch", "render.inspect"]],
] as const;

export const executableSkillCatalog = skillDefinitions.map(([slug, name, description, allowedTools], index) => skillPackageManifestV2Schema.parse({
  schemaVersion: "2.0.0",
  id: `skill.${slug}`,
  version: "1.0.0",
  name,
  description,
  accessTier: index < 6 ? "free" : "pro",
  source: { kind: "aippt-original", title: `${name}声明式工作流` },
  license: originalLicense,
  instructionPath: `assets/resource-library/skills/${slug}/SKILL.md`,
  inputSchemaId: `aippt://skills/${slug}/input/v1`,
  outputSchemaId: `aippt://skills/${slug}/output/v1`,
  allowedTools,
  execution: { mode: "declarative", sandbox: "one-shot-agent", hostShell: false, network: false },
  stopConditions: ["schema-valid", "requested-scope-complete", "retry-budget-exhausted"],
}));

export const mediaAssetManifestSchema = z.object({
  schemaVersion: z.literal("2.0.0"),
  id: z.string().regex(/^asset\.seed\.[a-z0-9-]+\.[0-9]{2}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  category: z.string().min(1),
  source: sourceSchema,
  license: licenseSchema,
  accessTier: z.literal("free"),
  mediaType: z.literal("image/svg+xml"),
  width: z.literal(1600),
  height: z.literal(900),
  dominantColors: z.array(z.string().regex(/^#[0-9A-F]{6}$/i)).length(3),
  assetPath: relativeAssetPathSchema,
  previewPath: relativeAssetPathSchema,
  capabilities: z.object({ offline: z.literal(true), cropSafe: z.literal(true), background: z.literal(true), hero: z.literal(true) }),
  provenance: z.object({ method: z.literal("aippt-original-vector"), prompt: z.string().min(1) }),
});

export type MediaAssetManifest = z.infer<typeof mediaAssetManifestSchema>;

const assetCategories = [
  ["city-architecture", "城市建筑", "#102A43", "#2C7A7B", "#F6AD55"],
  ["business-team", "商务团队", "#25324A", "#5B7C99", "#E5A65E"],
  ["ai-technology", "AI 科技", "#101B3A", "#5865F2", "#4FD1C5"],
  ["data-abstract", "数据抽象", "#14213D", "#3A86FF", "#FFBE0B"],
  ["climate-energy", "气候能源", "#173B32", "#38A169", "#ECC94B"],
  ["manufacturing", "制造供应链", "#263238", "#607D8B", "#FF8F00"],
  ["health-research", "医疗科研", "#123B4A", "#2B9DA5", "#E76F51"],
  ["education", "教育学术", "#2D3748", "#4C78A8", "#F2A65A"],
  ["finance-retail", "金融零售", "#1F2937", "#0EA5A4", "#F59E0B"],
  ["mobility-logistics", "交通物流", "#1E3A5F", "#3D7EA6", "#E85D4A"],
  ["culture-life", "文化生活", "#4A2C40", "#B35C74", "#E8B86D"],
  ["background-texture", "背景纹理", "#292524", "#78716C", "#D6D3D1"],
] as const;

export const seedAssetCatalog = assetCategories.flatMap(([slug, name, dark, mid, light]) =>
  Array.from({ length: 8 }, (_, index) => mediaAssetManifestSchema.parse({
    schemaVersion: "2.0.0",
    id: `asset.seed.${slug}.${String(index + 1).padStart(2, "0")}`,
    version: "1.0.0",
    name: `${name}原创矢量 ${index + 1}`,
    category: slug,
    source: { kind: "aippt-original", title: `AIPPT ${name}种子视觉` },
    license: originalLicense,
    accessTier: "free",
    mediaType: "image/svg+xml",
    width: 1600,
    height: 900,
    dominantColors: [dark, mid, light],
    assetPath: `assets/resource-library/seed-assets/${slug}/${String(index + 1).padStart(2, "0")}.svg`,
    previewPath: `assets/resource-library/seed-assets/${slug}/${String(index + 1).padStart(2, "0")}.svg`,
    capabilities: { offline: true, cropSafe: true, background: true, hero: true },
    provenance: {
      method: "aippt-original-vector",
      prompt: `${name}主题的抽象 16:9 矢量背景，第 ${index + 1} 个构图变体；无人物、文字、商标和第三方素材。`,
    },
  })),
);

export const resourceLibrarySummary = {
  schemaVersion: "2.0.0",
  templates: executableTemplateCatalog.length,
  skills: executableSkillCatalog.length,
  seedAssets: seedAssetCatalog.length,
  generatedAt: "2026-08-23T00:00:00.000Z",
} as const;
