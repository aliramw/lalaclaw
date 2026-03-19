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
- 在 `npm publish` 之前，必须验证“将要发布的 npm 产物”，不能只验证源码工作区。Before `npm publish`, validate the actual npm artifact that will be released instead of only validating the source checkout.
- 发布前必须执行 `npm pack`，并在干净临时目录里安装该 tarball 做一次安装态验证。Run `npm pack` before release and install that tarball in a clean temporary directory for installed-package validation.
- 安装态验证至少要覆盖一次真实启动路径：能启动服务、首页不白屏、浏览器 console 无新的 runtime error。The installed-package validation must cover one real startup path: the app starts, the first screen is not blank, and the browser console shows no new runtime errors.
- `vite build`、打包日志或安装态 smoke test 中出现 `Circular chunk`、chunk 初始化错误、首屏空白等信号时，视为 release blocker，不得继续发布。Treat `Circular chunk`, chunk-init failures, blank-first-screen symptoms, or similar build/install smoke signals as release blockers.
- 任何修改 `vite.config.*`、`manualChunks`、构建产物入口、Mermaid/Monaco/预览器等打包敏感区域的改动，发布前都必须补跑一次安装态 smoke test。Any change touching `vite.config.*`, `manualChunks`, bundle entry behavior, or packaging-sensitive areas such as Mermaid, Monaco, or preview pipelines must rerun the installed-package smoke test before release.
- 验证通过后再提交并推送到 `origin/main`。Only commit and push to `origin/main` after those checks pass.
- 推送完成后再创建 Git tag 和 GitHub release。Create the Git tag and GitHub release only after the main branch has been pushed.
- 最后发布 npm 包。Publish the npm package last.

### 发布产物验收 / Release Artifact Validation

- 推荐顺序：
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm pack`
- 之后在干净目录中至少执行一次：
  - `npm install ./lalaclaw-<version>.tgz`
  - 通过发布包的真实入口启动应用，而不是回到源码目录复用开发环境
- 验收时至少确认：
  - 安装后的应用能成功启动
  - 首屏能正常渲染，不出现白屏
  - 浏览器 console 没有新的 runtime / chunk 初始化错误
  - 如果本次改动涉及生产打包或懒加载分块，优先再检查一次 Network / console，确认没有循环 chunk 或缺失 chunk
- 如果需要更稳的发布节奏，可先用非 `latest` dist-tag 做一次 registry 验证，通过后再切到正式标签。If needed, publish to a non-`latest` dist-tag first, verify from the registry, and only then promote it.

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

## OpenClaw 运维能力 / OpenClaw Operations

- `#36` 默认按 umbrella issue 处理，不把 “安装 / 管理 / 配置 / 远程修复” 混进一个 PR。Treat `#36` as an umbrella issue and split installation, management, configuration, and remote repair into separate deliverables.
- 目标是让 `lalaclaw` 成为 OpenClaw 的安全运维前端，优先封装官方 OpenClaw CLI / RPC，不自行重写安装和修复逻辑。Build OpenClaw operations support by wrapping the official OpenClaw CLI or RPC instead of reimplementing install or repair behavior.
- 优先级始终是：只读诊断 -> 安全管理动作 -> 配置管理 -> 本地安装/更新 -> 远程运维。The default delivery order is read-only diagnostics, then safe management actions, then config management, then local install/update, and finally remote operations.

### 范围边界 / Scope Boundaries

- 默认先支持本机 OpenClaw 运维；远程主机只在本地链路稳定后单独立项。Prioritize local-machine OpenClaw operations first and treat remote-host support as a separate later phase.
- 默认优先调用官方命令，如 `openclaw doctor`、`openclaw gateway status|start|stop|restart`、`openclaw config.*`；没有充分依据时不要自造修复流程。Prefer official OpenClaw commands such as `openclaw doctor`, `openclaw gateway status|start|stop|restart`, and `openclaw config.*` over custom repair flows.
- `doctor` 自动修复默认使用官方 `--repair` 或兼容别名，不在 `lalaclaw` 内部维护一套并行修复逻辑。Use the official doctor repair mode and aliases instead of maintaining a parallel repair implementation inside `lalaclaw`.
- 高风险操作如 install、update、reinstall、uninstall、远程配置写入，都必须带确认、结果输出、health check，以及失败后的恢复提示。High-risk operations such as install, update, reinstall, uninstall, or remote config writes must include confirmation, output visibility, health checks, and recovery guidance.

### 实施顺序 / Implementation Order

- `P1` 只读诊断：先提供 OpenClaw 版本、gateway 状态、doctor 摘要、配置路径、日志入口等只读信息。Start with read-only diagnostics: version, gateway health, doctor summary, config paths, and log entry points.
- `P2` 安全管理动作：在只读面稳定后，再增加 start/stop/restart/status 和 doctor repair 等受控操作。Add controlled management actions such as start/stop/restart/status and doctor repair only after the read-only surface is stable.
- `P3` 配置管理：优先做结构化 `config.get/config.patch/config.apply`，写前记录 `baseHash` 或备份，写后自动验证并按需重启。Implement structured config management with backup or base-hash protection before allowing free-form editing.
- `P4` 本地安装与更新：单独处理本地 install/update，不和配置管理或远程运维混在一个 PR。Handle local install/update as its own phase, separate from config management and remote operations.
- `P5` 远程运维：只有前四期稳定后，才开始做远程配置写入、远程修复和审计/回滚。Only add remote operations after the first four phases are stable, with auditability and rollback in place.

### 测试与验收 / Validation Expectations

- 每一期至少覆盖一条 CLI/service 回归、一条后端 handler/service 测试，以及一条前端交互或状态测试。Each phase should include at least one CLI/service regression, one backend handler or service test, and one frontend interaction or state test.
- 只读能力上线前，至少验证一次真实 OpenClaw 状态读取；写操作上线前，至少验证一次真实或等价的 “执行 -> health check -> 结果展示” 闭环。Validate at least one real OpenClaw read path before shipping diagnostics, and at least one real or equivalent execute -> health-check -> result loop before shipping write operations.
- 新增 issue 或 PR 时，优先按 `P1` 到 `P5` 编排，不要跳过前置阶段直接做远程安装/修复。When planning issues or PRs, follow the `P1` to `P5` order instead of jumping straight to remote install or repair work.

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

### 测试命令基线 / Validation Command Baseline

- 默认测试命令使用仓库现有 script，不要临时发明新入口。Use the existing npm scripts as the default validation surface.
- 基线命令固定为：
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- 需要验证 build 产物相关行为时，先执行 `npm run build`，再用 `npm run lalaclaw:start` 或 `npm start` 做生产模式确认。When a change depends on built output, verify against the built app after `npm run build`.

### 最低验证矩阵 / Minimum Validation Matrix

- 仅文档、注释、纯文案改动：
  - 可不强制跑测试，但最终说明必须明确写“未跑测试，本次仅文档/文案改动”。For docs-only or copy-only changes, explicitly say tests were not run.
- 一般前端组件、样式、交互、小型后端逻辑改动：
  - 至少跑受影响测试文件；
  - 如果没有细粒度测试入口或影响面不清晰，至少跑 `npm test`。
- 状态管理、控制器、runtime、session、storage、streaming、并发发送、hydration、pending 恢复相关改动：
  - 至少跑对应模块测试；
  - 还必须补充 `App` 级或控制器级回归测试；
  - 如果影响范围跨前后端或多个状态层，至少补跑一次 `npm test`。
- 发布前、版本号变更、依赖升级、构建链路调整、生产模式行为改动：
  - 必跑 `npm run lint`
  - 必跑 `npm test`
  - 必跑 `npm run build`
  - 必跑 `npm pack`
  - 必做一次基于 tarball 的干净目录安装验证
  - 必确认安装态首页渲染与 console 状态正常
  - 对 release-facing 或高风险大改动，优先再跑 `npm run test:coverage`
- IM、WebSocket、delivery-routed、openclaw-client、runtimeHub 相关高风险链路：
  - 除单测/回归外，至少做一次真实或等价端到端链路验证。In addition to tests, perform one real or equivalent end-to-end validation for these high-risk flows.

### 通过标准 / Passing Standard

- 只要运行了某条验证命令，默认标准就是成功退出且无新增失败。A validation command only counts as passed when it exits successfully with no new failures.
- 不要把新增 skip、已知红灯、局部失败当作“通过”，除非任务明确允许，并在最终说明中单独写清原因。Do not treat skips or existing red tests as a pass unless the task explicitly allows it.
- 如果仓库本身已有 unrelated failure：
  - 先尽量缩小到受影响测试；
  - 明确区分“本次改动相关”与“仓库既有失败”；
  - 最终说明里必须写出失败命令、失败用例和判断依据。

### 测试分层与落点 / Test Layer Guidance

- 优先沿用现有测试层，不要为了省事只补最浅层 mock 测试。Prefer the highest-signal existing test layer instead of the easiest isolated mock.
- UI 呈现细节优先补组件测试；跨组件流程、切 tab、切 agent、消息发送、恢复状态等优先补 `App` 级测试。Use component tests for rendering details and `App`-level tests for cross-flow behavior.
- 控制器、状态同步、存储恢复、并发与流式行为优先补控制器级测试；只有当局部 hook 测试足够证明行为且不会漏掉集成风险时，才接受 hook 级覆盖。Prefer controller-level coverage for stateful and sync logic.
- 服务端 transport、runtime snapshot、gateway/client 逻辑优先补服务级回归测试，并覆盖 success、fallback、error 三类结果。Server-side transport or runtime logic should cover success, fallback, and error paths.

### 失败与 Flaky 处理 / Failure and Flaky Policy

- 测试失败时，默认先判断是代码问题、测试问题还是环境问题，不要直接跳过或删除测试。When a test fails, classify the failure before changing the test.
- 非任务明确要求时，不要通过放宽断言、增加 skip、删除覆盖来“修绿”测试。Do not weaken assertions or add skips just to make the suite pass.
- 如果怀疑 flaky：
  - 至少复跑一次相关命令确认；
  - 记录是否可稳定复现；
  - 没有定位根因前，不把 flaky 当作已解决。

### 最终汇报格式 / Final Verification Reporting

- 最终说明里的测试结果至少包含：
  - 实际运行过的命令
  - 通过 / 失败 / 未运行
  - 若失败，列出关键失败点
- 如果只跑了局部测试，要明确说明为什么局部测试足够。If only targeted tests were run, explain why the narrower validation scope is sufficient.
- 如果因环境、时间或外部依赖未能完成某项验证，要明确说明缺口和风险，不要省略。If validation is incomplete, state the gap and the remaining risk explicitly.

### UI 与可访问性 / UI and Accessibility

- 新增交互元素必须有明确的可访问名称，并保证键盘可操作。
- 改动 UI 时考虑长英文、长中文、窄屏、换行、按钮截断和状态文案显示。
- 失败时不要只吞错；用户侧要有稳定提示，开发侧要保留可排查信息。

### 前端视觉规范 / Frontend Visual Spec

- 开发规范类文档统一放在 `dev-spec/`，不要放进 `docs/`。Place development-spec documents under `dev-spec/`, not `docs/`.
- 前端视觉基线写在 `dev-spec/frontend-visual-spec.md`。Use `dev-spec/frontend-visual-spec.md` as the canonical frontend visual baseline.
- 处理 UI/视觉问题时，先对照该文档，再做实现；如果当前规则不够覆盖，就在同一轮改动里补充到规范文档。When fixing UI or visual issues, check the spec first and extend it in the same workstream when needed.
- 用户一旦提出新的视觉要求、信息架构要求、分组/排序要求、密度/间距要求，不要只改代码，必须同步把规则写进 `dev-spec/frontend-visual-spec.md`。When users raise new visual, IA, grouping, ordering, density, or spacing requirements, update the spec alongside the code change.
- 环境面板里的路径交互必须依赖已验证的文件/目录元数据，不要只靠字符串猜测；像 `/v1/chat/completions` 这类 API 路径不能渲染成文件预览链接。Environment-panel path interactions must rely on verified file or directory metadata instead of string heuristics alone; API routes such as `/v1/chat/completions` must not render as file-preview links.
- 如果新要求和旧规范冲突，直接更新规范文档并在最终说明里点明，而不是让实现和规范长期背离。If a new requirement conflicts with the previous spec, update the spec and call that out in the final report.

### 文档同步 / Documentation Sync

- 用户可见行为、命令、配置项、版本策略变化时，尽量同改动更新 `README.md`、相关文档或示例。
- `README.md` 负责贡献入口、开发摘要和版本约定；`CONTRIBUTING.md` 负责完整贡献流程，避免两边重复堆细节。

### 计划文档 / Planning Docs

- 仓库根目录下的 `plan/` 专门用于存放后续开发计划、执行计划、阶段方案和拆解文档。Use `plan/` for implementation plans, execution plans, phased roadmaps, and task breakdowns.
- 新增计划类 Markdown 时，默认优先放进 `plan/`，不要散落在仓库根目录或 `docs/` 里，除非任务明确要求其他位置。Place new planning markdown files under `plan/` by default unless a task explicitly requires another location.
- `plan/` 面向开发与执行协作，不视为用户文档入口；不要把仅供内部推进的计划误写到 `README.md` 或多语言 `docs/`。Treat `plan/` as internal engineering/planning space rather than user-facing documentation.
