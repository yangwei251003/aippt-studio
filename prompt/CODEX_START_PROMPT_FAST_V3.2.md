# AIPPT 给 Codex 的 Fast Build 启动提示词 V3.2

> **DEPRECATED — DO NOT USE AS A VISUAL BASELINE**
>
> 本提示词中的产品与技术约束仍可追溯；其中所有旧 Logo、IP、配色、首页和工作区视觉批准结论已被最新视觉重构补充规范覆盖。

你现在接手 AIPPT 项目。这个包已经把旧版本中冗长、互相冲突的材料压缩完成。不要读取旧 V2.0、V2.1、V3.0 或聊天中的废弃方案。

## 先读

1. `README_START_HERE.md`
2. `docs/PROJECT_BRIEF_FAST.md`
3. `docs/VISUAL_GUIDE_FAST.md`
4. `docs/ASSET_SPRINT_GUIDE.md`
5. `docs/FAST_BUILD_RULES.md`
6. `docs/MVP_CHECKLIST_FAST.md`

`optional/` 只在实现对应组件、动效或查找原始参考时按需打开，不要一次全部载入。

## 工作方式

### 先做 Asset Sprint

正式精修页面前，主动补齐网站缺少的视觉资产：

- 使用当前环境可用的图像生成能力制作原创图片；
- 使用 Web/图片搜索、官方 API、GitHub、MCP、Figma、Adobe 或其他合法工具寻找和制作图片、短视频、图标、纹理、3D 和组件；
- 优先获取琶洲分层场景、Page Core Sage 状态、模板/Skill 卡片和核心工作区示例内容；
- 资源不够时不要用廉价占位图，也不要停下来等用户上传；先生成可替换的高质量原创资产；
- 不得绕过访问控制或把授权不明的网络图片直接用于生产；
- 对实际使用的外部素材，只在 `docs/ASSET_SOURCES.md` 记录一次来源、作者/平台、许可证、用途和本地路径。

Asset Sprint 达到 `docs/ASSET_SPRINT_GUIDE.md` 的最低线后，立即进入页面实现，不写额外长报告。

### 再做最小 MVP 闭环

> 用户输入主题或上传资料 → 智能体最多追问 3 个问题 → 输出蓝图 → 生成 5 页可编辑演示 → 用户编辑 → AI 只修改当前页 → 保存/Undo → 导出 PPTX/PDF/PNG。

智能体只分五个阶段：理解、资料、蓝图、页面生成、检查与局部修改。必须接一个真实模型；Mock 只用于测试。不要实现几十个节点、无限反思、复杂多 Agent 或大规模评测平台。

## 技术

使用简单 Monorepo：

```text
apps/web
apps/api
apps/worker
packages/core
```

推荐 TypeScript、React/Next.js、PostgreSQL、简单队列、对象存储、PptxGenJS 和 Playwright。选择稳定版本后直接实现，不为普通选择写长篇 ADR。

演示数据只需 slides、elements、theme、sources、revision。正式修改使用简单命令，支持 Undo 和“只改选中范围”。

## 视觉

必须使用 `assets/` 中批准的 Folded Signal、Page Core Sage、琶洲六幕和六大工作区。概念图只作视觉依据，所有界面必须做成真实 React/CSS/SVG/WebGL。

营销页可以电影化；编辑器优先清晰和性能。需要动效时按需阅读 `optional/components/`，不要把所有组件堆在一个页面。

## 减少无用审查

只维护：

- `docs/STATUS.md`
- `docs/TODO.md`
- `docs/ASSET_SOURCES.md`
- `docs/KNOWN_ISSUES.md`

不要先写企业级架构、长篇研究、完整合规报告、复杂资源治理或几十份文档。只对真正进入生产的外部资源做一次最小实用检查，然后继续开发。

## 开发顺序

1. Asset Sprint；
2. 项目脚手架和固定 5 页示例；
3. 编辑、保存、Undo、PPTX/PDF/PNG；
4. 真实模型、蓝图和 5 页生成；
5. 只修改当前页；
6. 文件上传和基础解析；
7. 创建、蓝图、Studio、编辑器、质量/交付、项目列表；
8. 营销页和动效精修；
9. 移动端、Reduced Motion、性能和真实截图验证。

## 交付纪律

- 不要只回复计划，直接创建项目并运行；
- 每完成一个阶段就实际测试和截图；
- 缺 API 使用 Mock；
- 缺素材主动生成；
- 非阻塞细节自己选择合理默认值；
- 不伪造测试结果或授权信息。

现在开始：先创建四个轻量状态文件，盘点现有资产，执行 Asset Sprint，然后直接进入可运行 MVP 开发。
