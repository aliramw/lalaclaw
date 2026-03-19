[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[返回首頁](./documentation.md) | [快速開始](./documentation-quick-start.md) | [檢查器、檔案預覽與追蹤](./documentation-inspector.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md)

# API 與疑難排解

## API 概覽

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## 常見問題

### 頁面打不開，而且後端說缺少 `dist`

- 若要走 production mode，先執行 `npm run build`，再執行 `npm start`
- 若是本地開發，請依照 [快速開始](./documentation-quick-start.md) 同時啟動 Vite 與 Node

### 已安裝版本打開後是白畫面，而且 console 提到 `mermaid-vendor`

常見症狀：

- App bundle 有載入，但畫面保持空白
- 瀏覽器 console 看到來自 `mermaid-vendor-*.js` 的錯誤

最可能原因：

- 你仍在使用較舊的封裝版本 `2026.3.19-1`
- 該版本對 Mermaid 做了手動 vendor split，安裝後可能破壞 production 啟動

修復方式：

- 升級到 `lalaclaw@2026.3.19-2` 或更新版本
- 若你是從原始碼執行，請拉取最新 `main` 後重新執行 `npm run build`

### 開發模式能打開頁面，但 API 呼叫失敗

先確認：

- Frontend 是否跑在 `127.0.0.1:5173`
- Backend 是否跑在 `127.0.0.1:3000`
- 你是否使用 Vite 入口，而不是 production server 入口

### 已安裝 OpenClaw，但 App 仍停在 `mock`

請檢查：

- `~/.openclaw/openclaw.json` 是否存在
- `COMMANDCENTER_FORCE_MOCK=1` 是否被設定
- `OPENCLAW_BASE_URL` 與 `OPENCLAW_API_KEY` 是否為空或設定錯誤

### 切換模型或 Agent 看起來沒有生效

可能原因：

- 仍在 `mock` 模式，因此只改到本地偏好
- `openclaw` 模式下遠端 session patch 失敗
- 你選的模型其實就是該 Agent 的預設模型

建議查看：

- [檢查器、檔案預覽與追蹤](./documentation-inspector.md) 的 `Environment`
- Backend console 輸出

如果問題只發生在切換到另一個標籤後：

- 確認切換器已完成打開目標工作階段，再送出下一輪訊息
- 在 `Environment` 中檢查 `runtime.transport`、`runtime.socket`、`runtime.fallbackReason`

### 檔案無法預覽

常見原因：

- 該檔案項目沒有絕對路徑
- 檔案已不存在
- 目標不是一般檔案

注意：

- `file-preview` 與 `file-manager/reveal` 都需要絕對路徑
