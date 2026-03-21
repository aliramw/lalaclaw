# LalaClaw2 `init` 开机启动能力改造过程总结

更新时间：2026-03-19
仓库：`~/projects/lalaclaw2`
分支：`feat/init-autostart`

---

## 一、背景与目标

用户要求：

> 在 `~/projects/lalaclaw2` 开一个新分支，然后在这个新分支上开始工作，并开始尝试按照 OpenClaw 方法为 LalaClaw 安装后执行 `init` 后即增加开机启动的能力。

这个目标不是简单“能后台运行”，而是要尽量对齐 OpenClaw 在 macOS 上的服务化方法：

- 使用 **launchd LaunchAgent**
- 登录后自动启动
- 进程退出自动拉起
- 有状态可查（status / doctor）
- 有日志路径
- 能被 onboarding / environment 感知

---

## 二、先查清楚现状

### 1. 分支
已创建新分支：

- `feat/init-autostart`

### 2. 代码现状结论
起初并不是完全没有自启动能力。LalaClaw 已经有一套 macOS launchd 逻辑，集中在：

- `bin/lalaclaw.js`

关键能力包括：
- `resolveLaunchdPlistPath()`
- `renderLaunchdPlist()`
- `installLaunchdService()`
- `readLaunchdServiceStatus()`
- `stopLaunchdService()`
- `restartLaunchdService()`

并且 README 里已经承诺：

- 在 macOS npm installs 场景下，`lalaclaw init` 会安装并启动 launchd service

### 3. 关键现状问题
虽然已有 launchd 基础，但它离 OpenClaw 的方法还差很多：

1. LaunchAgent 模板过于简化
   - 没 `Comment`
   - 没 `ThrottleInterval`
   - 没 `Umask`
   - 环境变量太少
2. `doctor` 不知道 LalaClaw 自己的后台服务状态
3. onboarding state 不知道 LalaClaw 自己的后台服务状态
4. 前端 Environment / Onboarding 面板不显示 LalaClaw 自己的服务状态
5. **最关键**：source checkout 场景下，`lalaclaw init` 仍然只是启动 detached backend + Vite，而不是 launchd backend

这个第 5 点决定了它还不算真正按 OpenClaw 方法落地。

---

## 三、对 OpenClaw 方法的理解与对齐策略

参考 OpenClaw 当前在本机的真实行为：

- 使用 `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- `RunAtLoad = true`
- `KeepAlive = true`
- `ThrottleInterval = 1`
- 注入 HOME / TMPDIR / PATH / service version / label 等环境变量
- `status` / `doctor` / 运行态可见

因此对 LalaClaw 的对齐策略定为：

1. **保留现有 launchd 基础**，不推翻重写
2. 先把 LalaClaw 的 launchd 模板和 OpenClaw 风格拉齐
3. 再把“服务状态”纳入：
   - CLI `status`
   - CLI `doctor`
   - onboarding state
   - 前端 Onboarding 面板
4. 最后改 `init` 的 source checkout 分支，让 backend 也走 launchd

---

## 四、已经完成的代码改动

### 1. 分支创建
执行：

```bash
cd ~/projects/lalaclaw2
git checkout -b feat/init-autostart
```

---

### 2. 升级 LaunchAgent 模板（`bin/lalaclaw.js`）

对 `renderLaunchdPlist()` 做了增强，使生成的 plist 更接近 OpenClaw 风格。

#### 新增内容
- `Comment`：`LalaClaw Server (v${PACKAGE_VERSION})`
- `ThrottleInterval = 1`
- `Umask = 63`
- 注入环境变量：
  - `HOME`
  - `TMPDIR`
  - `PATH`
  - `LALACLAW_LAUNCHD_LABEL`
  - `LALACLAW_SERVICE_KIND=app`
  - `LALACLAW_SERVICE_VERSION`
  - `LALACLAW_CONFIG_FILE`

#### 保留内容
- `RunAtLoad = true`
- `KeepAlive = true`
- `ProgramArguments: node lalaclaw.js start --config-file <envFile>`
- stdout / stderr 日志路径

#### 改动目的
让 launchd service 更像“受管理服务”，而不是最小可运行壳。

---

### 3. 增强 CLI `status`

修改了 `readLaunchdServiceStatus()` 与 `runStatus()`：

#### 新增能力
- 从 plist 中解析：
  - `Label`
  - `Comment`
- 输出时显示：
  - LaunchAgent 路径
  - Label
  - Service Comment
  - Logs 目录

#### 意义
`lalaclaw status` 不再只是“跑没跑”，而是具备更多服务元信息可见性。

---

### 4. 新增服务状态模块

新增文件：

- `server/services/lalaclaw-service-status.js`

#### 提供能力
统一返回：
- `kind`
- `platform`
- `label`
- `installed`
- `running`
- `plistPath`
- `logDir`
- `serviceVersion`
- `comment`
- `details`

#### 目的
避免 CLI、onboarding、UI 各自零散判断 LaunchAgent 状态，统一成一个 server-side service status 能力。

---

### 5. onboarding state 接入 LalaClaw service 状态

修改文件：

- `server/services/openclaw-onboarding.js`

#### 改动
在 `buildOnboardingState()` 里加入：

- `service: service || getLalaClawServiceStatus()`

并在 service factory 中引入：

- `getLalaClawServiceStatus`

#### 结果
`GET /api/openclaw/onboarding` 现在会附带 LalaClaw 自己的服务状态。

这意味着 Onboarding 语义不再只覆盖 OpenClaw 本体，也开始覆盖 LalaClaw 运行方式。

---

### 6. 前端 Onboarding / Environment 面板接入服务状态

修改文件：

- `src/components/command-center/inspector-panel.jsx`

#### 新增展示块
在 OpenClaw 初始化状态卡中新增：

- `LalaClaw Service: installed · running / installed · stopped / not installed`
- `Label`
- `LaunchAgent`
- `Logs`

#### 目的
让“自启动能力”从后台能力变成前端可见、可验证的状态。

---

### 7. `doctor` 接入 LalaClaw LaunchAgent 状态

修改文件：

- `bin/lalaclaw.js`

#### 改动内容
在 `collectDoctorData()` 中收集：
- `const service = getLalaClawServiceStatus();`

在 `buildDoctorReport()` 中加入：
- `service`

在 summary warnings 中加入：
- 如果 macOS 上 `installed=true && running=false`
  - 增加 warning：
    - `LalaClaw launchd service is installed but not running (...)`

在 `printDoctorReport()` 中新增输出：
- launchd service 是否 installed / running
- LaunchAgent 路径
- logs 目录

#### 结果
`lalaclaw doctor` 已经能诊断 LalaClaw 自己的后台服务状态，而不只是 Node / OpenClaw / LibreOffice / ports。

---

### 8. source checkout 场景接入 launchd backend

这是本轮最关键的一刀。

原来 `runInit()` 中：

- source checkout (`isSourceCheckout() === true`) 时
  - 总是走 `startInitBackgroundServices()`
  - backend = detached `node server.js`
  - frontend = detached Vite

这不符合 OpenClaw 方法。

#### 新改法
在 macOS + source checkout + 非 `--no-background` 场景下：

- backend 改为：
  - `ensureBackgroundServiceBuildReady()`
  - `installLaunchdService(envFilePath)`
- frontend 改为：
  - `startInitBackgroundServices(envFilePath, { skipBackend: true })`

即：

> **source checkout 的 backend 也开始走 launchd LaunchAgent**
> frontend 保持开发态 detached Vite

#### 配套改动
`startInitBackgroundServices()` 增加：
- `options.skipBackend`

这样可以只启动 frontend，不重复启动 backend detached child。

#### 意义
这一步是从“已有 launchd 能力”走向“init 真按 OpenClaw 方法干活”的关键分水岭。

---

## 五、已经做过的验证

### 1. Onboarding / App 测试
执行过：

```bash
npm test -- src/App.test.jsx -t "onboarding|init|status|launchd|background service"
```

结果：通过。

说明：
- 增强 LaunchAgent 模板
- 增强 status 输出
- onboarding / init 相关 UI 路径

没有被打坏。

---

### 2. Onboarding service / route 测试
执行过：

```bash
npm test -- server/services/openclaw-onboarding.test.js server/routes/openclaw-onboarding.test.js src/App.test.jsx -t "onboarding|初始化"
```

结果：通过。

说明：
- onboarding state 新增 `service` 字段
- 并没有打穿现有 onboarding 流程

---

### 3. Inspector Onboarding UI 测试
执行过：

```bash
npm test -- src/components/command-center/inspector-panel.test.jsx -t "OpenClaw 初始化|prioritizes onboarding|switches straight into onboarding|supports custom provider onboarding"
```

结果：通过。

说明：
- Onboarding 面板接入 LalaClaw service 状态显示
- 没打坏 inspector / onboarding 交互

---

### 4. `doctor --json` / `status` 实测
执行过：

```bash
node ./bin/lalaclaw.js doctor --json
node ./bin/lalaclaw.js status
```

#### 结果
`doctor --json` 现在包含：

```json
"service": {
  "kind": "launchd",
  "platform": "darwin",
  "label": "ai.lalaclaw.app",
  "installed": true,
  "running": false,
  "plistPath": "/Users/marila/Library/LaunchAgents/ai.lalaclaw.app.plist",
  "logDir": "/Users/marila/.config/lalaclaw/logs",
  "serviceVersion": "2026.3.21-1"
}
```

summary 也会带 warning：

- `LalaClaw launchd service is installed but not running (ai.lalaclaw.app).`

`lalaclaw status` 也会打印：
- LaunchAgent
- Label
- Logs
- running / not running

#### 说明
CLI 诊断链已经接通。

---

### 5. `init --defaults --no-background` 实测
执行过：

```bash
node ./bin/lalaclaw.js init --defaults --no-background
```

结果：正常写配置并输出 next steps。

说明：
- 新改动没有破坏最基础 init 配置写入路径

---

### 6. `init --defaults` 实测（关键观察）
执行过：

```bash
node ./bin/lalaclaw.js init --defaults
```

#### 当时观察到的旧行为
在改 source checkout 分支之前，这条命令会进入：
- `startInitBackgroundServices()`
- 输出：
  - `Starting Server in background ...`
  - `Starting Frontend in background ...`

这证明了一个关键事实：

> **在 source checkout 场景下，旧实现根本没走 launchd。**

这也是为什么后续必须改 source checkout 分支。

---

## 六、当前实现达到的阶段

目前已经做到：

### 能力层
- 有 LaunchAgent 模板
- 有 status
- 有 doctor
- 有 onboarding state
- 有前端 service status 展示

### 行为层
- npm package 场景：backend 走 launchd（原本就有）
- source checkout 场景（macOS）：backend 也开始走 launchd（本轮新增）

### 语义层
- README 文案也已经调整成更接近 OpenClaw 的 supervisor 语义

---

## 七、当前还没完全收口的点

### 1. 还没重新执行一次 source checkout 新逻辑下的真实 `init`
虽然代码已经改了 source checkout 分支，但还没在修改后重新做一次：

```bash
node ./bin/lalaclaw.js init --defaults
```

来确认：
- 新 plist 是否重写
- launchctl bootstrap / enable / kickstart 是否真的执行
- status / doctor 是否从 `running=false` 变成 `running=true`

这一步是下一步最重要的真实验证。

### 2. 隔离 launchd 验证已完成（2026-03-19）
为了不破坏现有本地开发环境，没有直接复用默认：
- label：`ai.lalaclaw.app`
- 端口：`5000 / 5001`
- 配置：`~/.config/lalaclaw/.env.local`

而是先补了 **可覆盖的 launchd label 能力**，然后使用隔离验证：

- LaunchAgent label：`ai.lalaclaw.app.verify`
- plist：`~/Library/LaunchAgents/ai.lalaclaw.app.verify.plist`
- backend port：`5610`
- frontend port：`5611`
- config file：`/tmp/lalaclaw-init-verify.a6YyTC/.env.local`

#### 验证命令
```bash
LALACLAW_LAUNCHD_LABEL=ai.lalaclaw.app.verify \
node ~/projects/lalaclaw2/bin/lalaclaw.js init --defaults --config-file /tmp/lalaclaw-init-verify.a6YyTC/.env.local
```

#### 验证结果
1. `init` 已明确输出：
   - `Started Server background service (launchd) ai.lalaclaw.app.verify`
2. 已生成新的隔离 plist：
   - `~/Library/LaunchAgents/ai.lalaclaw.app.verify.plist`
3. `launchctl print gui/$UID/ai.lalaclaw.app.verify` 显示：
   - `state = running`
   - 有独立 `pid`
4. `lalaclaw status` 在隔离 label 下显示：
   - installed
   - running
   - 正确 label / logs / LaunchAgent 路径
5. `lalaclaw doctor --json` 在隔离 label 下显示：
   - `service.installed = true`
   - `service.running = true`
   - `service.label = ai.lalaclaw.app.verify`
   - `comment = LalaClaw Server (v2026.3.21-1)`
6. HTTP runtime 也已验证可用：

```bash
curl -sf 'http://127.0.0.1:5610/api/runtime?sessionUser=command-center&agentId=main'
```

返回核心结果：
- `ok: true`
- `hasSession: true`
- `sessionStatus: 就绪`
- `conversationCount: 14`
- `artifactCount: 6`

#### 结论
这次隔离验证已经证明：

> 在 `lalaclaw2` 当前代码下，macOS 的 source checkout 场景里，`lalaclaw init` 已经能够按 LaunchAgent 方法为 backend 提供登录自启 / 保活能力，并且这条链在隔离环境下可以真实跑通。

### 3. 当前本机现有默认服务与隔离服务并存
当前机器上现在至少存在两条 LaunchAgent：

- 默认：`ai.lalaclaw.app`
- 隔离验证：`ai.lalaclaw.app.verify`

隔离验证过程中没有覆盖默认服务，这符合“不破坏现有开发环境”的要求。

### 4. launchd label 隔离能力已补齐（2026-03-19）
为了安全验证而不破坏默认服务，已在 CLI / service status 两侧补齐：

- `LALACLAW_LAUNCHD_LABEL` 环境变量覆盖能力

覆盖范围包括：
- `resolveLaunchdPlistPath()`
- `renderLaunchdPlist()`
- `getLaunchdTargets()`
- `installLaunchdService()`
- `status`
- `doctor`
- `server/services/lalaclaw-service-status.js`

这使得后续可以安全创建：
- `ai.lalaclaw.app.verify`

而不覆盖默认：
- `ai.lalaclaw.app`

### 5. 已补最小 CLI launchd 回归测试
新增测试文件：

- `test/lalaclaw-cli-launchd.test.js`

目前已覆盖：
1. 默认 launchd label 路径
2. 覆盖 label 后的 plist path / service target
3. LaunchAgent plist 中 OpenClaw 风格元数据字段

已验证通过：

```bash
npm test -- test/lalaclaw-cli-launchd.test.js
```

结果：3/3 通过。

---

## 八、建议的下一步

### 下一步 1（最高优先级）
真实执行一遍：

```bash
cd ~/projects/lalaclaw2
node ./bin/lalaclaw.js init --defaults
```

然后验证：
1. 是否重写 `~/Library/LaunchAgents/ai.lalaclaw.app.plist`
2. `plutil -p` 能否看到：
   - `Comment`
   - `ThrottleInterval`
   - `Umask`
   - `EnvironmentVariables`
3. `lalaclaw status` 是否显示 installed + running
4. `lalaclaw doctor --json` 的 `service.running` 是否变成 true

### 下一步 2
补 CLI launchd 专项测试：
- `renderLaunchdPlist()` 输出快照
- `installLaunchdService()` 的 launchctl 调用顺序
- source checkout init 分支逻辑

---

## 九、一句话总结

这轮改造已经把 LalaClaw 的“开机启动能力”从：

> 仅在 npm package 场景下存在的一段 launchd 安装逻辑

推进成：

> **具备 OpenClaw 风格的 LaunchAgent 模板、status、doctor、onboarding state、前端可见 service 状态，以及 source checkout 场景 backend 也开始走 launchd 的完整能力链。**

但还差最后一刀真实验证，才能说“这条链真的闭环了”。
