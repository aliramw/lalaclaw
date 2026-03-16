# 重构路线图

> 导航：[文档首页](./documentation.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [API 与排障](./documentation-api-troubleshooting.md) | [架构概览](./architecture.md) | [产品演示指南](./showcase.md)

## 目标

- 降低 `src/App.jsx` 和 `server.js` 的维护风险
- 分离 UI 组合、数据编排和 OpenClaw 集成逻辑
- 在重构过程中尽量保持当前产品行为稳定，同时让测试更聚焦

## 当前压力点

- `src/App.jsx` 混合了持久化、轮询、输入行为、队列管理、主题和运行时同步
- `server.js` 混合了 HTTP 路由、运行配置探测、会话偏好存储、OpenClaw 传输、transcript 解析和 dashboard 投影
- 仓库中仍同时存在 Vite 应用入口和旧的静态应用痕迹
- 某些服务端测试依赖机器本地 OpenClaw 发现，除非显式固定在 mock 模式

## 目标结构

### 前端

- `src/app/bootstrap/`
  - App bootstrap、providers、全局样式和根渲染
- `src/features/session/`
  - 会话轮询、模型和 Agent 选择、fast mode、think mode
- `src/features/chat/`
  - 输入框、排队、发送流、prompt history、附件处理
- `src/features/inspector/`
  - timeline、files、artifacts、snapshots、agents、peeks
- `src/shared/`
  - UI primitives、markdown 渲染、格式化工具和存储辅助函数

### 后端

- `server/config.js`
  - 运行配置探测、mock 覆盖和本地 OpenClaw 发现
- `server/session-store.js`
  - 会话偏好和本地对话缓存
- `server/openclaw-client.js`
  - HTTP / gateway RPC 调用、session patch、直连请求与 session 模式
- `server/transcript.js`
  - transcript 读取、消息规范化、文件提取、timeline 和 snapshot 投影
- `server/routes.js`
  - `/api/session`、`/api/runtime`、`/api/chat` 和静态文件处理
- `server/index.js`
  - 仅负责创建与启动服务

## 推荐顺序

### 阶段 1：稳定运行边界

- 保留 `server.js` 作为公开入口，但先把纯函数辅助逻辑拆到小模块中
- 引入统一的运行配置模块，把环境探测收敛到一起
- 为 mock 模式和本地发现添加显式测试开关

### 阶段 2：拆分前端状态域

- 将附件存储和 prompt history 逻辑移到 `src/features/chat/state/`
- 将运行时轮询和 snapshot 应用逻辑移到 `src/features/session/state/`
- 让 `App.jsx` 保持为组合层外壳

### 阶段 3：拆分 OpenClaw 传输与快照投影

- 将请求发送和 transcript 解析分开
- 让 `buildDashboardSnapshot` 通过更小的函数组合，而不是在一处同时读文件和格式化
- 使用 transcript fixture 做更聚焦的单元测试，减少全 route 测试负担

### 阶段 4：移除旧静态应用

- 旧版 `public/index.html` 和 `public/app.js` 已移除，`dist` 现在是唯一前端产物
- 如果仍有遗留依赖，应清理并让 Node 服务只回退到 Vite 入口或构建结果
- 更新 README，确保本地运行说明始终与当前前端一致

## 建议的首批 PR

1. 抽离服务端运行配置和 session store
2. 抽离前端聊天发送流到 `useChatController`
3. 抽离前端运行时轮询到 `useRuntimeSnapshot`
4. 增加 transcript fixture 和解析器单测
5. 在确认无部署依赖后移除旧静态应用

## 测试策略

- 默认让 route 测试运行在 mock 模式
- 为以下模块增加更聚焦的单测：
  - transcript 解析
  - session preference 解析
  - 附件持久化与恢复
  - prompt history 导航
- 保留少量真实 route 集成测试，但通过显式环境进行保护

## 需要关注的风险

- Session reset 同时影响前端本地状态和后端 session identity 生成
- 附件持久化跨越 `localStorage` 与 IndexedDB，重构时要保留迁移行为
- `OpenClaw` 模式存在时序敏感的轮询和 session patch 调用，传输层拆分时必须保留顺序
