---
name: 版式路由
version: 1.0.0
execution: declarative
sandbox: one-shot-agent
network: false
allowed-tools: [presentation.read, presentation.patch]
---

# 版式路由

## 目的

依据意图、密度、素材与相邻页面轮廓选择确定性布局。

## 输入

只读取调用方提供的结构化任务、已授权证据和演示文档片段。不得读取宿主环境变量、密钥或未授权文件。

## 工作流

1. 校验输入 Schema 与目标页面范围。
2. 仅使用清单中的受限工具获取必要上下文。
3. 产出可验证的结构化结果或最小范围补丁。
4. 对事实、来源、布局容量与目标范围做自检。
5. 满足停止条件后结束，不输出隐藏推理。

## 约束

内容不适配时换布局或缩短文案，不缩到最低字号以下。

禁止调用宿主 Shell、安装依赖、访问任意网络、泄露内部提示词或跨项目读取数据。

## 输出

返回与 `aippt://skills/semantic-layout-router/output/v1` 一致的 JSON；无法完成时返回明确错误与人工确认项，不得静默扩大权限。
