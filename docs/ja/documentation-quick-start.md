[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [セッション、Agent、ランタイムモード](./documentation-sessions.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# クイックスタート

## 必要環境

- リポジトリの [`.nvmrc`](../../.nvmrc) に定義されている Node.js を使用します。現在は `22` です。
- 初回実行前にプロジェクトルートで `npm ci` を実行します。
- ローカルの `.env.local` を作る場合は `npm run lalaclaw:init` を実行します。

## 新しいマシンで GitHub からインストール

OpenClaw がすでにインストールされていて、`~/.openclaw/openclaw.json` が使える場合は、まず次を実行します。

```bash
git clone https://github.com/aliramw/CommandCenter.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

補足:

- `npm run doctor` は Node.js、OpenClaw、ローカル設定、ポート使用状況を確認します
- `npm run doctor -- --json` は同じ診断結果を `summary.status` と `summary.exitCode` 付きの JSON で返します
- `npm run lalaclaw:init` は `.env.local` の作成や更新を補助します
- `npm run lalaclaw:init -- --write-example` は `.env.local.example` を対話なしで対象の設定ファイルへコピーします
- `npm run lalaclaw:start` は `npm run build` 後の推奨本番起動コマンドです
- `npm run lalaclaw:start` は現在の terminal 上で動くため、その terminal を閉じると停止します
- すでに設定が揃っている場合は `npm run lalaclaw:init` を省略できます
- 手動で設定したい場合は [`.env.local.example`](../../.env.local.example) を出発点にできます

## 開発モード

開発時はフロントエンドとバックエンドを同時に起動し、ブラウザの入口には Vite ページを使います。

1コマンドで起動することもできます。

```bash
npm run dev:all
```

個別に起動する場合は次の手順です。

### 1. フロントエンドを起動

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Frontend URL:

```text
http://127.0.0.1:5173
```

### 2. バックエンドを起動

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

Backend URL:

```text
http://127.0.0.1:3000
```

### 3. アプリを開く

- 開発時のブラウザ入口は常に `http://127.0.0.1:5173`
- 開発中の `/api/*` は `vite.config.mjs` により `http://127.0.0.1:3000` にプロキシされます

## 本番ビルドモード

ビルド済みアプリを確認したい場合は次を実行します。

```bash
npm run build
npm run lalaclaw:start
```

注意:

- `npm run lalaclaw:start` は既存の `dist/` を前提とします
- `npm run build` を省くと、バックエンドは `503 Web app build is missing` を返します
- そのため通常のフロントエンド開発にはビルドモードは向きません

## macOS で常駐する本番デプロイ

macOS で terminal を閉じた後も動かし続けたい場合は、`launchd` を使ってください。

1. まずアプリをビルドします。

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. リポジトリ内のスクリプトで plist を生成します。

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. 読み込みます。

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

よく使うコマンド:

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

詳しい macOS 手順は [deploy/macos/README.md](../../deploy/macos/README.md) を参照してください。

## `mock` と OpenClaw

起動時にバックエンドは `~/.openclaw/openclaw.json` を読み取ろうとします。

- ローカル gateway と token が見つかれば `openclaw` モード
- 見つからなければ既定で `mock` モード

`mock` を強制:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

CLI で設定を作る場合:

```bash
npm run lalaclaw:init
npm run doctor
```

`remote-gateway` モードでは、`doctor` が実際にリモート gateway にアクセスし、設定した model と agent が使えるか最小リクエストで確認します。

gateway を明示的に設定:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

Responses API に近い gateway の場合:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## 起動後に見えるもの

- 左上に `LalaClaw`
- ヘッダーに model、context、fast mode、thinking mode の制御
- 添付ボタンと送信ボタン付きの composer
- `Run Log / Files / Summaries / Environment / Collab / Preview` の inspector タブ
- `mock` モードでも動作するチャット返信

## 次に読むもの

- UI 全体の説明は [画面概要](./documentation-interface.md)
- すぐに操作フローを知りたいなら [チャット、添付、コマンド](./documentation-chat.md)
