# AIPPT 视觉简版规范｜Fast Build

> **DEPRECATED — DO NOT USE AS A VISUAL BASELINE**
>
> 本文中的 Logo、IP、配色、首页和装饰语言已被视觉重构补充规范废弃。产品功能与技术架构仍以冻结文档和当前实现为准。

## 已批准视觉

- Logo：Folded Signal，位于 `assets/logo/`；
- IP：Page Core Sage / 页核·智核方案 C，位于 `assets/ip/`；
- 营销六幕：位于 `assets/landing/`；
- 六大核心工作区：位于 `assets/workspaces/`。

主视觉：深海军蓝、珠江青、电光蓝、珍珠白、少量暖橙；广州琶洲城市感；未来、专业、亲和、可控。

## 关键规则

- 概念图只作构图与气质参考，不能整张铺成页面冒充真实 UI；
- 所有文字、按钮、表格、编辑器和状态必须用真实 React/CSS/SVG/WebGL 实现；
- 营销页允许电影化，编辑器必须清晰、稳定、低疲劳；
- Page Core Sage 只在首页、生成状态、空状态、质量检查和交付场景出现；
- 不再创建第二套 Logo、IP 或主配色；
- 禁止廉价紫色渐变、通用机器人、满屏玻璃拟态、无意义粒子和假终端代码。

## 组件按需

可从 `optional/components/` 选用：Lightfall、LineSidebar、CircularGallery、PillNav、ElasticSlider、FoldText、ExpandingArrowButton、PazhouCinematicScroll。

每页最多一个主视觉动效和少量反馈动效。编辑器中央画布背后不运行强烈 WebGL。

## 素材策略

优先顺序：

1. 已批准资产；
2. 图像生成的原创资产；
3. 官方或明确商业授权的图库/API；
4. 自制 SVG、图表和 UI 截图；
5. 临时占位仅用于开发，不得作为正式视觉完成。

所有外部生产素材只在 `docs/ASSET_SOURCES.md` 记录来源、作者/平台、许可证、下载时间、用途和本地路径即可，不建立复杂治理系统。
