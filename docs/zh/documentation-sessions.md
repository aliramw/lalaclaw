[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[返回首页](./documentation.md) | [快速开始](./documentation-quick-start.md) | [对话、附件与命令](./documentation-chat.md) | [快捷键说明](./documentation-shortcuts.md) | [本地持久化与恢复](./documentation-persistence.md)

# 会话、智能体与运行模式

## 会话如何标识

前后端都围绕两个核心值组织会话状态：

- `agentId`
- `sessionUser`

可以这样理解：

- `agentId` 表示你在和谁协作
- `sessionUser` 表示当前上下文属于哪条对话链

同一个 Agent 可以对应多个 `sessionUser`，这也是应用在不切换 Agent 的情况下创建新上下文的方式。

## 智能体会话标签

前端标签页按 Agent 组织：

- 默认主标签是 `agent:main`
- 每个打开的 Agent 标签页都会维护自己的消息、草稿、滚动位置和部分会话元数据
- 关闭标签页只会隐藏当前视图，不会删除底层会话历史

## 会话级设置

以下内容会作为会话偏好保存到后端：

- Agent
- 模型
- Fast mode
- Think mode

切换规则：

- 切换 Agent 且未手动指定模型时，会回退到该 Agent 的默认模型
- 切换模型时，只有偏离默认模型才会显式持久化
- Think mode 会先校验合法性

## 开启新会话

清空上下文主要有三种方式：

- 点击聊天头部里的新会话操作
- 使用 `Cmd/Ctrl + N`
- 发送 `/new` 或 `/reset`

区别在于：

- UI 按钮和快捷键更偏向简单重置
- `/new` 和 `/reset` 支持尾随 prompt，可在新会话中立即继续工作

## `mock` 模式

在以下情况下进入 `mock` 模式：

- 没有检测到本地 OpenClaw 网关
- 或显式设置了 `COMMANDCENTER_FORCE_MOCK=1`

特点：

- 即使没有真实网关，也能完整使用界面
- 聊天、检查器、文件和环境面板都会返回演示用 mock 数据
- 很适合本地开发、UI 联调和自动化测试

## `openclaw` 模式

在以下情况下进入 `openclaw` 模式：

- 检测到 `~/.openclaw/openclaw.json`
- 或显式配置了 `OPENCLAW_BASE_URL` 等环境变量

特点：

- `/api/chat` 会把请求发往真实网关
- `/api/runtime` 和检查器会读取 transcript、session 状态和浏览器控制信息
- 切换模型和思考模式时可以 patch 远端 session

## 可提及的智能体与技能来自哪里

`@` 菜单不是写死的，而是从运行时配置派生出来：

- 可提及 Agent：当前 Agent 的 `subagents.allowAgents`
- 可用 Skill：当前 Agent、允许的子 Agent、本地 skill 目录，以及 skill lock 信息

因此，如果某个 Agent 或 Skill 没出现在菜单里，通常是配置范围或权限问题，而不是前端显示问题。

## 什么时候应该开新会话

这些情况通常适合新建会话：

- 对话历史已经很长，上下文占用明显变大
- 任务方向发生变化，不希望旧上下文继续影响结果
- 想保留模型和模式设置，但重置对话本身
