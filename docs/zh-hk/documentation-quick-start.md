[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[返回首頁](./documentation.md) | [介面總覽](./documentation-interface.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md)

# 快速開始

## npm 安裝

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

然後開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

## 開發模式

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

然後開啟 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 重要說明

- 本地 UI 開發請使用 npm run dev:all，不要使用 npm start
- doc、ppt、pptx 預覽需要 LibreOffice
- COMMANDCENTER_FORCE_MOCK=1 可強制切換到 mock 模式
