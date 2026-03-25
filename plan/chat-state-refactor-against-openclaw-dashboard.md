# LalaClaw 聊天状态重构计划（对照 OpenClaw Dashboard）

Last updated: 2026-03-25

## 背景

最近这轮聊天相关问题已经不是单点 bug：

- 用户消息和附件重复
- 图片卡片在不同阶段退化、重复、丢失
- `/reset` 后旧会话内容回灌
- assistant 已完成但仍显示流式尾巴、`可能卡住`、停止按钮失效
- 不同 IM / main 会话在 runtime、polling、snapshot、local persistence 之间表现不一致

这些问题反复出现，说明当前聊天状态并不是“某个 if 写错了”，而是状态所有权本身过于分散。

## 对照 OpenClaw Dashboard 的结论

我先读了 OpenClaw Control UI 的聊天实现，核心参考点如下：

- `ui/src/ui/controllers/chat.ts`
- `ui/src/ui/app-chat.ts`
- `ui/src/ui/views/chat.ts`
- `ui/src/ui/controllers/sessions.ts`
- `ui/src/ui/chat-event-reload.ts`

### OpenClaw 的聊天状态模型

OpenClaw Dashboard 的聊天状态明显更“单源”：

- 历史消息只有一份：`chatMessages`
- 正在流式的内容只有一份：`chatStream`
- 正在执行的 run 只有一份：`chatRunId`
- 是否忙碌只看 `chatSending || chatRunId`
- 本地排队只有一份：`chatQueue`
- 历史刷新只走 `chat.history`

关键实现特征：

1. `chat.send` 发送时，只做最小乐观更新：
   - 追加一条用户消息到 `chatMessages`
   - 设置 `chatRunId`
   - 设置 `chatStream = ""`

2. 流式事件只更新临时流式槽位：
   - `delta` 更新 `chatStream`
   - `final / aborted / error` 清空 `chatStream` 和 `chatRunId`

3. `chat.history` 重新加载时会显式清理流式态：
   - 清 `chatStream`
   - 清 tool stream artifacts
   - 用 gateway 历史整体替换当前历史显示

4. 渲染层并不依赖消息对象里长期残留的 `pending/streaming` 标志来判断忙碌。
   - 视图主要看 `props.sending || props.stream !== null`

### 对我们当前实现的启发

OpenClaw 不是没有乐观态，也不是没有流式态；但它把这些状态压缩在非常明确的“临时槽位”里，而不是把它们扩散进多套持久消息源，再靠大量 merge 重新收口。

这和我们当前实现形成了鲜明对比。

## 当前 LalaClaw 的结构性问题

当前聊天状态分散在以下层：

- `src/features/chat/controllers/use-chat-controller.ts`
- `src/features/app/controllers/use-command-center.ts`
- `src/features/session/runtime/use-runtime-snapshot.ts`
- `src/features/app/controllers/use-command-center-background-runtime-sync.ts`
- `src/features/app/storage/app-storage.ts`
- `src/features/app/storage/use-app-persistence.ts`
- `src/components/command-center/chat-panel.tsx`

### 当前至少存在四份“消息事实来源”

1. 控制器乐观消息
   - `useChatController`
   - `pendingChatTurns`
   - optimistic user / assistant bubble

2. runtime snapshot conversation
   - `useRuntimeSnapshot`
   - `/api/runtime`
   - runtime ws / polling 回来的 authoritative conversation

3. 本地持久化历史
   - `app-storage`
   - `use-app-persistence`
   - initial stored messages / hydrated attachments

4. 渲染时的状态派生
   - `chat-panel`
   - 基于消息对象里的 `pending/streaming` 再次判断 busy / stop / stale

### 当前最危险的模式

目前很多 bug 的共同根因是：

- 同一条会话消息会在多个层次被“再次投影”
- 同一份语义会用多种形态存在：
  - runtime authoritative message
  - optimistic local message
  - pending placeholder
  - storage hydrated message
  - attachment-enriched merged message
- 这些形态再通过 `mergeConversationAttachments`、`mergePendingConversation`、`mergeStaleLocalConversationTail` 等函数重新拼接

这会导致：

- 某层修了，另一层重新污染
- 某条消息内容正确，但标志位脏了
- 某个会话结束了，另一个层次仍然把它当作 live
- UI 只能通过大量“补丁判定”避免重复、闪烁、卡住

## 是否值得整体重构

结论：值得，而且应该做。

如果继续按当前结构补丁式修复，后续大概率还会在这些区域重复回归：

- `pending/streaming` 生命周期
- runtime authoritative conversation 和 local optimistic conversation 的相互覆盖
- attachment 富化和消息去重
- reset/new session 切换
- tab 切换和 hydration
- busy/stop/stale detector 的显示稳定性

## 重构目标

目标不是“重写聊天 UI”，而是把聊天状态改成更接近 OpenClaw Dashboard 的模型：

### 目标一：单一权威会话状态

每个 tab / session 只保留一份权威会话状态对象，例如：

- `conversation`
- `run`
- `composer`
- `sync`

其中：

- `conversation` 只表示当前 authoritative transcript
- `run` 只表示当前活跃回合的临时状态
- `composer` 只表示输入框与待发附件
- `sync` 只表示 runtime/ws/polling/hydration 的同步状态

### 目标二：流式态不再写入 durable message list

`pending/streaming` 不再作为“长期存活在消息对象里的状态”四处流动。

改成：

- 流式正文放在 `run.streamText`
- 正在执行的 assistant 预览只作为派生视图
- 当 final 到达时，再一次性提交为 settled assistant message

### 目标三：附件富化与路径透传分层

附件需要保留两层语义，但不能互相污染：

- UI 附件：预览图、dataUrl、名称、mime、路径
- 模型附件：输入图像、路径提示、运行时落盘路径

要求：

- 模型侧 helper 文本不回灌成用户气泡正文
- 同一附件只存在一个 canonical attachment record
- 路径透传能力保留

### 目标四：busy / stop 只看 run state

顶部待命、tab 绿点、停止按钮、卡住检测，不再基于历史消息数组里有没有 `pending/streaming`。

统一只看：

- `run.status`
- `run.runId`
- `run.startedAt`
- `run.lastDeltaAt`

## 目标架构

建议引入每会话一份 `ChatSessionState`，大致结构如下：

```ts
type ChatSessionState = {
  conversation: {
    messages: ChatMessage[];
    revision: number;
    source: "runtime" | "history" | "bootstrap";
  };
  run: {
    status: "idle" | "starting" | "streaming" | "aborting" | "failed";
    runId: string | null;
    userTurnId: string | null;
    streamText: string;
    toolStream: ToolStreamState;
    startedAt: number | null;
    lastDeltaAt: number | null;
    error: string | null;
  };
  composer: {
    draft: string;
    attachments: ChatAttachment[];
    queue: PendingOutgoingTurn[];
  };
  sync: {
    transport: "ws" | "polling" | "idle";
    recovering: boolean;
    hydrated: boolean;
    lastSnapshotAt: number | null;
    lastHistoryAt: number | null;
  };
}
```

## 状态所有权调整

### `use-chat-controller`

职责收敛为：

- 提交用户输入
- 驱动本地 run state
- 处理 send/abort/queue
- 不直接操纵最终历史消息数组

不再负责：

- 多来源 conversation merge
- hydration 后消息补丁
- 根据 runtime payload 回写全量消息数组

### `use-runtime-snapshot`

职责收敛为：

- 拉取 authoritative snapshot
- 更新 `conversation`
- 更新 `sync`
- 如有必要，更新 run completion signal

不再负责：

- 把 local optimistic tail 拼回 authoritative conversation
- 重新注入 stale pending assistant
- 附件与 pending 的多轮补丁式重建

### `app-storage` / `use-app-persistence`

职责收敛为：

- 持久化 settled conversation
- 持久化 composer draft / attachments
- 持久化少量 run recovery metadata

不再负责：

- 复杂 conversation merge
- stale local tail restoration
- 以 storage 数据重写 authoritative transcript

### `chat-panel`

职责收敛为：

- 纯渲染
- 从 `run` 派生 busy / stop / streaming tail / stale warning
- 从 `conversation + run.streamText` 渲染最终线程

不再负责：

- 用历史消息对象猜测系统是否还在运行

## 分阶段执行

### Phase 0：先立状态边界，不改交互

目标：

- 定义新的 `ChatSessionState`
- 把当前状态字段映射进新结构
- 在不删旧逻辑的前提下，先建立新的 state container

输出：

- `src/features/chat/state/chat-session-state.ts`
- `src/features/chat/state/chat-session-reducer.ts`
- 状态转换图文档

退出标准：

- 每个 tab 能有明确的 `conversation/run/composer/sync` 四块状态
- 旧逻辑仍可跑，作为兼容层

### Phase 1：把 busy / stop / streaming 从 message flags 迁出

目标：

- `chat-panel` 改为只看 `run`
- `use-stale-running-detector` 改为只看 `run`
- `showStopButton / showBusyBadge / 可能卡住` 改成 run-based

退出标准：

- 历史消息数组里即使残留旧标志，也不会再主导 UI busy
- 完成态不再因为历史脏标志卡住

### Phase 2：把 optimistic turn 从 conversation 中剥离

目标：

- user optimistic submit 和 assistant streaming preview 都进入 `run`
- `conversation.messages` 只保留 settled messages

兼容方案：

- 视图层在渲染时把 `conversation.messages + optimistic overlay` 合成为线程

退出标准：

- 不再需要 `mergePendingConversation`
- `pendingChatTurns` 可以开始退场

### Phase 3：runtime snapshot 改成“替换 conversation，不再拼本地尾巴”

目标：

- `useRuntimeSnapshot` 到达新快照时直接更新 `conversation`
- 只通过 `run` 做未完成回合的显示补偿

退出标准：

- 不再需要 `mergeStaleLocalConversationTail`
- 大部分 `mergeConversationAttachments` 只剩附件字段富化用途，不能再改变消息结构

### Phase 4：hydration/persistence 改成 cache，不再是消息主源

目标：

- storage 只恢复 settled conversation cache
- hydrate 不再重建正在进行中的 assistant
- 恢复中的 active run 统一由 runtime snapshot / ws 再次确认

退出标准：

- 不再需要 `initialStoredMessagesByTabIdRef` 作为消息主事实来源
- tab 切换和刷新不会再把旧 optimistic turn 回灌回来

### Phase 5：移除旧 merge helpers 和兼容路径

目标：

- 删除旧的 pending/streaming message-based merge 逻辑
- 删除重复 busy 推导
- 删除 conversation 多层次去重补丁

候选清理对象：

- `mergePendingConversation`
- `mergeStaleLocalConversationTail`
- 基于消息标志的 busy 判断
- 若干 attachment 回灌补丁

## 实施边界

这次重构默认不做：

- `/api/chat` 传输协议大改
- 把主聊天 SSE 整体迁到 WebSocket
- 全量重写 `chat-panel`
- 调整 OpenClaw/IM 路由协议

优先做的是状态所有权收口，而不是 transport 换血。

## 风险

### 高风险区域

- `use-command-center`
- `use-runtime-snapshot`
- `app-storage`
- `use-app-persistence`
- `use-chat-controller`

### 主要风险

- IM 会话与 main 会话共享控制器但行为差异大
- runtime ws / polling fallback 仍在并存
- 当前已经有大量未提交拆分改动，实施时必须尽量小步

## 风险展开与控制策略

下面不再只列“哪里危险”，而是把每类风险拆成：

- 风险描述
- 触发条件
- 用户可见症状
- 预防策略
- 回滚/止损点
- 必测场景

### R1：权威会话状态与本地乐观态脱节

风险描述：

- 新的 `run` 层建立后，如果 `conversation` 和 `run` 的 ownership 没切干净，可能出现“双写”。
- 一边是新 `run` 视图态，一边仍有旧的 `pending/streaming` message flag 在驱动 UI。

触发条件：

- 某一轮迁移只改了 `chat-panel`，但控制器仍在往消息数组里塞 `pending/streaming`
- 某些分支逻辑还在调用 `mergePendingConversation`

用户可见症状：

- 三个点尾巴消失又出现
- assistant 已完成但顶部仍忙
- stop 按钮偶发可见但无效

预防策略：

- Phase 1 中禁止同时保留“两套 busy 来源”
- 新增一个统一 selector，例如 `selectChatRunState(tabId)`，UI 只能从这里取忙碌态
- 旧的 `hasActiveAssistantReply(messages)` 在 Phase 1 后只允许作为兼容断言，不允许继续主导渲染

回滚/止损点：

- 如果 run-based busy 改动导致主会话 stop/send 出现系统性退化，可以暂时保留旧消息数组渲染，但必须维持 “busy 只看 run” 不回退

必测场景：

- assistant 正常完成
- assistant aborted
- assistant error
- final 先到、snapshot 后到
- snapshot 先到、final 后到

### R2：IM 会话和 main 会话的 session identity 漂移

风险描述：

- main 会话通常是一条相对稳定的本地会话链路，IM 会话却同时涉及 bootstrap session、resolved session、runtime anchor、canonical session user。
- 状态重构时如果没有先固定 session identity 规则，新的 `ChatSessionState` 可能会挂到错误 tab 上。

触发条件：

- `sessionUser`、`conversationKey`、`tabId`、runtime key 在不同层仍各自生成
- IM 会话 reset/new 后 key 变化，但旧 state 未清

用户可见症状：

- 切 tab 后内容串到别的会话
- reset 后旧消息又回来
- IM 回复落到 main tab 或错误 agent tab

预防策略：

- 在 Phase 0 前先冻结统一 identity contract：
  - `tabId`
  - `agentId`
  - `sessionUser`
  - `conversationKey`
  - `runtimeSessionUser`
- 所有 `ChatSessionState` 必须以统一 `conversationKey` 为 primary key
- `use-command-center-im-session` 保留为 session identity adapter，不允许把 identity 解析散落回 `storage/runtime/render`

回滚/止损点：

- 如果某个 IM 渠道在新状态层下无法稳定归位，允许临时让该渠道继续走旧同步分支，但不能让 main 会话继续依赖旧 merge 体系

必测场景：

- main tab
- 钉钉 tab
- 飞书 tab
- 企微 tab
- bootstrap IM tab 首次激活
- `/reset` 后切 tab 再切回

### R3：runtime WS / polling 双通道竞争

风险描述：

- 当前 runtime snapshot 不是单一来源，WS 和 polling 可能交错到达。
- 如果新状态层没有定义“谁覆盖谁”，同一轮结果仍可能被重复应用。

触发条件：

- WS 收到 delta/final，polling 随后带着旧 snapshot 覆盖回来
- refresh/manual reload 与自动 polling 并发

用户可见症状：

- assistant 回复重复
- 状态从完成跳回可能卡住
- 图片/附件又被旧快照冲成瘦消息

预防策略：

- `sync.lastSnapshotAt`、`sync.sourceRevision` 必须进入状态模型
- 每次 snapshot apply 要显式比较新旧 revision/timestamp
- 定义统一规则：
  - `run` 由 event 驱动
  - `conversation` 优先吃 authoritative snapshot/final transcript
  - 较旧 snapshot 不得回滚较新的 settled conversation

回滚/止损点：

- 如果 WS 增量与 polling snapshot 规则在某条 IM 链路上打架，允许短期降级为“snapshot authoritative, event 只驱动 run UI”，不要让 event 直接改 durable conversation

必测场景：

- WS delta -> final -> polling snapshot
- polling snapshot -> WS final
- reconnect 后首次 snapshot
- IM delivery-routed session fallback polling

### R4：附件 canonical record 建立不彻底

风险描述：

- 这轮重构如果只重构文本消息，不同步建立附件 canonical identity，图片重复/丢图/瘦附件回灌还会继续。

触发条件：

- 同一附件在 optimistic、runtime、storage 中仍能生成不同 key
- attachment merge 仍以“猜测相等”为主，而不是 canonical id/identity

用户可见症状：

- 一条消息里两张相同图片
- 刷新后图片裂图
- 路径透传后卡片退化成文字说明

预防策略：

- 在 `composer` 阶段就生成 canonical attachment identity
- 发送后 optimistic turn、runtime snapshot、storage hydration 都必须围绕这份 identity 合并
- 模型 helper 文本绝不能再反投影成 UI 文本附件说明

回滚/止损点：

- 如果 canonical attachment identity 全量切换风险太高，可先只对图片附件启用，再扩到文本/文件

必测场景：

- 文件选择上传图片
- 粘贴图片
- 图片 + 文本同发
- 刷新后恢复
- IM 会话图片回灌
- 路径透传同时保持正常卡片显示

### R5：hydration 从“缓存”重新变成“主源”

风险描述：

- 如果实施过程中仍让 `initialStoredMessagesByTabIdRef`、`initialStoredPendingRef` 决定当前消息面貌，刷新/切 tab 后旧问题还会回来。

触发条件：

- hydrate 晚到后覆盖 runtime authoritative conversation
- reset/new session 后旧 storage 仍能回写 active tab

用户可见症状：

- 清空会话后内容回灌
- 图片刷新后退化
- 历史卡片被旧本地版本覆盖

预防策略：

- 在新模型里，storage 只能填充 `conversation cache` 和 `composer draft`
- hydrate 不允许改写已存在的 settled authoritative revision，除非当前 tab 明确处于 cold start 且无 runtime data
- reset/new 必须同步清除对应 conversationKey 的 hydrate anchor

回滚/止损点：

- 如果 hydration 迁移一期内还不能完全可靠，宁可让刷新后短暂重新拉 runtime，也不要继续让 storage 改写活跃会话

必测场景：

- 冷启动恢复
- 热刷新恢复
- reset 后切 tab
- pending 中刷新

### R6：render 层仍保留隐藏的状态推导

风险描述：

- 即使 controller/storage 重构好了，只要 `chat-panel` 继续从历史消息内容里猜运行状态，还是会复发。

触发条件：

- `chat-panel` 内仍存在 `messages.some(...pending || streaming...)`
- stale running detector 继续以消息 flag 为输入

用户可见症状：

- UI 比真实状态更忙
- 闪烁感持续
- 大纲、尾巴、tab 绿点与真实 run 生命周期不一致

预防策略：

- `chat-panel` 所有 busy / stop / stale / streaming tail 都改为吃显式 props：
  - `runStatus`
  - `runId`
  - `streamText`
  - `lastDeltaAt`
- 组件测试禁止再通过伪造 message.pending/message.streaming 驱动主要状态

回滚/止损点：

- 如渲染改造范围过大，可先保留兼容 props，但新的高优先级 UI 状态只能来自 run props

必测场景：

- 长文流式
- 有 outline 的流式
- tool call 插入
- 完成后立即 idle
- stale detector 超时

### R7：重构过程与当前脏工作树冲突

风险描述：

- 仓库当前已有较多未提交改动，尤其 `use-command-center` 周边已经开始拆分。
- 如果重构计划不控制写集，很容易和现有拆分工作互相打架。

触发条件：

- 第一轮就同时触碰 `use-command-center.ts`、多个新拆分子模块、storage、runtime、render
- 在未收口旧改动的情况下大范围搬文件

用户可见症状：

- 回归无法定位属于哪一轮
- 同一文件同时承载“模块拆分”和“状态重构”两类变化

预防策略：

- 第一轮写集必须尽量小：
  - 新增状态模型文件
  - 最小接线
  - `chat-panel` busy selector 改造
- 避免在同一轮里再做无关模块拆分
- 每个 phase 明确“允许改哪些文件”

回滚/止损点：

- 如果发现当前 worktree 的既有拆分和新状态收口高度冲突，先暂停实施，单独整理 worktree 再继续

必测场景：

- 不是产品场景，而是工程控制要求：
  - 每 phase 单独 commit/验证
  - 每 phase 后都能回到可运行状态

## 分阶段风险门禁

为了避免“计划很美，但实施时又一把梭”，每个 phase 增加明确门禁。

### Phase 0 门禁

- 新状态模型建立后，不能改变用户可见行为
- 只允许新增 state adapter，不允许删旧 merge helper
- 至少有一条控制器级测试证明 state shape 已接入

### Phase 1 门禁

- busy/stop/stale 迁移完成后，消息数组不再作为 busy 主依据
- 任何失败都不得通过放宽 UI 断言来“修绿”
- 至少跑一次 `App` 级 busy/stop 回归

### Phase 2 门禁

- optimistic turn overlay 接入后，settled conversation 不得再包含 synthetic pending assistant
- 旧 `pendingChatTurns` 仍可兼容读取，但不得继续生成新的 durable pending message

### Phase 3 门禁

- runtime snapshot 不再拼接 stale local tail
- 至少一条 IM 等价端到端链路验证通过

### Phase 4 门禁

- refresh / tab switch / reset 三类恢复路径必须通过
- storage 不能再把旧会话内容写回已重置会话

### Phase 5 门禁

- 旧 merge helpers 移除前，必须先确认调用点已全部迁移
- 删除 helper 不得伴随用户行为变化，除非计划里明确标注

## 验证矩阵

这个重构不是补单测就够，最低验证矩阵应为：

### 控制器级

- 发送文本
- 发送图片
- stop / abort
- `/new` / `/reset`
- queue drain
- busy 状态切换

### App 级

- main 会话
- IM 会话
- 切 tab / 刷新 / hydration
- 有 pending turn 时 runtime snapshot 到达
- assistant final 到达后 busy 正常消失

### 等价端到端

- 至少一条 main 会话真实或等价链路
- 至少一条 IM 会话真实或等价链路
- 至少一条“图片 + 回复 + 刷新”链路

## 建议执行顺序

建议不要把整个重构一次性塞进一个 PR。

推荐拆成：

1. `state shape + run-based busy`
2. `optimistic turn overlay`
3. `runtime authoritative conversation`
4. `persistence/hydration cleanup`
5. `legacy merge helper removal`

## 当前建议

建议正式启动这次重构。

理由不是“代码难看”，而是：

- 当前聊天状态的 bug 已经集中暴露出相同根因
- OpenClaw Dashboard 的参考实现已经证明，更单源的模型可行
- 继续在现结构上补丁，后续回归成本会继续上升

这份计划的下一步不是立刻改所有文件，而是先做 `Phase 0 + Phase 1` 的最小可落地 PR，把 `busy/stop/streaming` 从历史消息对象里解耦出来，先切断最频繁的一类回归。
