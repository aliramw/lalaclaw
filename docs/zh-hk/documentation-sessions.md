[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[返回首頁](./documentation.md) | [對話、附件與命令](./documentation-chat.md) | [本地持久化與恢復](./documentation-persistence.md)

# 工作階段、Agent 與執行模式

## 工作階段

- 標籤頁依 agent 組織
- 實際的工作階段識別由 agentId + sessionUser 組成
- 關閉標籤頁只會隱藏視圖，不會刪除工作階段

## Agent 與模型

- agent 來自允許的 runtime 設定
- model 與 think mode 來自 backend 回報的選項
- fast mode 與 think mode 會按工作階段同步

## 執行模式

- App 預設可在 mock 模式下運作
- 啟用 gateway 後會改用真實的 OpenClaw endpoint
- runtime、auth、queue 狀態會顯示在頂部