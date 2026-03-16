# 产品演示指南

> 导航：[文档首页](./documentation.md) | [界面总览](./documentation-interface.md) | [彩蛋](./documentation-easter-egg.md) | [检查器、文件预览与追踪](./documentation-inspector.md) | [架构概览](./architecture.md) | [重构路线图](./refactor-roadmap.md)

这份文档用于整理展示、截图或录屏时值得突出的 LalaClaw 画面与流程。

## 核心画面

- 顶部概览条：Agent / model 选择、fast mode、thinking、queue、theme、locale
- 聊天面板：pending 助手回复、Markdown 回答、附件 chip 和重置入口
- 检查器：timeline、file list、artifacts、snapshots、agent graph 和 runtime peeks

## 演示流程

1. 在 `mock` 模式下展示默认指挥中心布局。
2. 发送一条带附件的 prompt，展示输入区行为和 pending 状态。
3. 打开检查器标签页，展示 timeline、files 和 snapshots 如何随同一会话更新。
4. 切换模型、fast mode、thinking mode、theme 和 locale，展示会话级控制。
5. 切换到 OpenClaw 真实网关环境，展示同一套 UI 如何驱动真实运行。

## 建议素材

- 一张默认工作区的全宽桌面截图
- 一张聚焦 pending 聊天状态的截图
- 一张聚焦任务完成后检查器的截图
- 一段展示 prompt 提交、状态变化和检查器更新的短 GIF

## 维护说明

- 优先使用当前 React 应用中的真实截图，不使用旧版 mockup
- 截图语言和主题应尽量与 README 中展示的一致
- 当主要 UI 或演示流程变化时，应同步更新本文件
