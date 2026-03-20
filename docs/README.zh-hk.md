[查看不同語言的 README： English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

一種更適合與 Agent 協作共創的方式。

作者：Marila Wang

## 亮點

- 基於 React + Vite 的 command center 介面，包含對話、時間線、檢查器、主題、語言與附件流程
- 參考 VS Code 的檔案探索體驗，支援工作階段樹、工作區樹、預覽操作與更豐富的文件處理
- 內建 中文、繁體中文（香港）、English、日本語、한국어、Français、Español、Português、Deutsch、Bahasa Melayu 與 தமிழ் 介面支援
- Node.js 後端可連接本地或遠端 OpenClaw gateway
- 內建聚焦測試、CI、lint、貢獻文件與版本記錄

## 產品導覽

- 頂部概覽列：Agent、模型、快速模式、思考模式、上下文、佇列、主題和語言控制
- 主對話區：提示詞輸入、附件處理、串流回覆和重設工作階段
- 右側檢查器：時間線、檔案、產物、快照與執行時活動
- 檢查器中的 Environment 區：OpenClaw 診斷、管理動作、安全配置編輯，以及檔案/目錄路徑不同的開啟行為
- 執行循環：預設支援 `mock` 模式，也可以切換到真實 OpenClaw gateway

更完整的展示見 [zh-hk/showcase.md](./zh-hk/showcase.md)。

## 文件

- 語言索引：[README.md](./README.md)
- 繁體中文（香港）指南：[zh-hk/documentation.md](./zh-hk/documentation.md)
- 快速開始：[zh-hk/documentation-quick-start.md](./zh-hk/documentation-quick-start.md)
- 介面說明：[zh-hk/documentation-interface.md](./zh-hk/documentation-interface.md)
- 工作階段與執行環境：[zh-hk/documentation-sessions.md](./zh-hk/documentation-sessions.md)
- 架構說明：[zh-hk/architecture.md](./zh-hk/architecture.md)

更多結構說明見 [server/README.md](../server/README.md) 和 [src/features/README.md](../src/features/README.md)。

## 安裝指南

### 從 npm 安裝

如果你是一般使用者，最簡單的安裝方式是：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

然後開啟 [http://127.0.0.1:5678](http://127.0.0.1:5678)。

說明：

- `lalaclaw init` 會在 macOS 和 Linux 上把本地設定寫到 `~/.config/lalaclaw/.env.local`
- 預設情況下，`lalaclaw init` 使用 `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321`，除非你主動覆蓋
- 在原始碼倉庫中，`lalaclaw init` 會預設背景啟動 Server 和 Vite Dev Server，然後提示你開啟 Dev Server URL
- 在 macOS 的 npm 安裝場景裡，`lalaclaw init` 會安裝並啟動 Server 的 `launchd` 服務，然後提示你開啟 Server URL
- 在 Linux 的 npm 安裝場景裡，`lalaclaw init` 會背景啟動 Server，然後提示你開啟 Server URL
- 如果你只想寫設定、不自動啟動服務，可以使用 `lalaclaw init --no-background`
- 使用 `--no-background` 後，先執行 `lalaclaw doctor`，原始碼倉庫用 `lalaclaw dev`，發佈包安裝用 `lalaclaw start`
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` 只用來管理 macOS 的 `launchd` Server 服務
- 預覽 `doc`、`ppt`、`pptx` 檔案需要 LibreOffice。在 macOS 上可執行 `lalaclaw doctor --fix`，或者使用 `brew install --cask libreoffice`

### 透過 OpenClaw 安裝

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

然後開啟本地位址：

```text
http://127.0.0.1:3000
```

### 從 GitHub 安裝

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
- 如果之後想使用即時開發環境，可以執行 `npm run dev:all`，再開啟 `http://127.0.0.1:4321` 或你自訂的 `FRONTEND_PORT`

### 更新 LalaClaw

如果你是透過 npm 安裝，想更新到最新版：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

如果你想切換到某個指定版本，例如 `2026.3.20-2`：

```bash
npm install -g lalaclaw@2026.3.20-2
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

如果你想切換到某個指定版本，例如 `2026.3.20-2`：

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-2
npm ci
npm run build
npm run lalaclaw:start
```

## 常用命令

- `npm run dev:all` 啟動標準本地開發流程
- `npm run doctor` 檢查 Node.js、OpenClaw 偵測、連接埠與本地設定
- `npm run lalaclaw:init` 寫入或刷新本地啟動設定
- `npm run lalaclaw:start` 在檢查 `dist/` 後啟動建置版應用
- `npm run build` 建置生產包
- `npm test` 執行一次 Vitest 測試
- `npm run lint` 執行 ESLint

完整命令列表與貢獻流程見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 貢獻

歡迎貢獻。對於較大的功能、架構調整或使用者可見行為變化，建議先開 issue 對齊方向。

在提交 PR 前：

- 保持改動聚焦，避免順手做無關重構
- 為行為變化補充或更新測試
- 新增使用者可見文案請走 `src/locales/*.js`
- 使用者可見行為變化時同步更新文件
- 版本化行為變化時更新 [CHANGELOG.md](../CHANGELOG.md)

完整貢獻清單見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 開發備註

- 標準本地開發流程使用 `npm run dev:all`
- 開發時預設開啟 [http://127.0.0.1:4321](http://127.0.0.1:4321)，或使用你自訂的 `FRONTEND_PORT`
- 只有在依賴 `dist/` 的建置產物時，才使用 `npm run lalaclaw:start` 或 `npm start`
- 預設情況下，應用會自動偵測本地 OpenClaw gateway
- 如果你想穩定重現 UI 或前端問題，可以設定 `COMMANDCENTER_FORCE_MOCK=1` 強制 `mock` 模式
- 提交 PR 前，建議至少執行 `npm run lint`、`npm test` 與 `npm run build`

## 版本規則

LalaClaw 使用 npm 相容的日曆版本格式。

- 每次專案版本變化時更新 [CHANGELOG.md](../CHANGELOG.md)
- 同一天的多次發佈使用 `YYYY.M.D-N`，例如 `2026.3.20-2`，不要使用 `YYYY.M.D.N`
- 破壞性變更應在 release notes 與遷移文件中明確標註
- 開發時建議使用 [`.nvmrc`](../.nvmrc) 中的 Node.js `22`；已發佈的 npm 套件支援 `^20.19.0 || ^22.12.0 || >=24.0.0`

## OpenClaw 接入

如果 `~/.openclaw/openclaw.json` 存在，LalaClaw 會自動偵測本地 OpenClaw gateway，並重用其中的回環位址與 gateway token。

對新的原始碼倉庫環境，常見初始化流程如下：

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

如果你想手動接入另一個 OpenClaw 相容 gateway，可以設定：

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

如果你的 gateway 更接近 OpenAI Responses API，可以使用：

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

如果沒有設定這些變數，應用會運行在 `mock` 模式，這樣在初始化階段也可以完整體驗介面與對話流程。
