export type DirectionId = "a" | "b" | "c";

export type DirectionSpec = {
  id: DirectionId;
  title: string;
  codeNameCn: string;
  codeNameEn: string;
  thesis: string;
  artDirection: string;
  accent: string;
  palette: ReadonlyArray<{ name: string; value: string }>;
  fonts: ReadonlyArray<string>;
  marketingDials: string;
  productDials: string;
  strength: string;
  risk: string;
  cost: string;
  masterImage: string;
  imageAlt: string;
  logoLogic: string;
  ipName: string;
  ipLogic: string;
  motionLogic: string;
};

export const directions: ReadonlyArray<DirectionSpec> = [
  {
    id: "a",
    title: "珠江算法电影场",
    codeNameCn: "江场",
    codeNameEn: "RIVER FIELD",
    thesis: "城市不是背景。资料、页面和算法在珠江两岸被看见、被编排、被交付。",
    artDirection: "琶洲蓝调时刻、珠江反射、多层城市空气、透明页面与克制的粤红光路。",
    accent: "#F05A3C",
    palette: [
      { name: "墨夜", value: "#07141E" },
      { name: "江潮", value: "#1A6970" },
      { name: "粤红", value: "#F05A3C" },
      { name: "珠雾", value: "#E8DCC7" },
      { name: "天际", value: "#7898AD" },
    ],
    fonts: ["Noto Sans SC", "Bahnschrift"],
    marketingDials: "9 / 9 / 4",
    productDials: "6 / 4 / 6",
    strength: "首屏记忆强，能把广州、算法与演示生产系统连成一个完整故事。",
    risk: "正式实现需要分层场景、移动端重构和严格的图像性能控制。",
    cost: "高",
    masterImage: "/visual-directions/round-1/a/master.png",
    imageAlt: "珠江蓝调时刻的琶洲城市、多层页面与算法编排光路",
    logoLogic: "地平线与两条汇入演示页面的编排轨迹形成开放符号。",
    ipName: "活的编排核心",
    ipLogic: "由少量节点构成，可聚合、拆分并穿梭页面，不使用眼睛、面孔或机器人身体。",
    motionLogic: "镜头缓慢推进，城市层次分开，资料沿水面进入，页面在远近景之间完成编排。",
  },
  {
    id: "b",
    title: "编辑出版舞台",
    codeNameCn: "页场",
    codeNameEn: "PAGE STAGE",
    thesis: "PPT 不是结果截图。它是一张经过策划、编辑、校对并真正能够交付的页面。",
    artDirection: "棉纸纹理、折页、裁切线、大字号编辑排版、黑白基底与单一编辑红。",
    accent: "#D62928",
    palette: [
      { name: "纸白", value: "#F4F0E6" },
      { name: "油墨", value: "#161616" },
      { name: "编辑红", value: "#D62928" },
      { name: "校样绿", value: "#1B6E5B" },
      { name: "网格灰", value: "#AAA393" },
    ],
    fonts: ["Noto Serif SC", "Noto Sans SC"],
    marketingDials: "7 / 5 / 4",
    productDials: "5 / 3 / 6",
    strength: "专业、可信、低疲劳，最直接地证明 AIPPT 能交付高质量演示。",
    risk: "需要高质量中文排版和纸张材质，处理不当会显得传统或过度印刷化。",
    cost: "中",
    masterImage: "/visual-directions/round-1/b/master.png",
    imageAlt: "由真实纸张、折页和编辑裁切结构构成的演示出版舞台",
    logoLogic: "一张正在折叠的页面与裁切角形成可缩放的开放字框。",
    ipName: "折页生命体",
    ipLogic: "从页面边缘生长，能展开、折叠、指向并成为版面的一部分，不做幼态表情。",
    motionLogic: "资料像校样进入版面，折页展开成章节，文字和图表按编辑节奏落位。",
  },
  {
    id: "c",
    title: "智能体控制场",
    codeNameCn: "序场",
    codeNameEn: "AGENT FIELD",
    thesis: "让复杂能力保持可理解。总控智能体调度资料、模板与 Skills，PPT 始终处于中心。",
    artDirection: "石墨空间、低强度光场、节点轨迹、流程路径、轻量透明层与清晰状态。",
    accent: "#53D6A2",
    palette: [
      { name: "石墨", value: "#0B0F14" },
      { name: "控制面", value: "#131B24" },
      { name: "信号绿", value: "#53D6A2" },
      { name: "轨迹蓝", value: "#4D7DFF" },
      { name: "信息白", value: "#E6EDF4" },
    ],
    fonts: ["Noto Sans SC", "IBM Plex Mono"],
    marketingDials: "8 / 7 / 5",
    productDials: "6 / 4 / 7",
    strength: "系统能力表达最清楚，适合展示总控智能体、Skills、质量检查与交付链路。",
    risk: "正式光场和工作流交互对性能、信息密度与无障碍要求最高。",
    cost: "高",
    masterImage: "/visual-directions/round-1/c/master.png",
    imageAlt: "石墨空间中由智能体协调页面、Skills、质量检查和交付路径的控制场",
    logoLogic: "三个受控节点与一条指向页面的轨道构成稳定、非六边形的编排标记。",
    ipName: "专业创意导演",
    ipLogic: "以无面孔的抽象剪影和光标手势出现，成熟、克制，不使用机器人装甲。",
    motionLogic: "目标进入控制场，路径按任务点亮，页面通过质量检查后收敛到交付出口。",
  },
] as const;

export const informationArchitecture = [
  "产品介绍",
  "五种创建入口",
  "使用方式",
  "六大核心工作流",
  "总控智能体执行过程",
  "现有 PPT 改造",
  "精确 AI 修改",
  "四种演示输出",
  "模板和 Skills",
  "质量检查",
  "PPT 与 WPS 导出",
  "案例",
  "定价",
  "团队介绍",
  "合作伙伴",
  "大赛参赛说明",
  "安全与隐私",
  "最终 CTA",
  "页脚",
] as const;

export function getDirection(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return directions.find((direction) => direction.id === normalized);
}

