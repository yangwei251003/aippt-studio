> 2026-10-26：本公开版自有资源按用户授权改为 MIT；第三方作品仍保留原许可。

# AIPPT 资源来源与许可证台账

本文件覆盖 `assets/resource-library` 中随产品分发的资源。运行时联网搜索获得的媒体不属于内置资源，必须在各自的 `MediaAsset` 记录中单独保存作者、来源网址、抓取时间和许可证。

## 内置模板、Skill 与图片

| 资源 | 数量 | 来源 | 许可证 | 商业使用 | 独立转售 |
|---|---:|---|---|---|---|
| 原生 PPTX 设计系统 | 16 | AIPPT Studio 原创 | `MIT` | 允许随 AIPPT 生成与导出 | 允许；须保留 MIT 版权与许可 |
| HTML 演示设计系统 | 16 | AIPPT Studio 原创 | `MIT` | 允许随 AIPPT 生成与导出 | 允许；须保留 MIT 版权与许可 |
| 图片式演示设计系统 | 16 | AIPPT Studio 原创 | `MIT` | 允许随 AIPPT 生成与导出 | 允许；须保留 MIT 版权与许可 |
| 声明式 PPT Skill | 12 | AIPPT Studio 原创 | `MIT` | 允许在 AIPPT 内执行 | 代码许可为 MIT；运行仍应遵守沙箱边界 |
| SVG 种子视觉 | 96 | AIPPT Studio 原创矢量 | `MIT` | 允许用于用户生成的演示 | 允许；须保留 MIT 版权与许可 |

所有内置条目均在 `packages/core/src/resource-ecosystem.ts` 中记录不可为空的版本、来源、许可证、访问层级、能力和实际文件路径。种子视觉明确标注为原创矢量，不宣称由 AI 模型生成，也不冒充第三方开放素材。

## 可借鉴的开源能力

这些项目可以在完成提交固定、许可证复核和 NOTICE 登记后采用其允许的代码能力；当前资源库没有复制其演示作品或二进制模板：

- PptxGenJS — MIT — <https://github.com/gitbrent/PptxGenJS>
- Presenton — Apache-2.0 — <https://github.com/presenton/presenton>
- Reveal.js — MIT — <https://github.com/hakimel/reveal.js>
- Marp — MIT — <https://github.com/marp-team/marp>
- PPTAgent — MIT；仅借鉴工作流思想 — <https://github.com/icip-cas/PPTAgent>

## 禁止内置或仅作链接研究

- PPTist、guizang-ppt-skill 等 AGPL 项目：可以研究交互与思想，闭源产品不得复制源码。
- Slidesgo、Canva、SlidesCarnival、Envato 等：不镜像其模板或预览，资源中心只允许展示指向官方页面的外部链接。
- Slidev 主题中的 CC BY-NC-SA 图片资产：不得用于商业内置资源。
- 许可证未知、带 NC/ND/BY-SA 限制、无法确认作者或来源的材料：自动审核必须阻止公开发布。

## 联网图片 Provider 政策

默认顺序为本地种子库、Openverse/Wikimedia、Pexels/Pixabay、AI 生图。所有远程图片必须先经过服务端安全检查并保存为内部 `assetId`，导出器不得在导出阶段再次联网。

- Openverse 只提供开放许可证索引，导入时仍需核验原站许可证。
- Wikimedia Commons 按每个文件页面的具体许可证履行署名与相同方式共享要求。
- Pexels/Pixabay 按 API 条款逐次搜索和导入，不批量镜像。
- Unsplash 仅提供搜索预览并遵守热链、下载事件和署名规则，不进入离线种子库。
- AI 生图保存供应商、模型、提示词、生成时间和编辑记录，不把生成来源标成摄影师作品。

## 用户上传

上传默认私有。公开前必须声明权利、选择许可证并通过机器扫描；自动通过只代表技术扫描通过，界面必须显示“自动审核、未经人工复核”。举报或权利人通知触发立即隐藏和管理员复核。
