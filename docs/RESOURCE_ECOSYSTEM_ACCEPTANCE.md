# AIPPT 资源生态与 10 页验收记录

验收日期：2026-08-23。环境：Windows、Microsoft Edge、PowerPoint、LibreOffice、开发态 Mock Pro、`Codex Test Bridge`。没有调用用户的第三方模型 API，也没有产生外部模型费用。

## 资源目录

| 类别 | 验收结果 |
|---|---:|
| 可执行模板 | 48（PPTX/HTML/图片式各 16） |
| 每类权益 | 6 Free / 8 Pro / 2 单品 |
| 声明式 PPT Skill | 12 |
| 离线原创种子视觉 | 96（12 类 × 8） |
| 自生成优秀案例 | 3 |
| 官方资源网站卡片 | 8 |

Edge 实机在 1440×1000 和 390×844 下验证：模板 48、Skill 12、图片 96 全部可见；48 张模板预览均成功加载，移动端无横向溢出。浏览器 trace、网络记录和截图保存在 `output/acceptance/resource-ecosystem-10p/browser-evidence`。

## 同 Brief 三种 10 页结果

Brief：**《琶洲 2035：AI 驱动的会展韧性操作系统》**。三版使用同一页序、来源与决策目标。

| 模式 | 文件 | 结果 |
|---|---|---|
| 原生可编辑 PPTX | `native-pptx.pptx` | 10 页；PowerPoint 打开、备注和逐页 PNG 导出成功；LibreOffice 转 PDF 成功 |
| 离线 HTML | `html-map-story.html` / `.zip` | 10 页；Reveal ready；无外部脚本；单 HTML 和 ZIP 均由站内导出器生成 |
| 图片混合式 PPTX | `image-hybrid.pptx` | 10 页；AI 主视觉仅在封面栅格化，标题/正文/图形/引用仍可编辑；PowerPoint 与 LibreOffice 验证成功 |

所有文档均由开发态 Bridge 标记为 `manual-codex-test`，再调用网站质量任务与导出 API；不是在网站外另做成品后冒充导出结果。每页备注包含 `[Sources]` 和资源绑定；第 6 页明确标注为模拟场景。

## 自动验证

- Web 契约：4/4。
- Core：29/29。
- API：76/76。
- 安全专项：17/17。
- 浏览器 E2E：11/11。
- TypeScript、生产构建、桌面/移动端 overflow、reduced-motion、项目失败恢复均通过。

## 已知边界（不伪装完成）

1. 内置 96 张种子图当前全部是 AIPPT 原创 SVG，不是假称开放摄影或 AI 生成图片；计划中的“每类 4 张开放授权照片 + 4 张 AI 图片”需要后续联网逐项核验/生图后替换。
2. 48 套模板是可执行的 Scene/令牌/语义布局包，能真实导出 PPTX/HTML；尚未为每套再附带一个独立二进制 starter `.pptx` 样例文件。
3. 资源元数据与 Mock 单品权益当前由运行期资源 Store 管理，上传二进制进入对象存储；正式 PostgreSQL 资源表与跨重启权益迁移仍需接入。生产上线前不能把开发态内存权益当成正式购买记录。
4. V1 上传采用受限 JSON/base64（30 MB Fastify body limit），不是 multipart 流式上传；大包上传应在 L1 接对象存储预签名 URL 和异步扫描。
5. Openverse/Wikimedia/Pexels/Pixabay/Unsplash/AI 生图已留 Provider 与密钥契约；没有密钥时只返回种子图，`generate` 如实返回未配置，不模拟成功。
