[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md) | [セッション、Agent、ランタイムモード](./documentation-sessions.md)

# API とトラブルシューティング

## API 概要

### `GET /api/session`

目的:

- 基本的な session metadata を取得する
- model、agent、think mode、available models、available agents、available skills などを返す

### `POST /api/session`

目的:

- session preference を更新する
- `agentId`、`model`、`fastMode`、`thinkMode` をサポートする

### `GET /api/runtime`

目的:

- 現在の runtime snapshot を取得する
- `conversation`、`timeline`、`files`、`artifacts`、`snapshots`、`agents`、`peeks` を返す

### `POST /api/chat`

目的:

- チャットターンを送信する
- 既定で NDJSON をストリームする
- attachments、`fastMode`、`assistantMessageId`、`sessionUser` をサポートする

### `POST /api/chat/stop`

目的:

- 現在タブのアクティブ返信を中断する

### `GET /api/file-preview`

目的:

- ファイル preview metadata を取得する
- インライン text content か media `contentUrl` を返す

### `GET /api/file-preview/content`

目的:

- 絶対パスから実ファイル内容を返す

### `POST /api/file-manager/reveal`

目的:

- 対象ファイルを Finder / Explorer / システム file manager で表示する

## よくある問題

### ページが開かず、バックエンドが `dist` 不足と言う

理由:

- `npm start` や `node server.js` を使って本番バンドルを期待している
- しかし `npm run build` がまだ実行されていない

対処:

- 本番確認なら `npm run build` の後に `npm start`
- 開発なら [クイックスタート](./documentation-quick-start.md) に従い Vite と Node を同時起動

### 開発中にページは開くが API が失敗する

まず確認:

- Frontend は `127.0.0.1:5173` で動いているか
- Backend は `127.0.0.1:3000` で動いているか
- 本番入口ではなく Vite 入口を使っているか

### OpenClaw を入れているのに `mock` のまま

確認事項:

- `~/.openclaw/openclaw.json` が存在するか
- `COMMANDCENTER_FORCE_MOCK=1` が設定されていないか
- `OPENCLAW_BASE_URL` と `OPENCLAW_API_KEY` が空または誤っていないか

### Model や Agent を切り替えても変化しない

考えられる理由:

- まだ `mock` モードで、ローカル preference だけが変化している
- `openclaw` モードで remote session patch が失敗した
- 選択した model が実はその Agent の既定値と同じ

確認場所:

- [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md) の `Environment`
- バックエンドのコンソール出力

### ファイルが preview できない

よくある原因:

- 絶対パスがない
- そのパスのファイルが既に存在しない
- 対象が通常ファイルではない

注意:

- `file-preview` と `file-manager/reveal` はどちらも絶対パスが必要

### 添付内容がなぜ切り詰められるのか

これは想定仕様です。

- テキスト添付はフロントエンドで `120000` 文字までに切り詰められる
- ファイル preview API はテキスト preview を `1 MB` に制限する

大きすぎる内容で chat payload や preview が壊れないようにするためです。

### リロード後に thinking 占位が一瞬見えるのはなぜか

pending turn の復元フローによるものです。

- フロントエンドが先にローカル pending 占位を復元する
- runtime snapshot が最終返信を持って到着すると、それで置き換える

多くの場合、これは正常な復元挙動です。

## より深い構造資料

- フロントエンド・バックエンドの層構造は [アーキテクチャ概要](./architecture.md)
- デモの流れは [プロダクトショーケース](./showcase.md)
- 今後のモジュール分割は [リファクタリングロードマップ](./refactor-roadmap.md)
