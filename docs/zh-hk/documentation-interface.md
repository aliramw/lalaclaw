[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[返回首頁](./documentation.md) | [快速開始](./documentation-quick-start.md) | [彩蛋](./documentation-easter-egg.md) | [對話、附件與命令](./documentation-chat.md) | [檢查器、檔案預覽與追蹤](./documentation-inspector.md)

# 介面總覽

LalaClaw 的主畫面可理解為三個部分：上方工作階段控制列、中間聊天工作區，以及右側檢查器。

## 頂部控制區

頂部區域包含：

- 從目前可用清單切換模型
- 顯示目前與最大 context 用量
- 一鍵切換 fast mode
- 在 `off / minimal / low / medium / high / xhigh / adaptive` 之間切換思考模式
- 切換 `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- 切換 `system / light / dark` 主題
- 右上角快捷鍵說明
- 左上角可點擊的龍蝦品牌彩蛋，詳見 [彩蛋](./documentation-easter-egg.md)

## 聊天工作區

主要聊天面板包含：

- Agent 工作階段與 IM 對話共用的標籤列，另有切換器入口可開啟其他 Agent 或 IM 執行緒
- 顯示目前 Agent、活動狀態、字型大小與新工作階段操作的標題列
- 顯示使用者訊息、助理訊息、串流回覆與附件預覽的對話區
- 支援文字、`@` 提及、附件與停止回覆的輸入框

可見的聊天行為包括：

- 使用者訊息靠右，助理訊息靠左
- 回覆進行中時會先出現暫時的 thinking placeholder
- 較長的 Markdown 回覆可產生 outline 方便跳轉標題
- 若你沒有停留在底部，會出現跳到最新內容的按鈕

## 右側檢查器

檢查器目前只有四個主要分頁：

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

它會與目前聊天工作階段同步，集中顯示同一工作階段的檔案活動、摘要、執行紀錄與 runtime 資訊。

## 版面與尺寸

- 聊天區與檢查器之間的分隔線可拖曳
- 檢查器寬度會保存在本機，下一次載入時自動還原
- 聊天字型大小是全域偏好，支援 `small / medium / large`

## 多工作階段標籤

標籤行為遵循以下規則：

- 標籤實際上依真實工作階段識別建立，也就是 `agentId + sessionUser`
- 切換器可開啟 Agent 工作階段，也可直接開啟釘釘、飛書、企微等 IM 對話
- 關閉標籤只會從目前畫面隱藏，不會刪除真正的工作階段狀態
- 已開啟的 Agent 標籤與已開啟的 IM 頻道不會再次出現在切換器中

## 下一步閱讀

- 若要了解發送訊息、附件、排隊與 slash commands，請看 [對話、附件與命令](./documentation-chat.md)
- 若要深入了解右側面板，請看 [檢查器、檔案預覽與追蹤](./documentation-inspector.md)

## 開發工作區徽章

- 在開發模式下，右下角會出現浮動徽章，顯示目前分支、worktree、連接埠和路徑
- 你可以折疊或展開它，也可以不離開瀏覽器就選擇目標 worktree 和目標分支
- 徽章可在原位重啟開發服務；當你切換到其他分支或 worktree 時，它會先完成切換，再等待預覽重新可用
