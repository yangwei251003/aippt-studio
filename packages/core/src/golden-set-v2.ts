export type GoldenSetScenario = {
  id: string;
  category: string;
  language: "zh-CN" | "en-US";
  pageCount: 5 | 10 | 20;
  delivery: "live" | "read";
  sources: "none" | "provided";
  contentWeight: "balanced" | "data-heavy" | "image-heavy";
  prompt: string;
};

const categories = [
  ["annual-review", "年度经营分析", "为管理层总结经营表现、关键变化与下一步决策"],
  ["product-launch", "新产品发布", "介绍新产品价值、差异化与发布计划"],
  ["client-proposal", "客户提案", "针对客户问题提出有证据的解决方案与合作路径"],
  ["project-retro", "项目复盘", "复盘项目结果、原因、经验与改进动作"],
  ["research-defense", "研究答辩", "说明研究问题、方法、结果、局限与贡献"],
  ["policy-brief", "政策汇报", "解释政策背景、影响、执行路径与风险"],
  ["training", "培训课程", "帮助学习者理解概念、案例与练习路径"],
  ["fundraising", "融资路演", "说明机会、产品、市场、商业模式与融资用途"],
  ["brand-campaign", "品牌战役", "提出品牌洞察、创意主张、渠道与衡量方案"],
  ["technical-architecture", "技术架构", "解释现状约束、目标架构、权衡与迁移计划"],
  ["keynote", "大会演讲", "用清晰故事与强视觉表达一个值得记住的观点"],
  ["data-report", "数据洞察报告", "从结构化数据中提炼趋势、异常、原因与行动建议"],
] as const;

const variants = [
  { language: "zh-CN", pageCount: 5, delivery: "live", sources: "none", contentWeight: "balanced" },
  { language: "zh-CN", pageCount: 10, delivery: "read", sources: "provided", contentWeight: "data-heavy" },
  { language: "en-US", pageCount: 10, delivery: "live", sources: "provided", contentWeight: "image-heavy" },
  { language: "zh-CN", pageCount: 20, delivery: "read", sources: "provided", contentWeight: "balanced" },
  { language: "en-US", pageCount: 20, delivery: "live", sources: "none", contentWeight: "data-heavy" },
] as const;

export const GOLDEN_SET_V2: readonly GoldenSetScenario[] = categories.flatMap(
  ([categoryId, category, prompt]) => variants.map((variant, index) => ({ id: `${categoryId}-${index + 1}`, category, prompt, ...variant })),
);
