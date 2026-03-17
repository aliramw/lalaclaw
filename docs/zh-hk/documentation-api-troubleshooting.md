[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[返回首頁](./documentation.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md) | [本地持久化與恢復](./documentation-persistence.md)

# API 與疑難排解

## 開發環境

- 前端：`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
- 後端：`PORT=3000 HOST=127.0.0.1 node server.js`
- Vite 會把 /api/* 代理到 http://127.0.0.1:3000

## 常見檢查項目

- 確認 OpenClaw 或 mock 模式是否按預期運作
- 在環境分頁查看 gateway、auth、runtime 資訊
- 使用 `npm run doctor` 檢查 port、設定與依賴
- 若 Office 預覽有問題，請確認 LibreOffice 已安裝