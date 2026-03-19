[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[返回首頁](./documentation.md) | [快速開始](./documentation-quick-start.md) | [對話、附件與命令](./documentation-chat.md) | [鍵盤快捷鍵](./documentation-shortcuts.md) | [本地持久化與恢復](./documentation-persistence.md)

# 工作階段、Agent 與執行模式

## 工作階段如何識別

前端與後端都以兩個核心值識別工作階段：

- `agentId`
- `sessionUser`

實務上：

- `agentId` 表示你目前與哪個 Agent 協作
- `sessionUser` 表示目前 context 屬於哪一條對話線

同一個 Agent 可以對應多個 `sessionUser`，因此不必更換 Agent，也能建立新的上下文。

## Agent 與 IM 標籤

前端聊天標籤是依真實工作階段識別管理，而不只是畫面上的名稱：

- 預設主標籤是 `agent:main`
- 額外的 Agent 標籤通常沿用同一個 `agentId`，但會有自己的 `sessionUser`
- IM 對話也能從切換器直接開成標籤，例如釘釘、飛書或企微執行緒
- 每個已開啟的標籤都會保留自己的訊息、草稿、捲動位置與部分工作階段中繼資料
- 關閉標籤只會隱藏 UI，不會刪除底層工作階段歷史

這代表：

- 兩個標籤可以指向同一個 Agent，但使用不同的 `sessionUser`
- IM 標籤底層仍然會解析成 `agentId + sessionUser`
- 已開啟的 Agent 標籤與已開啟的 IM 頻道不會再出現在切換器

## 工作階段層級設定

以下偏好會以工作階段設定保存到後端：

- Agent
- 模型
- Fast mode
- Think mode

切換規則：

- 切換 Agent 時，如果沒有明確指定模型，會回到該 Agent 的預設模型
- 模型只有在與預設值不同時才會持久化
- Think mode 會先驗證有效性才接受

## 開始新的工作階段

清空 context 的主要方式有三種：

- 點擊聊天標題列的新工作階段控制
- 使用 `Cmd/Ctrl + N`
- 發送 `/new` 或 `/reset`

差異是：

- UI 按鈕與快捷鍵是單純重置
- `/new` 與 `/reset` 可附加 trailing prompt，讓新工作階段立刻延續

## `mock` 模式

以下情況會進入 `mock` 模式：

- 沒有偵測到本地 OpenClaw gateway
- 或明確設定 `COMMANDCENTER_FORCE_MOCK=1`

特點：

- 即使沒有 live gateway，整個 UI 仍可操作
- 聊天、檢查器、檔案與環境面板都會提供適合展示與測試的 mock 資料

## `openclaw` 模式

以下情況會進入 `openclaw` 模式：

- 偵測到 `~/.openclaw/openclaw.json`
- 或明確設定 `OPENCLAW_BASE_URL` 及相關環境變數

特點：

- `/api/chat` 會送出真實請求到已設定的 gateway
- `/api/runtime` 與檢查器會讀取 transcript、工作階段狀態與 browser-control 資訊
- 模型與思考模式切換可 patch 遠端工作階段
