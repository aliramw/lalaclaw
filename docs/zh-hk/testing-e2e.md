[English](../en/testing-e2e.md) | [繁體中文（香港）](../zh-hk/testing-e2e.md)

# 瀏覽器 E2E 測試

這份指南定義了 LalaClaw 的瀏覽器端到端測試規範。

請配合 [CONTRIBUTING.md](../../CONTRIBUTING.md) 一起閱讀。`CONTRIBUTING.md` 說明整體貢獻流程；本文件則聚焦在什麼情況下應加入 Playwright 覆蓋、如何保持測試穩定，以及目前儲存庫對瀏覽器測試的預期。

## 目前測試堆疊

- 框架：Playwright
- 測試目錄：`tests/e2e/`
- 主設定：[`playwright.config.js`](../../playwright.config.js)
- 測試服務啟動腳本：[`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

目前設定會啟動：

- 前端開發服務：`http://127.0.0.1:5173`
- 後端開發服務：`http://127.0.0.1:3000`

Playwright 啟動腳本會讓後端以 `COMMANDCENTER_FORCE_MOCK=1` 模式運行，因此瀏覽器測試預設不依賴真實 OpenClaw 環境。

## 什麼時候需要補瀏覽器 E2E

當改動影響以下任一類行為時，應新增或更新瀏覽器 e2e：

- 訊息送出 / 停止 / 重試行為
- 排隊回合與延遲進入對話區的行為
- 工作階段 bootstrap、切換工作階段或 tab 路由
- 只有真實渲染後才會暴露的 hydration 與恢復行為
- 單靠 hook 或 controller 測試難以建立信心的瀏覽器可見回歸

純狀態轉換優先使用 controller 級或 `App` 級 Vitest 測試。只有當風險依賴真實 DOM 時序、焦點行為、路由、請求順序或多步 UI 流程時，再補瀏覽器 e2e。

## 優先覆蓋內容

儲存庫不需要一開始就鋪大量瀏覽器覆蓋，先把高風險使用者流程穩定住。

優先覆蓋這些流程：

1. 應用啟動與首屏渲染
2. 一次正常送出 / 回覆循環
3. 排隊訊息在輪到之前不進入對話區
4. 回覆進行中觸發 stop / abort
5. IM tab、agent 切換等工作階段 bootstrap 路徑

如果 bug 修復涉及排隊、串流、stop、hydration 或 session/runtime 同步，通常應補一條直接對準該使用者可見故障的瀏覽器回歸測試。

## 穩定性規則

瀏覽器 e2e 的目標是穩定驗證行為，而不是驗證視覺細節。

- 優先斷言使用者可見行為，而不是內部實作細節
- 優先斷言文字、role、label 與穩定控制項
- 除非 bug 本身和動畫時序有關，否則不要依賴動畫時間
- 除非 class 本身就是行為的一部分，否則避免斷言脆弱的 Tailwind 類名
- 對關鍵 `/api/*` 請求做 route mock，確保網路行為可控
- 輸入、點擊、tab 焦點和請求順序盡量走真實瀏覽器互動

對於排隊或串流流程，優先斷言：

- 訊息是否出現在對話區
- 它是否仍只停留在排隊區
- 它是否必須等前一輪完成後才出現
- 可見順序是否與實際回合順序一致

## Mock 策略

預設不要把瀏覽器 e2e 直接打到真實 OpenClaw 部署。

建議按這個順序處理：

1. 在 Playwright 測試裡 route 相關 `/api/*` 請求
2. 使用儲存庫現有的 backend mock 模式
3. 只有任務明確要求等價真實鏈路時，才接入真實外部依賴

目前 [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) 就採用這個模式：

- `/api/auth/state` 已 stub
- `/api/lalaclaw/update` 已 stub
- `/api/runtime` 已 stub
- `/api/chat` 由各測試分別控制，確保排隊順序與完成時序可預測

## 撰寫建議

讓每條瀏覽器 e2e 都維持單一職責。

- 一個 spec 檔通常只聚焦一個產品區域
- 一條測試通常只驗證一個使用者流程
- 優先抽出小型 helper / fixture 檔，而不是在每條測試裡複製大段 JSON
- 盡量重用 snapshot builder，讓瀏覽器測試與 `App.test.jsx` 保持一致

好的例子：

- 「排隊訊息在真正開始前不進入對話區」
- 「stop 後送出按鈕會恢復」
- 「Feishu bootstrap tab 在首次送出前解析成原生 session user」

價值較低的例子：

- 「按鈕必須精確包含這組 utility class」
- 「一條測試同時覆蓋三個無關流程」
- 「明明可以 route mock，卻仍依賴真實遠端服務」

## 本地執行

先安裝一次 Playwright 瀏覽器：

```bash
npm run test:e2e:install
```

執行瀏覽器 e2e：

```bash
npm run test:e2e
```

以可見瀏覽器執行：

```bash
npm run test:e2e:headed
```

使用 Playwright UI：

```bash
npm run test:e2e:ui
```

## CI 約定

CI 裡已經有獨立的瀏覽器 e2e job，定義在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)。

這個 job 應保持聚焦且穩定：

- 瀏覽器用例規模要夠小，能在每個 PR 上穩定執行
- 先加入高價值回歸，再考慮更廣泛的探索性場景
- 避免引入 flaky wait 或長時間 sleep

如果一條瀏覽器測試過慢、過度依賴環境，暫時不適合進入預設 `test:e2e` 路徑，應先簡化或穩定。

## 建議 Review 清單

在合併瀏覽器 e2e 改動前，至少檢查：

- 這次是否真的需要瀏覽器 e2e，還是 `App` / controller 測試就足夠？
- 測試斷言的是使用者可見行為，而不是實作細節嗎？
- 所需的網路狀態是否已被可預測地控制？
- 如果 6 個月後 UI 樣式改變，這條測試仍然有意義嗎？
- 這條測試是否真的會在我們關心的使用者回歸上失敗？

## 相關檔案

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
