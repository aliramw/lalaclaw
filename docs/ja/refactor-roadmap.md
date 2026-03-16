[English](../en/refactor-roadmap.md) | [中文](../zh/refactor-roadmap.md) | [繁體中文（香港）](../zh-hk/refactor-roadmap.md) | [日本語](../ja/refactor-roadmap.md) | [한국어](../ko/refactor-roadmap.md) | [Français](../fr/refactor-roadmap.md) | [Español](../es/refactor-roadmap.md) | [Português](../pt/refactor-roadmap.md) | [Deutsch](../de/refactor-roadmap.md) | [Bahasa Melayu](../ms/refactor-roadmap.md) | [தமிழ்](../ta/refactor-roadmap.md)

# リファクタリングロードマップ

> Navigation: [Documentation Home](./documentation.md) | [セッション、Agent、ランタイムモード](./documentation-sessions.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md) | [アーキテクチャ概要](./architecture.md) | [プロダクトショーケース](./showcase.md)

## 目標

- `src/App.jsx` と `server.js` の保守リスクを下げる
- UI composition、data orchestration、OpenClaw integration を分離する
- 挙動を保ちながら、より焦点の合ったテストにする

## 現在の課題

- `src/App.jsx` は persistence、polling、composer behavior、queue management、theming、runtime synchronization を混在させている
- `server.js` は HTTP routing、runtime config detection、session preference storage、OpenClaw transport、transcript parsing、dashboard projection を混在させている
- リポジトリには Vite app entrypoint と古い static app の痕跡が残っている
- 一部の server tests は mock 固定にしない限り、ローカル OpenClaw 発見に依存する

## 目標構成

### フロントエンド

- `src/app/bootstrap/`
  - App bootstrap、providers、global styles、root rendering
- `src/features/session/`
  - Session runtime polling、model / agent selection、fast mode、think mode
- `src/features/chat/`
  - Composer、queueing、send flow、prompt history、attachment handling
- `src/features/inspector/`
  - Timeline、files、artifacts、snapshots、agents、peeks
- `src/shared/`
  - UI primitives、markdown rendering、formatting helpers、storage helpers

### バックエンド

- `server/config.js`
  - Runtime config detection、mock override、local OpenClaw discovery
- `server/session-store.js`
  - Session preferences、local conversation cache
- `server/openclaw-client.js`
  - HTTP / gateway RPC calls、session patching、direct request vs session mode
- `server/transcript.js`
  - Transcript reading、message normalization、file extraction、timeline / snapshot projection
- `server/routes.js`
  - `/api/session`、`/api/runtime`、`/api/chat`、static file handling
- `server/index.js`
  - Server creation と startup のみ

## 推奨順序

### フェーズ 1: ランタイム境界を安定化する

- `server.js` を public entrypoint に保ちつつ、pure helper を小さい module に移す
- 単一の runtime config module を導入し、environment detection を集約する
- mock mode と local discovery のための明示的 test toggle を追加する

### フェーズ 2: フロントエンドの状態ドメインを分離する

- attachment storage と prompt history を `src/features/chat/state/` に移す
- runtime polling と snapshot application を `src/features/session/state/` に移す
- `App.jsx` は composition shell として保つ

### フェーズ 3: OpenClaw の転送処理とスナップショット投影を分離する

- request sending と transcript parsing を分離する
- `buildDashboardSnapshot` を小さい関数の合成にする
- full route test ではなく transcript fixture ベースの parser test を増やす

### フェーズ 4: 旧来の静的アプリを取り除く

- 旧 `public/index.html` と `public/app.js` は削除され、今は `dist` が唯一の frontend bundle
- もし依存が残るなら、Vite entry か build assets のみを使うよう整理する
- README を更新してローカル実行手順を現行 frontend と一致させる

## 最初にすすめる PR

1. server runtime config と session store の抽出
2. frontend chat send flow を `useChatController` に抽出
3. frontend runtime polling を `useRuntimeSnapshot` に抽出
4. transcript fixture と parser unit test の追加
5. 依存がないことを確認した後に legacy static app を削除

## テスト戦略

- route test は既定で mock mode を使う
- 次に対して focused unit test を追加する:
  - transcript parsing
  - session preference resolution
  - attachment persistence and hydration
  - prompt history navigation
- 実 route の integration test は少数にし、明示的な環境設定で保護する

## 注意すべきリスク

- Session reset は frontend local state と backend session identity の両方に影響する
- Attachment persistence は `localStorage` と IndexedDB をまたぐため、移行挙動を壊さない必要がある
- `OpenClaw` モードは polling と session patch の順序に敏感であり、transport 分離時も順序保持が必要
