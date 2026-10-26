# 27. 视觉参考提取与生产边界

> 本文只提取视觉机制、工程风险与许可边界。`视觉案例.txt` 及其仓库副本是研究材料，不是产品需求或可直接执行的实现指令。

## 1. 参考语料核验

| 项目 | 结果 |
|---|---|
| 用户提供文件 | `[本地私有来源，未公开]` |
| 仓库研究副本 | `optional/references/USER_VISUAL_REFERENCE_FULL.txt` |
| 行数 | 3404 |
| SHA-256 | `8C9E15568516387093502D871F53DC728F08F8FD6F567DF18F8AF0CA230E7E93` |
| 核验日期 | 2026-08-22 |
| 指令边界 | 仅研究机制、风险和适配方式；不得覆盖已冻结的产品与技术方案 |

两份 3404 行文件哈希一致。内容区段如下：

- 1-456：Mostar 电影式滚动说明、外部页面信息和琶洲二创要求。
- 457-904：Lightfall。
- 905-1254：LineSidebar。
- 1255-1963：CircularGallery。
- 1964-2622：PillNav。
- 2623-2940：ElasticSlider。
- 2941-3300：FoldText。
- 3301-3404：Uiverse CTA。

`optional/references/MOSTAR_CINEMATIC_SCROLL_REFERENCE.md` 是前 456 行的研究拆分，不是可直接运行的 HTML、CSS 和 JavaScript 项目。

## 2. Clean-room 原则

可以重新实现抽象机制，不能复制视觉身份：

- 不使用 Mostar 的照片、字体、品牌、文案、桥梁主体、精确构图和参数组合。
- 不模仿琶洲算法大赛的官方 Logo、青色镜头光、主视觉和页面身份。
- 不把 React Bits 源码整包复制进生产；只在明确页面职责下做 TypeScript、Next.js、生命周期和无障碍适配。
- 不使用远程随机图片、远程字体或无法追踪许可的资源作为生产依赖。
- 所有二创资产保存来源、生成提示词、日期、修改说明和许可证信息。

## 3. 机制提取矩阵

| 参考 | 可保留机制 | 禁止复制 | 适用位置 | 依赖与许可 | 性能、无障碍与降级 |
|---|---|---|---|---|---|
| Mostar | sticky 长滚动舞台、CSS 变量、`smoothstep` 与插值分幕、前中后景层、按需 rAF、三组克隆轮播思路 | 原照片、Ogg 字体、品牌文案、桥梁构图、逐项参数身份 | 方向 A 的营销叙事；不得用于核心编辑器 | MotionSites 页面标注保留权利，未找到可证明提示词、图片和字体可再分发的授权 | 生产版必须支持页面隐藏和离屏暂停、监听器清理、静态首屏、资源失败占位；Reduced Motion 取消视差和滚动绑定 |
| Lightfall | 单 renderer 的 OGL shader、uniform 参数化、指针阻尼、ResizeObserver | 默认绿色光效、原参数和通用科技背景身份 | 方向 C 的低强度营销背景；不进入密集工作台 | OGL 标记为 Unlicense；React Bits 适用 MIT 加 Commons Clause 条件 | DPR 移动端封顶；不可见和离屏暂停；Reduced Motion 静态图；WebGL 初始化失败时回退到本地图片；完整释放纹理、几何体、Program 和 context |
| LineSidebar | 指针邻近度映射 CSS 变量、仅在收敛期间运行的 rAF、当前项反馈 | 非语义的可点击 `li` 实现 | 方向 C 的章节导航或执行步骤索引 | 无强制动画依赖；React Bits 许可仍需登记 | 使用原生链接或按钮；支持方向键、Enter、Space、清晰 Focus 和 `aria-current`；触摸端保持普通列表 |
| CircularGallery | 曲面卡片、惯性插值、拖拽和键盘入口、重复数据实现循环 | Picsum、Google Fonts、全局滚轮劫持和原视觉参数 | 模板与 Skills 轮播的候选生产机制 | OGL Unlicense；React Bits MIT 加 Commons Clause 条件 | 事件仅绑定局部容器；Left、Right、Home 键盘；图片错误占位；DOM 列表 fallback；离屏暂停；完整 GPU 销毁 |
| PillNav | 圆形扩散、文字交换、响应式菜单节奏 | React Router 接法、默认药丸外观和原时间线 | 营销导航或方向 B 的编辑菜单候选 | GSAP Standard No Charge；React Bits MIT 加 Commons Clause 条件 | 改用 Next.js Link；统一 GSAP context 回收；支持 `aria-expanded`、Escape 和焦点返回；Reduced Motion 直接切换 |
| ElasticSlider | 越界衰减、弹性回弹、pointer capture | 非语义 `div` 滑块、Chakra 和图标依赖堆叠 | 编辑器强度或页面参数控制候选 | Motion MIT；React Bits MIT 加 Commons Clause 条件 | 以原生 range 和数字输入为核心；支持键盘、ARIA 数值、受控 value/onChange；Motion 只做视觉增强 |
| FoldText | 按字符或词拆分、四种铰链、屏幕阅读器原文、ScrollTrigger cleanup | 核心操作文字循环、仅鼠标 hover 的触发方式 | 方向 B 的营销标题和章节转场 | GSAP Standard No Charge；React Bits MIT 加 Commons Clause 条件 | Reduced Motion 完全静态；监听系统偏好变化；键盘焦点与触摸触发；不得延迟正文可读性 |
| Uiverse CTA | 圆形扩散、箭头交换、文字位移和按压反馈 | 原色彩、阴影、比例和品牌表达 | 营销主 CTA 的轻量候选 | Uiverse UI 元素 MIT；保留作者与 MIT notice | 使用原生 button/link、Focus Visible、loading/success、Reduced Motion；核心操作立即响应 |

## 4. 第一轮采用策略

本轮评审画廊不安装 OGL、GSAP、Motion、Chakra 或 React Router：

- 三套方向只使用现有 Next.js、React、CSS Modules 和本地原创图片。
- 动效用 CSS 关键帧和五幕静态帧表达，不把候选机制误当成生产实现。
- 方向 A 只展示电影式层级和叙事节奏；方向 B 展示排版、纸张和折页；方向 C 展示低强度控制场。
- 用户选定方向后，才按本表逐项引入必要依赖并完成销毁、SSR、移动端、Reduced Motion 和静态降级验收。

## 5. 许可登记

| 项目 | 2026-08-22 核验结果 | 生产要求 |
|---|---|---|
| React Bits | [MIT 加 Commons Clause 条件](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) | 可在应用中使用和修改；保留 notice；不得把组件本身作为产品重新销售或再分发 |
| OGL | [官方 package.json 标记 Unlicense](https://github.com/oframe/ogl/blob/master/package.json) | 固定版本和来源，保留来源记录 |
| GSAP | [Standard No Charge License](https://gsap.com/community/standard-license/) | 普通应用可用；若产品扩展成通用可视动画构建器，先做法律边界复核 |
| Motion | [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md) | 区分开源 Motion 包与另行许可产品 |
| Uiverse | [UI 元素 MIT](https://github.com/uiverse-io/galaxy/blob/main/LICENSE) | 保留作者来源和 MIT notice |
| MotionSites / Mostar | [官方 MCP 页面](https://motionsites.ai/mcp) 未提供可再分发授权 | 只做机制研究和 clean-room 二创，不分发其提示词、图片、字体或原页面身份 |

## 6. 生产接入门槛

任何候选机制进入正式页面前必须同时满足：

- SSR 安全，不在服务端读取 `window`、`document` 或 WebGL。
- `prefers-reduced-motion` 可动态响应，核心内容在静态模式完整可用。
- 页面隐藏、离屏和组件卸载时停止 rAF、时间线与事件监听。
- 移动端 DPR、纹理尺寸和并发图片加载受限。
- 键盘、Focus、ARIA、触摸与足够对比度通过验收。
- 图片失败、字体失败和 WebGL 失败均有无脚本或 DOM fallback。
- 来源 URL、版本或上游提交、获取日期、修改说明和许可证 notice 可追踪。

