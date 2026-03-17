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

## 透過 OpenClaw 安裝到遠端主機

如果你有一台可以由 OpenClaw 控制的遠端機器，而且你也能透過 SSH 登入該機器，那麼你可以讓 OpenClaw 在遠端安裝並啟動 LalaClaw，然後透過 SSH 連接埠轉發在本地使用它。

給 OpenClaw 的示例指令：

~~~text
安裝這個 https://github.com/aliramw/lalaclaw
~~~

典型流程：

1. OpenClaw 在遠端機器上 clone 倉庫
2. OpenClaw 安裝相依套件並啟動應用
3. LalaClaw 在遠端機器的 `127.0.0.1:3000` 上監聽
4. 你使用 SSH 把這個遠端連接埠轉發到本地機器
5. 你在本地瀏覽器中開啟轉發後的網址

示例 SSH 連接埠轉發：

~~~bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
~~~

然後開啟：

~~~text
http://127.0.0.1:3000
~~~

說明：

- 這種方式下，本地的 `127.0.0.1:3000` 實際上對應的是遠端機器的 `127.0.0.1:3000`
- 應用程序、OpenClaw 設定、transcript、日誌與工作區都在遠端機器上
- 這種方式比直接把 dashboard 暴露在公網上更安全，因為否則任何知道這個網址的人，都可以在沒有密碼的情況下直接使用這個控制台
- 如果你本地的 `3000` 連接埠已被佔用，可以改用 `3300:127.0.0.1:3000`，再開啟 `http://127.0.0.1:3300`

## 重要說明

- 本地 UI 開發請使用 npm run dev:all，不要使用 npm start
- doc、ppt、pptx 預覽需要 LibreOffice
- COMMANDCENTER_FORCE_MOCK=1 可強制切換到 mock 模式
