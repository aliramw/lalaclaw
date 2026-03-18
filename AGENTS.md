# AGENTS.md

## 开发服务启动 / Dev Servers

开发态需要同时启动前端和后端，不使用 `dist/`。  
Run both frontend and backend in development. Do not use `dist/`.

### 前端开发服务 / Frontend

在项目根目录运行：

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

前端访问地址 / Frontend URL:

```text
http://127.0.0.1:5173
```

### 后端开发服务 / Backend

在项目根目录运行：

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

后端接口地址 / Backend URL:

```text
http://127.0.0.1:3000
```

### 联调说明 / Notes

- 页面入口使用 `http://127.0.0.1:5173`。Use `http://127.0.0.1:5173` as the main dev entry.
- `vite.config.mjs` 已将 `/api/*` 代理到 `http://127.0.0.1:3000`。`vite.config.mjs` already proxies `/api/*` to `http://127.0.0.1:3000`.
- 不要用 `npm start` 做前端联调，它依赖已有 `dist/`。Do not use `npm start` for frontend dev verification.
- 默认自动连接本地 OpenClaw。The app auto-detects local OpenClaw by default.
- 强制 `mock` 模式：`COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js`。

## 版本维护 / Versioning

- 版本号变更时必须同步更新 `CHANGELOG.md`。Update `CHANGELOG.md` whenever the project version changes.
- 发布版本必须保持 npm 兼容。同一天的第 N 个版本使用 `YYYY.M.D-N`，例如 `2026.3.17-2`，不要使用 `YYYY.M.D.N`。Release versions must stay npm-compatible. For the Nth release on the same day, use `YYYY.M.D-N`, for example `2026.3.17-2`, not `YYYY.M.D.N`.
- `CHANGELOG.md` 需明确记录新增、修改、修复和重要行为变化。Record additions, changes, fixes, and important behavior changes clearly.

### 发布顺序 / Release Order

- 发布时按固定顺序执行，避免版本号、tag、npm 包和 GitHub release 中间状态不一致。Follow a fixed release order to avoid mismatches between the version, tag, npm package, and GitHub release.
- 先把版本号从当前版本 bump 到目标版本，例如 `2026.3.17-5` -> `2026.3.17-6`。First bump the version from the current release to the target release, for example `2026.3.17-5` -> `2026.3.17-6`.
- 写 `CHANGELOG.md`，并同步更新 `README`、`documentation-quick-start` 等文档里的示例版本号。Update `CHANGELOG.md`, then sync example version numbers in `README`, `documentation-quick-start`, and related docs.
- 跑一轮关键测试和构建，至少覆盖 release 前最关键的 lint、test、build。Run the key validation steps before release, at minimum the critical lint, test, and build commands.
- 验证通过后再提交并推送到 `origin/main`。Only commit and push to `origin/main` after those checks pass.
- 推送完成后再创建 Git tag 和 GitHub release。Create the Git tag and GitHub release only after the main branch has been pushed.
- 最后发布 npm 包。Publish the npm package last.

## WebSocket 第二阶段 / WebSocket Phase 2

- 第二阶段目标：把当前“runtime WebSocket 已落地，但 IM/钉钉等投递会话仍主要依赖 polling fallback”的状态，推进到“关键会话默认事件驱动，polling 只做兜底”。Phase 2 should move the app from runtime-only WebSocket usage toward event-first sync for IM and delivery-routed sessions, with polling kept only as a fallback.
- 默认按以下顺序推进，避免同时改太多高风险链路。Implement Phase 2 in the order below unless a task explicitly requires a different sequence.

### 执行顺序 / Execution Order

- 先修 `runtimeHub` 的 `sessionKey` 解析，不要继续依赖字符串 `split(':')` 去路由 gateway event。First replace ad-hoc `sessionKey` splitting in `runtimeHub` with a shared parser that can handle JSON-style `sessionUser` values safely.
- 再放开 IM session 的 runtime WebSocket 订阅，让钉钉、飞书、企微也能接入 `/api/runtime/ws`。Then enable runtime WebSocket subscriptions for IM sessions instead of excluding them by default.
- 再让 delivery-routed session 优先走 gateway event stream，而不是一开始就落回 polling。After that, make delivery-routed sessions prefer gateway event streams before falling back to polling.
- 最后再考虑把 `runtimeHub` 从“收到 event 后 refresh 快照”推进到“直接消费 event 并广播增量 patch”。Only after the routing and IM cases are stable should `runtimeHub` move from event-triggered refresh to direct event-driven patch emission.

### 范围要求 / Scope Expectations

- 修改 IM session 的 WebSocket 行为时，同时检查 bootstrap session、resolved session、runtime anchor 三类 `sessionUser` 的映射是否一致。When changing IM WebSocket behavior, verify bootstrap, resolved, and runtime-anchor session identity mapping together.
- 修改 gateway event 路由时，优先复用统一的 session key / session user 解析逻辑，不要在多个模块里复制字符串解析。Reuse shared parsing helpers for session keys and session users instead of duplicating string parsing across modules.
- 修改 delivery-routed stream 行为时，保留 polling fallback，不要把现有兜底路径删掉。Keep the polling fallback in place when extending delivery-routed streams to gateway events.
- 如果聊天主链路是否迁移到 WebSocket 没被明确要求，第二阶段默认不把 `/api/chat` 的 SSE/streaming 响应整体改成 WebSocket。Do not migrate the `/api/chat` streaming transport to WebSocket as part of Phase 2 unless the task explicitly asks for it.

### 测试要求 / Phase 2 Testing

- `runtime-hub` 必须补精确路由测试，覆盖 command-center session、IM JSON sessionUser、bootstrap session、异常 session key。Add precise routing tests for `runtime-hub`, including command-center, IM JSON session users, bootstrap sessions, and malformed session keys.
- `use-runtime-socket` 和 `use-runtime-snapshot` 必须补 IM session 建连、断线重连、切 tab、pending 清理、stop override 的回归测试。Add IM-focused regressions for `use-runtime-socket` and `use-runtime-snapshot`, covering connect, reconnect, tab switching, pending clearing, and stop overrides.
- `openclaw-client` 必须补 delivery-routed event stream、delta/final/error、fallback polling 的回归测试。Add regressions for `openclaw-client` covering delivery-routed event streams, delta/final/error handling, and fallback polling.
- 涉及钉钉/飞书/企微的改动，至少验证一次真实或等价的端到端消息链路。For DingTalk, Feishu, or WeCom changes, validate at least one real or equivalent end-to-end message flow.

## WebSocket 后续收口 / WebSocket Follow-up

- 第二阶段完成后，优先进入稳定化收口，不要立刻把 `/api/chat` 主聊天传输整体迁到 WebSocket。After Phase 2, prioritize stabilization before considering any full `/api/chat` transport migration.

### 第一优先级 / Priority 1

- 先把 `App` 级和 `use-command-center` 级回归收绿，特别是聊天发送、stop、pending 恢复、bootstrap IM tab、agent 切换等全局流程。First restore green coverage for `App`-level and `use-command-center` regressions, especially send/stop flows, pending recovery, bootstrap IM tabs, and agent switching.
- 任何修复这类全局回归的改动，都要优先补控制器级或 `App` 级测试，而不是只补 hook 局部测试。When fixing these regressions, prefer controller-level or `App`-level coverage rather than hook-only tests.

### 第二优先级 / Priority 2

- 至少做一次真实或等价的 IM 联调验收，覆盖钉钉、飞书、企微里至少一个完整链路：发消息 -> gateway event stream -> runtime WS -> 前端落盘。Run at least one real or equivalent IM end-to-end validation covering send -> gateway event stream -> runtime WS -> frontend persistence.
- 联调时记录当前是否走 `ws` 还是 `polling`、最近一次 fallback 原因、以及 `runtimeHub` 的 `lastRefreshReason/lastGatewayEvent`。During IM validation, record whether the session stayed on `ws` or fell back to `polling`, along with the latest fallback reason and `runtimeHub` refresh metadata.

### 第三优先级 / Priority 3

- 把 `runtimeHub` 当前支持的 direct patch 事件整理成稳定协议，至少固定 `session.sync`、`conversation.sync`、`taskRelationships.sync`、`taskTimeline.sync`、`artifacts.sync`。Stabilize the direct patch event contract used by `runtimeHub`, at minimum for `session`, `conversation`, `taskRelationships`, `taskTimeline`, and `artifacts`.
- 新增事件类型时，优先沿用已有 `*.sync` 结构，不要继续扩散“仅靠宽松识别 payload.data”的临时协议。When adding new event types, prefer the existing `*.sync` structure instead of relying on increasingly loose `payload.data` heuristics.

### 暂不做 / Out of Scope For Now

- 如果任务没有明确要求，不要把 `/api/chat` 的 SSE/streaming 主链路并入 WebSocket 第三阶段之前的日常修复。Do not migrate the `/api/chat` SSE/streaming transport as part of routine follow-up work unless a task explicitly asks for it.

## 维护者规则 / Maintainer Rules

### 国际化 / Internationalization

- 禁止新增硬编码用户文案。Do not add hard-coded user-facing strings.
- 所有用户文案进入 `src/locales/*.js`，并走现有 i18n 层。All visible copy must live in `src/locales/*.js`.
- 新增 key 至少同步更新 `src/locales/en.js` 和 `src/locales/zh.js`。
- 不要随意重命名或删除已有 locale key，除非任务明确包含迁移。

### 开源兼容性 / Open Source Compatibility

- 新增依赖前先考虑 license、维护状态、包体积和长期成本。
- 能复用现有依赖或原生能力时，不引入新包。
- 导出路径、组件 props、路由、localStorage key、事件名默认视为兼容性接口。

### 改动原则 / Change Principles

- 默认优先最小可行改动，不顺手做大范围重构。
- 改动前先阅读现有实现和测试，尽量沿用已有状态模型、命名和交互模式。
- 修改流式回复、排队发送、持久化恢复、session/runtime 同步逻辑时，优先检查：
  - `src/features/chat/controllers/*.js`
  - `src/features/app/controllers/*.js`
  - `src/features/app/storage/*.js`
  - `src/features/session/runtime/*.js`
- 不要静默丢弃用户消息、历史、会话状态或本地持久化数据，除非任务明确要求 reset 或迁移。

### 测试 / Testing

- 修复 bug 时至少补一条回归测试。
- 涉及流式消息、并发发送、hydration、持久化恢复时，优先补 `App` 级或控制器级测试。
- 最终说明里明确写出已运行的测试命令；没跑测试也要明确说明。

### UI 与可访问性 / UI and Accessibility

- 新增交互元素必须有明确的可访问名称，并保证键盘可操作。
- 改动 UI 时考虑长英文、长中文、窄屏、换行、按钮截断和状态文案显示。
- 失败时不要只吞错；用户侧要有稳定提示，开发侧要保留可排查信息。

### 文档同步 / Documentation Sync

- 用户可见行为、命令、配置项、版本策略变化时，尽量同改动更新 `README.md`、相关文档或示例。
- `README.md` 负责贡献入口、开发摘要和版本约定；`CONTRIBUTING.md` 负责完整贡献流程，避免两边重复堆细节。
