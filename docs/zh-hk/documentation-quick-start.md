[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[返回首頁](./documentation.md) | [介面總覽](./documentation-interface.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md) | [API 與排障](./documentation-api-troubleshooting.md)

# 快速開始

## 環境要求

- 開發時使用倉庫 [`.nvmrc`](../../.nvmrc) 中定義的 Node.js 版本，目前為 `22`；已發佈的 npm 套件支援 `^20.19.0 || ^22.12.0 || >=24.0.0`
- 一般本地使用建議採用 npm 安裝
- 只有在需要開發模式或本地修改程式碼時，才需要 GitHub 原始碼倉庫

## 透過 OpenClaw 安裝

使用 OpenClaw 在遠端 Mac 或 Linux 機器上安裝 LalaClaw，然後透過 SSH 連接埠轉發在本地存取。

如果你已經有一台安裝了 OpenClaw 的機器，而且可以透過 SSH 登入該機器，那麼你可以讓 OpenClaw 直接從 GitHub 安裝這個專案、在遠端啟動它，再把遠端連接埠轉發回本地使用。

對 OpenClaw 說：

```text
安裝這個 https://github.com/aliramw/lalaclaw
```

典型流程：

1. OpenClaw 在遠端機器上 clone 這個倉庫。
2. OpenClaw 安裝依賴並啟動 LalaClaw。
3. 應用在遠端機器的 `127.0.0.1:5678` 上監聽。
4. 你透過 SSH 把遠端連接埠轉發到本地。
5. 你在本地瀏覽器中開啟轉發後的位址。

示例 SSH 連接埠轉發：

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

然後開啟：

```text
http://127.0.0.1:3000
```

## 從 npm 安裝

如果你是一般使用者，最簡單的安裝方式是：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

然後開啟 [http://127.0.0.1:5678](http://127.0.0.1:5678)。

### Windows

在 Windows 上，請在 PowerShell 中執行相同指令：

```powershell
npm install -g lalaclaw@latest
lalaclaw init
```

然後開啟 [http://127.0.0.1:5678](http://127.0.0.1:5678)。

Windows 補充說明：

- `lalaclaw init` 通常會把本地設定寫到 `%APPDATA%\LalaClaw\.env.local`
- 如果你只想寫設定、不自動啟動服務，可以使用 `lalaclaw init --no-background`
- 使用 `--no-background` 後，先執行 `lalaclaw doctor`，然後對發佈包安裝使用 `lalaclaw start`
- `lalaclaw start` 會佔用目前的 PowerShell 工作階段，關閉視窗後應用也會停止
- 如果系統提示找不到 `lalaclaw`，請重新開啟 PowerShell，或確認 npm 全域 bin 目錄已加入 `PATH`

說明：

- `lalaclaw init` 會在 macOS 和 Linux 上把本地設定寫到 `~/.config/lalaclaw/.env.local`
- 預設情況下，`lalaclaw init` 使用 `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321`，除非你主動覆蓋
- 偵測到本地 OpenClaw 時，`lalaclaw init` 還會寫入解析後的 `OPENCLAW_BIN`，並給 `launchd` 配好包含目前 Node 執行時的 `PATH`
- 在原始碼倉庫中，`lalaclaw init` 會預設背景啟動 Server 和 Vite Dev Server，然後提示你開啟 Dev Server URL
- 在 macOS 的 npm 安裝場景裡，`lalaclaw init` 會安裝並啟動 Server 的 `launchd` 服務，然後提示你開啟 Server URL
- 在 Linux 的 npm 安裝場景裡，`lalaclaw init` 會背景啟動 Server，然後提示你開啟 Server URL
- 如果你只想寫設定、不自動啟動服務，可以使用 `lalaclaw init --no-background`
- 使用 `--no-background` 後，先執行 `lalaclaw doctor`，原始碼倉庫用 `lalaclaw dev`，發佈包安裝用 `lalaclaw start`
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` 只用來管理 macOS 的 `launchd` Server 服務
- 預覽 `doc`、`ppt`、`pptx` 檔案需要 LibreOffice。在 macOS 上可執行 `lalaclaw doctor --fix`，或者使用 `brew install --cask libreoffice`

## 從 GitHub 安裝

如果你想取得原始碼，用於開發或本地修改：

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

然後開啟 [http://127.0.0.1:4321](http://127.0.0.1:4321)。

說明：

- `npm run lalaclaw:init` 現在預設會背景啟動 Server 和 Vite Dev Server，除非你明確傳入 `--no-background`
- 背景啟動完成後，會提示你開啟 Dev Server URL，預設是 `http://127.0.0.1:4321`
- 如果你只想產生設定，可執行 `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` 會佔用目前終端，關閉終端後服務也會停止
- 如果你的本地設定已經準備好，可以跳過 `npm run lalaclaw:init`
- 如果你更想手動編輯設定，可以從 [`.env.local.example`](../../.env.local.example) 開始

## 更新已安裝的 LalaClaw

如果你是透過 npm 安裝，想更新到最新版：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

如果你想切換到某個指定發佈版本，例如 `2026.3.24-1`：

```bash
npm install -g lalaclaw@2026.3.24-1
lalaclaw init
```

如果你是從 GitHub 安裝，想更新到最新版本：

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

如果你想切換到某個指定發佈版本，例如 `2026.3.24-1`：

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.24-1
npm ci
npm run build
npm run lalaclaw:start
```

說明：

- `npm install -g lalaclaw@latest` 會更新全域安裝的 npm 套件
- `git pull` 會把你本地的程式碼更新到 GitHub 上的最新版本
- `npm ci` 會安裝該版本對應的依賴
- `npm run build` 會刷新生產模式使用的前端檔案
- 如果你使用 macOS 的 `launchd` 常駐執行，更新後請執行 `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app` 重啟服務
- 如果 Git 提示你有本地改動，請先備份或提交後再更新

## 開發模式

開發模式需要 GitHub 原始碼倉庫，並且已經執行過 `npm ci`。

倉庫聯調時請使用倉庫固定開發連接埠：

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

你也可以直接執行：

```bash
npm run dev:all
```

開發位址：

- 前端：`http://127.0.0.1:5173`
- 後端：`http://127.0.0.1:3000`
- 瀏覽器入口：`http://127.0.0.1:5173`

開發態下 `/api/*` 會透過 `vite.config.mjs` 代理到 `http://127.0.0.1:3000`。

## 生產建置模式

如果你要驗證建置產物而不是開發聯調：

```bash
npm run build
npm run lalaclaw:start
```

說明：

- `npm run lalaclaw:start` 依賴現有的 `dist/`
- 如果略過 `npm run build`，後端會回傳 `503 Web app build is missing`
- 因此日常前端開發不應使用建置模式

## macOS 常駐生產部署

如果你希望在 macOS 上關閉 terminal 之後服務仍然在線，建議使用 `launchd`。

1. 先建置應用：

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. 用倉庫裡的腳本生成 plist：

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. 載入服務：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

常用命令：

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

更完整的 macOS 部署說明見 [deploy/macos/README.md](../../deploy/macos/README.md)。

## `mock` 與 OpenClaw

啟動時，後端會優先讀取 `~/.openclaw/openclaw.json`。

- 如果偵測到本地 gateway 和 token，則進入 `openclaw` 模式
- 否則預設回退到 `mock` 模式

強制使用 `mock`：

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

如果你使用 CLI 初始化設定：

```bash
npm run lalaclaw:init
npm run doctor
```

在 `remote-gateway` 模式下，`doctor` 還會對遠端 gateway 做一次真實探測，並送出一個最小 API 請求來驗證設定的模型和 Agent。

## Browser Access Tokens

如果瀏覽器開啟後看到存取權杖解鎖頁，可以用下面的方法找到或重設 token：

- 執行 `lalaclaw access token` 查看目前的 token
- 執行 `lalaclaw access token --rotate` 產生並寫入新的 token
- 檢查 `~/.config/lalaclaw/.env.local` 裡的 `COMMANDCENTER_ACCESS_TOKENS` 或 `COMMANDCENTER_ACCESS_TOKENS_FILE`
- 如果這個實例不是你自己部署的，向部署者索取 token

## 啟動診斷

- `lalaclaw doctor` 和 `npm run doctor` 現在會輸出彩色狀態標籤、可用時的 macOS `launchd` 服務資訊、預覽依賴檢查，以及最後的摘要行，方便你在開啟應用前先發現啟動阻塞項
- `lalaclaw start` 和 `npm run lalaclaw:start` 會在啟動前執行同一套 doctor 預檢；如果仍有阻塞性錯誤，會直接停止啟動
- 在 macOS 上，doctor 輸出還會提供 LaunchAgent plist 路徑與日誌目錄，方便排查 `lalaclaw init` 之後的背景啟動問題
