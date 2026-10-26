# AIPPT 首页与工作台视觉基线锁定

> 状态：**LOCKED / 禁止无授权覆盖**  
> 生效日期：2026-08-23  
> 基线提交：`280de95d511c20f6a8202e5250e252c73aca7242`  
> 基线分支：`recovery/restore-visual-baseline-20260822`

## 1. 锁定目的

本文件记录用户已经确认的 AIPPT 首页与工作台视觉版本。后续任务、其他 Codex 窗口、子任务或自动修改，不得因为新增功能、资源中心、商业化、动效实验或通用重构而替换这套界面。

除非用户在当前任务中明确点名要求修改某个具体页面或组件，否则默认规则是：**保持现状，不改视觉，不换结构，不降级功能。**

## 2. 唯一视觉基线

以下截图是实现验收基线，不是灵感图或待重做方案：

- 首页首屏：`artifacts/design-qa/home-restored-enhanced.png`
- 页核互动区：`artifacts/design-qa/home-sage-interaction.png`
- 项目列表：`artifacts/design-qa/project-list-restored.png`
- 详细对照记录：`design-qa.md`

基线截图 SHA-256：

- `home-restored-enhanced.png`：`3E7D2B21C8342FB3155ECDC93CA855A9778CB72C1C7FD2E123B53929EDE6D1B8`
- `home-sage-interaction.png`：`1065AA241DC526367C20E6F58C82D522D0DA67BE15E2578B4AB66B8E790D3299`
- `project-list-restored.png`：`56F45D6B6B3945ABE716E82688B05D13D47248635792AEEAFCE2F749C2CA38AB`

恢复或验收时使用 1592 × 900 桌面视口，并同时检查首页、项目列表和工作台六个阶段。

## 3. 必须保留的视觉语言

- 琶洲夜景主视觉和现有城市地平线资产。
- 黑色工程控制台、细网格、低饱和暗绿色表面和荧光黄绿色单一强调色。
- 首页轨道、五张演示卡片和中央“页核”核心。
- 当前非巨型标题的左右分栏信息密度与 CTA 层级。
- 当前药丸导航、镜面按钮、滚动文字、倾斜卡和鼠标响应背景。
- 当前 Page Core IP，不得替换为女性头像、通用机器人、Emoji 或无关形象。
- 项目列表真实卡片、真实封面、项目名称、页数、更新时间、阶段和同步语义。
- 工作台左侧完整流程：创建中心、演示蓝图、Agent Studio、编辑器、质量中心、交付中心。
- 创建中心三种模式：标准 PPT、HTML 网页 PPT、AI 生图 PPT。

## 4. 受保护的核心文件

无明确视觉授权时，不得修改或整体替换：

- `apps/web/app/page.tsx`
- `apps/web/app/page.module.css`
- `apps/web/app/extra.module.css`
- `apps/web/app/landing.module.css`
- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/app/typography.css`
- `apps/web/components/landing/interactive-sage.tsx`
- `apps/web/components/landing/interactive-sage.module.css`
- `apps/web/components/navigation/`
- `apps/web/components/motion/`
- `apps/web/components/commercial/` 中被首页和工作台头部使用的状态组件
- `apps/web/public/observatory/`
- `apps/web/public/generated/production/sage-sage-*/`

如果新增功能必须接入这些页面，应以最小插入方式完成，不能重写页面骨架、设计令牌或现有组件。

## 5. 明确禁止

- 不得把首页改成巨型文字长页面、普通 SaaS 后台、蓝紫渐变或玻璃拟态模板。
- 不得删除琶洲夜景、轨道、五卡、页核、项目卡或工作台完整侧栏。
- 不得用错误提示、永久 Mock 或空白页面代替真实项目内容。
- 不得为了新路由重新导出或替换根 `app/page.tsx`。
- 不得在无截图对照的情况下做全局字体、间距、颜色和组件库迁移。
- 不得使用 `git reset --hard`、`git clean`、整仓覆盖或强推来恢复视觉。
- 不得把其他窗口未经用户验收的视觉结果合并为新基线。

## 6. 功能基线

以下入口必须持续可用，任何一项黑屏都属于回归：

1. 首页进入工作台。
2. 项目列表加载真实 API 项目，并显示正确同步状态。
3. 新建演示进入创建中心。
4. 蓝图、Agent Studio、编辑器、质量中心和交付中心均有完整内容。
5. 项目卡可以进入真实编辑器。
6. 页面刷新后项目和当前编辑内容仍然存在。
7. 请求失败使用中文原因与真实重试，不向用户暴露原始 `Failed to fetch`。

## 7. 允许修改的条件

只有同时满足以下条件，才允许调整受保护视觉：

1. 用户在当前任务中明确点名具体页面、组件和期望变化。
2. 修改前保存当前截图并查看 `git status` 与相关 diff。
3. 只编辑被点名的最小文件范围，不做无关重构。
4. 修改后在同一视口并排比较基线截图和实现截图。
5. 运行相关 `lint`、`typecheck`、`build` 和关键点击路径。
6. 用户确认后，才能更新本文件中的基线提交与截图。

## 8. 安全恢复流程

发生视觉回归时：

1. 先查看 `git status`、最近提交和受保护文件 diff。
2. 用 stash 或补丁保存异常改动，确保可追溯。
3. 仅从基线提交 `280de95` 恢复发生回归的受保护文件。
4. 不触碰 API、数据库、资源库以及其他未提交修改。
5. 完成构建和浏览器截图验证后，再创建普通恢复提交。

本次回归前的异常 `app/page.tsx` 已保存在：

`stash@{0}: preserve-regressed-page-before-visual-lock-20260823`

该 stash 仅用于审计，不得重新应用到受保护首页。

## 9. 给后续 Agent 的开工检查

开始任何 `apps/web` 任务前先回答：

- 当前任务是否明确授权修改受保护视觉？
- 是否已经阅读本文件和 `apps/web/AGENTS.md`？
- 是否会触碰首页或工作台核心文件？
- 是否已经保留用户其他未提交修改？

如果第一项答案是否定的，后续 Agent 必须绕开受保护视觉文件。

## 10. 已批准的增量资源生态

此前批准的资源生态工作 的资源生态只允许以增量方式保留：

- `/resources`：模板、PPT Skill、图片、案例和推荐网站目录。
- `/resources/[resourceId]`：版本、授权、权益与使用入口。
- `/resources/upload`：默认私有的资源上传与审核入口。
- 后端资源目录、安装、单品 Mock 权益、举报、审核、生成绑定和图片 Provider 预留接口。
- `assets/resource-library/` 中的原创模板定义、声明式 Skill 和离线素材。

这些能力不得通过替换根页面、缩减工作台流程或重做导航体系来接入。若需要增加入口，只能使用现有设计语言做最小增量，并先验证本文件第 2 节的视觉基线。

## 11. 已批准的创作者中心入口

当前任务明确批准以下增量接入，仍不得改变首页与工作台的既有视觉骨架：

- 首页现有药丸导航增加“资源中心”，沿用原导航尺寸、颜色和交互。
- 首页及工作台现有账户区域增加 `/account` 入口，不新增悬浮调试组件。
- 工作台侧栏底部增加“资源中心”，不得删除或挤占六阶段创作流程。
- `/account` 作为独立创作者中心，汇总真实项目数、套餐与点数、站内消息和常用创作入口。
- 创作者消息使用独立 API，支持加载、失败重试、分类、已读/未读及全部已读；不得用永久前端 Mock 掩盖接口失败。

后续新增创作者功能优先落在 `/account` 子路由或独立模块中；未经用户再次明确授权，不得以扩充创作者平台为由重排首页 Hero、轨道五卡、工作台头部或侧栏流程。

## 12. 已批准的独立页面动态背景

当前任务明确批准且仅批准以下背景层替换：

- `/resources` 目录页使用 React Bits Galaxy shader，保留星体流动、闪烁、旋转和鼠标排斥；资源详情与上传页不继承该背景。
- `/account` 创作者中心使用 React Bits Aurora shader，配色适配 AIPPT 的深绿与荧光黄绿。
- 两个 WebGL 背景必须延迟加载、提供暂停／恢复、尊重 `prefers-reduced-motion`，并在页面卸载时释放动画帧、监听器和 WebGL context。
- 背景层不得改变现有资源卡、消息中心、统计卡、导航结构、首页或工作台视觉。
