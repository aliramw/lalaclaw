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
