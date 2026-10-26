> 历史材料包说明；当前公开版本请先读 [README.md](README.md) 与 [RELEASE_SCOPE.md](RELEASE_SCOPE.md)。本文件不是本次新验收报告。

# AIPPT Codex Fast Build V3.2｜从这里开始

## 启动可生成的完整工作台

1. 复制 `.env.example` 为 `.env`，配置一个真实模型：
   - OpenAI Responses：`AI_PROVIDER=openai` 与 `OPENAI_API_KEY`；或
   - OpenAI-compatible：`AI_PROVIDER=openai-compatible`，并设置对应的 Key、Base URL 和 Model。
2. 在本文件所在的项目根目录运行 `pnpm dev`。这会同时启动网页和 API；不要只运行 `pnpm --filter @aippt/web dev`。
3. 打开 `http://localhost:3000`，API 健康状态可在 `http://localhost:8787/health` 查看。

未配置模型时 API 仍会启动，但返回明确的 `AI_MODEL_NOT_CONFIGURED`，不会偷偷用假文稿冒充 AI 生成。

这个版本修复了上一条消息中“下载链接指向不存在文件”的问题，并把开发材料重新整理为**视觉资产优先、核心 MVP 次之、文档最少化**的可下载项目包。

## 只需先读 6 个文件

1. `prompt/CODEX_START_PROMPT_FAST_V3.2.md`
2. `docs/PROJECT_BRIEF_FAST.md`
3. `docs/VISUAL_GUIDE_FAST.md`
4. `docs/ASSET_SPRINT_GUIDE.md`
5. `docs/FAST_BUILD_RULES.md`
6. `docs/MVP_CHECKLIST_FAST.md`

`optional/` 只在实现对应组件或动效时按需打开，不要一开始全部载入上下文。

## 第一优先级：Asset Sprint

正式精修网站页面前，先补齐可用的视觉资产：

- Folded Signal 的干净 SVG 和小尺寸版本；
- Page Core Sage 的 10 个状态；
- 琶洲六幕分层场景素材；
- 至少 12 张真实模板/案例卡片；
- 6 个核心工作区的插图、空状态和示例内容；
- 合法可用的图片、短视频、图标和纹理。

Codex 应主动使用可用的图像生成工具、联网搜索、官方 API、GitHub、组件库和设计工具获取或制作资源；没有合适素材时优先生成原创素材，而不是使用廉价占位图。

## 第二优先级：最小可用闭环

> 输入主题或资料 → 最多追问 3 个问题 → 演示蓝图 → 生成 5 页可编辑演示 → 用户编辑 → AI 只修改当前页 → 保存与撤销 → 导出 PPTX/PDF/PNG。

## 减少无用审查

只保留四个轻量记录：

- `docs/STATUS.md`
- `docs/TODO.md`
- `docs/ASSET_SOURCES.md`
- `docs/KNOWN_ISSUES.md`

不要先写长篇 ADR、企业级合规报告、复杂评测平台或几十份规划文档。只有真正进入生产使用的外部资源才做一次简明来源与许可证核对。
