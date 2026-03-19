[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md) | [セッション、エージェント、ランタイムモード](./documentation-sessions.md)

# API とトラブルシューティング

## API 概要

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## よくある問題

### ページが開かず、バックエンドが `dist` 不足と言う

- 本番確認なら先に `npm run build`、その後に `npm start`
- 開発用途なら [クイックスタート](./documentation-quick-start.md) に従って Vite と Node を同時に起動する

### インストール済みアプリが白画面になり、コンソールに `mermaid-vendor` が出る

典型的な症状:

- アプリの bundle は読み込まれるが、画面が空白のまま
- ブラウザコンソールに `mermaid-vendor-*.js` 由来のエラーが出る

考えられる主因:

- 古いパッケージ版 `2026.3.19-1` を使っている
- そのビルドは Mermaid 専用の手動 vendor split を使っており、インストール後の production 起動を壊すことがあった

対処:

- `lalaclaw@2026.3.19-2` 以降へ更新する
- source checkout から実行している場合は最新の `main` を pull して `npm run build` し直す

### 開発中はページが開くが API 呼び出しが失敗する

まず確認:

- frontend が `127.0.0.1:5173` で動いているか
- backend が `127.0.0.1:3000` で動いているか
- production server ではなく Vite エントリを使っているか

### OpenClaw を入れているのに `mock` のまま

確認事項:

- `~/.openclaw/openclaw.json` が存在するか
- `COMMANDCENTER_FORCE_MOCK=1` が設定されていないか
- `OPENCLAW_BASE_URL` と `OPENCLAW_API_KEY` が空または誤っていないか

### モデルや Agent を切り替えても変化しない

考えられる理由:

- まだ `mock` モードでローカル設定だけが変わっている
- `openclaw` モードで remote session patch が失敗した
- 選択した model がその Agent の既定値と同じ

確認場所:

- [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md) の `Environment`
- バックエンドのコンソール出力

別タブへ切り替えたときだけ問題が出るなら:

- switcher が対象セッションを開き終わってから次の turn を送っているか確認する
- `Environment` で `runtime.transport`、`runtime.socket`、`runtime.fallbackReason` を確認する
