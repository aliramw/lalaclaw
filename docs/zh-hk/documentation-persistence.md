[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[返回首頁](./documentation.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md) | [API 與疑難排解](./documentation-api-troubleshooting.md)

# 本地持久化與恢復

LalaClaw 會把部分 UI 狀態保存在本地，好讓頁面重新載入後能快速恢復。

- 已開啟的標籤頁與目前工作階段
- inspector 寬度
- 聊天字體大小
- 已選語言與主題

恢復時，App 會嘗試重新同步 runtime 資料與已儲存狀態，而不會默默丟棄對話內容。