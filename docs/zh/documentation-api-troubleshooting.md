[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[返回首页](./documentation.md) | [快速开始](./documentation-quick-start.md) | [检查器、文件预览与追踪](./documentation-inspector.md) | [会话、Agent 与运行模式](./documentation-sessions.md)

# API 与排障

## API 概览

### `GET /api/session`

用途：

- 获取基础会话元信息
- 返回模型、Agent、think mode、available models、available agents、available skills 等状态

### `POST /api/session`

用途：

- 更新会话偏好
- 支持 `agentId`、`model`、`fastMode` 和 `thinkMode`

### `GET /api/runtime`

用途：

- 获取当前运行时快照
- 返回投影后的 `conversation`、`timeline`、`files`、`artifacts`、`snapshots`、`agents` 和 `peeks`

### `POST /api/chat`

用途：

- 发送聊天轮次
- 默认使用 NDJSON 流式输出
- 支持附件、`fastMode`、`assistantMessageId` 和 `sessionUser`

### `POST /api/chat/stop`

用途：

- 中止当前标签页的活跃回复

### `GET /api/file-preview`

用途：

- 获取文件预览元数据
- 返回内联文本内容或媒体 `contentUrl`

### `GET /api/file-preview/content`

用途：

- 根据绝对路径返回真实文件内容

### `POST /api/file-manager/reveal`

用途：

- 在 Finder、Explorer 或系统文件管理器中定位目标文件

## 常见问题

### 页面打不开，后端提示 `dist` 缺失

原因：

- 你启动了 `npm start` 或 `node server.js`，但期待的是生产构建产物
- 还没有执行 `npm run build`

解决：

- 生产模式下先执行 `npm run build` 再执行 `npm start`
- 开发模式下按 [快速开始](./documentation-quick-start.md) 同时启动 Vite 和 Node

### 开发时页面能打开，但 API 失败

先检查：

- 前端是否运行在 `127.0.0.1:5173`
- 后端是否运行在 `127.0.0.1:3000`
- 是否使用了 Vite 入口，而不是生产服务入口

### 已安装 OpenClaw，但应用仍在 `mock` 模式

检查：

- `~/.openclaw/openclaw.json` 是否存在
- 是否设置了 `COMMANDCENTER_FORCE_MOCK=1`
- `OPENCLAW_BASE_URL` 和 `OPENCLAW_API_KEY` 是否为空或错误

### 第一条消息发出后立刻消失，又回到“等待第一条指令”

常见表现：

- 页面可以在 `127.0.0.1:5173` 打开
- 发送第一条 `hi` 之后，对话区又回到空白状态
- 没有看到正常回复，像是消息被“吃掉”了

优先检查：

- 运行 `npm run doctor`
- 如果你使用的是 `local-openclaw`，确认输出里不是 `OpenClaw CLI not found on PATH`
- 在浏览器 Network 里看 `POST /api/chat` 是否返回了空的 `conversation`

最常见原因：

- 本机虽然有 `~/.openclaw/openclaw.json`，但 `openclaw` 命令本身没有安装好，或不在 `PATH` 里
- 后端因此无法正确 patch 或调用本地 OpenClaw session，前端随后又被一个空快照覆盖

解决：

- 先执行 `which openclaw`
- 如果没有结果，安装 OpenClaw CLI，或把它加入 `PATH`
- 如果 CLI 已经安装在自定义位置，启动后端前设置：

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw PORT=3000 HOST=127.0.0.1 node server.js
```

- 然后重新执行：

```bash
npm run doctor
```

确认：

- `Runtime profile` 是你预期的模式
- `OpenClaw CLI found` 不再报错
- 再重新发送第一条消息

### 切换模型或智能体后没有变化

可能原因：

- 当前仍处于 `mock` 模式，因此只有本地偏好在变化
- `openclaw` 模式下远端 session patch 失败
- 选择的模型其实就是该 Agent 的默认模型

优先查看：

- [检查器、文件预览与追踪](./documentation-inspector.md) 中的 `Environment`
- 后端控制台输出

### 文件无法预览

常见原因：

- 文件项没有绝对路径
- 对应路径上的文件已不存在
- 目标不是普通文件

注意：

- `file-preview` 和 `file-manager/reveal` 都要求绝对路径

### 为什么附件内容被截断

这是预期行为：

- 文本附件在前端会截断到 `120000` 字符
- 文件预览接口会把文本预览限制在 `1 MB`

这样可以避免超大内容拖垮聊天负载和预览渲染。

### 为什么刷新后会短暂看到思考中占位

这是 pending 恢复流程的一部分：

- 前端先恢复本地 pending 占位
- runtime snapshot 到达后，如果已经带有最终回复，就会替换该占位

多数情况下，这属于正常恢复行为，而不是错误。

## 想了解更深的结构说明

- 前后端分层见 [架构概览](./architecture.md)
- 演示流程见 [产品演示指南](./showcase.md)
- 后续拆分方向见 [重构路线图](./refactor-roadmap.md)
