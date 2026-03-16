[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md)

[返回首页](./documentation.md) | [快速开始](./documentation-quick-start.md) | [彩蛋](./documentation-easter-egg.md) | [对话、附件与命令](./documentation-chat.md) | [检查器、文件预览与追踪](./documentation-inspector.md)

# 界面总览

LalaClaw 的主界面可以理解为三部分：顶部会话控制区、中间聊天工作区，以及右侧检查器。

## 顶部会话控制区

顶部区域由 `SessionOverview` 驱动，主要包括：

- 从可用模型列表中切换模型
- 查看当前上下文使用量与上限
- 一键切换快速模式
- 在 `off / minimal / low / medium / high / xhigh / adaptive` 之间切换思考模式
- 切换 `中文 / English / 日本語 / Français / Español / Português`
- 切换 `system / light / dark` 主题
- 打开快捷键帮助弹窗
- 点击左上角龙虾触发品牌彩蛋，详见 [彩蛋](./documentation-easter-egg.md)

## 聊天工作区

主聊天面板包括：

- 会话标签条，每个 Agent 一个标签页
- 面板头部，显示当前 Agent、忙闲状态、字体大小和新会话操作
- 对话区，展示用户消息、助手消息、流式回复和附件预览
- 输入区，支持文本、`@` 提及、附件和停止当前回复

可见行为包括：

- 用户消息右对齐，助手消息左对齐
- 回复生成中会先显示 thinking 占位
- 较长的助手 Markdown 回复会自动生成大纲
- 如果你滚离底部，会出现跳回最新回复的按钮

## 右侧检查器

检查器包含六个主要面板：

- `Run Log`
- `Files`
- `Summaries`
- `Environment`
- `Collab`
- `Preview`

它和聊天区是联动的：同一轮任务的文件活动、工具调用、摘要和环境快照都会同步显示在这里。

## 布局与尺寸

- 聊天区和检查器之间的分隔条可以拖动
- 检查器宽度会保存在本地并在下次加载时恢复
- 聊天字体大小是全局偏好，支持 `small / medium / large`

## 多会话标签

标签页遵循这些规则：

- 标签按 Agent 组织
- 实际会话身份由 `agentId + sessionUser` 组成
- 关闭标签页只是隐藏，不会删除底层会话
- 已经打开的标签不会再出现在切换 Agent 菜单里

## 接下来读什么

- 消息发送、附件、排队和命令：看 [对话、附件与命令](./documentation-chat.md)
- 右侧面板的详细说明：看 [检查器、文件预览与追踪](./documentation-inspector.md)
