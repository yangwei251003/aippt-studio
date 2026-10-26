# Known Issues

- 当前环境未配置真实模型密钥。API 会保持可用并返回 `AI_MODEL_NOT_CONFIGURED`；只有测试环境允许 Fake，开发和生产不会生成假文稿。
- 扫描型 PDF 首版不做 OCR，会明确提示需要 OCR，不会伪装提取成功。
- PDF/PNG 导出依赖本机 Edge/Chromium；找不到浏览器时需设置 `PLAYWRIGHT_EXECUTABLE_PATH`。
- 精确拖拽和缩放为桌面能力；移动端保留创建、蓝图、查看、文字编辑与导出。
