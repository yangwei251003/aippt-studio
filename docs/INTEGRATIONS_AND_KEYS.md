# AIPPT 集成与密钥清单

> 更新：2026-08-24。本文只列官方申请入口。密钥只应放在服务端密钥管理器或未提交的 `.env`，不要使用 `NEXT_PUBLIC_` 前缀暴露服务端密钥。

生成工作流 V2 首版只强制需要服务端 `OPENAI_API_KEY`。设置 `FEATURE_GENERATION_WORKFLOW_V2=true` 后，未单独配置角色模型时，推理、结构化输出、截图审稿与抽象插图都回退到 `OPENAI_MODEL`；开放图库与本地证据检索不需要额外密钥。

## 四级上线门槛

| 级别 | 环境 | 必需能力 |
|---|---|---|
| L0 | 本地验收 | 无外部密钥；`Codex Test Bridge` 只允许 development + localhost + 显式开关 |
| L1 | 私有 Alpha | 真实身份、一个主模型、PostgreSQL、对象存储、队列、服务端会话密钥 |
| L2 | 公开 Beta | L1 + 正式渲染、支付、邮件/验证、监控、限流、备份与事件审计 |
| L3 | 质量增强 | 多供应商模型、搜索引用、图像生成、OCR、视觉审校 |

## 配置表

| 类别 | 环境变量 | 用途 | 级别 | 官方获取入口 |
|---|---|---|---|---|
| 主模型 | `OPENAI_API_KEY`, `OPENAI_MODEL`, 可选 `AIPPT_REASONING_MODEL`, `AIPPT_FAST_MODEL`, `AIPPT_VISION_MODEL`, `AIPPT_IMAGE_MODEL` | 结构化 Brief、证据、故事、文案、截图审稿和受限修复；未设置角色模型时统一回退到主模型 | L1 | [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) / [API keys](https://platform.openai.com/api-keys) |
| 兼容模型 | `AIPPT_MODEL_BASE_URL`, `AIPPT_MODEL_API_KEY` | OpenAI-compatible 私有网关或其他供应商 | L3 | 对应供应商官方控制台；不接受中转站共享密钥 |
| 身份 | `AUTH_SECRET`, `AUTH_TRUST_HOST`, OAuth 客户端 ID/Secret | 真实用户与组织边界 | L1 | [Auth.js](https://authjs.dev/)；或 [Clerk](https://clerk.com/docs) / [Auth0](https://auth0.com/docs) |
| 主数据库 | `DATABASE_URL` | 项目、版本、工作流、事件、计费账本 | L1 | [Neon 连接指南](https://neon.com/docs/connect/query-with-psql-editor) 或自托管 PostgreSQL |
| 对象存储 | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | PPTX/PDF/PNG、上传资料、渲染图 | L1 | [Cloudflare R2 S3](https://developers.cloudflare.com/r2/get-started/s3/) / [R2 token](https://developers.cloudflare.com/r2/api/tokens/)；或 [AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-iam.html) |
| 队列/锁 | `REDIS_URL` 或 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | lease、heartbeat、超时回收、幂等键与限流 | L1 | [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) / [REST API](https://upstash.com/docs/redis/features/restapi) |
| 渲染 | `GOTENBERG_URL`, 可选 `GOTENBERG_AUTH_TOKEN` | PPTX 转 PDF、PDF 与截图回归 | L2 | [Gotenberg Office 转 PDF](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf) |
| 支付 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 订阅、Webhook 核验、权益与对账 | L2 | [Stripe API keys](https://docs.stripe.com/keys) / [Webhooks](https://docs.stripe.com/webhooks) |
| 国内支付（可选） | `WECHAT_PAY_*` 或 `ALIPAY_*` | 中国大陆商业化 | L2 | [微信支付开发文档](https://pay.weixin.qq.com/doc/v3/merchant/4012072524) / [支付宝开放平台](https://open.alipay.com/) |
| 错误监控 | `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | 前后端错误、release 与 sourcemap | L2 | [Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/) |
| 可观测 | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | 跨主智能体/工作任务的 trace、metric、log | L2 | [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) |
| 搜索引用 | `TAVILY_API_KEY` 或 `BRAVE_SEARCH_API_KEY` | 研究、证据台账与 URL 定位 | L3 | [Tavily](https://docs.tavily.com/documentation/api-credits) / [Brave Search API](https://api.search.brave.com/app/keys) |
| 图像生成 | `OPENAI_API_KEY` 或独立供应商密钥 | 获得可追溯的主视觉与插图 | L3 | [OpenAI Images](https://platform.openai.com/docs/guides/images) |
| OCR | `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY` | 扫描 PDF/图片资料的文字与表格提取 | L3 | [Azure AI Document Intelligence](https://learn.microsoft.com/azure/ai-services/document-intelligence/create-document-intelligence-resource) |
| 开放图片 | 无；建议设置 `WIKIMEDIA_USER_AGENT` | Openverse/Wikimedia 搜索、许可与署名信息 | L0/L3 | [Openverse API](https://api.openverse.org/v1/) / [Wikimedia API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) |
| Pexels | `PEXELS_API_KEY` | 按需搜索图片；必须展示 Pexels 链接并尽量署名摄影师，不做批量镜像 | L3 | [Pexels API](https://www.pexels.com/api/documentation/) |
| Pixabay | `PIXABAY_API_KEY` | 按需图片候选与来源信息 | L3 | [Pixabay API](https://pixabay.com/api/docs/) |
| Unsplash 预览 | `UNSPLASH_ACCESS_KEY` | 只在资源选择器中预览，不进入离线种子库 | L3 | [Unsplash API](https://unsplash.com/documentation) |
| 备用生图 | `STABILITY_API_KEY` | OpenAI Images 不可用时的可选适配器 | L3 | [Stability API](https://platform.stability.ai/docs/api-reference) |
| Skill 沙箱 | `SKILL_SANDBOX_RUNNER`, `SKILL_SANDBOX_IMAGE`, `SKILL_SANDBOX_TIMEOUT_MS` | 声明式 Skill 或生产容器执行 | L0/L2 | [gVisor](https://gvisor.dev/docs/)；本地无容器时不得执行脚本型 Skill |
| 恶意文件扫描 | `CLAMAV_HOST`, `CLAMAV_PORT` | 公开资源包和附件的生产恶意文件扫描 | L2 | [ClamAV](https://docs.clamav.net/) |

## 本轮无需提供

- `ENABLE_CODEX_TEST_BRIDGE=true` 是本地开发开关，不是密钥；生产构建不得开启。
- Mock Pro 仅用于本地验收，不会创建支付或伪装真实订阅。
- 本地 PGlite 和文件存储可完成功能验收，不是公开上线配置。
- 96 张种子资源和声明式 Skill 无需图片或沙箱密钥；`GET /api/integrations/status` 只返回布尔配置状态，不返回任何密钥值。

## 接入顺序

1. 先配真实 Auth + PostgreSQL + 对象存储，验证越权、恢复和备份。
2. 再配一个主模型，使所有角色先回退到同一模型，界面如实显示。
3. 接队列和渲染，做 Worker 崩溃、429、超时与重复请求演练。
4. 支付与监控通过后再开公开 Beta。
5. 最后增加搜索、图像、OCR 和多模型路由，且为每个供应商设预算上限。

## 开源借鉴边界

- [PptxGenJS](https://github.com/gitbrent/PptxGenJS) 是 MIT，继续作为 OOXML 输出底座。
- [PPTAgent](https://github.com/icip-cas/PPTAgent) 是 MIT，本轮借鉴“参考页功能分类 + 编辑式生成 + 内容/设计/连贯性评估”思想。
- [Presenton](https://github.com/presenton/presenton) 是 Apache-2.0，借鉴自带模型配置、模板导入和可编辑导出流程。
- [PPTist](https://github.com/pipipi-pikachu/PPTist) 是 AGPL-3.0：本轮只作交互研究，不复制其源码。
- [LangGraph.js](https://github.com/langchain-ai/langgraphjs) 只借鉴持久化图和人工门控思想；当前保持 TypeScript + PGlite 显式 DAG，不新增大型框架。
