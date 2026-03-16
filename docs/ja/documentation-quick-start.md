[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [セッション、Agent、ランタイムモード](./documentation-sessions.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# クイックスタート

## 必要環境

- リポジトリの [`.nvmrc`](../../.nvmrc) に定義されている Node.js を使用します。現在は `22` です。
- 初回実行前にプロジェクトルートで `npm ci` を実行します。

## 開発モード

開発時はフロントエンドとバックエンドを同時に起動し、ブラウザの入口には Vite ページを使います。

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
npm start
```

注意:

- `npm start` は既存の `dist/` を前提とします
- `npm run build` を省くと、バックエンドは `503 Web app build is missing` を返します
- そのため通常のフロントエンド開発には `npm start` は向きません

## `mock` と OpenClaw

起動時にバックエンドは `~/.openclaw/openclaw.json` を読み取ろうとします。

- ローカル gateway と token が見つかれば `openclaw` モード
- 見つからなければ既定で `mock` モード

`mock` を強制:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

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
