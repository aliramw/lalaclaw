[查看不同語言的 README： English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

一種更適合與 Agent 協作共創的方式。

作者：Marila Wang

## 亮點

- 基於 React + Vite 的 command center 介面，包含對話、時間線、檢查器、主題、語言與附件流程
- 參考 VS Code 的檔案探索體驗，內建工作階段 / 工作區雙樹視圖、預覽操作與更豐富的媒體處理
- 內建 中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ் 介面支援
- Node.js 後端可連接本地或遠端 OpenClaw gateway

## 文件

- 語言索引：[docs/README.md](./docs/README.md)
- 繁體中文（香港）文件：[docs/zh-hk/documentation.md](./docs/zh-hk/documentation.md)
- 快速開始：[docs/zh-hk/documentation-quick-start.md](./docs/zh-hk/documentation-quick-start.md)
- 介面總覽：[docs/zh-hk/documentation-interface.md](./docs/zh-hk/documentation-interface.md)
- 工作階段與執行環境：[docs/zh-hk/documentation-sessions.md](./docs/zh-hk/documentation-sessions.md)

## 快速開始

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

然後開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

說明：

- 在 macOS 上，`lalaclaw init` 也會自動透過 `launchd` 啟動背景服務
- 在 macOS 的原始碼倉庫裡，如果缺少 `dist/`，`lalaclaw init` 會先建置生產包，再啟動背景服務
- 如果你只想寫入設定、不自動背景啟動，可以使用 `lalaclaw init --no-background`
- 在 Linux 上，或你關閉了自動背景啟動時，再繼續執行 `lalaclaw doctor` 和 `lalaclaw start`
- 預覽 doc、ppt、pptx 檔案需要 LibreOffice
- 在 macOS 上可執行 lalaclaw doctor --fix，或使用 brew install --cask libreoffice

若要進行本地開發：

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

開發模式請使用 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

如果你想在 macOS 的原始碼倉庫裡使用生產背景服務，可先執行 `npm run doctor`，再執行 `npm run lalaclaw:init`。

## 更新

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

安裝指定版本：

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## 開發備註

- 開發時請使用 npm run dev:all，而非 npm start
- 只有在需要驗證 dist build 時才使用 npm run lalaclaw:start 或 npm start
- App 會自動偵測本地 OpenClaw
- 如需強制使用 mock 模式，可設定 COMMANDCENTER_FORCE_MOCK=1

## 版本規則

- 每次版本變更都要同步更新 CHANGELOG.md
- 同一天多次發布時，請使用 YYYY.M.D-N 格式，例如 2026.3.17-5
