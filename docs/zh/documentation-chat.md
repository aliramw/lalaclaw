[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [快捷键说明](./documentation-shortcuts.md) | [本地持久化与恢复](./documentation-persistence.md)

# 对话、附件与命令

## 发送消息

输入框采用“写作优先，快捷发送补充”的交互方式：

- `Enter`：插入换行
- `Shift + Enter`：立即发送
- 连按两次 `Enter`：立即发送
- `ArrowUp / ArrowDown`：浏览当前会话的历史输入

发送后会发生：

- 前端先插入一条乐观更新的用户消息
- 如果输入不是 Slash 命令，会插入一个临时的助手 thinking 占位
- 后端默认用 NDJSON 流式返回回复
- 回复进行中可以点击 `Stop`

## 排队行为

如果当前标签页正在忙碌：

- 新消息不会丢失，而是进入该标签页队列
- 排队的用户消息会先显示在聊天区，但不会立即生成第二个 thinking 占位
- 当前回复结束后，队列会按顺序自动继续执行

## `@` 提及

有两种入口：

- 直接在输入框里键入 `@`
- 点击输入框附近的 `@` 按钮

候选来源：

- 可提及 Agent：当前 Agent 的 `subagents.allowAgents`
- 可提及 Skill：当前 Agent、允许的子 Agent 以及本地发现到的 skill

支持的交互：

- 输入时实时过滤
- `ArrowUp / ArrowDown` 移动选项
- `Enter / Tab` 插入高亮项
- `Escape` 关闭菜单

## 附件

附件入口：

- 点击回形针按钮
- 直接从剪贴板粘贴文件

按类型的处理方式：

- 图片：读取为 `data URL` 并显示内联预览
- 文本附件：读取为文本，截断到 `120000` 字符，并一起发给模型
- 其他文件：只发送元数据

如果浏览器或桌面环境能提供本地路径，附件还会带上 `path/fullPath`，后续可供检查器和预览使用。

## 刷新恢复

如果页面在回复过程中刷新：

- 前端会单独保存待完成的用户轮次和助手占位
- 页面重新加载后会尽量恢复这轮未完成任务
- 如果后端已经完成，则会用最终回复替换占位

## Slash 命令

### `/fast`

支持：

- `/fast`
- `/fast status`
- `/fast on`
- `/fast off`

行为：

- `status` 返回当前 fast mode 状态
- `on/off` 会把 fast mode 偏好持久化到当前会话

### `/think <mode>`

支持的模式：

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`
- `adaptive`

行为：

- 更新当前会话的思考深度
- 在 `openclaw` 模式下，还会同步 patch 远端 session

### `/new [prompt]` 与 `/reset [prompt]`

行为：

- 创建新的 `sessionUser`
- 继承当前模型、Agent、fast mode 和 think mode 偏好
- 如果带尾随 prompt，会在新会话里立即继续执行

适用场景：

- 当前上下文太长
- 希望保留控制参数但清空对话历史

## 使用建议

- 长任务开始前，先确认 Agent、模型和思考模式
- 大段文本素材用文本附件，图片素材用图片附件
- 想干净切分上下文时，优先使用新会话或 `/new`
- 后续需求可以直接排队，不必等当前回复完全结束
