[English](../en/testing-e2e.md) | [中文](../zh/testing-e2e.md)

# 浏览器 E2E 测试

这份指南定义了 LalaClaw 的浏览器端到端测试规范。

请结合 [CONTRIBUTING.md](../../CONTRIBUTING.md) 一起阅读。`CONTRIBUTING.md` 说明整体贡献流程；本文件重点说明什么时候该补 Playwright 覆盖、怎样保持测试稳定，以及当前仓库对浏览器测试的约定。

## 当前测试栈

- 框架：Playwright
- 测试目录：`tests/e2e/`
- 主配置：[`playwright.config.js`](../../playwright.config.js)
- 测试服务启动脚本：[`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

当前配置会启动：

- 前端开发服务：`http://127.0.0.1:5173`
- 后端开发服务：`http://127.0.0.1:3000`

Playwright 启动脚本会让后端以 `COMMANDCENTER_FORCE_MOCK=1` 模式运行，因此浏览器测试默认不依赖真实 OpenClaw 环境。

## 什么时候必须补浏览器 E2E

当改动影响以下任意一类行为时，应新增或更新浏览器 e2e：

- 消息发送 / 停止 / 重试行为
- 排队消息与延迟进入会话区的行为
- 会话 bootstrap、会话切换或 tab 路由
- 只有真实渲染后才会暴露的 hydration 与恢复行为
- 仅靠 hook 或 controller 测试难以建立信心的浏览器可见回归

纯状态迁移优先使用 controller 级或 `App` 级 Vitest 测试。只有当风险依赖真实 DOM 时序、焦点行为、路由、请求顺序或多步 UI 流程时，再补浏览器 e2e。

## 优先覆盖什么

仓库不需要一开始就铺开大面积浏览器覆盖，先把高风险用户路径测稳。

优先覆盖这些流程：

1. 应用启动与首屏渲染
2. 一次普通发送 / 回复闭环
3. 排队消息在轮到自己前不进入会话区
4. 回复进行中触发 stop / abort
5. IM tab、agent 切换等会话 bootstrap 路径

如果 bug 修复涉及排队、流式、stop、hydration 或 session/runtime 同步，通常应补一条正对该用户可见故障的浏览器回归测试。

## 稳定性规则

浏览器 e2e 的目标是稳定验证行为，不是验证视觉细枝末节。

- 优先断言用户可见行为，而不是内部实现细节
- 优先断言文本、role、label 和稳定控件
- 除非 bug 本身与动画时序相关，否则不要依赖动画时间
- 除非 class 本身就是行为的一部分，否则避免断言脆弱的 Tailwind 类名
- 对关键 `/api/*` 请求做路由 mock，保证网络行为可控
- 输入、点击、tab 焦点和请求顺序要尽量走真实浏览器交互

对于排队或流式流程，优先断言：

- 消息是否出现在会话区
- 它是否仍只停留在排队区
- 它是否要等前一轮完成后才出现
- 可见顺序是否与真实轮次顺序一致

## Mock 策略

默认不要把浏览器 e2e 直接打到真实 OpenClaw 部署。

建议按这个顺序处理：

1. 在 Playwright 测试里路由相关 `/api/*` 请求
2. 使用仓库现有的 backend mock 模式
3. 只有任务明确要求等价真实链路时，才接入真实外部依赖

当前 [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) 就遵循了这个模式：

- `/api/auth/state` 已 stub
- `/api/lalaclaw/update` 已 stub
- `/api/runtime` 已 stub
- `/api/chat` 由各测试分别控制，保证排队顺序和完成时序可预测

## 编写建议

让每条浏览器 e2e 都保持单一职责。

- 一个 spec 文件通常只关注一个产品区域
- 一条测试通常只验证一个用户流程
- 优先抽一个小型 helper / fixture 文件，而不是在每条测试里复制大段 JSON
- 尽量复用 snapshot builder，让浏览器测试和 `App.test.jsx` 保持一致

好的例子：

- “排队消息在真正开始前不进入会话区”
- “stop 后发送按钮会恢复”
- “Feishu bootstrap tab 在首次发送前解析为原生 session user”

价值较低的例子：

- “按钮必须精确包含这一组 utility class”
- “一条测试同时覆盖三个无关流程”
- “明明可以 route mock，却仍依赖真实远端服务”

## 本地运行

先安装一次 Playwright 浏览器：

```bash
npm run test:e2e:install
```

运行浏览器 e2e：

```bash
npm run test:e2e
```

以可见浏览器运行：

```bash
npm run test:e2e:headed
```

使用 Playwright UI：

```bash
npm run test:e2e:ui
```

## CI 约定

CI 里已经有独立的浏览器 e2e job，定义在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)。

这个 job 应保持聚焦且稳定：

- 浏览器用例规模要足够小，能在每个 PR 上稳定运行
- 先加高价值回归，再考虑更宽泛的探索性场景
- 避免引入 flaky wait 或长时间 sleep

如果一条浏览器测试过慢、过度依赖环境，暂时不适合放进默认 `test:e2e` 路径，应该先简化或稳定下来。

## 推荐 Review 清单

在合并浏览器 e2e 改动前，至少检查：

- 这次是否真的需要浏览器 e2e，还是 `App` / controller 测试就够？
- 测试断言的是用户可见行为，而不是实现细节吗？
- 所需网络状态是否被可预测地控制住了？
- 如果 6 个月后 UI 样式变化，这条测试仍然有意义吗？
- 这条测试是否真的会在我们关心的用户回归上失败？

## 相关文件

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
