# 依赖安全更新与剩余范围

核对日期：2026-10-26。范围为本公开候选的锁定依赖与本地运行验证，不是生产渗透测试或无漏洞保证。

## 本次兼容更新

- Next.js **16.4.3**、Sharp **0.35.5**：对应维护者关于图片处理和 App Router 缓存的修复记录：[Next SVG](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)、[Next Cache Components](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)、[Sharp / librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)。各漏洞有平台与功能前提，不能据此断言本项目曾被利用。
- Fastify **5.12.6**、Zod **4.6.6**、Vitest **4.1.12**；同主版本内锁定 shell-quote 1.11.0、source-map-js 1.2.2、fast-uri 3.1.9 / 4.2.3、Vite 7.3.7、image-size 2.0.3。`pnpm-workspace.yaml` 的 overrides 仍受 `pnpm-lock.yaml` 完整性约束。
- Sharp 的 Linux x64 libvips 可选包更新至 **1.3.4**，实际版本清单为 libvips 8.18.7、librsvg 2.63.2。真实包 SHA512、来源及原文位于 `licenses/upstream/sharp-libvips-1.3.4/`；没有把打包脚本的 Apache 条款冒用于 LGPL 原生库。

## 审计仍保留的 4 条 high

`pnpm audit --json` 扫描包括开发依赖。固定依赖后的结果为 **0 critical、4 high、0 moderate、0 low**。这是该日期的数据库结果，后续安装应再次审计。精简可复核记录见 `verification/dependency-security.json`。

| 依赖链 | 记录 | 当前代码核对与限制 |
|---|---|---|
| API → pptx-automizer 0.9.0 → extract-zip 2.0.1 | [symlink traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)、[arbitrary write](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)；审计未提供上游已修版本 | 库的文件系统 archive 模式调用 extract-zip。项目 `TemplatePptxAdapter` 传入 Buffer，库默认 jszip 模式且 Buffer 分支进入内存 JSZip；当前项目没有调用该适配器的业务入口。这是源码路径核对，未证明其他入口绝不可能到达。不要改为 fs 模式处理不可信模板；需上游修复或单独评审替代方案后解除记录。 |
| API → pptx-automizer → pptxgenjs 3.12.0 → image-size 1.2.1 | [JXL / HEIF loop](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)、[ICNS loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)；已修版本 ≥2.0.3 | 该旧依赖来自 Automizer 的 PptxGenJS 3.x，并非项目原生导出使用的 PptxGenJS 4.0.1。Automizer 自己的 image-size 2.x 已补到 2.0.3；现有适配器只复制幻灯片，没有调用图片替换/cover 方法。未跨主版本强制重写旧包 API，也未把静态检查当作对恶意图片的完整防护。 |

OOXML 上传还有项目自身的内存 ZIP 解析与条目/展开量/完整性检查；原生图片导出要求已托管的 data URL，拒绝任意网络和本地路径。它们不能替代上述依赖补丁，也不代表已对所有恶意格式做完安全测试。

## 验证边界

本次只在 Windows、Node.js 24 与本地已安装 Chrome 使用合成资料回归。未调用真实模型、客户资料、生产认证、支付或云存储。Linux 原包仅校验元数据与许可，未执行其本机库、未实测 Linux 完整后端。Pages 工作流只打包只读手册与允许公开的截图，不运行 Next/API 服务。

运行服务仍应限制到自己受控环境。后续上游公告、依赖升级或启用新的模板/图片处理路径时，需要重新评估这些记录。
