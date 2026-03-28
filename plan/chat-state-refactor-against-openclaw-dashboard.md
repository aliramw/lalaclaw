# LalaClaw 聊天状态重构计划（对照 OpenClaw Dashboard）

Last updated: 2026-03-28

## 当前进展

### 2026-03-28

- `chat single-pipeline cutover` 已进入收口阶段：
  - active chat rendering 现在只认 `chat-dashboard-session` 导出的 `visibleMessages`
  - hydration / persistence / runtime reconciliation / background runtime sync 现在统一消费同一套 dashboard `settledMessages`
  - `use-command-center` 里基于 previous-frame 的 `stabilizeDashboardVisibleMessages` 热路径已经移除
- `chat-dashboard-session` 现在承担 durable transcript 的最后一层单源规则：
  - 新增 `buildDashboardSettledMessages`
  - pending user reinsertion、explicit live assistant strip、stopped assistant override、lagging snapshot local-tail append 都在这一层集中判定
  - runtime 与 background sync 不再各自拼接 settled transcript 规则
- runtime cutover 已完成到 dashboard pipeline：
  - `use-runtime-snapshot` 不再在热路径上依赖 `buildStabilizedHydratedConversationMessages`
  - runtime durable / visible conversation 都改为基于 dashboard settled/visible output 推导
  - local live assistant 的 partial text 会透传到当前 pending turn 的 `streamText`，避免 snapshot lag 时回退到旧 placeholder
- hot-path compatibility builder 的公开面已经收缩：
  - `chat-session-view` 只保留 `buildHydratedPendingConversationMessages`
  - `chat-pending-conversation` 只保留 `buildPendingConversationOverlayMessages`
  - `buildSettledConversationMessages`、`buildSettledPendingConversationMessages`、`buildStabilizedHydratedConversationMessages`、`buildDurableConversationMessages` 都已退出 production hot path
- 当前收尾重点已经从“继续拆 helper”切到“验证和人工复审”：
  - focused runtime / controller / storage / architecture contract regressions 已重新跑绿
  - 剩余工作以全量验证记录和人工 review 为主，不再建议继续扩散内部兼容层重构

### 2026-03-26

- 收尾状态：
  - 这条 `chat/storage ownership` 主线已经进入可收尾状态，当前更适合转入人工复审、PR 整理和后续 issue 跟踪，而不是继续做低收益 internalize
  - 当前建议的人工收尾顺序：
    - 审读 `app/state`、`chat/state`、`app/storage` 的最终公开边界
    - 复核 `typecheck / lint / test / build / architecture contracts / release smoke` 的最终记录
    - 决定是否拆成更小 PR，或直接以“ownership + guardrail + validation close-out”整体提交
- `typecheck` 已重新拉绿，不再沿用“仓库既有全局 TS 红灯”的旧结论；本轮围绕 `use-command-center`、runtime pending/session 边界和若干拆分后 helper 的显式签名补齐，最终 `npm run typecheck` 通过
- 在 `typecheck` 拉绿后，又重新挂回了更高层基线：
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run check:architecture:contracts`
  - 都已通过
- 发布产物验证也已经补齐到 tarball 安装态：
  - `npm run pack:release` 成功产出 `artifacts/lalaclaw-2026.3.24-1.tgz`
  - `npm run test:release:smoke -- --tarball ./artifacts/lalaclaw-2026.3.24-1.tgz` 通过
  - 安装态 Chromium smoke 结果为 `consoleErrors: 0`、`pageErrors: 0`
  - 这意味着本轮不仅源码工作区基线通过，发布包的首屏与浏览器 console smoke 也已确认无新增 runtime / chunk-init 信号
- `app-pending-storage` 已有 `app-pending-storage-core-api.test.js`，把 pending key、load、sanitize、prune 这组集中后的 pending storage 契约锁成 source-level contract
- 新增 `app-prompt-storage-core-api.test.js`，把 `prompt storage` 当前的 key、sanitize、load、clean、extract 与 `promptHistoryLimit` 锁成 source-level contract，避免 prompt 清洗 / 提取 / 持久化边界再漂回 `app-storage`
- 新增 `app-chat-scroll-storage-core-api.test.js` 与 `app-preferences-core-api.test.js`，分别把 chat scroll 持久化契约、UI preference 默认值与 sanitize 契约锁成 source-level contract，补齐已经从 `app-storage` 拆出的 feature-owned app-state 边界
- 新增 `app-session-identity-core-api.test.js` 与 `theme-storage-core-api.test.js`，分别把 session identity 单源与 theme feature 自有持久化边界锁成 contract；配合已有 source-level 行为回归，进一步固定 `identity / theme` 这两条 feature-owned 契约
- 新增 `app-state-storage-boundary.test.js`，锁住 `src/features/app/state/*` 源模块不再反向依赖 `app/storage`；这样 `pending / prompt / scroll / preferences / session identity` 这些已经拆到 app-state 的 feature-owned 语义，不会再顺手漂回 storage 实现层
- 新增 `theme-storage-boundary.test.js`，锁住 `src/features/theme/*` 源模块不再反向依赖 `app/storage`；这样 `theme-storage` 这条 feature-owned 持久化边界也和 `app-state / chat-state` 一样有了统一的依赖方向保护
- 新增 `app-storage-source-boundary.test.js`，锁住 `src/features/app/storage/*` 的实现层源模块不再反向依赖 `storage` barrel 或 `app-storage` compatibility shell；这样 storage 自己内部也保持“实现直连实现、兼容入口只给外层”的单向边界
- 新增 `chat-runtime-pending-core-api.test.js` 与 `chat-pending-conversation-core-api.test.js`，把刚从 `app-storage` 抽出的 runtime pending / pending conversation 两条聊天核心语义锁成 source-level contract，避免后续又把 pending 判定或 overlay/durable builder 漂回 storage compatibility 边界
- 新增 `chat-settled-conversation-core-api.test.js`、`chat-conversation-merge-core-api.test.js`、`chat-persisted-messages-core-api.test.js`、`chat-session-view-core-api.test.js`、`chat-conversation-dedupe-core-api.test.js`，把 `settled tail reuse`、`conversation merge`、`persisted sanitize`、`session view builder`、`conversation dedupe` 这些已经稳定下来的 `chat/state` 单源边界补成 contract；其中 `dedupe` 这轮只锁导出 surface，不锁窗口常量的具体值
- 新增 `chat-state-storage-boundary.test.js`，锁住 `src/features/chat/state/*` 源模块不再反向依赖 `app/storage`；这样前面几轮把 pending / settled / merge / sanitize 语义从 storage 脱耦出来的边界不再只靠约定维持
- 现在已经形成一套可单独执行的 architecture contract matrix：
  - `app/storage`：compat shell / implementation / source boundary / barrel boundary / compatibility API / implementation API
  - `app/state`：feature-owned core API + storage dependency boundary
  - `chat/state`：core API + storage dependency boundary
  - `theme`：core API + storage dependency boundary
  - 这组回归的目标不是替代行为测试，而是防止后续重构把已经拆清的依赖方向和公开面重新揉回 `storage`
  - `package.json` 已补 `list:architecture:contracts`、`list:architecture:contracts:json`、`lint:architecture:contracts`、`test:architecture:contracts` 与聚合入口 `check:architecture:contracts`，并由 `scripts/architecture-contracts.cjs` 统一自动发现文件清单；`json` 输出还会给出总数和按 feature root 分组的摘要，后续增删 guardrail 文件时不必同时改多条长命令
  - `test/architecture-contracts-script.test.js` 已补脚本级回归，锁住 `list / json / lint / test / check` 这几种模式的基本调度 contract

### 2026-03-25

- 已完成 `Phase 0` 的第一步落地：
  - 新增 `src/features/chat/state/chat-session-state.ts`
  - 新增 `src/features/chat/state/chat-session-reducer.ts`
  - 先把 `conversation / run / composer / sync` 四块 state shape 建出来，并用兼容适配方式从现有 command-center 状态映射

- 已完成 `Phase 1` 的第一步落地：
  - `use-command-center` 现在会先为每个 tab 构造显式 `ChatSessionState`
  - tab 忙碌态和 active panel 忙碌态改为优先看 `run`
  - `ChatPanel` 新增 `run` prop，主应用接线后不再依赖消息数组里的 `pending/streaming` flag 来主导 busy / stop / stale
  - `use-stale-running-detector` 改为基于 `run.startedAt / run.lastDeltaAt` 判断卡住，而不是盯消息数组长度和 pending 气泡

- 兼容边界：
  - `ChatPanel` 仍保留 legacy fallback，用于未接 `run` 的独立渲染场景和现有单测；但主应用路径已经走显式 `run`
  - 旧的 pending / streaming message merge 逻辑还没有删，这一轮只先把 UI 忙碌态 ownership 从 message flags 挪出来

- 已完成 `Phase 2` 的第一步落地（过渡层）：
  - 新增 `src/features/chat/state/chat-session-view.ts`
  - `ChatSessionState.conversation.messages` 现在开始收口为 settled transcript，不再把 active pending/streaming assistant 当作权威历史
  - `use-command-center` 新增 `visibleMessagesByTabId`，主 UI 改为渲染 `settled conversation + optimistic overlay`
  - overlay 当前由 `pendingChatTurn + run` 重建：
    - optimistic user turn
    - assistant thinking placeholder
    - assistant streaming preview
  - hydration 不再在初始化阶段直接把 pending placeholder 合并进 durable `messagesByTabId`
  - 持久化快照开始优先写 settled transcript，把 pending/recovery 信息继续单独留在 `pendingChatTurns`

- 已完成 `Phase 2` 的第二步落地（controller 收口）：
  - `use-chat-controller` 发送时不再把 optimistic user / pending assistant 直接写进 durable conversation
  - NDJSON streaming 现在只更新 `pendingChatTurns` 上的 overlay 字段：
    - `assistantMessageId`
    - `lastDeltaAt`
    - `streamText`
    - `tokenBadge`
  - `buildChatRequestBody` 改为基于 settled transcript 组装请求，并把当前 user turn 作为 latest request message 追加
  - stop / abort / error finalize 继续只在 settle 时把 assistant 内容写回 durable conversation
  - `PendingChatTurn` 新增 `lastDeltaAt / streamText / tokenBadge`，让 overlay、stop 恢复和持久化都围绕同一份 pending entry 走
  - 额外修正了 `chat-session-view` 在“run 已停止但 pending 仍保留”窗口里误隐藏 settled assistant reply 的问题，并保证 pending user overlay 会插回 assistant 之前而不是倒序显示

- 已完成 `Phase 2` 的第三步落地（background runtime sync 收口）：
  - `use-command-center-background-runtime-sync` 现在会先按旧逻辑解析 runtime snapshot 和 pending entry，再在写回 `messagesByTabId` 前收口成 settled transcript
  - 后台 IM tab 不再把 synthetic pending assistant / streaming assistant 直接持久写进 durable messages
  - tracked pending user turn 继续只留在 overlay / pending state，不会因为后台轮询再次回灌成 settled transcript

- 已完成 `Phase 2` 的第四步落地（active runtime snapshot 收口）：
  - `use-runtime-snapshot` 在主 `applySnapshot` 和 incremental conversation sync 路径上，写回 `setMessagesSynced` 前都会先收口为 settled transcript
  - active conversation 现在仍保留当前 user turn，但不再把 synthetic pending / streaming assistant 直接写进 durable messages
  - pending / recovery / busy 判定仍沿用原有 runtime merge 逻辑，所以这一步只改落盘 ownership，不额外扩大恢复链路的状态机改动面

- 已完成 `Phase 2` 的第五步落地（durable transcript helper 前移）：
  - `app-storage` 新增 `mergePendingConversationIntoTranscript`
  - active `use-runtime-snapshot` 的 durable 写回分支现在优先走“补 pending user，但不补 assistant live state”的 helper，而不是统一先走 `mergePendingConversation`
  - 对 `local live assistant` 和 `stopped pending` 这两类高耦合恢复场景，暂时保留原有 `stabilizedConversation -> settled transcript` fallback，先保证行为稳定

- 已完成 `Phase 2` 的第六步落地（fallback helper 化）：
  - `app-storage` 新增 `mergeStoppedPendingConversationIntoTranscript`
  - `mergePendingConversationIntoTranscript` 现在支持显式剥离当前 pending assistant match
  - `use-runtime-snapshot` 对 `local live assistant` 和 `stopped pending` 两条 durable 写回分支都已经改成显式 helper，不再依赖 `mergePendingConversation` 的副作用来拿到目标 transcript

- 已完成 `Phase 2` 的第七步落地（settled reply helper 前移）：
  - `app-storage` 新增 `mergePendingConversationSettledReplyIntoTranscript`
  - active `use-runtime-snapshot` 在“pending 还 tracked、但本地 assistant 已经 settled 且 snapshot 还滞后”的 durable 写回分支上，不再依赖 `mergeStaleLocalConversationTail`
  - 到这一步为止，active runtime snapshot durable 写回里与 pending transcript 相关的三类分支：
    - pending user only
    - local live assistant
    - stopped pending / settled local reply
    都已经改成显式 helper，而不是统一依赖通用 merge 再过滤

- 已完成 `Phase 2` 的第八步落地（pending 分支判定收口）：
  - `use-runtime-snapshot` 新增本地 settled pending assistant candidate 判定，避免 durable transcript helper 继续依赖隐式 local-tail merge
  - `durable transcript` 与 `busy / clear-pending` 的判定重新解耦：
    - 没有 `assistantMessageId` 的本地已落字 assistant 现在可以写入 durable transcript
    - 但不会因此提前把 pending turn 视为已 settle
  - 到这一步为止，active runtime snapshot durable 写回里所有“tracked pending 仍存在”的 transcript 分支都已经改成显式 helper 或显式 candidate 规则；`mergeStaleLocalConversationTail` 剩余使用面只在“无 tracked pending 的稳定本地尾巴”支线

- 已完成 `Phase 2` 的第九步落地（no-pending durable 分支 helper 化）：
  - `app-storage` 新增 `mergeSettledLocalConversationTailIntoTranscript`
  - active `use-runtime-snapshot` 在“无 tracked pending 的稳定本地尾巴” durable 写回分支上，不再直接依赖通用 `mergeStaleLocalConversationTail`
  - `use-command-center-background-runtime-sync` 的 no-pending settled transcript 分支也切到同一个 helper，active / background 两条 durable 路径对齐
  - 到这一步为止，`mergeStaleLocalConversationTail` 在 runtime 路径里只剩显示层 `stabilizeHydratedConversation` 和 pending 恢复可视化 merge 仍在用，durable transcript 分支已经全部改成显式 helper

- 已完成 `Phase 2` 的第十步落地（显示层 helper 化）：
  - `app-storage` 新增 `mergeSettledLocalConversationTailIntoView`
  - `app-storage` 新增 `stabilizeHydratedConversationWithLocalState`
  - `use-runtime-snapshot` 不再直接调用 `mergeStaleLocalConversationTail`，显示层的 local-tail merge 和 hydration stabilize 都改走显式 view helper
  - 到这一步为止，`mergeStaleLocalConversationTail` 已经不再被 runtime/controller 直接依赖，剩余使用面只在 storage helper 内部实现

- 已完成 `Phase 2` 的第十一步落地（storage 内部分规则收口）：
  - `mergeStaleLocalConversationTail` 内部拆成两条显式规则：
    - `restoreMissingUserBeforeMatchingAssistant`
    - `appendLocalTailWhenSnapshotMatchesPrefix`
  - overlap 计算也单独收成 `calculateLocalTailOverlap`
  - 这一步不改外部 helper 接口，只把 storage 内部“assistant-only user restore”和“older-prefix tail restore”分层，便于后续继续拆掉通用 merge 本体

- 已完成 `Phase 2` 的第十二步落地（compat wrapper 收口）：
  - storage 内部新增 `mergeSettledLocalConversationTail` 作为规则组合入口
  - `mergeSettledLocalConversationTailIntoView` / `mergeSettledLocalConversationTailIntoTranscript` 现在直接基于该入口组合
  - 旧的 `mergeStaleLocalConversationTail` 兼容包装已经删除，storage / runtime / background 全部改为依赖显式 view/transcript helper

- 已完成 `Phase 2` 的第十三步落地（runtime hydration helper 收口）：
  - `use-runtime-snapshot` 新增 `buildHydratedConversationState`
  - `applySnapshot` 和 `conversation.sync` 里原本重复的 local-tail / pending placeholder / stabilized view 组合逻辑，现在改成共用同一份纯 helper
  - 这一步不改变状态机分支，只减少两条 runtime 路径之间的重复实现，方便后续继续压缩 view/transcript/hydrate 组合

- 已完成 `Phase 2` 的第十四步落地（runtime durable helper 收口）：
  - `use-runtime-snapshot` 新增 `buildDurableConversationState`
  - `applySnapshot` 和 `conversation.sync` 里原本重复的 durable transcript helper 选择逻辑，现在改成共用同一份纯 helper
  - 这一步同样不改 pending / stop / settled 判定，只把 runtime 两条路径的 durable 写回实现收成一处

- 已完成 `Phase 2` 的第十五步落地（runtime merge decision 收口）：
  - `use-runtime-snapshot` 新增 `buildPendingMergeDecision`
  - `applySnapshot` 和 `conversation.sync` 里原本重复的 pending merge 判定布尔量：
    - `snapshotHasAssistantReply`
    - `snapshotIncludesPendingUserMessage`
    - `snapshotCanSettlePending`
    - `localHasLivePendingAssistant`
    - `localHasSettledAssistantReply`
    - `hasAssistantReply`
    - `shouldClearPending`
    现在都改成共用同一份结果对象
  - 到这一步为止，runtime 两条主路径在 merge 决策、hydration 组合、durable transcript 写回三层都已经各自收成公共 helper

- 已完成 `Phase 2` 的第十六步落地（runtime merge bundle 收口）：
  - `use-runtime-snapshot` 新增 `buildRuntimeConversationMergeState`
  - 这层 helper 负责把：
    - merged conversation
    - recovered pending progress
    - pending merge decision
    - local explicit live assistant 判定
    收成一份 bundle
  - `applySnapshot` 和 `conversation.sync` 现在共享同一份 runtime merge 骨架，只在 stop override、debug event 名称和 session 写回上保留差异

- 已完成 `Phase 2` 的第十七步落地（runtime outputs helper 收口）：
  - `use-runtime-snapshot` 新增 `buildRuntimeConversationOutputs`
  - stabilized view、durable transcript、`hasActivePendingTurn` 现在改成共用同一份输出 helper
  - 到这一步为止，runtime 两条主路径的公共部分已经可以分成：
    - merge state bundle
    - hydrated view output
    - durable transcript output
    - session / debug / settle side-effect

- 已完成 `Phase 2` 的第十八步落地（runtime post-merge helper 收口）：
  - `use-runtime-snapshot` 新增 `shouldScheduleRecoveredPendingSettle`
  - `use-runtime-snapshot` 新增 `clearPendingTurnByKey`
  - `applySnapshot` 和 `conversation.sync` 里原本重复的 recovered-pending settle 判断与 pending turn cleanup 现在改成共用纯 helper
  - 到这一步为止，runtime 两条主路径的差异进一步收敛到：
    - stop override
    - debug event 名称与 payload
    - session / prompt history / defer-busy 写回

- 已完成 `Phase 2` 的第十九步落地（runtime conversation-effects 收口）：
  - `use-runtime-snapshot` 新增 `commitRuntimeConversationEffects`
  - `applySnapshot` 和 `conversation.sync` 里原本重复的 conversation side-effect 提交逻辑：
    - `setMessagesSynced`
    - `setBusy`
    - recovered-pending settle schedule / clear
    - pending turn cleanup
    现在改成共用同一份 helper
  - `use-runtime-snapshot` 新增 `syncPromptHistoryForConversation`
  - snapshot 路径和 incremental conversation 路径的 prompt history 写回现在也共用同一份 helper
  - 这一刀刻意停在 `conversation` 级副作用边界，没有继续把 `stop override`、debug event、session 写回硬抽成统一外壳，避免把仍有业务差异的分支揉平

- 已完成 `Phase 2` 的第二十步落地（authoritative empty snapshot 收窄）：
  - `app-storage` 新增 `shouldReuseSettledLocalConversationTail`
  - `mergeSettledLocalConversationTailIntoView` / `mergeSettledLocalConversationTailIntoTranscript` / `stabilizeHydratedConversationWithLocalState` 现在支持显式关闭 `allowEmptySnapshot`
  - `use-runtime-snapshot` 现在只会在 `fresh reset session` 这类明确场景下，把空的 `idle/completed` runtime snapshot 视为权威 transcript，并停止默认补回 settled local tail
  - 普通初始化、background IM tab、older-prefix lagging snapshot 的本地 tail 兜底行为保持不变；这一步主要收窄的是 reset 后旧消息回灌的风险面，而不是全面改写 empty-snapshot 策略

- 已完成 `Phase 2` 的第二十一步落地（repeated turn identity 对齐收口）：
  - `mergeConversationIdentity` 现在不再用“第一个等价本地消息”做身份回填
  - 新规则改为：
    - 优先匹配相同 `id`
    - 否则在等价消息里优先选时间戳更接近 runtime snapshot 的本地消息
  - 这一步主要收的是 repeated prompt / repeated assistant 文本场景下的 identity 误绑定，减少后续 local-tail merge 基于错误本地位置继续补回的噪音

- 已完成 `Phase 2` 的第二十二步落地（trailing user restore freshness 收口）：
  - `restoreMissingUserBeforeMatchingAssistant` 现在新增两层显式约束：
    - 本地 trailing `user -> assistant` 必须是紧邻且时间上足够接近的一轮 turn
    - snapshot 里的 matching assistant 不能比本地 assistant 晚太多，否则不再把 trailing user 倒插回去
  - 这一步主要收的是“相同 assistant 文本在更晚一轮再次出现”时，storage helper 误把更早的 local user 补回当前 snapshot 之前的情况

- 已完成 `Phase 2` 的第二十三步落地（older-prefix local-tail monotonicity 收口）：
  - `appendLocalTailWhenSnapshotMatchesPrefix` 现在新增本地顺序约束：
    - 只有当 local tail 的第一条消息在本地时间顺序上确实落在 prefix 尾巴之后时，才允许把 tail 补回去
  - 这一步刻意不再直接依赖 snapshot 时间戳做门槛，而是只约束 local 自身的顺序关系，避免误伤 `stabilizeHydratedConversationWithLocalState` 这类 hydrated timestamp 与本地 timestamp 不同尺度的路径

- 已完成 `Phase 2` 的第二十四步落地（local-tail overlap 泛化）：
  - `calculateLocalTailOverlap` 现在不再只识别 assistant 级别的重叠
  - overlap 判定改成：
    - 先看 `id`
    - 否则直接走 `areEquivalentConversationMessages`
  - 这一步主要收的是 stale local tail 开头就是重复 user 的场景，避免 older-prefix merge 继续把重复 user 再补一遍

- 已完成 `Phase 2` 的第二十五步落地（local-tail monotonic continuation 收口）：
  - `appendLocalTailWhenSnapshotMatchesPrefix` 现在会显式检查 local tail 自己的时间顺序
  - 如果 tail 内部时间戳已经倒退，就不再把这段 tail 当作“当前轮最新尾巴”补回去
  - 这一步主要收的是 local 顺序已经乱掉的 older-prefix tail，避免继续把一段时间上不自洽的本地尾巴拼回 authoritative transcript / view

- 已完成 `Phase 2` 的第二十六步落地（local-tail overlap freshness 收口）：
  - `calculateLocalTailOverlap` 现在保留两层判定：
    - 相同 `id` 仍直接视为 overlap
    - 如果只能靠 `areEquivalentConversationMessages` 命中，则还要求 snapshot / local 的消息时间戳落在重复 turn 窗口内
  - 这一步主要收的是“很晚才再次出现的相同可见 turn”被误当成 stale local overlap 的场景，避免 older-prefix merge 把本应保留的后续重复轮次吞掉

- 已完成 `Phase 2` 的第二十七步落地（role-aware overlap freshness 收口）：
  - `calculateLocalTailOverlap` 在“只能靠可见等价命中”的分支上，进一步改成按消息角色使用不同 freshness 窗口：
    - `assistant` 继续保留较长的 replay / lagging 容忍窗口
    - `user` 改成只接受较短的 turn replay 窗口
  - 这一步主要收的是“几分钟后再次发送同样 user turn”被误当成 stale overlap 的场景，避免 older-prefix merge 继续吞掉后续真实重复轮次

- 已完成 `Phase 2` 的第二十八步落地（identity monotonic ordering 收口）：
  - `mergeConversationIdentity` 现在在顺序扫描 snapshot 时，要求匹配出来的 local message index 保持单调递增
  - `findBestMatchingLocalMessageIndex` 继续保留“优先 exact id、否则选最近等价消息”的策略，但不会再回头选到前一条 snapshot 已经越过的本地位置
  - 这一步主要收的是 repeated visible turn 场景下，snapshot user / assistant 因为各自独立找“最近匹配”而跨轮错配的问题

- 已完成 `Phase 2` 的第二十九步落地（trailing-user latest-assistant guard 收口）：
  - `restoreMissingUserBeforeMatchingAssistant` 现在只有在 matching assistant 仍然是 snapshot 最新一条消息时，才允许把 trailing local user 插回去
  - 如果 snapshot 已经在 matching assistant 之后继续前进，就不再把更早的 local user 倒插回中间
  - 这一步主要收的是“lagging assistant 命中成功，但 snapshot 实际上已经走到后续消息”时的误恢复场景，避免 helper 继续对中段历史做回填

- 已完成 `Phase 2` 的第三十步落地（pending-user authoritative-tail guard 收口）：
  - `mergePendingConversation` / `mergePendingConversationIntoTranscript` 现在只有在 authoritative assistant reply 仍然停留在 snapshot 尾部时，才允许把缺失的 pending user 插回 assistant 之前
  - 如果 snapshot 已经继续前进，或者无 pending user 情况下出现多条 assistant 候选，就不再猜哪条 assistant 属于这次 pending turn，而是直接信任 authoritative snapshot
  - 这一步主要收的是“pending turn 恢复逻辑继续改写中段 authoritative history”的场景，让 pending user restore 更接近 OpenClaw `chat.history` 重新加载后的尾部替换语义

- 已完成 `Phase 2` 的第三十一步落地（streaming-assistant current-turn guard 收口）：
  - `mergePendingConversation` 现在只会在当前 pending turn 后面还没有出现新的 user turn 时，才允许用 local streaming assistant 覆盖 authoritative snapshot 里的 pending assistant 候选
  - 一旦 snapshot 已经出现后续 user turn，就不再让 local partial assistant 去覆盖已经越过的 authoritative 历史
  - 这一步主要收的是“local stream 继续回写已经结束的旧回合”的场景，让 streaming assistant 的作用范围更接近 OpenClaw 里只服务当前尾部回合的 `chatStream`

- 已完成 `Phase 2` 的第三十二步落地（stopped/settled assistant turn-boundary guard 收口）：
  - `mergeStoppedPendingConversationIntoTranscript` / `mergePendingConversationSettledReplyIntoTranscript` 现在都会先检查 authoritative snapshot 是否已经越过当前 pending turn
  - 一旦 snapshot 在该 turn 之后已经出现新的 user turn，就不再把本地 stopped / settled assistant 追加回 transcript
  - 这一步主要收的是“本地旧 assistant 尾巴继续回写已越过的 authoritative 历史”的场景，让 stopped / settled assistant 的补回语义也和 OpenClaw 当前尾部 authority 更一致

- 已完成 `Phase 2` 的第三十三步落地（authoritative-settle uniqueness guard 收口）：
  - `hasSnapshotAssistantReply` 继续表示“snapshot 里已经出现了 assistant reply”
  - `hasAuthoritativePendingAssistantReply` 则进一步收窄成：在没有明确 `assistantMessageId` 命中的情况下，只有存在唯一 assistant 候选时才把 snapshot 视为足够权威、可以 settle 当前 pending turn
  - 这一步主要收的是“同一 pending 窗口里出现多个 assistant 候选时，过早把 run 判成已 settle”的场景，让 authoritative settle 更接近 OpenClaw 里只在明确 final 到达时结束当前 run 的语义

- 已完成 `Phase 2` 的第三十四步落地（later-user authoritative-final guard 收口）：
  - `hasAuthoritativePendingAssistantReply` 现在如果检测到 snapshot 在当前 pending turn 之后已经出现新的 user turn，就直接返回 `false`
  - 这意味着更早那条 assistant 即使有精确 `assistantMessageId`，也不再被视为“当前 pending 的 authoritative final”
  - 这一步主要收的是“旧回合 assistant 因为还能命中 id，就被继续当成当前 run 的 final reply”这一类越界 settle，进一步贴近 OpenClaw 只以当前尾部回合为准的 authority 语义

- 已完成 `Phase 2` 的第三十五步落地（recovered-pending current-turn guard 收口）：
  - `use-runtime-snapshot` 的 recovered pending progress 跟踪现在如果检测到 authoritative snapshot 已经越过当前 pending turn，就会立即停止 keep-alive，并清掉对应 progress 缓存
  - 这意味着旧回合的 recovered pending assistant 不会再继续把当前 run 判成 busy，也不会在 snapshot 已进入后续 user turn 时继续尝试按“当前尾部恢复中”处理
  - 这一步主要收的是“recovered pending 的本地恢复态越界 hold 住当前 run”的场景，让 runtime 层的忙态语义继续贴近 OpenClaw 只认当前尾部回合 authority 的处理方式

- 已完成 `Phase 2` 的第三十六步落地（stale tracked-pending entry guard 收口）：
  - `resolveRuntimePendingEntry` 现在如果发现 tracked pending turn 对应的消息序列已经进入后续 user turn，就不再把它继续认作“当前尾部 pending”
  - `use-runtime-snapshot` 同时补上了 stale tracked pending 的主动清理：当 authoritative snapshot / conversation.sync 已明确越过该 turn 时，会清掉对应的 `pendingChatTurns` 条目，而不是只把 busy 拉回正确值
  - 这一步主要收的是“旧 tracked pending 既不该继续 hold busy、也不该继续残留在本地 pending state”这一类越界状态，进一步对齐 OpenClaw 里只认当前尾部回合的 authority 边界

- 已完成 `Phase 2` 的第三十七步落地（tab busy current-turn guard 收口）：
  - `use-command-center` 的 tab busy helper 现在不再直接把“存在 tracked pending entry”当成 busy，而是先复用 `resolveRuntimePendingEntry` 去确认这条 pending turn 仍然属于当前尾部回合
  - helper 同时保留了“只认 tracked pending、不把孤立 stale pending flag 重新升级成 tracked run”的边界，因此不会把 runtime 层的 optimistic fallback 误搬到 tab busy 判定上
  - 这一步主要收的是“tab 级 busy 还在被已越过的旧 pending turn 持续点亮”的场景，让 controller/helper 层的忙态语义继续和 storage/runtime 的 current-turn authority 规则对齐

- 已完成 `Phase 2` 的第三十八步落地（active tab stale-pending cleanup 收口）：
  - `use-command-center` 的 active pending 清理 effect 现在除了“命中 authoritative assistant final”之外，也会处理“authoritative history 已经越过当前 pending turn”的场景
  - 一旦 active tab 的 tracked pending 已不再属于当前尾部回合，就会清掉对应的 `pendingChatTurns` 条目，并在 run 已不忙时同步清掉 tab busy
  - 这一步主要收的是“active tab UI 虽然已经显示后续 turn，但本地 pending storage 仍残留旧回合 entry”这一类越界状态，让 controller 层的 pending cleanup 继续贴近 OpenClaw 的当前尾部 authority 语义

- 已完成 `Phase 2` 的第三十九步落地（controller session/view current-turn guard 收口）：
  - `use-command-center` 现在在构建 `chatSessionStateByTabId` 和 `visibleMessagesByTabId` 时，也不再直接信任 raw `pendingChatTurns[conversationKey]`
  - controller 会先把 tracked pending entry 通过 `resolveRuntimePendingEntry` 再过一遍“当前尾部回合”校验，然后才决定 run / settled conversation / visible overlay 是否继续带这条 pending turn
  - 这一步主要收的是“background tab 或 controller-derived visible state 继续展示已越过的旧 pending overlay”这一类残余状态，让 controller 派生层也和 storage/runtime 保持同一条 current-turn authority 边界

- 已完成 `Phase 2` 的第四十步落地（active entry / persistence current-turn guard 收口）：
  - `use-command-center` 的 active pending 入口现在也不再直接取 raw `pendingChatTurns[activeConversationKey]`，而是先走同一条 tracked current-turn 校验
  - controller 的持久化路径在构建 settled conversation snapshot 时，同样会先验证 tracked pending 是否仍属于当前尾部回合，避免把已越过的旧 pending turn 继续投影进落盘的 settled transcript
  - 这一步主要收的是“刷新前一刻或 active tab 首次派生时，raw pending 仍短暂覆盖当前 authority”的残余窗口，让 controller 入口、派生状态和持久化快照继续对齐 OpenClaw 的当前尾部 authority 语义

- 已完成 `Phase 2` 的第四十一步落地（persisted pending-map current-turn guard 收口）：
  - `use-command-center` 现在在 optimistic 落盘和普通 UI 快照落盘时，都会先过滤 `pendingChatTurns`，只保留那些仍能通过 tracked current-turn 校验的 pending entry
  - 这意味着 stale pending 不只是“在内存里不再生效”，也不会继续被原样写回本地持久化，减少下一次启动时再次把旧回合 pending 带回来的机会
  - 这一步主要收的是“controller 已经不再信任某条 pending，但本地落盘仍让它长期存活”这一类残余状态，让持久化层也继续贴近 OpenClaw 的当前尾部 authority 语义

- 已完成 `Phase 2` 的第四十二步落地（hydration stale-pending prune 收口）：
  - `pruneCompletedPendingChatTurns` 现在除了“本地消息里已经存在 authoritative assistant final”之外，也会在本地消息序列已经进入后续 user turn 时，直接丢弃对应的 restored pending turn
  - 这意味着历史上遗留下来的 stale pending 就算还躺在本地存储里，也不会在新一轮 hydration 时再次被当成“待恢复的当前 run”带回应用
  - 这一步主要收的是“持久化里残留的旧 pending 在启动恢复阶段再次复活”的场景，让 hydration 入口也继续对齐 OpenClaw 只认当前尾部回合的 authority 边界

- 已完成 `Phase 2` 的第四十三步落地（hydration-only app regression 补齐）：
  - 新增 `App` 级回归，覆盖“runtime snapshot 还没返回时，仅靠本地 storage hydration 也不会把已越过的旧 pending turn 重新渲染成当前进行中”
  - 这条回归不依赖后续 runtime 修正，而是直接验证启动瞬间的本地恢复视图已经遵守 current-turn guard
  - 这一步主要补的是用户真实刷新启动路径上的高信号兜底，确保 stale pending prune 不只是 storage 纯函数正确，而是实际 UI 启动阶段也保持和 OpenClaw 一致的当前尾部 authority 语义

- 已完成 `Phase 2` 的第四十四步落地（hydration helper regression 补齐）：
  - 新增 `use-command-center-hydration` 级回归，直接覆盖 `buildStoredPendingChatTurns` 会在本地消息已进入后续 user turn 时剪掉 stale pending，并确保对应 tab 的 `buildInitialBusyByTabId` 不再误亮 busy
  - 这样 stale-pending prune 现在已经由 `storage 纯函数 -> hydration helper -> App 启动恢复` 三层共同兜住，而不是只靠一层大回归间接覆盖
  - 这一步主要补的是 hydration contract 本身的直接断言，让启动恢复阶段的 current-turn authority 规则更稳，也更便于后续继续演进 Phase 2

- 已完成 `Phase 2` 的第四十五步落地（storage persistence safety-net 收口）：
  - `persistUiStateSnapshot` 现在在真正写入 `pendingChatTurns` 前，也会统一调用 stale-pending prune，只把仍属于当前尾部回合的 pending entry 落盘
  - 这让 current-turn authority 规则从 controller / hydration 一路下沉到了 storage 持久化本身，形成最后一道安全网：即使未来有别的调用点绕过 controller 过滤，也不会把已越过的旧 pending turn 写回本地
  - 这一步主要收的是“调用点层层过滤已经做了，但 storage 自身仍缺最后防线”的结构性风险，让这条主线在持久化边界也彻底贴近 OpenClaw 的当前尾部 authority 语义

- 已完成 `Phase 2` 的第四十六步落地（chat-panel stale streaming visual guard 收口）：
  - `ChatPanel` 现在在显式 `run` 已存在时，只有 `run` 仍处于 busy 态才继续信任旧 `message.streaming` 去渲染最新 assistant 泡泡的“进行中”视觉态
  - 这意味着一旦 authoritative run 已明确 idle，就不会再因为旧 streaming flag 残留，把最新 assistant bubble 继续渲染成 streaming 状态
  - 这一步主要收的是“主状态已经切到 run authority，但显示层还会被旧 message flag 误拉回进行中”的残余视觉分叉，让 `chat-panel` 更贴近 OpenClaw 只认当前尾部 run 的处理方式

- 已完成 `Phase 2` 的第四十七步落地（background/session idle busy stale-live-flag guard 收口）：
  - `use-command-center-background-runtime-sync` 和 `use-runtime-snapshot` 的 `session.sync` 现在都不再因为“仅剩旧 local pending/streaming flag”而继续 hold busy
  - background tab busy 和 active session busy 现在都会优先只认 tracked current turn；如果 authoritative 状态已经 idle/completed 且没有仍属当前尾部回合的 pending entry，就不会再被旧 live flag 误亮忙态
  - 这一步主要收的是“controller/runtime 的忙态兜底仍会被已越过旧回合的 live flag 拖住”这一类残余状态，让忙态语义继续和 OpenClaw 的 current-turn authority 对齐

- 已补齐一轮全量基线 contract 同步：
  - `test/use-stale-running-detector.test.js` 已经从旧的 `busy + messages` 断言同步到新的 run-based stale detector contract，直接覆盖 `run.startedAt / lastDeltaAt / status`
  - `src/App.test.jsx` 里“later-user 清理旧 pending 后 busy-dot 消失”的断言补成了稳定的 effect 时序等待，避免全量基线下的时序型误红
  - `server/services/dashboard.ts` 的 replay collapse 重新收回“等价 replay 默认保留更早原始 user turn”的偏好，避免镜像 replay 把本地原始消息 timestamp 换成更晚一条，也继续贴近 OpenClaw 保留本地回合身份的语义

- 已补强一条 `App` 级 IM 等价链路验证：
  - 新增 “IM 会话图片消息 + assistant 回复 + 刷新恢复” 回归，直接覆盖 Feishu 风格 IM tab 在 persisted transcript / runtime snapshot 下的恢复路径
  - 这条回归验证了 settled image attachment、assistant reply 和 refresh 后的 active IM tab 能一起稳定恢复，且不会因为 current-turn cleanup 把已 settle 的 IM 图片消息误当成 pending/live overlay
  - 这一步主要补的是计划验证矩阵里“IM 会话”与“图片 + 回复 + 刷新”交叉场景的高信号兜底，让后续继续对齐 OpenClaw 时不只依赖 main 会话图片链路

- 已继续补强一条 `App` 级 IM pending refresh 链路：
  - 新增 “IM 会话图片消息仍在 pending 时刷新恢复” 回归，覆盖 Feishu 风格 IM tab 在 `pendingChatTurns + runtime snapshot` 共同参与时的恢复路径
  - 这条回归验证了用户图片附件、pending assistant placeholder、busy/stop 以及 active IM tab busy-dot 会在 refresh 后一起稳定恢复，不会被 current-turn cleanup 或 hydration 剪枝误清掉
  - 这一步主要补的是计划验证矩阵里“IM 会话 + 图片 + pending 恢复 + refresh”这条更贴近真实投递链路的高风险组合，继续向 OpenClaw 的尾部 authority 恢复语义对齐

- 已继续补强一条 `App` 级 IM tab-switch 恢复链路：
  - 新增 “主会话启动后切到带 pending 图片的 IM tab” 回归，覆盖 `切 tab + hydration + pending overlay` 共同参与时的恢复路径
  - 这条回归验证了 inactive IM tab 的 busy-dot、用户图片附件、pending assistant placeholder 和 active tab busy/stop 会在切换到该 tab 后一起稳定恢复，不会在 tab 可见性切换时丢掉 pending overlay
  - 这一步主要补的是计划验证矩阵里“切 tab / 刷新 / hydration”与 IM pending 图片链路的交叉场景，让这轮 current-turn authority 收口不只在 refresh 场景里成立

- 已完成 `Phase 3` 的第一小步对齐（background empty-authority reset guard）：
  - `use-command-center-background-runtime-sync` 现在在 “空 idle snapshot + justReset” 场景下，也会像 active runtime snapshot 一样信任 authoritative empty transcript，而不是继续复用 background tab 本地 settled tail
  - 这让 background IM tab 的 reset 后空会话语义不再落后于 active tab：如果 runtime 已明确给出空 transcript，background sync 不会把旧本地消息再拼回去
  - 这一步主要收的是 `Phase 3` 里 “runtime snapshot 改成替换 conversation” 在 background IM tabs 上的一个残余分叉，让 active/background 两条 runtime authority 规则进一步对齐 OpenClaw

- 已完成 `Phase 4` 的第一小步对齐（attachment hydration cache-only guard）：
  - `use-app-persistence` 的 attachment hydration 现在只会富化当前仍存在的消息 / pending entry，不再用 storage hydrated 结果重新补 tab、补消息结构或复活已移除的 pending turn
  - `mergeHydratedMessagesByKey` / `mergeHydratedPendingChatTurns` 改成只作用于当前 state 已存在的 key；active messages 也改成只做 attachment merge，而不是在 “current === initial storage” 时直接整块替换
  - 这让 storage/hydration 更接近 `Phase 4` 目标里的 “cache，而不是消息主源”：晚到的附件恢复不会再把 reset 后已移除的旧会话内容重新灌回应用

- 已补 `App` 级 late-hydration reset 回归：
  - 新增 “attachment hydration 在 reset 之后晚到时，也不会把已清空的 main 会话旧消息重新灌回 UI” 回归
  - 这条回归把刚落到 `use-app-persistence` 的 cache-only 边界补到了真实启动/重置流程，而不是只停在 hook 级 race 断言

- 已完成 `Phase 4` 的第二小步对齐（initial hydration live-flag demotion）：
  - `buildInitialHydratedMessagesByTabId` 现在会在“没有 tracked pending turn”的会话上，先把 storage 里残留的 `pending/streaming` message flag 降级成普通 settled 文本
  - 这意味着启动恢复阶段不再让 storage 直接决定 live/busy 语义；如果当前没有真正被追踪的 pending turn，旧 assistant 文本会继续保留，但不会再因为脏 live flag 把 UI 点成运行中
  - 这一步主要收的是 `Phase 4` 里“storage 仍以 message flag 形式影响当前状态”的残余入口，同时避免直接丢掉已经落字的 assistant 内容

- 已完成 `Phase 4` 的第三小步对齐（tracked-pending hydration transcript 收口）：
  - `buildInitialHydratedMessagesByTabId` 现在在“存在 tracked pending turn”的会话上，也不再把 storage 里的 optimistic user / pending assistant 直接带进初始 messages，而是先收口成 settled transcript
  - pending 中的可见恢复继续由 `pendingChatTurns + run` 负责，因此 hydration 初始化不再把 storage 里的进行中回合本体当作 conversation 主事实来源
  - 这一步主要收的是 `Phase 4` 里“hydrate 仍在从 storage 重建进行中的 assistant/message turn”这一层残余，让初始 transcript ownership 更贴近 OpenClaw 的 authoritative conversation + transient run 语义

- 已完成 `Phase 4` 的第四小步对齐（one-shot attachment hydration import）：
  - `use-app-persistence` 的 attachment hydration 现在默认只在启动阶段导入一次，不再随着 `activeChatTabId` 变化反复去问 storage
  - hydration resolve 时会按最新 active tab 选择需要同步到 `setMessagesSynced` 的那一路消息，因此切 tab 期间晚到的附件导入仍能落到当前活动会话
  - 这一步主要收的是 `Phase 4` 里“切 tab 仍把 storage 当作可重复读取的消息来源”这条残余路径，让 attachment storage 更明确地退回成启动期 cache 导入，而不是运行中主来源

- 已完成 `Phase 4` 的第五小步对齐（initial stored refs 退场）：
  - `use-app-persistence` 在完成启动期 attachment hydration 之后，会主动清空 `initialStoredMessagesByTabIdRef / initialStoredPendingRef`
  - 这意味着 storage 导入完成后，运行态不再继续保留一份“初始 storage 快照”作为潜在备用消息源；后续 reset / tab switch / refresh 都只围绕当前 state 和新一轮 runtime authority 工作
  - 这一步主要收的是 `Phase 4` 里“storage snapshot 即使导入完成后仍长期滞留在内存里”这条残余路径，让 initial stored refs 更明确地退回成一次性 bootstrap 辅助数据

- 已完成 `Phase 4` 的第六小步对齐（structured-tab storage precedence）：
  - `loadStoredState` 现在如果已经存在结构化的 `messagesByTabId`，就不再继续拿顶层 `messages` 去给 active tab 做回填
  - 顶层 `messages` 现在更明确地只服务老格式兼容；在新格式存储里，tab transcript 的权威来源始终是 `messagesByTabId`
  - 这一步主要收的是 `Phase 4` 里“顶层 active messages 仍可能越权回灌 active tab transcript”这条残余路径，进一步把 storage ownership 对齐到 tab-scoped transcript

- 已完成 `Phase 4` 的第七小步对齐（active top-level message mirror 收口）：
  - `persistUiStateSnapshot` 和 `use-app-persistence` 现在在写入顶层 `messages` 时，都会优先镜像 `messagesByTabId[activeChatTabId]`，只有缺少结构化 active transcript 时才回退到 legacy `messages`
  - 这意味着即使调用方仍传入一份陈旧的 top-level active messages，最终落盘的 legacy 顶层字段也会继续和结构化的 active tab transcript 保持一致，而不会单独漂移成另一份事实来源
  - 这一步主要收的是 `Phase 4` 里“读路径已经不再信任顶层 `messages`，但写路径仍可能把旧 active transcript 写回 legacy 字段”的残余风险，让 storage 的读写两端都继续向 `messagesByTabId` 单源收拢

- 已完成 `Phase 4` 的第八小步对齐（pending storage prune contract 收口）：
  - `use-app-persistence` 主写路径现在在写 `pendingChatStorageKey` 前，也会和 `persistUiStateSnapshot` 一样先执行 `pruneCompletedPendingChatTurns`
  - 同时，pending map 在 prune 之后如果已经为空，会直接删除 `pendingChatStorageKey`，而不是继续写一个空的 pending payload
  - 这一步主要收的是 `Phase 4` 里“controller/runtime 已经剪掉 stale pending，但常规 persistence 写路径仍可能把它重新落盘”的残余分叉，让 storage 落盘 contract 在显式 snapshot 和常规 debounce persistence 两条路径上重新对齐

- 已完成 `Phase 4` 的第九小步对齐（empty bootstrap cache 退场）：
  - `use-app-persistence` 现在只有在 `initialStoredMessagesByTabIdRef / initialStoredPendingRef` 里真的还有可导入的消息或 pending turn 时，才会启动 attachment hydration
  - 如果这两份 bootstrap cache 里只剩空数组 / 空 map，会直接把 refs 清空并跳过 hydration，不再把“空的 storage bootstrap”当成一次真实恢复流程
  - `use-command-center-reset` 也不再往 `initialStoredMessagesByTabIdRef` 里重新塞一个空 active tab 占位，而是直接移除已 reset 的旧 tab bootstrap cache
  - 这一步主要收的是 `Phase 4` 里“bootstrap cache 已经逻辑退场，但 reset/new 后的空占位仍可能让 hydration 误启动一次”的残余边界，让 initial stored refs 更明确地退回一次性导入语义

- 已完成 `Phase 4` 的第十小步对齐（persistence write-path 单源收口）：
  - `use-app-persistence` 现在不再自己维护一套独立的 `storageKey/legacyStorageKey/pendingChatStorageKey` 写逻辑，而是把常规 debounce persistence 收回到 `persistUiStateSnapshot`
  - 这样 top-level active messages 选择、structured `messagesByTabId` 优先、stale pending prune、空 pending key 删除、以及 `_persistedAt` 保护，都会统一走同一个 storage 写入口
  - 这一步主要收的是 `Phase 4` 里“显式 snapshot 和常规 persistence 明明 contract 已逐步对齐，但实现仍是两套写路径”的残余分叉，让 storage contract 不只在行为上对齐，也在实现层真正回到单源

- 已完成 `Phase 4` 的第十一步对齐（controller snapshot payload 去重）：
  - `use-command-center` 和 `use-command-center-reset` 现在在调用 `persistUiStateSnapshot` 时，不再额外显式传一份 top-level `messages`
  - controller 侧只继续交付结构化的 `messagesByTabId`，由 storage 写入口统一决定 active top-level legacy mirror，避免 controller 和 storage 同时维护这份重复镜像参数
  - 这一步主要收的是 `Phase 4` 里“storage 写入口已经单源了，但 controller 仍在传一份冗余 top-level transcript 镜像”的实现噪音，让上层 ownership 继续朝 `messagesByTabId` 单源收拢

- 已完成 `Phase 4` 的第十二小步对齐（useAppPersistence 内部 legacy mirror 去重）：
  - `use-app-persistence` 现在内部也不再提前计算或暂存一份 top-level active `messages` 镜像，常规 debounce persistence 只继续围绕 `messagesByTabId + pendingChatTurns + tabMetaById` 组织快照
  - active top-level legacy mirror 的选择逻辑现在彻底只留在 `persistUiStateSnapshot` 这一层，不再在 `use-app-persistence` 内部重复执行一遍
  - 这一步主要收的是 `Phase 4` 里“storage 写入口虽然已经单源，但 `use-app-persistence` 内部还保留一层旧 active transcript 镜像计算”的实现重复，让 legacy mirror 真正退回 storage 边界处理

- 已完成 `Phase 4` 的第十三小步对齐（useAppPersistence 输入接口去噪）：
  - `use-app-persistence` 现在正式去掉了未使用的 `messages` 输入以及内部 `PendingPersistencePayload.messages` 镜像字段
  - 主调用方 `use-command-center` 也不再把 active settled transcript 额外传给 `use-app-persistence`，hook 内部只继续围绕 `messagesByTabId`、pending map 和 bootstrap refs 组织 persistence / hydration
  - 这一步主要收的是 `Phase 4` 里“实现已经不再依赖 top-level active transcript，但 hook 接口和内部 payload 仍保留旧镜像参数”的残余噪音，让 storage/cache 单源边界在接口层也进一步收干净

- 已完成 `Phase 4` 的第十四小步对齐（initial message helper legacy fallback 收口）：
  - `buildInitialMessagesByTabId` 现在不再从 `stored.messages` 回退生成初始 tab transcript；如果没有结构化 `messagesByTabId`，就直接返回空的 active-tab transcript
  - 这意味着 legacy top-level `messages` 的兼容归一化只继续留在 `loadStoredState` / `app-storage` 这一层，而不会再在 controller 初始化 helper 里重复保留一份 fallback
  - 这一步主要收的是 `Phase 4` 里“storage 归一化已经接管 legacy 顶层消息兼容，但 controller helper 仍残留一层 dead fallback”的实现分叉，让初始化 ownership 更明确地停留在 storage 边界

- 已完成一刀 `Phase 5` 前置内部收口（pending-assistant transcript helper 合并）：
  - `mergeStoppedPendingConversationIntoTranscript` 和 `mergePendingConversationSettledReplyIntoTranscript` 里重复的“附加本地 assistant candidate 进 transcript”逻辑，现在抽成了内部 helper `appendPendingAssistantCandidateIntoTranscript`
  - 这一步不改外部语义，只把 stopped / settled 两条 transcript 补回分支里共享的 boundary 判定与重复去重先收成一处
  - 这一步主要是为后续真正的 `Phase 5` legacy helper 清理先把 storage 内部结构理顺，避免在删除旧 helper 之前还带着重复规则块

- 已继续完成一刀 `Phase 5` 前置内部收口（pending-assistant transcript merge skeleton 合并）：
  - `mergeStoppedPendingConversationIntoTranscript` 和 `mergePendingConversationSettledReplyIntoTranscript` 现在继续共用内部 helper `mergePendingAssistantCandidateIntoTranscript`
  - 这层 helper 统一负责：
    - 先走 `mergePendingConversationIntoTranscript`
    - 再按语义 guard 决定是否允许补本地 assistant candidate
    - 最后把 candidate append / 去重下沉给 `appendPendingAssistantCandidateIntoTranscript`
  - 这一步同样不改外部语义，只是把 stopped / settled 两条 transcript 补回路径的“骨架”也先收成一处，为后续真正裁掉 legacy helper 做更稳的前置整理

- 已继续完成一刀 `Phase 5` 前置内部收口（pending snapshot normalize helper 合并）：
  - `mergePendingConversation` 和 `mergePendingConversationIntoTranscript` 现在开始共用内部 helper `normalizePendingSnapshotMessages`
  - 这层 helper 统一负责 stopped-turn assistant 过滤，以及 transcript 分支需要时的 pending assistant match strip
  - 这一步同样不改外部语义，只是把 pending merge / transcript merge 里共享的 snapshot 预处理先收成一处，避免后续真正裁旧 helper 时还带着重复的 normalize 逻辑

- 已继续完成一刀 `Phase 5` 前置内部收口（pending-user merge skeleton 合并）：
  - `mergePendingConversation` 和 `mergePendingConversationIntoTranscript` 现在继续共用内部 helper `buildPendingUserMergeState`
  - 这层 helper 统一负责：
    - 是否已存在 pending user
    - snapshot 已有 assistant reply 时是否还允许把 user 插回 assistant 前
    - 需要时生成插回 pending user 后的消息序列
  - 这一步同样不改外部语义，只是把 pending overlay merge 和 transcript merge 里共享的“补 user 或保持原样”骨架先收成一处，为后续真正进入 legacy helper 清理继续降结构风险

- 已继续完成一刀 `Phase 5` 前置内部收口（pending merge state bundle 合并）：
  - `mergePendingConversation` 和 `mergePendingConversationIntoTranscript` 现在继续共用内部 helper `buildPendingConversationMergeState`
  - 这层 helper 统一负责：
    - `normalizePendingSnapshotMessages`
    - `hasSnapshotAssistantReply`
    - `buildPendingUserMergeState`
  - 这一步同样不改外部语义，只是把 pending merge / transcript merge 里共享的前置 state 组装先收成一处，为后续真正裁掉旧 merge helper 前再缩小一层重复骨架

- 已继续完成一刀 `Phase 5` 前置内部收口（pending overlay finalize helper 合并）：
  - `mergePendingConversation` 里“已有 pending user merge 结果后，最终是保留 snapshot assistant、补 local streaming assistant，还是补 pending placeholder”的收尾逻辑，现在抽成了内部 helper `finalizePendingConversationOverlay`
  - 这层 helper 统一负责：
    - local streaming assistant 的等价去重
    - snapshot pending assistant 已存在时的直接保留
    - `suppressPendingPlaceholder` 分支
    - 最终 placeholder append
  - 这一步同样不改外部语义，只是把 pending overlay merge 主函数里的最后一层收尾骨架先拆出来，让后续真正进入 legacy helper 清理时能更清楚地区分 authority 判定和 overlay 收尾

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant branch helper 合并）：
  - `mergePendingConversation` 里“snapshot 已有 assistant reply”这条 authority 分支，现在抽成了内部 helper `finalizeAuthoritativePendingConversation`
  - 这层 helper 统一负责：
    - authoritative snapshot 是否已经越过当前 pending turn
    - snapshot 已有 assistant reply、但是否仍需要把 pending user 插回 assistant 前
    - 需要时把 local streaming assistant 合并进 authority 分支
  - 这一步同样不改外部语义，只是把 pending overlay merge 主函数里的 authority 分支骨架也拆出来，让后续真正进入 legacy helper 清理时能更清楚地区分 authority 分叉、pending-user merge 和 overlay finalize 三层责任

- 已继续完成一刀 `Phase 5` 前置内部收口（pending transcript base helper 合并）：
  - `mergePendingConversationIntoTranscript` 和 `mergePendingAssistantCandidateIntoTranscript` 现在继续共用内部 helper `buildPendingTranscriptMessages`
  - 这层 helper 统一负责：
    - 先走 `buildPendingConversationMergeState`
    - 无 pending entry 时直接 collapse normalized snapshot transcript
    - 有 pending entry 时返回 collapse 后的 pending transcript base
  - 这一步同样不改外部语义，只是把 transcript 路径里共享的“先构造 merge state，再生成 transcript 基座”骨架也收成一处，让后续真正进入 legacy helper 清理时，transcript 分支和 overlay 分支都已经有比较明确的内部层次

- 已继续完成一刀 `Phase 5` 前置内部收口（pending merge state 显式类型化）：
  - `app-storage.ts` 里当前几层 pending merge helper 之间来回传递的 merge-state 形状，现在显式收成了内部类型：
    - `PendingUserMergeState`
    - `PendingConversationMergeState`
  - 这一步不改外部语义，只是把匿名对象 contract 显式化，让后续真正开始裁旧 helper 时，authority 分支、transcript 基座和 pending-user merge 三层之间的责任边界更容易审查，也更不容易在继续整理时把字段语义搞混

- 已继续完成一刀 `Phase 5` 前置内部收口（pending assistant candidate append/dedupe helper 合并）：
  - overlay 路径和 transcript 路径里共享的“assistant candidate 等价则保留原样，否则 append 后 collapse”逻辑，现在抽成了内部 helper `appendDistinctPendingAssistantCandidate`
  - 这层 helper 统一负责：
    - assistant candidate 等价去重
    - append 后 collapse
    - 无 candidate 时保持原消息序列
  - 这一步同样不改外部语义，只是把 `finalizePendingConversationOverlay` 和 `appendPendingAssistantCandidateIntoTranscript` 之间共享的最后一层 append/dedupe 骨架先收成一处，让后续继续整理 transcript / overlay 分支时不再带着两份相似实现

- 已继续完成一刀 `Phase 5` 前置内部收口（pending merge state 判别态收口）：
  - `PendingConversationMergeState` 现在从“`pendingUserMerge | null` 的隐式约定”收成了显式判别状态：
    - `hasPendingEntry: false`
    - `hasPendingEntry: true`
  - 调用点 `mergePendingConversation` 和 `buildPendingTranscriptMessages` 也同步改成基于这个判别态收口，而不是继续依赖“前面已经判断过 pendingEntry”来隐式推断 non-null
  - 这一步不改外部语义，只是把 pending merge state contract 再收清楚一层，减少后续继续整理 helper 时对 nullable 字段的隐式依赖

- 已继续完成一刀 `Phase 5` 前置内部收口（pending helper options contract 显式化）：
  - 当前几层 pending merge helper 里复用的匿名 options contract，现在显式收成了内部类型：
    - `PendingTranscriptBuildOptions`
    - `PendingAssistantCandidateAppendOptions`
  - 这一步不改外部语义，只是把 `{ stripPendingAssistantMatch }` 和 `{ shouldAppend }` 这两类共享 options 从匿名对象收成显式内部 contract，让后续继续整理 helper 时不需要在多个函数签名之间反复追隐式约定

- 已继续完成一刀 `Phase 5` 前置内部收口（pending assistant candidate / user-merge options 显式化）：
  - `buildPendingUserMergeState` 里原来的匿名 options 现在显式收成了内部类型 `PendingUserMergeBuildOptions`
  - overlay 路径和 transcript 路径里重复的 `findLocalStreamingAssistant(localMessages, pendingEntry)` 调用，现在也统一收成了内部 helper `resolvePendingAssistantCandidate`
  - 这一步不改外部语义，只是把 pending-user merge 的 options contract 和本地 assistant candidate 解析都再收清楚一层，让后续继续整理 helper 时减少重复调用点和匿名参数约定

- 已继续完成一刀 `Phase 5` 前置内部收口（pending placeholder finalize helper 合并）：
  - `finalizePendingConversationOverlay` 里最后一层“已有 snapshot assistant / suppress placeholder / append pending placeholder”的收尾逻辑，现在抽成了内部 helper `finalizePendingPlaceholderOverlay`
  - 这一步不改外部语义，只是把 overlay 路径里本地 assistant candidate 处理之后的 placeholder 分支再拆清楚一层，让后续继续整理 overlay finalize 逻辑时，assistant candidate append 和 placeholder fallback 能更明确地分开审查

- 已继续完成一刀 `Phase 5` 前置内部收口（pending placeholder append predicate 显式化）：
  - `finalizePendingPlaceholderOverlay` 里原来内联的“是否真的需要 append placeholder”判断，现在抽成了内部 helper `shouldAppendPendingPlaceholder`
  - 这一步不改外部语义，只是把 overlay placeholder 分支里的条件判断和最终 append 动作再拆开一层，让后续继续整理 overlay finalize 路径时，predicate 和 append 动作能分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative snapshot keep predicate 显式化）：
  - `finalizeAuthoritativePendingConversation` 里原来内联的“是否直接保留 authoritative snapshot”判断，现在抽成了内部 helper `shouldKeepAuthoritativePendingSnapshot`
  - 这一步不改外部语义，只是把 authority 分支里的 predicate 和最终 `mergeStreamingAssistant` 动作再拆开一层，让后续继续整理 authoritative pending 路径时，guard 和 append/merge 动作能分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（pending-user merge state 构造收口）：
  - `buildPendingUserMergeState` 里原来三处重复的 state 字面量构造，现在统一收成了内部 helper `createPendingUserMergeState`
  - 这一步不改外部语义，只是把 pending-user merge 路径里“predicate 判断”和“最终返回的 merge-state 形状”再拆开一层，让后续继续整理这条 helper 时能更聚焦在条件本身，而不是重复的 return shape

- 已继续完成一刀 `Phase 5` 前置内部收口（streaming assistant 选优规则 helper 化）：
  - `mergeStreamingAssistant` 里原来内联的“snapshot assistant 和 local streaming assistant 谁作为最终版本”规则，现在抽成了内部 helper `selectPreferredPendingAssistantMessage`
  - 这一步不改外部语义，只是把 trailing assistant 的内容选优规则单独收成一处，让后续继续整理 streaming merge 路径时，predicate、替换位置和选优规则能分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（snapshot pending assistant predicate 显式化）：
  - 原来分散在 pending-user restore 和 placeholder append 里的 `findSnapshotPendingAssistantIndex` 命中判断，现在抽成了内部 helpers：
    - `hasSnapshotPendingAssistantMatch`
    - `hasTailSnapshotPendingAssistantMatch`
  - 这一步不改外部语义，只是把“snapshot 里是否命中当前 pending assistant”这层重复语义单独显式化，让后续继续整理 restore / placeholder 路径时不需要反复追 index 细节

- 已继续完成一刀 `Phase 5` 前置内部收口（pending conversation merge state 构造收口）：
  - `buildPendingConversationMergeState` 里原来针对 `hasPendingEntry: false/true` 的两处判别态对象构造，现在统一收成了内部 helper `createPendingConversationMergeState`
  - 这一步不改外部语义，只是把 pending conversation merge 路径里“predicate/归一化逻辑”和“最终判别态 shape 构造”再拆开一层，让后续继续整理这条 helper 时更聚焦在条件本身，而不是重复的 state shape

- 已继续完成一刀 `Phase 5` 前置内部收口（transcript assistant append guard 显式化）：
  - `appendPendingAssistantCandidateIntoTranscript` 里原来内联的 `advancedPast` guard 现在抽成了内部 helper `shouldAppendPendingAssistantCandidateIntoTranscript`
  - 这一步不改外部语义，只是把 transcript 路径里“是否还允许 append 本地 assistant candidate”的 guard 和实际 append 动作再拆开一层，让后续继续整理 transcript append 路径时能分别审查 predicate 与 append 动作

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant reply predicate 分层）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联的两层 assistant 候选判定，现在拆成了内部 helpers：
    - `hasDirectAuthoritativePendingAssistantMatch`
    - `hasExactlyOneAuthoritativePendingAssistantCandidate`
  - 这一步不改外部语义，只是把 direct `assistantMessageId` 命中和 fallback 唯一候选两层语义分开，让后续继续整理 authoritative assistant 判定路径时更容易逐层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate 基础资格收口）：
  - `hasDirectAuthoritativePendingAssistantMatch` 和 `hasExactlyOneAuthoritativePendingAssistantCandidate` 现在继续共用内部 helper `isAuthoritativePendingAssistantCandidateMessage`
  - 这一步不改外部语义，只是把 authoritative assistant 候选共享的基础资格条件单独收成一处，让后续继续整理 authoritative assistant 判定路径时，基础资格和额外条件可以分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant startedAt window predicate 显式化）：
  - `hasExactlyOneAuthoritativePendingAssistantCandidate` 里原来内联的 startedAt 时间窗口判断，现在抽成了内部 helper `isAuthoritativePendingAssistantCandidateWithinStartedAtWindow`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 候选里的“基础资格”和“时间窗口资格”再拆开一层，让后续继续整理这条判定路径时能分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate source 选择 helper 化）：
  - `hasExactlyOneAuthoritativePendingAssistantCandidate` 里原来内联的“从 pending user 后面截取，否则全量 snapshot”逻辑，现在抽成了内部 helper `selectAuthoritativePendingAssistantCandidateSourceMessages`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 候选里的 source-messages 选择显式化，让后续继续整理这条路径时，source 选择和 candidate filter 可以分别审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate filter helper 化）：
  - `hasExactlyOneAuthoritativePendingAssistantCandidate` 里原来内联的 fallback candidate filter，现在抽成了内部 helper `filterAuthoritativePendingAssistantCandidates`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 路径里的 source 选择和 candidate filter 再拆开一层，让后续继续整理这条判定链时能逐层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate 组合 predicate 收口）：
  - `filterAuthoritativePendingAssistantCandidates` 里原来内联的“基础资格 + startedAt 时间窗口”组合判断，现在抽成了内部 helper `matchesAuthoritativePendingAssistantCandidate`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 候选里共享的组合 predicate 再收成一处，让后续继续整理 filter 路径时能把基础资格、时间窗口资格和组合 predicate 分层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant id-match predicate 显式化）：
  - `hasDirectAuthoritativePendingAssistantMatch` 里原来内联的“基础资格 + id 命中”判断，现在抽成了内部 helper `matchesAuthoritativePendingAssistantId`
  - 这一步不改外部语义，只是把 authoritative assistant direct-match 路径里的组合 predicate 也显式化，让后续继续整理 authoritative assistant 判定链时，direct-match 和 fallback 两条支线在结构上更对称

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant 唯一性判断 helper 化）：
  - `hasExactlyOneAuthoritativePendingAssistantCandidate` 里原来内联的 `eligibleAssistants.length === 1` 判断，现在抽成了内部 helper `hasSingleAuthoritativePendingAssistantCandidate`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 路径里的最终唯一性判断也显式化，让整条判定链在结构上更完整

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant 入口 guard 显式化）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联的 `stopped` / `advancedPast` early guard，现在抽成了内部 helper `shouldEvaluateAuthoritativePendingAssistantReply`
  - 这一步不改外部语义，只是把 authoritative assistant 判定链最外层的入口 guard 也显式化，让后续继续整理这条路径时，入口 guard 和后续 direct-match / fallback 判定可以分层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluation state 类型化与 fallback helper 化）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联使用的 evaluation state，现在显式收成了内部类型 `AuthoritativePendingAssistantEvaluationState`
  - 同时 fallback 分支调用也抽成了内部 helper `hasFallbackAuthoritativePendingAssistantReply`
  - 这一步不改外部语义，只是把 authoritative assistant 主链里的中间 state contract 和 fallback 调用再收清楚一层，让主函数结构更接近纯流程编排

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant direct-path helper 化）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联的 direct-match 调用，现在抽成了内部 helper `hasDirectAuthoritativePendingAssistantReply`
  - 这一步不改外部语义，只是把 authoritative assistant 主链里的 direct 路径也从主函数中剥出来，让主函数结构更接近“guard -> state -> direct -> fallback”

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate count 显式化）：
  - `hasExactlyOneAuthoritativePendingAssistantCandidate` 里现在继续把 fallback 候选数量统计抽成了内部 helper `countAuthoritativePendingAssistantCandidates`
  - 这一步不改外部语义，只是把 authoritative assistant fallback 路径里的 `filter -> count -> 唯一性` 三层结构再拆清楚一点，让后续继续整理这条链时更容易逐层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（pending snapshot strip predicate 显式化）：
  - `normalizePendingSnapshotMessages` 里原来内联的“是否要 strip 当前 pending assistant match”判断，现在抽成了内部 helper `shouldStripPendingAssistantMatchFromSnapshot`
  - 这一步不改外部语义，只是把 transcript normalize 路径里的入口 predicate 也显式化，让后续继续整理 normalize / strip 逻辑时能把 guard 和实际 filter 动作分层审查

- 已继续完成一刀 `Phase 5` 前置内部收口（pending snapshot strip transform helper 化）：
  - `normalizePendingSnapshotMessages` 里原来内联的 strip 动作，现在抽成了内部 helper `stripPendingAssistantMatchFromSnapshotMessages`
  - 这一步不改外部语义，只是把 transcript normalize 路径里的 `guard -> transform` 结构再拆清楚一层，让后续继续整理 normalize / strip 逻辑时更容易分别审查 predicate 和 transform

- 已继续完成一刀 `Phase 5` 前置内部收口（pending transcript base selection helper 化）：
  - `buildPendingTranscriptMessages` 里原来内联的 “snapshot transcript 还是 pending-user merge transcript” 选择逻辑，现在抽成了内部 helper `selectPendingTranscriptBaseMessages`
  - 这一步不改外部语义，只是把 transcript 路径里的 `state -> base messages -> collapse` 结构再拆清楚一层，让后续继续整理 transcript 构造路径时能分别审查 base-selection 和最终 collapse

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant 主链 evaluate helper 化）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联的 direct/fallback 编排，现在抽成了内部 helper `hasAuthoritativePendingAssistantReplyForEvaluationState`
  - 这一步不改外部语义，只是让 authoritative assistant 主链更接近“guard -> state -> evaluate”的纯流程编排，后续继续整理时不需要在主函数里同时读 direct 和 fallback 两段实现

- 已继续完成一刀 `Phase 5` 前置内部收口（pending-user merge flags 类型化）：
  - `createPendingUserMergeState` 里原来匿名的 flags 结构，现在显式收成了内部类型 `PendingUserMergeStateFlags`
  - 这一步不改外部语义，只是把 pending-user merge 路径里最后一层 state-shape contract 也从匿名对象收成显式类型，让这条链的内部 contract 更一致

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluation state 组装收口）：
  - `hasAuthoritativePendingAssistantReply` 里原来内联的 `assistantMessageId / pendingUserIndex / startedAt` 准备逻辑，现在统一收成了内部 helper `buildAuthoritativePendingAssistantEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant 判定链里的输入 state 组装和后续 direct-match / fallback 判定再拆开一层，让主函数结构更接近“guard -> direct-match -> fallback”

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluate result 显式化）：
  - `hasAuthoritativePendingAssistantReplyForEvaluationState` 里原来内联的 direct / fallback 编排，现在统一收成了内部 helper `evaluateAuthoritativePendingAssistantReplyForEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant 判定链里的 evaluate 结果显式状态化，让主链更清楚地拆成 `guard -> state -> result`

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluate result 判别态收口）：
  - `AuthoritativePendingAssistantReplyEvaluation` 现在从两个并列布尔值收成单一 `source` 判别态：`none / direct / fallback`
  - 这一步不改外部语义，只是把 authoritative assistant 判定链里的 evaluate result contract 再收清楚一层，让 direct / fallback 的来源表达更明确

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluate result 构造 helper 化）：
  - `evaluateAuthoritativePendingAssistantReplyForEvaluationState` 里原来散落的 `{ source: ... }` 字面量构造，现在统一收成了内部 helper `createAuthoritativePendingAssistantReplyEvaluation`
  - 这一步不改外部语义，只是把 authoritative assistant evaluate result 的返回 contract 再统一一层，避免后续整理时继续散落多处判别态字面量

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant source 选择 helper 化）：
  - `evaluateAuthoritativePendingAssistantReplyForEvaluationState` 里原来内联的 `direct / fallback / none` 来源选择，现在统一收成了内部 helper `selectAuthoritativePendingAssistantReplySource`
  - 这一步不改外部语义，只是把 authoritative assistant evaluate 这条链再拆成“来源选择”和“结果包装”两层，让主函数更接近纯流程编排

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant source 类型别名显式化）：
  - `AuthoritativePendingAssistantReplyEvaluation` 和 `selectAuthoritativePendingAssistantReplySource` 里共享的 `none / direct / fallback` 联合类型，现在统一收成了内部类型 `AuthoritativePendingAssistantReplySource`
  - 这一步不改外部语义，只是把 authoritative assistant evaluate result 这条链的 source contract 再收成一处，避免后续整理时重复写同一组字面量联合

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant source predicate 显式化）：
  - `hasAuthoritativePendingAssistantReplyForEvaluationState` 里原来内联的 `source !== "none"` 判定，现在统一收成了内部 helper `hasAuthoritativePendingAssistantReplySource`
  - 这一步不改外部语义，只是把 authoritative assistant evaluate 链里的 source predicate 再拆成一处，后续继续整理时不需要在主链里反复读字面量比较

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant evaluation state 构造 helper 化）：
  - `buildAuthoritativePendingAssistantEvaluationState` 里原来散落的 evaluation-state 字面量构造，现在统一收成了内部 helper `createAuthoritativePendingAssistantEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant evaluation state 这条 contract 再统一一层，让后续继续整理时不需要在主链里反复读匿名对象构造

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate evaluation state 类型化）：
  - fallback candidate 这条链里共享的 `pendingUserIndex / startedAt` 输入，现在统一收成了内部类型 `AuthoritativePendingAssistantCandidateEvaluationState` 和构造 helper `createAuthoritativePendingAssistantCandidateEvaluationState`
  - `hasExactlyOneAuthoritativePendingAssistantCandidate`、`countAuthoritativePendingAssistantCandidates`、`filterAuthoritativePendingAssistantCandidates` 现在都改成共用这层 state contract
  - 这一步不改外部语义，只是把 authoritative assistant fallback 判定链里成对散落的输入再收成一处，后续继续整理时不需要在多个 helper 签名之间来回传裸参数

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate state-aware predicate 显式化）：
  - `filterAuthoritativePendingAssistantCandidates` 里原来把 `evaluationState.startedAt` 裸传给底层 predicate 的那层组合判断，现在统一收成了内部 helper `matchesAuthoritativePendingAssistantCandidateForEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant fallback candidate 这条链再收成更一致的 state-aware contract，后续继续整理时不需要在 filter 层直接拆 evaluationState 字段

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate source state-aware helper 化）：
  - `filterAuthoritativePendingAssistantCandidates` 里原来把 `evaluationState.pendingUserIndex` 裸传给 source 选择 helper 的那层组合判断，现在统一收成了内部 helper `selectAuthoritativePendingAssistantCandidateSourceMessagesForEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant fallback candidate 这条链从 source 选择到 predicate 都统一围绕同一份 evaluation-state，后续继续整理时不需要在 filter 层直接拆 source 相关字段

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate evaluation bridge helper 化）：
  - `hasFallbackAuthoritativePendingAssistantReply` 里原来手拆 `pendingUserIndex / startedAt` 再构造 candidate evaluation state 的桥接逻辑，现在统一收成了内部 helper `buildAuthoritativePendingAssistantCandidateEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant evaluation state 到 candidate evaluation state 的桥接收成一处，让 fallback 主链不再直接拆字段

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant direct-match state-aware helper 化）：
  - direct 路径里原来把 `assistantMessageId` 当裸参数往下传的匹配逻辑，现在统一补成了 `hasDirectAuthoritativePendingAssistantMatchForEvaluationState` 和 `matchesAuthoritativePendingAssistantIdForEvaluationState`
  - 这一步不改外部语义，只是把 authoritative assistant direct-match 支线也补成和 fallback 类似的 state-aware contract，减少主链继续拆字段的地方

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate source raw helper 内联删除）：
  - `selectAuthoritativePendingAssistantCandidateSourceMessages` 现在已经完全内联进 `selectAuthoritativePendingAssistantCandidateSourceMessagesForEvaluationState`
  - 这一步不改外部语义，只是把 fallback candidate source 选择这层收成单一的 state-aware helper，减少一层只剩 wrapper 在调的 raw helper

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant candidate raw predicate 内联删除）：
  - `matchesAuthoritativePendingAssistantCandidate` 现在已经完全内联进 `matchesAuthoritativePendingAssistantCandidateForEvaluationState`
  - 这一步不改外部语义，只是把 fallback candidate 匹配这层也收成单一的 state-aware helper，和前一刀的 source 选择收口保持一致

- 已继续完成一刀 `Phase 5` 前置内部收口（authoritative assistant direct-match raw predicate 内联删除）：
  - `matchesAuthoritativePendingAssistantId` 现在已经完全内联进 `matchesAuthoritativePendingAssistantIdForEvaluationState`
  - 这一步不改外部语义，只是把 direct-match 这层也收成单一的 state-aware helper，让 authoritative assistant 两条支线的 helper 形状更一致

- 已开始执行 `Phase 5` 的外部调用面收口（background settled conversation helper 化）：
  - `use-command-center-background-runtime-sync` 不再直接在调用点拼 `mergePendingConversation + buildSettledConversationMessages`
  - 新增 `buildSettledPendingConversationMessages`，把“pending merge -> settled transcript”这条组合收成显式 helper
  - 这一步不改外部语义，但开始把 `Phase 5` 从纯内部 contract 整理推进到真正的外部调用面收口，为后续删除旧 merge helper 做准备

- 已继续执行 `Phase 5` 的外部调用面收口（runtime hydrated conversation helper 化）：
  - `use-runtime-snapshot` 不再直接在调用点拼 `mergePendingConversation`
  - 新增 `buildHydratedPendingConversationMessages`，把“pending merge -> hydrated conversation”这条组合收成显式 helper
  - 这一步不改外部语义，但继续把 `Phase 5` 从 helper 内部整理推进到 runtime 外部调用面收口，减少 `use-runtime-snapshot` 对 legacy merge helper 名字的直接依赖

- 已继续执行 `Phase 5` 的外部调用面收口（runtime durable transcript helper 化）：
  - `use-runtime-snapshot` 不再直接在调用点分支调用 `mergeStoppedPendingConversationIntoTranscript / mergePendingConversationIntoTranscript / mergePendingConversationSettledReplyIntoTranscript`
  - 新增 `buildDurablePendingConversationMessages`，把“pending durable transcript 分支选择”这条组合收成显式 helper
  - 这一步不改外部语义，但继续缩小 `use-runtime-snapshot` 对 legacy transcript helper 名字的直接依赖，为后续真正删除旧 helper 调用面做准备

- 已继续执行 `Phase 5` 的外部调用面收口（runtime hydrated state helper 外移）：
  - `use-runtime-snapshot` 不再在本地内联 `buildHydratedConversationState`
  - 新增 `buildStabilizedHydratedConversationMessages`，把“pending hydrated conversation + local-tail merge + stabilize”这条组合收成显式 helper
  - 这一步不改外部语义，但继续把 `use-runtime-snapshot` 对旧 local-tail / hydrate helper 的直接编排收口到更明确的外部入口

- 已继续执行 `Phase 5` 的外部调用面收口（runtime durable state helper 外移）：
  - `use-runtime-snapshot` 不再在本地内联 no-pending durable local-tail 分支
  - 新增 `buildDurableConversationMessages`，把“no-pending local-tail durable transcript + pending durable transcript”统一收成显式 helper
  - 这一步不改外部语义，但继续把 `use-runtime-snapshot` 的 durable 路径收成单一入口，进一步减少外层对 legacy transcript helper 的直接编排

- 已继续执行 `Phase 5` 的外部调用面收口（background durable transcript helper 化）：
  - `use-command-center-background-runtime-sync` 不再直接在调用点拼 no-pending durable local-tail transcript merge
  - background runtime sync 现在也走 `buildDurableConversationMessages`，把 no-pending 和 pending durable transcript 统一收进显式 helper 入口
  - 这一步不改外部语义，但继续缩小 controller 外层对 legacy transcript helper 的直接依赖，为后续真正删除旧 helper 名字做准备

- 已开始执行 `Phase 5` 的旧 helper 名字回收（durable pending helper 内聚）：
  - `buildDurablePendingConversationMessages` 已退回 storage 内部实现，不再作为外部导出 helper 暴露
  - 现有 durable transcript 回归改成统一走 `buildDurableConversationMessages` 入口，runtime/controller 外层只保留单一 durable helper 名字
  - 这一步不改外部语义，但代表 `Phase 5` 已从“只收调用面”进入第一批旧 helper 名字回收

- 已继续执行 `Phase 5` 的旧 helper 名字回收（stopped / settled transcript wrapper 内聚）：
  - `mergeStoppedPendingConversationIntoTranscript` 与 `mergePendingConversationSettledReplyIntoTranscript` 已退回 storage 内部实现，不再作为外部导出 helper 暴露
  - 对应 durable transcript 回归统一改走 `buildDurableConversationMessages`，外部 durable transcript 入口进一步收敛到单一 helper
  - 这一步不改外部语义，但继续减少外部需要理解的 legacy transcript helper 名字

- 已继续执行 `Phase 5` 的旧 helper 名字回收（基础 transcript wrapper 内聚）：
  - `mergePendingConversationIntoTranscript` 与 `mergeSettledLocalConversationTailIntoTranscript` 已退回 storage 内部实现，不再作为外部导出 helper 暴露
  - 对应 transcript 回归统一改走 `buildDurableConversationMessages`，外部 durable transcript 侧现在只保留单一显式入口
  - 这一步不改外部语义，但代表 durable transcript 这条线的 legacy helper 名字已基本完成外部收口

- 已继续执行 `Phase 5` 的 overlay/view 调用面收口（hydrated base helper 化）：
  - `chat-session-view` 不再在 `buildStabilizedHydratedConversationMessages` 里直接内联 local-tail merge 与 stabilize 编排
  - 新增本地 helper，把 “hydrated base messages” 与 “stabilized conversation” 两层责任拆开
  - 这一步不改外部语义，但让 overlay/view 这条线更接近 durable transcript 已完成的“显式入口 + 显式阶段”结构

- 已继续执行 `Phase 5` 的 overlay/view 调用面收口（pending merge helper 单点化）：
  - `chat-session-view` 不再在 settled/hydrated 两个 public helper 里分别直接调用 `mergePendingConversation`
  - 新增本地 helper，把 pending merge 这条 view 侧编排统一收成单一接触点
  - 这一步不改外部语义，但为后续继续收窄 view 层对 storage 旧 helper 名字的直接依赖做准备

- 已开始执行 `Phase 5` 的 overlay/view 名字迁移（pending overlay build 入口）：
  - `app-storage` 新增 `buildPendingConversationOverlayMessages`，作为 view/overlay 侧更明确的 pending merge 入口
  - `chat-session-view` 已改为依赖这个 `build*` helper，而不是继续直接绑定 `mergePendingConversation` 旧名字
  - 这一步不改外部语义，但开始把业务代码从 legacy merge helper 命名上脱开，为后续是否收回旧名字做准备

- 已继续执行 `Phase 5` 的 overlay/view 名字回收（pending overlay helper 内聚）：
  - `mergePendingConversation` 已退回 storage 内部实现，不再作为外部导出 helper 暴露
  - overlay 相关 storage 回归统一改走 `buildPendingConversationOverlayMessages`，业务代码与测试都不再直接绑定 `mergePendingConversation` 旧名字
  - 这一步不改外部语义，但代表 overlay/view 这条线也开始真正回收 legacy helper 名字

- 已继续执行 `Phase 5` 的 overlay/view 名字迁移（local-tail / stabilize build 入口）：
  - `app-storage` 新增 `buildHydratedConversationWithLocalTail` 与 `buildStabilizedHydratedConversationWithLocalState`
  - `chat-session-view` 已改为依赖这两个 `build*` helper，而不是继续直接绑定 `mergeSettledLocalConversationTailIntoView` / `stabilizeHydratedConversationWithLocalState`
  - 这一步不改外部语义，但让业务代码里剩余的 local-tail/hydrate 旧 helper 名字继续退场

- 已继续执行 `Phase 5` 的 overlay/view 名字回收（local-tail / stabilize helper 内聚）：
  - `mergeSettledLocalConversationTailIntoView` 与 `stabilizeHydratedConversationWithLocalState` 已退回 storage 内部实现，不再作为外部导出 helper 暴露
  - 相关 storage 回归统一改走 `buildHydratedConversationWithLocalTail` 与 `buildStabilizedHydratedConversationWithLocalState`
  - 这一步不改外部语义，但代表业务代码侧对 local-tail/hydrate legacy helper 名字的直接依赖已经基本清空

- 已继续执行 `Phase 5` 的 storage public API 收口（barrel 显式导出）：
  - `src/features/app/storage/index.ts` 已从 `export *` 收成显式 public API 列表
  - 这样 storage 层当前允许外部依赖的 helper 与常量被固定下来，后续不会再把新的内部 helper 顺手暴露出去
  - 这一步不改外部语义，但把 `Phase 5` 从“清理旧名字”进一步推进到了“固定公开边界”
  - 对测试侧补充约束：公开常量与正常 helper 默认继续走 barrel；只有像 `vi.spyOn` 这种依赖模块对象身份的场景，才保留对源模块的直接 import
  - 后续又进一步收掉了一批零外部消费的低层导出；但像 `extractUserPromptHistory` 这类仍被 `runtime` 调用面的 helper 继续保留在 public API，避免把“固定公开边界”误做成“误删仍在用的契约”
  - 继续把 `storageKey` / `pendingChatStorageKey` / `promptDraftStorageKey` / `promptHistoryStorageKey` / `chatScrollStorageKey` 这类只剩内部使用的 storage key 常量从 barrel 移出，相关 storage 自测改为直接依赖源模块，不再把这些低层持久化细节继续挂在业务层 public API 上
  - 再继续把 `buildDurableConversationMessages`、`buildHydratedConversationWithLocalTail`、`buildPendingConversationOverlayMessages`、`buildStabilizedHydratedConversationWithLocalState` 以及 authority/identity/local-tail 这组 low-level merge helper 从 barrel 移出；`runtime`、`background sync`、`chat-session-view` 和少量 controller/helper 改为直接依赖 `app-storage` 源模块，让 `storage/index.ts` 更接近真正的业务层 public API，而不是 storage 内部算法集合
  - 再继续把 controller / runtime / component 侧剩余的 storage barrel import 切到 `app-storage` 或 `use-app-persistence` 源模块；到这一步，`storage/index.ts` 的真实消费者已经基本只剩 `App` 和 `theme` 两类更高层入口，barrel 开始真正退回“外层 convenience API”而不是内部状态逻辑入口
  - 再继续把 `App` 与 `theme` 也切到源模块后，仓库内部对 `@/features/app/storage` 的 import 已经归零；`storage/index.ts` 现阶段保留为兼容入口，但已经不再承担内部实现依赖面
  - 再继续把 `legacyStorageKey`、`promptHistoryLimit`、`sanitizePendingChatTurnsMap`、`selectPersistedActiveMessages` 这类零外部消费导出退回 `app-storage` 内部实现，并顺手删掉已经彻底无人使用的 `defaultChatTabId` 常量；这一步没有改行为，只是继续压缩剩余的 legacy/export 面
  - 再继续把 `derivePendingEntryFromLocalMessages` 退回 `app-storage` 内部实现，并把对应直测改成走 `resolveRuntimePendingEntry` 的等价覆盖；这样 pending 推导这条链对外只保留一个更明确的入口
  - 再继续把 `createResetSessionUser` 收回 `use-command-center-reset` 内部实现，删除 `app-storage` 里的 helper 直测，并改由 `App` 级 reset 流程断言“第二次 runtime 请求使用 `command-center-reset-*` sessionUser”来承接这条语义；这一步让 reset session 命名规则不再依赖 storage helper 直测
  - 再继续把 `appendPromptHistory` 收回 `use-command-center` 本地实现，保留 `App` 级 prompt history 流程回归来承接语义；这样 prompt history 追加逻辑不再继续占用 `app-storage` 的 helper 导出面
  - 新增 `src/features/app/storage/storage-public-api-boundary.test.js`，把“仓库内部不再从 `@/features/app/storage` barrel 取内部实现”固化成一条架构回归；这样当前已经收出的 public/internal 边界不会在后续改动里被悄悄回退
  - 在 `src/features/app/storage/index.ts` 明确补上 “compatibility-only barrel” 注释，与上面的架构回归对应起来；这样当前边界不只体现在测试里，也直接体现在代码入口本身
  - 新增 `src/features/app/storage/storage-compatibility-api.test.js`，把 `storage/index.ts` 当前仅保留的兼容导出面锁成 contract；这样后续如果有人想重新把内部 helper re-export 回来，会直接在测试里暴露出来
  - 再继续把 `defaultUserLabel` 收回 `use-command-center` 本地常量；这样这个默认值不再继续占用 `app-storage` 的导出面，同时保留 `App` / controller 级回归兜住现有行为
  - 再继续把 `defaultTab`、`defaultChatFontSize`、`defaultComposerSendMode`、`defaultInspectorPanelWidth` 以及 `sanitizeUserLabel` / `sanitizeInspectorPanelWidth` 这组 UI 偏好默认值与 normalize 逻辑提到 `src/features/app/state/app-preferences.ts`；`app-storage` 改为消费该模块，`App` / `use-command-center` 也改走同一份 app-state helper，而 `storage/index.ts` 继续只把 inspector width 兼容导出桥接出来。这样这组语义不再继续挂在 storage 实现层上，同时保持现有 compatibility barrel contract 不变
  - 再继续把 `defaultSessionUser`、`createAgentTabId`、`createAgentSessionUser`、`createConversationKey` 这一组 session identity helper 提到 `src/features/app/state/app-session-identity.ts`；controller / runtime / chat-panel / app-session 改为直接依赖新的 app-state 模块，`app-storage` 改为反向消费它们。这样 session 身份语义不再继续挂在 storage 实现层上，同时把 `Phase 5` 从“storage public API 收口”继续推进到“storage 只保留真正的存储与 merge 语义”
  - 再继续把 `themeStorageKey` 与 `loadStoredTheme` 从 `app-storage` 挪到 `src/features/theme/theme-storage.ts`；`use-theme` 直接依赖 theme 自己的 storage 模块，而 `storage/index.ts` 继续桥接 re-export 维持 compatibility contract。这样 `app-storage` 又少了一组已经明显 feature-owned 的持久化语义，同时不破坏前面锁住的 `storage` 兼容导出面
  - 再继续把 `chatScrollStorageKey`、`loadStoredChatScrollTops`、`persistChatScrollTops` 以及对应 normalize/sanitize 逻辑从 `app-storage` 挪到 `src/features/app/state/app-chat-scroll-storage.ts`；`use-command-center` 与 source-level 自测改为直接依赖新的 app-state 模块。这样 `app-storage` 又少了一组纯 UI scroll 持久化细节，同时保持现有 `App` 级 scroll restore 回归不变
  - 再继续把 `promptHistoryStorageKey`、`promptDraftStorageKey`、`sanitizePromptHistoryMap`、`sanitizePromptDraftsMap`、`loadStoredPromptHistory`、`loadStoredPromptDrafts` 这一组 prompt 存储 helper 提到 `src/features/app/state/app-prompt-storage.ts`；`use-command-center` 改为直接读取新模块，`use-app-persistence` 也改为直接写入新模块，而 `app-storage` 仅继续反向消费 drafts sanitize 与 history limit。这样 prompt history / drafts 也从 `app-storage` 的职责里退出，只保留 feature-owned 持久化边界
  - 再继续把 `pendingChatStorageKey` 与 `loadPendingChatTurns` 从 `app-storage` 挪到 `src/features/app/state/app-pending-storage.ts`；`use-command-center` 与 source-level 自测改为直接读取新的 pending storage，而 `app-storage` 仅继续在 `persistUiStateSnapshot` 里反向消费 pending key 做写入。这样 `pending` 这组 feature-owned 持久化入口也从 `app-storage` 的公开职责里退出，只保留 prune / merge 这类更核心的 storage 语义
  - 再继续把 `cleanWrappedUserMessage` 与 `extractUserPromptHistory` 从 `app-storage` 挪到 `src/features/app/state/app-prompt-storage.ts`；`use-runtime-snapshot` 改为直接依赖新的 prompt 模块，而 `app-storage` 仅继续反向消费 user-message 清洗函数做 storage sanitize。这样 prompt 侧的“清洗 + 提取 + 持久化”语义进一步从 `app-storage` 里退出，只保留 storage 自己对该清洗函数的调用
  - 继续扫描剩余 `app-storage` 导出面后，当前保留下来的已只剩 `loadStoredState`、`persistUiStateSnapshot` 两项更纯的 storage I/O 契约。`sanitizeMessagesForStorage` 也已迁到 `chat/state` 的 persisted message 模块；`pruneCompletedPendingChatTurns` 已迁到 `app-state` 的 pending storage 模块；pending overlay / durable conversation 组装链同样已经迁到 `chat/state` 的 `chat-pending-conversation` 模块；其余 conversation dedupe / merge、settled-tail reuse、runtime pending resolution、authoritative pending assistant 判定也都已经迁到 `chat/state`。这意味着 `Phase 5` 在“把明显 feature-owned persistence 边界挪出 app-storage”这一目标上已经进入健康 stopping boundary；后续除非要改行为或改测试层，否则不再继续为了 internalize 而 internalize

- 已补 `App` 级 deferred-runtime 回归：
  - 新增 “runtime 还没返回时，旧 streaming assistant 文本仍可见，但不会恢复 busy/stop” 回归
  - 这样这轮 hydration live-flag demotion 不只停在 helper 级，而是直接覆盖到了真实启动路径上的 `storage -> hydration -> App` 组合

- 已补 pending-refresh 回归验证：
  - 继续验证 “IM pending 图片 turn 在 refresh 后仍能恢复” 这条高风险链路，确认 hydration transcript 收口后，进行中回合的用户图片、placeholder 和 busy 仍由 pending overlay 正常重建

- 已补回归：
  - 新增 `src/features/chat/state/chat-session-state.test.ts`
  - 新增 `src/features/chat/state/chat-session-view.test.ts`
  - 补了 `ChatPanel` 的 run-based regressions，覆盖“显式 run 覆盖脏 message flag”以及“消息已 settled 但 run 仍在流式时继续显示 busy/stop”
  - 补了 `App` / controller 级 regressions：
    - `src/App.test.jsx` 覆盖“刷新后只有脏 `pending` flag、但没有 tracked run 时，不再误显示 busy/stop”
    - `src/features/app/controllers/use-command-center.test.js` 覆盖“helper 层忽略孤立 stale pending flag”
    - `src/App.test.jsx` 继续覆盖 Phase 2 过渡层关键场景：
      - refresh 后 restored pending 仍能显示 placeholder / streaming preview
      - runtime 已经带回 assistant replies 时，不再重复插入 optimistic user 和 thinking placeholder
      - 无 pending 场景下，原有滚动恢复行为保持不变
  - 补了 `use-chat-controller` 的 Phase 2 regressions，覆盖：
    - optimistic pending turn 立即写入 `pendingChatTurns`，但不再预写 durable conversation
    - NDJSON streaming 期间增量只更新 overlay `streamText`
    - slash command / normal prompt 的 placeholder ownership
    - stop 时保留已收到的 partial assistant text
  - `src/features/chat/state/chat-session-view.test.ts` 新增“run 已停止后仍显示 settled assistant reply”回归
  - 新增 `src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`，覆盖“后台 IM tab runtime sync 只写 settled transcript，不再落 synthetic pending/streaming”
  - `src/features/session/runtime/use-runtime-snapshot.test.jsx` 已更新为新的 settled-only 断言，继续覆盖：
    - restored pending / IM synced user / lagging snapshot 等场景下 user 仍可见
    - pending / streaming assistant 不再写进 durable transcript
    - busy / recovery / clear-pending 判定保持原有行为
  - `src/features/app/storage/app-storage.test.js` 新增 `mergePendingConversationIntoTranscript` 回归，覆盖：
    - snapshot 缺少 pending user 时，会把 user 插回 assistant 之前
    - 不会顺手生成 synthetic thinking placeholder
  - `src/features/app/storage/app-storage.test.js` 继续新增 helper regressions，覆盖：
    - local live assistant 场景下可显式剥离当前 pending assistant match
    - stopped pending 场景下保留本地 stopped assistant，而不吃 runtime 后到的完整回复
  - `src/features/app/storage/app-storage.test.js` 继续新增 settled-reply helper 回归，覆盖“snapshot 仍滞后时保留本地 settled assistant”
  - `src/features/session/runtime/use-runtime-snapshot.test.jsx` 继续补回归，覆盖“本地 assistant 已有内容但未拿到 authoritative assistant id 时，durable transcript 保留 assistant、busy 仍保持 running”
  - `src/features/app/storage/app-storage.test.js` 新增 `mergeSettledLocalConversationTailIntoTranscript` 回归，覆盖“无 tracked pending 时，older-prefix snapshot 仍可补回本地 settled tail”
  - `src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx` 新增回归，覆盖“后台 no-pending tab 在 lagging snapshot 下仍保留 settled local tail”
  - `src/features/app/storage/app-storage.test.js` 新增 view/helper 回归，覆盖：
    - `mergeSettledLocalConversationTailIntoView`
    - `stabilizeHydratedConversationWithLocalState`
  - 现有 local-tail 回归继续覆盖两条拆开的内部规则：
    - matching assistant 前补回缺失 user
    - older-prefix snapshot 追加 local settled tail
  - 现有 storage / runtime / background 回归继续覆盖：删除 legacy helper 后，显式 view/transcript helper 行为保持不变
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 `buildHydratedConversationState` 后，active runtime snapshot 与 incremental conversation sync 的 hydration 行为保持一致
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 `buildDurableConversationState` 后，active runtime snapshot 与 incremental conversation sync 的 durable transcript 行为保持一致
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 `buildPendingMergeDecision` 后，active runtime snapshot 与 incremental conversation sync 的 pending clear / busy / settle 判定保持一致
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 `buildRuntimeConversationMergeState` 后，active runtime snapshot 与 incremental conversation sync 的整体 merge 骨架保持一致
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 `buildRuntimeConversationOutputs` 后，active runtime snapshot 与 incremental conversation sync 的 stabilized view / durable transcript / busy 输出保持一致
  - 现有 `use-runtime-snapshot` 回归继续覆盖：提取 recovered-pending settle / pending cleanup helper 后，active runtime snapshot 与 incremental conversation sync 的后处理保持一致
  - 现有 `use-runtime-snapshot` / `App` / controller 回归继续覆盖：提取 conversation-effects helper 后，active runtime snapshot 与 incremental conversation sync 的消息写回、busy、pending settle / cleanup、prompt history 写回保持一致
  - 新增 `use-runtime-snapshot` / `app-storage` 回归，覆盖“fresh reset session 遇到 empty idle snapshot 时，权威 transcript 不再默认补回旧的 settled local tail”
  - 现有 `App` reset 回归继续覆盖：普通初始化和 reset 后切 tab 场景下，旧消息不会因为这次 empty-snapshot 收窄被提前误清或错误回灌
  - 新增 `mergeConversationIdentity` 回归，覆盖“相同可见 turn 重复出现时，优先对齐时间更接近 snapshot 的本地消息，而不是总吃第一个重复项”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“matching assistant 来自明显更晚的 turn 时，不再误恢复更早的 trailing local user”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“older-prefix local tail 如果第一条追加消息在本地顺序上已经早于 prefix 尾巴，则不再继续补回”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“stale local tail 如果开头就是重复 user，也不再重复补回 user”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“older-prefix local tail 如果内部时间顺序已经倒退，则不再继续补回”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“很晚才再次出现的相同可见 turn，不再被误判成 overlap 而被吞掉”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“user turn 虽然文本相同，但一旦超出短 replay 窗口，就不再被当成 overlap 吞掉”
  - 新增 `mergeConversationIdentity` 回归，覆盖“重复可见 turn 存在时，local identity 匹配保持顺序单调，不再把 user / assistant 跨轮错配”
  - 新增 `mergeSettledLocalConversationTailIntoView` 回归，覆盖“matching assistant 已不在 snapshot 尾部时，不再恢复 trailing local user”
  - 新增 `mergePendingConversation` / `mergePendingConversationIntoTranscript` 回归，覆盖“authoritative snapshot 已经继续前进时，不再把 pending user 倒插回中段历史”
  - 新增 `mergePendingConversation` 回归，覆盖“snapshot 已出现后续 user turn 时，不再让 local streaming assistant 覆盖已越过的 authoritative 历史”
  - 新增 `mergeStoppedPendingConversationIntoTranscript` / `mergePendingConversationSettledReplyIntoTranscript` 回归，覆盖“snapshot 已越过当前 turn 时，不再把本地 stopped / settled assistant 追加回 transcript”
  - 新增 `hasAuthoritativePendingAssistantReply` 回归，覆盖“同一 pending 窗口里有多个 assistant 候选时，不再直接判成 authoritative final reply”
  - 新增 `hasAuthoritativePendingAssistantReply` 回归，覆盖“snapshot 已进入后续 user turn 时，更早那条 assistant 不再被当成当前 pending 的 authoritative final”

- 本轮验证：
  - 通过：`npm test -- src/features/chat/state/chat-session-state.test.ts src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.test.js`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js`
  - 通过：`npm test -- src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.test.js src/features/chat/state/chat-session-state.test.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/chat/controllers/use-chat-controller.test.jsx src/features/chat/state/chat-session-state.test.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/chat/state/chat-session-view.test.ts src/App.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.test.js src/features/chat/controllers/use-chat-controller.test.jsx src/features/chat/state/chat-session-state.test.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/App.tsx src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-helpers.ts src/features/chat/state/chat-session-state.ts src/features/chat/state/chat-session-reducer.ts src/features/chat/state/chat-session-state.test.ts src/features/session/runtime/use-stale-running-detector.ts`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js`
  - 通过：`npx eslint src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/chat/state/chat-session-state.ts src/features/chat/state/chat-session-reducer.ts src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-state.test.ts src/features/chat/state/chat-session-view.test.ts src/features/session/runtime/use-stale-running-detector.ts`
  - 通过：`npx eslint src/features/chat/controllers/chat-request-helpers.ts src/features/chat/controllers/chat-stream-helpers.ts src/features/chat/controllers/use-chat-controller.ts src/features/chat/controllers/use-chat-controller.test.jsx src/types/chat.ts src/features/chat/state/chat-session-state.ts`
  - 通过：`npx eslint src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts src/App.test.jsx`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/app/storage/use-app-persistence.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.test.js`
  - 通过：`npx eslint src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/use-app-persistence.test.jsx src/App.test.jsx -t "retires empty bootstrap attachment caches without starting hydration|reset|attachment hydration resolves after reset|does not restore cleared main-tab messages after reset when switching tabs|clears active messages on reset"`
  - 通过：`npx eslint src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx src/features/app/controllers/use-command-center-reset.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.test.js src/App.test.jsx -t "reset|attachment hydration resolves after reset|does not restore cleared main-tab messages after reset when switching tabs|clears active messages on reset|retires empty bootstrap attachment caches without starting hydration"`
  - 通过：`npx eslint src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/app/controllers/use-command-center-reset.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js -t "reset|switching tabs|refresh|pending|busy"`
  - 通过：`npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-reset.ts src/features/app/storage/app-storage.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.test.js src/App.test.jsx -t "reset|attachment hydration resolves after reset|does not restore cleared main-tab messages after reset when switching tabs|clears active messages on reset|retires empty bootstrap attachment caches without starting hydration"`
  - 通过：`npx eslint src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-reset.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/use-app-persistence.test.jsx src/App.test.jsx src/features/app/controllers/use-command-center.test.js -t "reset|attachment hydration resolves after reset|does not restore cleared main-tab messages after reset when switching tabs|clears active messages on reset|retires empty bootstrap attachment caches without starting hydration|pending|busy"`
  - 通过：`npx eslint src/features/app/storage/use-app-persistence.ts src/features/app/storage/use-app-persistence.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-reset.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/controllers/use-command-center.test.js src/App.test.jsx -t "buildInitialMessagesByTabId|refresh|reset|pending|busy"`
  - 通过：`npx eslint src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center.ts`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npm test`
  - 通过：`npx eslint src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/chat/controllers/chat-request-helpers.ts src/features/chat/controllers/chat-stream-helpers.ts src/features/chat/controllers/use-chat-controller.ts src/features/chat/controllers/use-chat-controller.test.jsx src/features/chat/state/chat-session-state.ts src/features/chat/state/chat-session-reducer.ts src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-state.test.ts src/features/chat/state/chat-session-view.test.ts src/features/session/runtime/use-stale-running-detector.ts src/components/command-center/chat-panel.tsx src/types/chat.ts`
  - 通过：`npx eslint src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts`
  - 通过：`npx eslint src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/chat/state/chat-session-view.ts`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npm test -- src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npm test -- src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.test.ts`
  - 通过：`npx eslint src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx`
  - 通过：`npx eslint src/App.test.jsx src/features/app/controllers/use-command-center.test.js src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-background-runtime-sync.test.jsx src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-helpers.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/app/storage/app-storage.ts src/features/app/storage/app-storage.test.js src/features/chat/state/chat-session-view.ts src/features/chat/state/chat-session-view.test.ts`
  - 历史记录（已于 2026-03-26 收敛并过期）：当时 `npm run typecheck -- --pretty false` 仍未通过，红灯主要分布在 `App.tsx`、`use-command-center-reset.ts`、`use-runtime-snapshot.ts`、`use-app-persistence.ts`、`chat-panel-attachments.tsx` 等类型边界；该状态后来已在本计划顶部记录的收尾轮次中重新拉绿

- 下一步建议：
  - 继续 Phase 2，但不再优先抽 `use-runtime-snapshot` 更外层的 session/debug 外壳；当前边界已经足够清晰，再往上抽的收益开始下降
  - 继续沿“authoritative transcript 替换策略”往下收，但下一刀优先看 no-pending、non-reset 场景里是否还存在“prefix 形状正确、但 local tail 本身已经不是当前轮最新尾巴”的情况，判断要不要引入更明确的 per-turn freshness 信号

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

当前边界判断：

- `storage/index.ts` 已退出仓库内部依赖面，只保留 compatibility-only barrel 角色
- 明显属于 feature-owned 的 persistence / identity / preferences / theme / prompt / scroll / pending 入口已迁出 `app-storage`
- `app-storage` 当前剩余导出已基本收敛为 core storage/merge contracts：
  - `loadStoredState`
  - `persistUiStateSnapshot`
  - `pruneCompletedPendingChatTurns`
  - `sanitizeMessagesForStorage`
  - `hasAuthoritativePendingAssistantReply`
  - `buildPendingConversationOverlayMessages`
  - `buildDurableConversationMessages`
- `shouldReuseSettledLocalConversationTail` 已迁到 `chat/state`，确认这类 settled-tail reuse policy 更适合作为 conversation/view 规则，而不是继续挂在 storage 导出面
- `storageKey` 已退回 `app-storage` 内部常量；实际 localStorage key 兼容保持不变，但不再继续作为 source-level helper API 暴露
- `collapseDuplicateConversationTurns` 已迁到 `chat/state` 的 conversation dedupe 模块，`app-storage` 只反向消费这条算法，不再继续拥有或暴露 replay-collapse helper
- `mergeConversationAttachments` 已迁到 `chat/state` 的 conversation merge 模块；`app-storage` 与 runtime/persistence 继续共享同一份 merge 规则，但不再把 attachment merge 暴露为 storage API
- `mergeConversationIdentity` 已迁到同一个 `chat/state` conversation merge 模块；`app-storage` 继续复用这条 identity merge 规则，但不再把它当作 storage API 暴露
- `buildHydratedConversationWithLocalTail` / `buildStabilizedHydratedConversationWithLocalState` 与同族 local-tail merge 规则已迁到 `chat/state` 的 settled conversation 模块；`app-storage` 只继续反向消费 durable transcript 版本，不再把 hydrated/view local-tail helper 暴露为 storage API
- `resolveRuntimePendingEntry` 与 `findPendingUserIndex` / `findSnapshotPendingAssistantIndex` / `hasSnapshotAdvancedPastPendingTurn` 这一组 runtime pending resolution helper 已迁到 `chat/state` 的 `chat-runtime-pending` 模块；controller/runtime/test 统一改为直接依赖新的 pending-state 入口，`app-storage` 不再继续暴露 runtime pending 解析 API
- `hasAuthoritativePendingAssistantReply` 与同族 authoritative pending assistant evaluation helper 也已迁到同一个 `chat-runtime-pending` 模块；runtime/background/view/controller 统一改为直接依赖新的 pending-state authority 入口，`app-storage` 只继续在内部反向复用这条判定
- `buildPendingConversationOverlayMessages` / `buildDurableConversationMessages` 与整组 pending conversation overlay / transcript merge helper 已迁到 `chat/state` 的 `chat-pending-conversation` 模块；view/runtime/background/test 统一改为直接依赖新的 pending conversation 入口，`app-storage` 不再继续暴露 pending conversation 组装 API
- `pruneCompletedPendingChatTurns` 已迁到 `app-state` 的 `app-pending-storage` 模块；hydration / persistence / source-level 测试统一改为直接依赖新的 pending storage 入口，`app-storage` 只继续在 `persistUiStateSnapshot` 里反向复用这条 prune 规则
- `sanitizePendingChatTurnsMap` 也已统一收回 `app-pending-storage`；`app-ui-state-storage` 不再保留第二份 pending sanitize 实现，而是直接复用 pending storage 模块的单一入口
- 新增 `app-pending-storage-core-api.test.js`，锁住 `app-pending-storage` 当前只暴露 pending key、load、sanitize、prune 这组集中后的 pending storage 契约
- `sanitizeMessagesForStorage` 已迁到 `chat/state` 的 `chat-persisted-messages` 模块；storage / persistence / source-level 测试统一改为直接依赖新的 persisted message sanitize 入口，`app-storage` 只继续反向复用这条消息裁剪规则
- `loadStoredState` / `persistUiStateSnapshot` 的实际实现已迁到 `app-storage` 同目录下的 `app-ui-state-storage` 模块；controller / persistence / source-level 测试统一改为直接依赖新的 UI state storage 实现，而 `app-storage.ts` 自身退回 compatibility-only shell
- 新增 `app-session-identity.test.js`，把 `parseStoredConversationKey` / `normalizeStoredConversationKey` 的 stored conversation key contract 直接锁成 source-level 回归，不再只靠 storage 集成回归间接覆盖
- 这条边界现在已有 source-level contract test 锁定，避免后续又把 feature-owned helper 重新暴露到 `app-storage` 导出面
- 新增 `app-storage-implementation-boundary.test.js`，锁住仓库内部模块不再直接依赖 `app-storage.ts` 这个 compatibility shell
- 新增 `app-ui-state-storage-core-api.test.js`，锁住 `app-ui-state-storage` 自身只暴露 UI state 的读/写实现入口，避免后续又把内部 sanitize/helper 顺手挂回实现模块导出面
- 新增 `app-storage-shell-compatibility.test.js`，锁住 `app-storage.ts` 这个 compatibility shell 与 `app-ui-state-storage` 的两项导出保持逐项同一引用，避免 shell 和实现层意外漂开
- 在没有新的行为目标前，继续 internalize 这批 helper 的收益已明显下降；后续若再动，默认视为核心 storage/merge 契约调整，而不是 Phase 5 的机械收口

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
- 当剩余导出已主要是 core storage/merge contracts 时，可以把 Phase 5 视为到达健康 stopping boundary，而不是继续做低收益 internalize

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
