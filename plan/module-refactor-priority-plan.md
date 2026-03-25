# LalaClaw 模块拆分优先级计划

Last updated: 2026-03-25

## 目标

在不打断当前功能迭代和发布节奏的前提下，逐步降低前端主编排层和重型面板模块的复杂度，把“目录上看起来已模块化、实际仍集中在少数巨型文件里”的问题拆开。

这份计划聚焦的是：

- 模块职责边界是否合理
- 哪些文件应该优先拆
- 每一轮拆分应控制到什么粒度
- 如何避免“为了拆而拆”带来新的状态回归

不直接覆盖的内容：

- 新功能 roadmap
- `/api/chat` 传输协议重构
- OpenClaw 运维能力扩张
- TypeScript 严格模式推进本身

## 当前判断

仓库当前的主要结构问题，不是“完全没分模块”，而是“目录级分层已存在，但核心编排文件仍然过重”。

当前最突出的重量级文件包括：

- `src/features/app/controllers/use-command-center.ts`
- `src/components/command-center/chat-panel.tsx`
- `src/components/command-center/inspector-panel.tsx`
- `src/App.tsx`

这些文件的问题不是单纯“行数大”，而是同时承担了过多职责，例如：

- 页面级编排
- session / tab 身份映射
- runtime snapshot 合并
- 持久化恢复
- OpenClaw environment / onboarding / update UI
- 文件预览、上下文预览、剪贴板、overlay 等交互编排

## 优先级原则

默认按以下原则决定先拆谁：

1. 先拆“跨域编排中心”，再拆“渲染很重但边界清楚的 UI 大组件”。
2. 先拆“状态/身份/持久化”交汇处，再拆纯展示区域。
3. 优先选择可以在不改变对外 props 的情况下完成第一轮减重的文件。
4. 每一轮拆分都必须保留现有测试层，尤其是 `App` 级和控制器级回归。
5. 不把“迁移到 TS”与“模块拆分”混成一个大任务；除非某个提取步骤天然需要补类型。

## 优先级列表

### P0: `use-command-center`

目标文件：

- `src/features/app/controllers/use-command-center.ts`

为什么排第一：

- 它是当前前端页面状态的总编排中心。
- 同时连接 `app/storage`、`chat/controllers`、`session/runtime`、IM session identity、theme、i18n、debug 等多个域。
- 后续拆 `App.tsx`、`chat-panel.tsx`、`inspector-panel.tsx` 时，几乎都会被它阻塞。

当前主要不合理点：

- 一个 hook 内同时处理 hydration、tab lifecycle、runtime merge、pending 恢复、session file rewrite、IM bootstrap 映射、UI snapshot 持久化。
- 很多 helper 虽然已经外提，但域边界还不清，仍由单一 hook 直接掌控。
- 它既像 controller，又像 state reducer，又像 integration adapter。

建议拆分方向：

- `app/controllers/use-command-center-tab-state.ts`
  处理 tab 创建、激活、关闭、重排、tab meta。
- `app/controllers/use-command-center-hydration.ts`
  处理 local persistence 恢复、prompt draft、scroll、pending 恢复。
- `app/controllers/use-command-center-runtime-sync.ts`
  处理 runtime snapshot 合并、conversation identity merge、runtime files merge。
- `app/controllers/use-command-center-im-session.ts`
  处理 IM bootstrap、resolved session、runtime anchor 映射。
- `app/controllers/use-command-center-ui-persistence.ts`
  处理 UI 状态落盘、rehydrate 后的同步。

第一轮退出标准：

- `use-command-center.ts` 不再直接包含大段 hydration + runtime merge + IM session mapping 细节。
- 主文件更像组合器，而不是实现细节容器。
- 相关 `App` / controller 级测试继续覆盖原行为。

### P1: `App.tsx`

目标文件：

- `src/App.tsx`

为什么排第二：

- 它虽然已经把大量业务逻辑下沉到 controller，但自身仍保留了太多页面级交互状态和 dev-only 逻辑。
- 只有在 `use-command-center` 先减重之后，`App.tsx` 才能继续明显变薄。

当前主要不合理点：

- 同时承担页面壳、overlay、inspector resize、dev worktree badge、restart / branch / worktree 交互。
- dev workspace badge 这类开发态能力与主产品 UI 混在同一个根组件里。

建议拆分方向：

- `src/components/app-shell/app-shell.tsx`
  承载主布局、panel split、overlay 插槽。
- `src/components/app-shell/dev-workspace-badge.tsx`
  承载 dev worktree badge 和相关交互。
- `src/components/app-shell/model-switch-overlay.tsx`
- `src/components/app-shell/agent-switch-overlay.tsx`
- `src/components/app-shell/inspector-resize-handle.tsx`

第一轮退出标准：

- `App.tsx` 主要负责组合 `useCommandCenter()` 输出与 page shell。
- dev-only 逻辑和 overlay 渲染从根文件移出。

### P2: `inspector-panel`

目标文件：

- `src/components/command-center/inspector-panel.tsx`
- `src/features/app/controllers/use-openclaw-inspector.ts`

为什么排第三：

- 当前 Inspector 已经拆出很多 helper，但主 panel 仍是一个高耦合总入口。
- OpenClaw environment / onboarding / config / history / update 在同一个 panel 根组件里汇合，回归面非常大。
- 这部分属于高风险区域，必须在 `use-command-center` 和 `App` 稳定后，以更保守的方式拆。

当前主要不合理点：

- `inspector-panel.tsx` 既负责 tab 容器，又直接负责 OpenClaw environment 细节、文件树、timeline、clipboard、preview 协调。
- `use-openclaw-inspector.ts` 已承担部分 domain controller 角色，但和面板层之间边界仍偏宽。

建议拆分方向：

- `command-center/inspector-tabs-shell.tsx`
  管理 tabs 外壳和共享状态。
- `command-center/inspector-environment-panel.tsx`
  聚焦 environment / OpenClaw / LalaClaw update 面板。
- `command-center/inspector-artifacts-panel.tsx`
- `command-center/inspector-files-root.tsx`
  聚焦 files tab 根入口，而不是散落在多个 file section / utils 之间。
- `features/app/controllers/openclaw-inspector/`
  将 `use-openclaw-inspector.ts` 周边 helper 整理成更清晰的子模块目录。

第一轮退出标准：

- `inspector-panel.tsx` 不再直接承载所有 tab 的实现细节。
- OpenClaw environment 逻辑具备独立入口文件，便于单独测与单独 review。

### P3: `chat-panel`

目标文件：

- `src/components/command-center/chat-panel.tsx`

为什么排第四：

- 它很大，但边界相对比 `use-command-center` 更清楚，属于“重型 UI 容器”问题。
- 等前面的状态编排层更稳定后，拆它的风险更可控。

当前主要不合理点：

- 同时承载 tabs strip、composer、message list、message bubble、outline、jump controls、attachment/image preview、drag/reorder。
- 有大量 UI 级局部状态和长 props surface 混在一个文件里。

建议拆分方向：

- `command-center/chat-tabs-strip.tsx`
- `command-center/chat-composer.tsx`
- `command-center/chat-message-list.tsx`
- `command-center/chat-message-bubble.tsx`
- `command-center/chat-outline-panel.tsx`
- `command-center/chat-preview-overlays.tsx`

第一轮退出标准：

- `chat-panel.tsx` 主要保留容器编排和共享滚动/焦点桥接。
- 气泡渲染、composer、tabs strip 至少拆出两个以上独立模块。

### P4: 测试与辅助模块整理

目标区域：

- `src/**/*.test.jsx`
- `src/**/*.test.js`
- `server/**/*.test.js`
- `test/*.js`

为什么排第五：

- 这不是最先要动的地方，但它决定了后续拆分成本。
- 当前测试分布在 `src/`、`server/`、`test/` 三处，格式也混用 `js/jsx`，不利于长期维护和“哪一层该测什么”的判断。

建议方向：

- 先不急着统一全部迁移为 TS。
- 先明确分层：
  - 组件/UI 测试留在 `src/`
  - 服务/路由级测试留在 `server/` 或统一收敛到 `test/server/`
  - 脚本/集成/CLI 测试留在 `test/`
- 清理重复覆盖或命名不一致的测试入口。

第一轮退出标准：

- 测试目录职责边界写清楚并落到文档。
- 新增测试不再继续扩大混乱分布。

## 暂不优先处理

这些问题是存在的，但默认不放在第一轮模块拆分里：

- `src/locales/*.js` 迁移到 TS
- `scripts/*.cjs` 迁移
- `.server-build/` 的存在形式
- 更激进的 backend `server/services/*` 再次细拆

原因：

- 它们对“当前前端主编排层过重”的缓解帮助有限。
- 其中一些更像工程规范或构建策略问题，而不是当前最影响维护效率的模块边界问题。

## 建议执行顺序

建议按以下顺序推进：

1. `use-command-center` 减重
2. `App.tsx` 壳层减重
3. `inspector-panel` 与 `use-openclaw-inspector` 边界收紧
4. `chat-panel` 拆分
5. 测试结构整理

如果中途出现高风险回归，优先停在当前阶段补测试，不继续顺手推进下一阶段。

## 验证要求

模块拆分默认不是“纯重命名”；每一轮都要按受影响层级补验证。

最低要求：

- 受影响模块测试
- 至少一次 `npm test`，当改动跨 controller / App / inspector / chat 主链路时

高风险区域额外要求：

- 若涉及 `use-command-center`、runtime sync、pending 恢复、hydration：必须优先看 `App` 级或 controller 级回归
- 若涉及 Inspector / OpenClaw：优先补 `inspector-panel` 或 `use-openclaw-inspector` 相关回归
- 若涉及 chat 面板的滚动、focus、preview overlay：优先补组件级和 `App` 级交互回归

## 与 TypeScript 现状的关系

这份计划不把“模块拆分”与“TS 改造”混为一谈。

当前仓库的运行时代码实际上已经基本完成 TS/TSX 化；仓库里仍显得 JavaScript 比例偏高，主要来自：

- `src/locales/*.js`
- 前后端测试的 `.js/.jsx`
- `scripts/*.cjs`
- `.server-build/` 与 `dist/` 等生成产物

因此，这份计划默认不把“降低 JS 百分比”当作第一目标，而把“降低核心模块复杂度”放在第一位。

## 当前状态

- 状态：In progress
- 本轮已完成：
  - 仓库结构盘点
  - 重型模块识别
  - 优先级排序
  - `use-command-center.ts` 第一轮 helper 外提，已将一批稳定的 tab / identity / scroll 纯函数移入 `use-command-center-helpers.ts`
  - `use-command-center.ts` 第二轮 hydration 外提，已将初始化 / pending 恢复 / 初始消息与 session 组装逻辑移入 `use-command-center-hydration.ts`
  - `use-command-center.ts` 第三轮 UI state 外提，已将 prompt 高度、draft flush、conversation scroll 持久化等交互状态逻辑移入 `use-command-center-ui-state.ts`
  - `use-command-center.ts` 第四轮 tab state 外提，已将 tab 级消息、busy、meta、session、identity 更新逻辑移入 `use-command-center-tab-state.ts`
  - `use-command-center.ts` 第五轮 IM session 外提，已将 resolved session 回写与发送前 IM bootstrap session 解析逻辑移入 `use-command-center-im-session.ts`
  - `use-command-center.ts` 第六轮 send target 外提，已将发送前 target tab / agent / session / model / mode 解析逻辑移入 `use-command-center-send-target.ts`
  - `use-command-center.ts` 第七轮 background runtime sync 外提，已将后台 IM tab 的 runtime 同步 effect 移入 `use-command-center-background-runtime-sync.ts`
  - `use-command-center.ts` 第八轮 tab navigation 外提，已将 tab 激活、按序切换、关闭、重排逻辑移入 `use-command-center-tab-navigation.ts`
  - `use-command-center.ts` 第九轮 session selection 外提，已将 agent tab 打开、session 搜索、搜索结果选中、IM tab 打开逻辑移入 `use-command-center-session-selection.ts`
  - `use-command-center.ts` 第十轮 session actions 外提，已将 session update、agent/model/fastMode/thinkMode 切换逻辑移入 `use-command-center-session-actions.ts`
  - `use-command-center.ts` 第十一轮 environment/actions 外提，已将 artifact 选中、environment refresh、workspace files open、session files tracking 逻辑移入 `use-command-center-environment-actions.ts`
  - `use-command-center.ts` 第十二轮 reset 外提，已将 reset 流程与 IM `/reset` 分流、tab remap、snapshot 落盘逻辑移入 `use-command-center-reset.ts`
- 当前阶段目标：
  - 继续保持 `use-command-center.ts` 主文件以编排为主
  - 在 `use-command-center.ts` 继续保持“组合器优先”的前提下，开始推进 `App.tsx` 壳层减重
  - 优先外提 `App.tsx` 中边界稳定的壳层组件，例如 dev workspace badge、switch overlay、session notice
  - 对全量测试中出现过的 suite 级波动保持留意，避免把偶发超时误判为本轮结构回归
- 最近验证：
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-helpers.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-tab-navigation.ts src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-session-selection.ts src/features/app/controllers/use-command-center-tab-navigation.ts src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-session-actions.ts src/features/app/controllers/use-command-center-session-selection.ts src/features/app/controllers/use-command-center-tab-navigation.ts src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-environment-actions.ts src/features/app/controllers/use-command-center-session-actions.ts src/features/app/controllers/use-command-center-session-selection.ts src/features/app/controllers/use-command-center-tab-navigation.ts src/features/app/controllers/use-command-center-background-runtime-sync.ts src/features/app/controllers/use-command-center-im-session.ts src/features/app/controllers/use-command-center-send-target.ts src/features/app/controllers/use-command-center-tab-state.ts src/features/app/controllers/use-command-center-helpers.ts src/features/app/controllers/use-command-center-hydration.ts src/features/app/controllers/use-command-center-ui-state.ts`
  - `npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-reset.ts`
  - `npx vitest run src/features/app/controllers/use-command-center.test.js`
  - `npx vitest run src/App.test.jsx`
  - `npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx`
  - `npm test`
  - `npx eslint src/App.tsx src/components/app-shell/dev-workspace-badge.tsx src/components/app-shell/dev-workspace-info.ts src/components/app-shell/session-overlays.tsx`

## 更新记录

### 2026-03-24

- 新建本计划文档。
- 基于当前仓库结构盘点结果，确认第一优先级是 `use-command-center.ts`，第二优先级是 `App.tsx`，第三优先级是 Inspector，第四优先级是 Chat Panel。
- 明确说明：JavaScript 占比偏高主要来自测试、locale、脚本和生成产物，而不是运行时代码仍大量停留在 JS。
- 开始执行 P0 第一轮减重：将 `use-command-center.ts` 内一批稳定的纯函数与 tab/identity/scroll helper 外提到 `use-command-center-helpers.ts`，降低主文件体积并保持行为不变。
- 完成 P0 第一轮基础验证：`use-command-center` 与 `App` 相关回归均通过，确认这次 helper 外提未引入行为变化。
- 继续执行 P0 第二轮减重：将启动时的 hydration / pending 恢复 / 初始 session 与消息组装逻辑外提到 `use-command-center-hydration.ts`。
- 完成 P0 第二轮基础验证：新增 hydration helper 后，controller lint、`use-command-center` 测试和 `App` 级回归仍全部通过。
- 继续执行 P0 第三轮减重：将 prompt 高度调整、draft flush、conversation scroll 持久化等 UI state 逻辑外提到 `use-command-center-ui-state.ts`。
- 完成 P0 第三轮基础验证：controller lint、`use-command-center` 测试、`App` 级回归和一次全量 `npm test` 均通过；`use-command-center.ts` 主文件进一步降到约 2829 行。
- 继续执行 P0 第四轮减重：将 tab 级消息、busy、meta、session、identity 更新逻辑外提到 `use-command-center-tab-state.ts`，让主控制器进一步收敛为编排入口。
- 完成 P0 第四轮基础验证：新增 `tab state` 模块后，controller lint、`use-command-center` 测试、`App` 级回归均通过；`use-command-center.ts` 主文件进一步降到约 2691 行。
- 本轮第一次全量 `npm test` 出现 6 个 suite 级失败，但将失败文件组合复跑后全部通过，随后再次执行全量 `npm test` 也恢复全绿，当前更接近套件级波动而非结构回归。
- 继续执行 P0 第五轮减重：将 resolved IM session 回写和发送前 bootstrap IM session 解析逻辑移入 `use-command-center-im-session.ts`，减少主控制器里的跨 runtime / session-search 细节。
- 完成 P0 第五轮基础验证：controller lint、`use-command-center` 测试、`App` 级回归、3 文件高信号组合回归均通过；第一次全量 `npm test` 出现 7 个 suite 级失败，但同批高信号文件此前已通过组合复跑，随后再次执行全量 `npm test` 恢复全绿。
- 继续执行 P0 第六轮减重：将发送前 target tab / agent / session / model / mode 解析提取到 `use-command-center-send-target.ts`，消除主控制器中两段重复的发送目标推导逻辑。
- 完成 P0 第六轮基础验证：controller lint、`use-command-center` 测试、`App` 级回归、3 文件高信号组合回归和一次全量 `npm test` 均通过；`use-command-center.ts` 主文件进一步降到约 2553 行。
- 继续执行 P0 第七轮减重：将后台 IM tab 的 runtime 同步 effect 提取到 `use-command-center-background-runtime-sync.ts`，把后台轮询 / snapshot 合并 / busy 状态更新从主控制器主体剥离。
- 完成 P0 第七轮基础验证：controller lint、`use-command-center` 测试、3 文件高信号组合回归和一次全量 `npm test` 均通过；`use-command-center.ts` 主文件进一步降到约 2323 行。
- 继续执行 P0 第八轮减重：将 tab 激活、按序切换、关闭、重排逻辑提取到 `use-command-center-tab-navigation.ts`，继续把 tab UI 编排从主控制器主体剥离。
- 完成 P0 第八轮基础验证：controller lint、`use-command-center` 测试、3 文件高信号组合回归均通过；`use-command-center.ts` 主文件进一步降到约 2216 行。
- 本轮连续两次全量 `npm test` 都在同一类高耗时文件上失败，仍集中于 `src/App.test.jsx`、`src/components/command-center/chat-panel.test.jsx`、`src/components/command-center/inspector-panel.test.jsx` 的 suite 级超时/交互等待问题；但对应 3 文件组合回归继续通过，当前更像整套并发下的稳定性问题，而不是本轮 tab navigation 外提直接引入的功能回归。
- 继续执行 P0 第九轮减重：将 agent tab 打开、session 搜索、搜索结果选中、IM tab 打开逻辑提取到 `use-command-center-session-selection.ts`，继续把会话路由与创建编排从主控制器主体剥离。
- 完成 P0 第九轮基础验证：controller lint、`use-command-center` 测试、3 文件高信号组合回归和一次全量 `npm test` 均通过；`use-command-center.ts` 主文件进一步降到约 1971 行。
- 继续执行 P0 第十轮减重：将 session update、agent/model/fastMode/thinkMode 切换逻辑提取到 `use-command-center-session-actions.ts`，继续把会话状态动作从主控制器主体剥离。
- 完成 P0 第十轮基础验证：controller lint、`use-command-center` 测试、3 文件高信号组合回归和一次全量 `npm test` 均通过；`use-command-center.ts` 主文件进一步降到约 1866 行。
- 继续执行 P0 第十一轮减重：将 artifact 选中、environment refresh、workspace files open、session files tracking 逻辑提取到 `use-command-center-environment-actions.ts`，继续把环境侧动作从主控制器主体剥离。
- 完成 P0 第十一轮基础验证：controller lint、`use-command-center` 测试、3 文件高信号组合回归均通过；`use-command-center.ts` 主文件进一步降到约 1826 行。
- 本轮执行全量 `npm test` 时，仓库里的另一条工作线触发了后端侧失败，当前失败集中在 `test/server.test.js` 与 `server/services/dashboard.test.js`，并且报错内容都指向 transcript/dashboard 相关时间戳断言，不属于本轮 `use-command-center` 前端重构直接覆盖的区域。因此当前判断是：本轮前端高信号回归已通过，但整仓全量绿灯暂时被现有的 transcript/dashboard 改动阻塞。

### 2026-03-25

- 继续执行 P0 第十二轮减重：将 `handleReset` 相关逻辑提取到 `use-command-center-reset.ts`，把 IM `/reset` 快路径、普通 reset 的 sessionUser 重建、IM tab remap、snapshot 落盘和 runtime reload 从主控制器主体剥离。
- 完成 P0 第十二轮高信号验证：`npx eslint src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-reset.ts`、`npx vitest run src/features/app/controllers/use-command-center.test.js`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮重新执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与 `use-command-center` 的 reset 模块拆分无直接重叠，当前判断仍是仓库中另一条后端改动线阻塞了整仓全绿。
- 本轮后 `use-command-center.ts` 主文件进一步降到约 1622 行，已经明显更接近组合器角色；下一步应优先判断 P0 是否可以收口并转入 `App.tsx` 壳层减重，而不是继续在同一控制器里做收益递减的细碎拆分。
- 开始执行 P1 第一轮减重：将 `App.tsx` 中边界较稳定的壳层组件移入 `src/components/app-shell/`，新增 `dev-workspace-badge.tsx`、`dev-workspace-info.ts`、`session-overlays.tsx`，把 dev workspace badge、agent/model switching overlay、session notice 从根文件中抽离。
- 完成 P1 第一轮高信号验证：`npx eslint src/App.tsx src/components/app-shell/dev-workspace-badge.tsx src/components/app-shell/dev-workspace-info.ts src/components/app-shell/session-overlays.tsx`、`npx vitest run src/App.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `App.tsx` 壳层搬迁无直接重叠。
- 本轮后 `App.tsx` 主文件降到约 1168 行，P1 第一刀已经证明“壳层组件外提”风险可控；下一步可以继续评估是否把 split layout/resize shell 再抽一层，或开始清理 `SessionOverview` 相关重复组合。
- 继续执行 P1 第二轮减重：新增 `app-split-layout.tsx` 与 `settings-trigger.tsx`，把 `App.tsx` 中的 split layout 渲染壳、resize handle UI、设置入口按钮再外提一层，继续把根文件收敛到组合器角色。
- 完成 P1 第二轮高信号验证：`npx eslint src/App.tsx src/components/app-shell/app-split-layout.tsx src/components/app-shell/settings-trigger.tsx src/components/app-shell/dev-workspace-badge.tsx src/components/app-shell/dev-workspace-info.ts src/components/app-shell/session-overlays.tsx`、`npx vitest run src/App.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `App.tsx` layout shell 外提无直接重叠。
- 本轮后 `App.tsx` 主文件进一步降到约 1126 行；下一步可以在 P1 中继续考虑 `SessionOverview` 的重复组装是否值得抽成共享构造层，或者转入更保守的 `inspector-panel` 减重前准备。
- 继续执行 P1 第三轮减重：新增 `use-app-session-overviews.tsx`，将 `App.tsx` 中四段重复的 `SessionOverview` 组装统一收敛到一个共享 hook，减少根组件里重复的 overview props 编排。
- 完成 P1 第三轮高信号验证：`npx eslint src/App.tsx src/components/app-shell/use-app-session-overviews.tsx src/components/app-shell/app-split-layout.tsx src/components/app-shell/settings-trigger.tsx src/components/app-shell/dev-workspace-badge.tsx src/components/app-shell/dev-workspace-info.ts src/components/app-shell/session-overlays.tsx`、`npx vitest run src/App.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `SessionOverview` 共享组装收口无直接重叠。
- 本轮后 `App.tsx` 主文件进一步降到约 913 行；P1 已经从“搬出壳层组件”推进到“压缩根组件重复编排”。下一步可以考虑是否就此收口 P1，或只再做一轮 very-light 的 layout/controller glue 清理后转入 `inspector-panel` 减重准备。
- 开始执行 P2 第一轮减重：新增 `inspector-panel-openclaw-panels.tsx`，将 `LalaClawPanel` 与 `OpenClawManagementPanel` 从 `inspector-panel.tsx` 主文件中拆出，同时保留 `LalaClawPanel` 的原有导出面，避免影响 `SettingsDialog` 等现有依赖。
- 完成 P2 第一轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `inspector-panel` 模块拆分无直接重叠。
- 本轮后 `inspector-panel.tsx` 主文件降到约 3898 行，P2 已经开始把 environment/OpenClaw 区域从“一个超大文件”往“主文件 + 独立面板模块”推进。下一步可继续沿着 OpenClaw 子面板拆分，或转去 files / dialogs 这类更独立的 UI 壳层。
- 继续执行 P2 第二轮减重：新增 `inspector-panel-openclaw-update.tsx`，将 `OpenClawUpdatePanel` 从 `inspector-panel.tsx` 主文件中拆出，保留 update/troubleshooting 交互的既有 props 面与行为。
- 完成 P2 第二轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/settings-dialog.tsx` 通过；`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx`、`npx vitest run src/components/command-center/chat-panel.test.jsx` 均分别通过。
- P2 第二轮过程中，曾出现过 `inspector-panel` / `chat-panel` / `App` 组合回归的 suite 级波动，但将失败用例与受影响文件串行复跑后全部通过；当前判断更接近前端高耗时套件在并发下的抖动，而不是 `OpenClawUpdatePanel` 拆分引入的稳定性回归。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 3629 行，说明 OpenClaw update 区域已成功从主文件中剥离。
- 继续执行 P2 第三轮减重：新增 `inspector-panel-openclaw-config.tsx`，将 `OpenClawConfigPanel` 从 `inspector-panel.tsx` 主文件中拆出，把 config 表单、remote 授权确认、validation/backup/result 展示逻辑收敛到独立模块。
- 完成 P2 第三轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `OpenClawConfigPanel` 拆分无直接重叠。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 3271 行，P2 已经把 OpenClaw 的 management / update / config 三块都从主文件中分离；下一步适合继续沿着 `OpenClawOnboardingPanel` 或 remote operations / dialogs 方向收缩主文件职责。
- 继续执行 P2 第四轮减重：新增 `inspector-panel-openclaw-onboarding.tsx`，将 `OpenClawOnboardingPanel` 与其 capability/auth/daemon/gateway 表单编排从 `inspector-panel.tsx` 主文件中拆出，把 onboarding UI 收敛到独立模块。
- 完成 P2 第四轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；与本轮 `OpenClawOnboardingPanel` 拆分无直接重叠。当前失败用例仍是 replay/transcript timestamp 保留策略相关断言，不属于 `inspector-panel` UI 模块拆分覆盖的区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 2588 行，P2 已经把 OpenClaw 的 management / update / config / onboarding 四块都从主文件中拆离。下一步更适合继续沿着 remote operations / confirm dialogs / environment summary blocks 做第五轮减重，而不是回到已拆出的 onboarding 细部。
- 继续执行 P2 第五轮减重：新增 `inspector-panel-openclaw-operations.tsx`，将 `OpenClawOperationHistoryPanel`、`OpenClawRemoteRecoveryDialog`、`OpenClawRollbackConfirmDialog`、`OpenClawManagementConfirmDialog` 从 `inspector-panel.tsx` 主文件中整组拆出，把 remote operations 历史面板与确认对话框集中到独立模块。
- 完成 P2 第五轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；失败形态与前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于 `inspector-panel` 的 UI 模块拆分覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 2230 行，P2 已经把 OpenClaw 的 management / update / config / onboarding / remote operations 五块都从主文件中剥离。下一步更适合继续沿着 `EnvironmentTab` 内的 summary/diagnostics block 或 `OpenClawUpdateTroubleshootingDialog` / rename dialogs 这类剩余壳层做第六轮减重。
- 继续执行 P2 第六轮减重：新增 `inspector-panel-environment-sections.tsx`，将 `EnvironmentTab` 中 OpenClaw diagnostics 列表和常规 environment item 列表渲染从 `inspector-panel.tsx` 主文件中拆出，把 diagnostics/environment 展示壳收敛到独立模块。
- 完成 P2 第六轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；失败形态和前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于本轮 `EnvironmentTab` 纯展示模块拆分覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 2130 行，P2 已经把 OpenClaw flows、remote operations、diagnostics/environment 列表渲染都从主文件中剥离。下一步更适合继续沿着 `OpenClawUpdateTroubleshootingDialog`、rename dialogs、或 `EnvironmentTab` 剩余 flow section 编排做第七轮减重。
- 继续执行 P2 第七轮减重：新增 `inspector-panel-dialogs.tsx`，将 `RenameDialog`、`RenameExtensionConfirmDialog`、`OpenClawUpdateTroubleshootingDialog` 从 `inspector-panel.tsx` 主文件中拆出，把通用 rename / troubleshooting dialogs 收敛到独立模块。
- 完成 P2 第七轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；失败形态与前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于本轮 dialogs 壳层拆分覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1953 行，P2 已经把 OpenClaw flows、remote operations、environment 列表展示和主要 dialogs 都从主文件中剥离。下一步更适合继续沿着 `EnvironmentTab` 剩余 flow section 编排，或者把 `FilesTab` 的 rename/context-menu/glue 再收一层做第八轮减重。
- 继续执行 P2 第八轮减重：新增 `inspector-panel-files-overlays.tsx`，将 `FilesTab` 末尾的 `FileContextMenu`、rename dialog 挂载、rename extension confirm 挂载从 `inspector-panel.tsx` 主文件中拆出，把 files overlay/render glue 收敛到独立模块。
- 完成 P2 第八轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-files-overlays.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；失败形态与前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于本轮 `FilesTab` overlay/render glue 拆分覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1931 行，P2 已经把 FilesTab 的 overlay/render glue 也从主文件中剥离。下一步更适合继续沿着 `FilesTab` 剩余 rename/paste/context-menu 逻辑动作层，或者 `EnvironmentTab` 剩余 flow section 编排，做第九轮减重。
- 继续执行 P2 第九轮减重：新增 `inspector-panel-file-actions.ts`，将 `requestWorkspaceTree`、rename 状态类型、rename dialog state 构造、rename 提交流程从 `inspector-panel.tsx` 主文件中拆出，把 `FilesTab` 的 rename 动作层收敛到独立模块。
- 完成 P2 第九轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-file-actions.ts src/components/command-center/inspector-panel-files-overlays.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个失败；失败形态与前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于本轮 `FilesTab` rename 动作层拆分覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1823 行，P2 已经把 `FilesTab` 的 overlay/render glue 与 rename 动作层都从主文件中剥离。下一步更适合继续沿着 `FilesTab` 的 paste/context-menu 逻辑动作层，或者转回 `EnvironmentTab` 剩余 flow section 编排，做第十轮减重。
- 继续执行 P2 第十轮减重：在 `inspector-panel-file-actions.ts` 中新增 `refreshWorkspaceAfterPaste` 与 `pasteClipboardEntriesIntoDirectory`，将 `FilesTab` 的剪贴板粘贴请求、目录目标文案、workspace/session 文件刷新与 paste 成功回写逻辑从 `inspector-panel.tsx` 主文件中拆出，继续把 `FilesTab` 收敛为“状态编排 + 视图组合”。
- 完成 P2 第十轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-file-actions.ts src/components/command-center/inspector-panel-files-overlays.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx` 全部通过；`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 在一次并发运行中曾出现 `App`/`chat-panel` 既有用例波动，但对应失败用例单独复跑通过，随后三文件组合回归也再次通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个后端失败；同一轮里还出现过 `src/components/command-center/chat-panel.test.jsx` 的单条图片渲染用例波动，但该用例单独复跑通过，当前判断仍是套件级不稳定而不是本轮 `inspector-panel` paste/context-menu 动作层拆分引入的稳定回归。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1710 行，P2 已经把 `FilesTab` 的 overlay/render glue、rename 动作层、paste/context-menu 主要动作层都从主文件中剥离。下一步更适合继续沿着 `FilesTab` 剩余的上传/选择/目录交互 glue 再收一层，或转回 `EnvironmentTab` 剩余 flow section 编排，做第十一轮减重。
- 继续执行 P2 第十一轮减重：在 `inspector-panel-file-actions.ts` 中新增 workspace tree 的目录加载、目录展开和根目录加载动作层，将 `loadWorkspaceDirectoryChildren`、`fetchWorkspaceDirectoryContents`、`toggleWorkspaceDirectoryOpen`、`loadWorkspaceRootTree` 从 `inspector-panel.tsx` 主文件中抽离，继续把 `FilesTab` 收敛为“状态编排 + 动作调度”而不是“同时管理目录 IO 与视图”。
- 完成 P2 第十一轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-file-actions.ts src/components/command-center/inspector-panel-files-overlays.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个后端失败；本轮未再观察到与 `inspector-panel` 相关的新前端稳定失败。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1650 行，`FilesTab` 里 workspace tree 的目录 IO/展开编排也已经从主文件中剥离。下一步更适合继续沿着 `FilesTab` 剩余的上传入口、session/workspace 选择 glue 再收一层，或评估 P2 是否已经接近可以收口。
- 继续执行 P2 第十二轮减重：在 `inspector-panel-file-actions.ts` 中新增 `resetFilesTabStateForWorkspaceRootChange`、`syncWorkspaceNodesFromIncomingSnapshot`、`reloadFilteredWorkspaceTree`、`bootstrapWorkspaceTree`、`pasteClipboardEntriesFromMenu`、`handleSelectedDirectoryPaste`，将 `FilesTab` 里 workspace root 切换时的状态重置、incoming workspace snapshot 合并、filter/initial tree 加载、菜单粘贴入口与窗口级目录粘贴入口从 `inspector-panel.tsx` 主文件中抽离。
- 完成 P2 第十二轮高信号验证：`npx eslint src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-file-actions.ts src/components/command-center/inspector-panel-files-overlays.tsx src/components/command-center/inspector-panel-dialogs.tsx src/components/command-center/inspector-panel-environment-sections.tsx src/components/command-center/inspector-panel-openclaw-operations.tsx src/components/command-center/inspector-panel-openclaw-panels.tsx src/components/command-center/inspector-panel-openclaw-config.tsx src/components/command-center/inspector-panel-openclaw-update.tsx src/components/command-center/inspector-panel-openclaw-onboarding.tsx src/components/command-center/settings-dialog.tsx`、`npx vitest run src/components/command-center/inspector-panel.test.jsx`、`npx vitest run src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/inspector-panel.test.jsx` 全部通过。
- 本轮再次执行全量 `npm test` 后，失败仍集中在 `test/server.test.js` 与 `server/services/dashboard.test.js` 的 transcript/dashboard 时间戳断言，共 4 个后端失败；失败内容和前几轮一致，仍是 replay/transcript timestamp 保留策略相关断言，不属于本轮 `inspector-panel` FilesTab glue 收缩覆盖区域。
- 本轮后 `inspector-panel.tsx` 主文件进一步降到约 1625 行，`FilesTab` 里的 workspace root reset、incoming snapshot merge、menu/window paste 入口也已经从主文件中剥离。下一步更适合评估 P2 是否已接近收口，或者只再做一轮 very-light 的 FilesTab section props/selection glue 清理后转向 `chat-panel`。
- 开始执行 P3 第一轮减重：新增 `chat-panel-attachments.tsx` 与 `chat-panel-attachment-utils.ts`，将 `chat-panel.tsx` 中的附件去重/图片源解析、消息附件渲染、composer 附件条和“是否包含视觉媒体”的判定从主文件中拆出，先挑出 `chat-panel` 中边界最清晰的一块 UI 渲染逻辑独立成模块。
- 完成 P3 第一轮高信号验证：`npx eslint src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel-attachments.tsx src/components/command-center/chat-panel-attachment-utils.ts src/components/command-center/chat-panel.test.jsx src/App.test.jsx`、`npx vitest run src/components/command-center/chat-panel.test.jsx src/App.test.jsx` 全部通过。
- 本轮未重跑全量 `npm test`；原因是本次改动仅收缩 `chat-panel` 内的附件渲染模块，`chat-panel` 与 `App` 两层高信号前端回归已经覆盖附件预览、markdown 图片、composer 附件条与入口交互。整仓当前仍有已知的后端 transcript/dashboard 时间戳失败，本轮没有触碰相关服务逻辑。
- 本轮后 `chat-panel.tsx` 主文件从约 5029 行降到约 4792 行，P3 已经正式开始。下一步更适合继续沿着 `chat-panel` 中边界清晰的 `reset dialog / queued strip / message meta` 子区域做第二轮减重，而不是直接碰最重的滚动编排逻辑。
