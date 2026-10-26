# Asset Sprint｜正式页面开发前的视觉资产冲刺

> **DEPRECATED — DO NOT USE AS A VISUAL BASELINE**
>
> 本文定义的旧品牌、IP 和页面视觉已经废弃。资产制作流程可作为历史记录，但不得继续生成 V1 视觉。

## 目标

在正式精修首页和核心工作区之前，先建立一套足够真实、统一、可直接使用的视觉资产，避免默认占位图和廉价 UI。

技术脚手架、数据模型和基础组件可以并行开发；但**页面视觉验收前必须达到以下资产最低线**。

## 最低资产清单

### 品牌

- [ ] Folded Signal Logo 的干净 SVG；
- [ ] 深色、浅色、单色和 16/24/32/64/512px 版本；
- [ ] Favicon 和 App Icon。

### Page Core Sage

- [ ] 主形象透明背景；
- [ ] Idle、Listening、Planning、Researching、Composing；
- [ ] Checking、Warning、Success、Paused、Recovery；
- [ ] 24px、64px、128px UI 版本；
- [ ] Reduced Motion 静态版本。

### 营销首页

- [ ] 琶洲天空/氛围层；
- [ ] 远景天际线；
- [ ] 珠江与倒影；
- [ ] 琶洲中景建筑；
- [ ] 前景舞台或页面层；
- [ ] 文档/表格/旧 PPT 输入卡；
- [ ] 智能体编排图；
- [ ] 四种输出卡；
- [ ] 模板/Skills 画廊卡；
- [ ] 移动端裁切和静态回退。

### 模板与案例

至少 12 张真实 16:9 卡片：

- 销售提案；
- 经营汇报；
- 产品发布；
- 融资路演；
- 咨询报告；
- 数据分析；
- 培训课件；
- 旧 PPT 改造前后；
- 研究 Skill；
- 图表 Skill；
- 品牌检查 Skill；
- PPTX 兼容检查 Skill。

### 核心工作区

为创建中心、蓝图、Agent Studio、编辑器、质量中心、交付中心各准备：

- [ ] 一张主要视觉或示例内容；
- [ ] 空状态；
- [ ] 加载/进行中状态；
- [ ] 成功或错误状态；
- [ ] 真实示例 PPT 页面。

## Codex 主动获取方式

Codex 应优先使用当前环境可用的：

- 图像生成工具；
- Web 搜索和图片搜索；
- Unsplash、Pexels、Wikimedia Commons 等有明确规则的来源；
- GitHub 上的合法组件和示例项目；
- MotionSites、React Bits 或其他已连接 MCP；
- Figma、Adobe 等设计工具；
- 自制 SVG、CSS、Canvas、WebGL 和真实产品截图。

不要通过绕过登录、付费墙、robots、访问控制或版权限制的方式抓取素材。网络素材授权不清楚时，只能作研究参考，不能进入生产。

## 生成要求

生成资产时：

- 保持 Folded Signal、Page Core Sage 和蓝/青/白/橙体系；
- 保持相同城市时间、光源、镜头和材质；
- 不生成不可读伪文字，文字与 UI 后续用真实组件叠加；
- 保存 Prompt、模型、时间、尺寸和使用页面到 `docs/ASSET_SOURCES.md`；
- 输出 WebP/AVIF、透明 PNG 和必要的高分辨率母版；
- 不把单张大图当作整站 UI。

## 快速通过标准

Asset Sprint 通过后应至少有：

- 1 套完整品牌文件；
- 10 个 IP 状态；
- 8—10 个首页分层资产；
- 12 张模板/Skill 卡片；
- 6 个核心工作区的真实示例内容；
- 一个来源记录文件。

通过后立即进入页面实现，不再为资产写额外长报告。
