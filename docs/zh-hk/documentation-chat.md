[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[返回首頁](./documentation.md) | [介面總覽](./documentation-interface.md) | [工作階段、Agent 與執行模式](./documentation-sessions.md) | [鍵盤快捷鍵](./documentation-shortcuts.md) | [本地持久化與恢復](./documentation-persistence.md)

# 對話、附件與命令

## 訊息傳送

- Enter 傳送模式：Enter 傳送，Shift + Enter 換行
- 連按兩次 Enter 傳送模式：連按兩次 Enter 傳送，Shift + Enter 亦可傳送，單按 Enter 則換行
- ArrowUp / ArrowDown 可瀏覽提示歷史
- Stop 可中止目前回覆

## 隊列

若目前分頁正忙碌，新訊息會先進入隊列，待目前回覆完成後自動送出。

## 附件與 slash 指令

- 圖片會提供預覽
- 文字檔會讀取內容，過長時會截斷
- 支援 /model、/think、/new、/reset 等 slash 指令

## 語音輸入

- 在支援 Web Speech API 的瀏覽器裡，輸入框會在附件和送出按鈕旁顯示麥克風按鈕
- 按一下開始聽寫，再按一下停止；辨識出的文字會寫回目前草稿，不會自動送出
- 語音輸入進行中時，按鈕會顯示脈衝狀態，輸入區也會顯示即時的聆聽 / 轉寫狀態
- 如果瀏覽器不支援語音辨識，或麥克風權限被拒絕，輸入區會顯示不可用或錯誤狀態，而不是靜默失敗
