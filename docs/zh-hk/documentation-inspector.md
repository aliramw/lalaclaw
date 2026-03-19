[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[返回首頁](./documentation.md) | [介面總覽](./documentation-interface.md) | [對話、附件與命令](./documentation-chat.md) | [API 與疑難排解](./documentation-api-troubleshooting.md)

# 檢查器、檔案預覽與追蹤

右側檢查器是 LalaClaw 最核心的介面之一。它目前將工作階段資訊整理成四個分頁：`Files`、`Artifacts`、`Timeline`、`Environment`。

## Files

`Files` 分頁現在分成兩個區塊：

- `Session Files`：目前對話中觸碰過的檔案，仍會按 `Created`、`Modified`、`Viewed` 分組
- `Workspace Files`：以目前 workspace 為根的樹狀檢視

重點行為：

- Workspace 樹只會逐層載入，不會一開始就掃完整個專案
- 即使折疊，兩個區塊仍會保留數量 badge
- 空的 `Session Files` 區塊會自動隱藏
- Session 與 workspace filter 都支援純文字與簡單 glob

互動：

- 點擊檔案可開啟預覽
- 右鍵檔案可複製絕對路徑
- 右鍵 workspace 資料夾可只刷新該層

## Artifacts

`Artifacts` 會列出目前工作階段的助理回覆摘要。

你可以：

- 點擊摘要跳回對應的聊天訊息
- 在長對話中快速找到重要回覆
- 開啟 `View Context` 查看目前送往模型的工作階段上下文

## Timeline

`Timeline` 會按執行回合整理紀錄：

- 執行標題與時間
- Prompt 摘要與結果
- Tool 輸入、輸出與狀態
- 與該回合相關的檔案變更
- 派工與協作關係

## Environment

`Environment` 會彙整 runtime 詳情，例如：

- 頂部 `OpenClaw 診斷` 摘要，按 `概覽`、`連線概況`、`Doctor`、`日誌` 分組
- OpenClaw 版本、執行檔位、設定檔路徑、工作區根目錄、Gateway 狀態、健康檢查位址與日誌入口
- 目前 runtime transport、runtime socket 狀態，以及切回 polling 前的 reconnect 次數與 fallback 原因
- 下層再按 `工作階段上下文`、`即時同步`、`Gateway 設定`、`應用`、`其他` 分組呈現技術細節

`Environment` 現在是一個組合面板，聚合 OpenClaw 診斷、管理動作、配置能力，以及目前工作階段的執行時資訊。

重點行為：

- 已提升到頂部診斷摘要的欄位，會從下層技術分組中去重，避免重複資訊
- JSON session key 這類長 value 會在容器內自動換行，不會再橫向溢出
- 已驗證的絕對檔案路徑，例如日誌或設定檔，點擊後會開啟共用檔案預覽
- 目錄路徑，例如日誌目錄或目前工作階段 Agent 工作區目錄，不會走檔案預覽；它們會顯示獨立的灰色資料夾圖示，並直接在 Finder / Explorer / 系統檔案管理器中打開
- 頂部摘要現在使用 `OpenClaw Doctor`、`目前工作階段 Agent 工作區目錄` 等新的使用者可見命名
- 頂部灰色提示文案固定由前端國際化提供，用來概括 OpenClaw 診斷、管理動作與目前工作階段環境資訊，而不再直接沿用後端 summary 字串

若行為和預期不同，這通常是最值得先看的分頁。

## 檔案預覽能力

從檔案列表、Markdown 連結或圖片縮圖開啟預覽時，App 支援：

- 文字、JSON 與 Markdown 語法高亮
- Markdown front matter 分離顯示
- 圖片縮放、旋轉與重設
- 影片、音訊與 PDF 內嵌預覽
- 在 VS Code 中開啟
- 在 Finder / Explorer / 系統檔案管理器中顯示

`file-preview` 端點需要絕對路徑，因此沒有絕對路徑的項目通常只能顯示標籤，無法深入開啟。
