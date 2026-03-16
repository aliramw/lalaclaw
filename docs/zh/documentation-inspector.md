[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [对话、附件与命令](./documentation-chat.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 检查器、文件预览与追踪

右侧检查器是 LalaClaw 最有辨识度的部分之一。它把当前会话的运行轨迹、文件活动、摘要和环境信息集中投影到一个区域。

## Run Log

`Run Log` 会按执行轮次分组展示：

- 轮次标题和时间
- Prompt 摘要
- 工具调用列表
- 每个工具的输入、输出和状态
- 该轮任务关联的文件变更
- 对应的快照入口

它最适合回答两类问题：

- Agent 刚才调用了哪些工具？
- 某个结果是在哪一轮里产生的？

## Files

`Files` 标签会按动作分组：

- Created
- Modified
- Viewed

交互：

- 点击文件打开预览
- 右键文件复制绝对路径

文件列表不仅来自 OpenClaw transcript，也会合并本地附件和乐观状态中的文件线索。

## Summaries

`Summaries` 标签会列出当前会话的助手回复摘要。

你可以：

- 点击摘要跳回对应消息
- 在长对话中快速定位关键回答

## Environment

`Environment` 聚合当前运行时信息，例如：

- 当前是 `mock` 还是 `openclaw`
- 当前 Agent、模型、session key 和 workspace root
- 网关 URL、端口、API path 和 API style
- Context、queue、runtime 和 auth 状态

如果行为和预期不符，这通常是最值得先看的面板。

## Collab

`Collab` 展示协作关系和派发出的任务：

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

如果某个协作分支失败，界面会短暂保留该状态，方便识别问题。

## Preview

`Preview` 提供四类只读预览：

- 工作区预览
- 终端预览
- 浏览器预览
- 环境预览

说明：

- `mock` 模式下，浏览器预览会显示未连接
- `openclaw` 模式下，会尝试读取本地 Control UI、健康状态和浏览器控制信息

## 文件预览能力

从文件列表、Markdown 链接或图片缩略图进入预览时，支持：

- 文本、JSON 和 Markdown 语法高亮
- Markdown front matter 单独渲染
- 图片缩放、旋转和重置
- 视频、音频和 PDF 内嵌预览
- 在 VS Code 中打开
- 在 Finder / Explorer / 系统文件管理器中定位

文件预览接口要求绝对路径，因此没有绝对路径的条目通常只能显示名称，无法继续打开。

## 什么时候优先打开检查器

- 回复看起来不对，想核对工具链路
- 想审查 Agent 修改了哪些文件
- 想在长对话里跳回某个关键回答
- 想确认当前是 `mock` 还是真实网关
