# Chat Message State Machine 收口方案

## 背景

这次连续发送与卡片闪烁问题，已经证明当前聊天主链路存在系统性风险：

- 同一段会话消息会被多套异步来源直接改写
- 多个来源之间不存在单一权威写入口
- 半截 snapshot、流式 delta、最终 reply、pending 清理会互相覆盖
- UI 症状表现为：
  - 用户消息闪没又回来
  - assistant 卡片短暂重复或重排
  - thinking 卡片消失时底部 turn 抖动
  - 队列推进受 `busy / pending / dispatching` 多状态拍点影响

当前修复已经把主要故障压住，但整体仍属于“多入口互相礼让”的结构。只要后续继续在不同模块里直接写 `messages`，同类问题仍可能以别的变体回归。

## 目标

把聊天消息链路收口成：

- 多来源只产出统一事件
- 只有一个 reducer / state machine 能真正生成 `messages`
- 当前 turn 的可见性、pending、streaming、settled、stop、queue 推进都由同一套状态规则决定

目标不是一次性重写聊天系统，而是在不打断现有功能的前提下，逐步把“直接写 `messages`”迁移成“发事件 -> reducer 决策 -> 单写入口落盘”。

## 现状问题归类

### 1. 多入口直接写消息数组

当前至少有这些路径能直接改会话消息：

- [use-chat-controller.js](/Users/marila/projects/lalaclaw2/src/features/chat/controllers/use-chat-controller.js)
  - optimistic user / thinking
  - stream delta
  - final response
  - error / stop
- [use-runtime-snapshot.js](/Users/marila/projects/lalaclaw2/src/features/session/runtime/use-runtime-snapshot.js)
  - `snapshot.apply`
  - `conversation.sync`
  - pending 恢复 / 清理
- [app-storage.js](/Users/marila/projects/lalaclaw2/src/features/app/storage/app-storage.js)
  - 多种 merge / identity / stale tail repair helper

这些入口都在直接改 `messages`，只是改法不同。

### 2. “完整 turn” 不是一等状态

系统当前更多是在“消息数组层”做修补，而不是在“turn 状态层”表达：

- 当前用户 turn 是否已创建
- 当前 assistant 是否仍在 pending / streaming / settled
- 远端 snapshot 是否足够完整，能否覆盖当前 turn
- 当前 turn 是否已 stop / fail / finalize

结果就是：列表看似正确，但中间帧容易被半截数据打散。

### 3. 覆盖优先级隐含在多个 helper 里

现在很多关键规则都分散在 helper 里：

- assistant-only snapshot 不能清 pending
- 未带当前 user 的 conversation 不能覆盖底部 turn
- 本地已 settled assistant 不能被较旧 snapshot 回退
- trailing local turn 要在某些情况下补回

这些规则是对的，但还没有被提升成统一协议。

## 目标架构

### 核心原则

聊天链路未来应满足：

1. 任何来源都不能直接 `setMessages`
2. 所有来源先转成标准事件
3. reducer 基于当前 state 决定下一状态
4. `messages` 只是 state machine 的投影结果，不是被各模块直接拼出来的数组

### 建议状态模型

建议引入 `conversation state`，至少包含：

- `historyTurns`
  - 已稳定完成的 turn 列表
- `activeTurn`
  - 当前正在处理的 turn
  - 字段建议：
    - `entryId`
    - `userMessage`
    - `assistant`
      - `messageId`
      - `status`: `pending | streaming | settled | failed | stopped`
      - `content`
      - `tokenBadge`
      - `timestamp`
    - `source`
      - `optimistic`
      - `chat-response`
      - `runtime-sync`
- `queue`
  - 待发送 turn
- `sessionSync`
  - 最近一次 session patch
- `runtimeSyncMeta`
  - 最近一次 snapshot / conversation.sync 的完整度信息

### 建议事件模型

所有写入口先转成标准事件，例如：

- `turn.enqueue`
- `turn.start`
- `turn.user-visible`
- `assistant.pending-visible`
- `assistant.stream.delta`
- `assistant.stream.complete`
- `assistant.final.received`
- `turn.stop.requested`
- `turn.stopped`
- `turn.failed`
- `runtime.snapshot.received`
- `runtime.conversation.received`
- `runtime.pending.cleared`
- `queue.advance.requested`

这样 `/api/chat`、`runtime.snapshot`、`conversation.sync` 只是不同事件来源，不再直接决定最终 `messages` 长什么样。

## 单一权威规则

以下规则建议明确固化进 reducer，而不是散落在 helper 中：

### 1. 当前 turn 优先级高于远端半截 snapshot

如果当前 turn 尚未稳定完成：

- assistant-only snapshot 不能删除当前 user
- 未包含当前 user 的 conversation 不能覆盖 active turn
- partial assistant 只能更新 active assistant 内容，不能重建消息顺序

### 2. 已 settled 的 assistant 不能回退

一旦当前 assistant 进入 `settled`：

- 后续较旧的 pending / streaming / assistant-only snapshot 不能把它降级
- 只能做 identity 对齐或 metadata 补齐

### 3. 队列推进只跟 turn 生命周期走

队列出队不再依赖多个零散布尔量碰巧落在同一拍：

- 只要 active turn 进入 `settled / failed / stopped`
- reducer 明确发出 `queue.advance.requested`
- 再由单一 effect 启动下一轮

### 4. UI 渲染使用稳定 message identity

对 UI 层来说：

- `user` 与 `assistant` 的 key 必须来自稳定 turn identity
- 不因 snapshot timestamp 微调而换 key
- 最终目标是：同一条 turn 在 UI 上只更新内容，不做节点重建

## 推荐实施顺序

### Phase 1：收口消息写入口

目标：

- 不改外部行为
- 先让 `use-chat-controller` 与 `use-runtime-snapshot` 不再各自自由拼 `messages`

建议动作：

- 新增 `conversation-reducer.js` 或同层 helper
- 先把以下逻辑集中到同一个 reducer helper：
  - optimistic turn 创建
  - pending assistant 替换
  - runtime snapshot / conversation sync merge
  - stop / fail / finalize
- `use-chat-controller` 和 `use-runtime-snapshot` 只调用统一 reducer

交付标准：

- `messages` 的最终生成只剩一个实现位置
- 现有外部 props、localStorage key、事件名不变

### Phase 2：引入 active turn 状态机

目标：

- 明确当前 turn 生命周期

建议动作：

- 新增 `activeTurn` 概念，不再通过消息数组倒推 pending 状态
- `derivePendingEntryFromLocalMessages(...)` 逐步退役
- 将以下状态统一放入 reducer：
  - `pending`
  - `streaming`
  - `settled`
  - `stopped`
  - `failed`

交付标准：

- pending 清理不再依赖“从 messages 反推”
- runtime 合并判断基于 turn state，而不是只看数组内容

### Phase 3：把 runtime 输入改成标准事件

目标：

- `use-runtime-snapshot` 不再直接处理“最终消息数组”

建议动作：

- `applySnapshot` / `applyIncrementalConversation` 先转成事件：
  - `runtime.snapshot.received`
  - `runtime.conversation.received`
- reducer 再根据完整度判断：
  - 覆盖 history
  - 更新 active turn
  - 忽略半截 snapshot

交付标准：

- runtime 模块不再直接拼 hydrated conversation
- 只负责把远端 payload 转成统一输入

### Phase 4：把 `/api/chat` 返回改成标准事件

目标：

- `use-chat-controller` 不再直接替换 pending assistant 或直接 apply snapshot

建议动作：

- stream delta -> `assistant.stream.delta`
- final payload -> `assistant.final.received`
- `/api/chat` 返回中的 `conversation` 只作为参考输入，不直接覆盖 UI

交付标准：

- `/api/chat` 与 runtime 都共享同一套合并规则
- 不再需要在两边分别防 assistant-only / missing-user 覆盖

### Phase 5：清理历史补丁逻辑

目标：

- 收敛这次调试中加的临时防御分支

候选清理对象：

- `mergeStaleLocalConversationTail(...)` 的部分兜底
- `assistant-only` snapshot 特判
- 局部 `syncConversation: false` 防御
- 多处 `pendingChatTurnsRef` / `messagesRef` 的竞态补丁

前提：

- 只有当 reducer/state machine 已稳定并被 `App` 级测试覆盖后，才清理这些历史补丁

## 文件级改造建议

### [use-chat-controller.js](/Users/marila/projects/lalaclaw2/src/features/chat/controllers/use-chat-controller.js)

建议保留职责：

- 接收用户输入
- 发起 `/api/chat`
- 处理中断与队列
- 将外部响应转成标准事件

建议移出职责：

- 直接拼装最终 `messages`
- 直接决定哪些 snapshot 可以覆盖会话

### [use-runtime-snapshot.js](/Users/marila/projects/lalaclaw2/src/features/session/runtime/use-runtime-snapshot.js)

建议保留职责：

- 拉取 runtime snapshot
- 监听 runtime ws / polling
- 把远端 payload 变成统一事件

建议移出职责：

- `hydratedConversation` 的直接拼装
- “当前 turn 是否可清 pending”的最终裁决

### [app-storage.js](/Users/marila/projects/lalaclaw2/src/features/app/storage/app-storage.js)

建议保留职责：

- identity merge
- attachment merge
- 持久化 sanitize

建议迁出或弱化：

- 过多带业务时序假设的会话 merge 决策
- “底部 turn 修复”这类带 runtime 语义的策略

更理想的状态是：

- `app-storage` 只负责纯数据归一化
- turn 生命周期决策全部交给 reducer

## 测试策略

这类重构必须以高层回归保底，不能只补 helper 单测。

### 必补控制器级 / App 级回归

- 连续发送 `1,2,3,4`
  - queued message 不提前进入会话
  - 每轮只在真正开始时进会话
- thinking 消失瞬间
  - 当前 user 不闪没
  - assistant 不双卡片
- runtime assistant-only snapshot
  - 不清 pending
  - 不覆盖 active turn
- `/api/chat` final response 与 runtime snapshot 交错
  - 不重排底部 turn
- stop / fail / retry
  - 不丢 user turn

### 建议新增的测试层

- reducer 级测试
  - 针对标准事件序列断言最终 state
- `App` 级竞态测试
  - 手工构造：
    - optimistic
    - response final
    - runtime lagging snapshot
    - conversation.sync replay

### 通过标准

重构阶段每一小步至少应保证：

- 受影响控制器测试通过
- 关键 `App` 级连续发送回归通过
- 至少一条“thinking 消失瞬间”回归通过

## 风险与边界

### 主要风险

- 一次性重构过大，反而引入新竞态
- 老逻辑和新 reducer 并存太久，出现双写
- pending 恢复、持久化 hydration、stop override 被遗漏

### 控制策略

- 严格分阶段
- 每阶段只收口一类写入口
- 禁止一边引入 reducer，一边保留旧路径继续直接 `setMessages`

## 建议落地方式

建议以 3 个 PR 起步，而不是一口气大改：

### PR 1

- 新建 `conversation-reducer` 基础层
- 先把 optimistic + final assistant replace 收口进去
- 不动 runtime

### PR 2

- runtime snapshot / conversation sync 改发事件
- reducer 接管 active turn merge

### PR 3

- pending/stop/fail/queue 推进完全切到 turn state machine
- 清理旧 helper 分支

## 结论

这次 bug 说明：当前系统已经不适合继续靠局部 if/else 打补丁长期维护。

全局彻底方案不是“再补几条 merge 规则”，而是：

- 多入口事件化
- 单一 reducer 决策
- turn 生命周期显式建模
- `messages` 只作为状态投影结果

这是后续真正把“闪烁、重排、双卡片、丢 turn、队列竞态”一类问题整体收敛的方向。
