[English](../en/architecture.md) | [中文](../zh/architecture.md) | [繁體中文（香港）](../zh-hk/architecture.md) | [日本語](../ja/architecture.md) | [한국어](../ko/architecture.md) | [Français](../fr/architecture.md) | [Español](../es/architecture.md) | [Português](../pt/architecture.md) | [Deutsch](../de/architecture.md) | [Bahasa Melayu](../ms/architecture.md) | [தமிழ்](../ta/architecture.md)

# 架構總覽

> 導覽： [文件首頁](./documentation.md) | [快速開始](./documentation-quick-start.md) | [介面總覽](./documentation-interface.md) | [產品展示](./showcase.md) | [重構路線圖](./refactor-roadmap.md)

LalaClaw 由輕量前端入口、輕量伺服器入口，以及易於測試的中間模組組成。

- `src` 包含 React 介面與功能控制器
- `server` 包含 routes、services 與 runtime integration
- `docs` 以多語言形式整理實際產品行為