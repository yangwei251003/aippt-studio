# Status

- Asset Sprint 已完成：Folded Signal 品牌套件、Page Core Sage 10 状态、琶洲五层场景、Web/AVIF/PNG 派生与公共目录同步均可重复生成。
- 本地 Git 已初始化并保留原材料基线；未配置远端、未推送。
- pnpm monorepo 已建立：Next.js Web、Fastify API、内嵌本地 Worker、共享 Core。
- V2 主闭环可运行：真实 Brief/资料 → 可变页数蓝图 → 语义版式生成 → 原生对象编辑 → 逐页三阶段质量检查 → PPTX/PDF/PNG/离线 HTML/可维护 HTML ZIP。
- PDF/DOCX/XLSX/PPTX 上传解析已接入；PPTX 会检查宏、加密、外链、OLE、字体、主题、母版、版式和对象，并要求用户确认后才进入模板集合。
- 本地持久化使用文件型 PGlite，对象文件写入 `.data/`；Fake 模型仅允许测试环境，生产必须显式配置 OpenAI Responses 或 OpenAI-compatible 模型，失败会直接返回原因。
- 已配置 14 个受限 Skill manifest、12 类 × 10 个原创语义版式、固定版本的 PptxGenJS/pptx-automizer/Reveal/Konva，并可生成 SPDX SBOM。
- Edge 实机验收已覆盖页面流程、750ms 保存/刷新恢复、AI 当前页修改、Undo 与三种真实导出。
