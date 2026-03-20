[English](../en/testing-e2e.md) | [日本語](../ja/testing-e2e.md)

# ブラウザ E2E テスト

このガイドは、LalaClaw におけるブラウザレベルのエンドツーエンドテスト方針を定義します。

[CONTRIBUTING.md](../../CONTRIBUTING.md) とあわせて読んでください。`CONTRIBUTING.md` は全体のコントリビューションフローを説明し、この文書では Playwright をいつ追加すべきか、どうやって安定性を保つか、そして現在のリポジトリがブラウザテストに何を期待しているかを説明します。

## 現在の構成

- フレームワーク: Playwright
- テストディレクトリ: `tests/e2e/`
- メイン設定: [`playwright.config.js`](../../playwright.config.js)
- テストサーバー起動スクリプト: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

現在のセットアップでは次を起動します。

- フロントエンド開発サーバー: `http://127.0.0.1:5173`
- バックエンド開発サーバー: `http://127.0.0.1:3000`

Playwright の起動スクリプトはバックエンドを `COMMANDCENTER_FORCE_MOCK=1` モードで実行するため、ブラウザテストは既定では実際の OpenClaw 環境に依存しません。

## ブラウザ E2E が必要な場合

変更が次のいずれかに影響する場合は、ブラウザ e2e を追加または更新してください。

- メッセージ送信 / stop / retry の挙動
- キュー待ちターンと会話領域への遅延表示
- セッション bootstrap、セッション切り替え、またはタブラウティング
- 実際のレンダー後にしか見えない hydration や復元の挙動
- hook や controller テストだけでは信頼しにくいブラウザ可視の回帰

純粋な状態遷移であれば controller レベルまたは `App` レベルの Vitest を優先してください。実 DOM のタイミング、フォーカス挙動、ルーティング、リクエスト順序、多段 UI フローに依存する場合にブラウザ e2e を追加します。

## 最初に優先してカバーするもの

リポジトリに最初から広いブラウザカバレッジは不要です。まずは高リスクのユーザーフローを安定させます。

優先すべきフロー:

1. アプリ起動と初回レンダー
2. 通常の送信 / 応答 1 サイクル
3. キュー中の送信が自分の番まで会話に入らないこと
4. 進行中の応答に対する stop / abort
5. IM タブや agent 切り替えなどのセッション bootstrap 経路

バグ修正がキュー、ストリーミング、stop、hydration、session/runtime 同期に触れる場合は、通常そのユーザー可視の失敗モードを直接狙ったブラウザ回帰を 1 本追加します。

## 安定性ルール

ブラウザ e2e は見た目の細部ではなく、安定した挙動確認のために書きます。

- 内部実装ではなく、ユーザーに見える挙動を優先して検証する
- テキスト、role、label、安定した操作要素に対して検証する
- バグ自体がアニメーション時序に関係する場合を除き、アニメーション時間に依存しない
- class 自体が挙動でない限り、壊れやすい Tailwind クラス名への依存を避ける
- 関連する `/api/*` をテスト内で route mock し、ネットワーク状態を決定的に保つ
- 入力、クリック、タブフォーカス、リクエスト順序は実ブラウザ操作で検証する

キューやストリーミングでは次を優先して確認します。

- メッセージが会話領域に表示されているか
- まだキュー領域にだけ残っているか
- 前のターンが完了した後にだけ表示されるか
- 表示順が実際のターン順と一致しているか

## Mock 戦略

既定ではブラウザ e2e を実際の OpenClaw デプロイに直接向けないでください。

推奨順序:

1. Playwright テスト内で必要な `/api/*` を route する
2. リポジトリの mock モードを使う
3. タスクが明示的に同等のライブ検証を求める場合だけ実外部依存を使う

現在の [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) はこのパターンに従っています。

- `/api/auth/state` は stub 済み
- `/api/lalaclaw/update` は stub 済み
- `/api/runtime` は stub 済み
- `/api/chat` は各テストで制御し、キュー順序と完了タイミングを決定的にしている

## 作成ガイドライン

各ブラウザ e2e は狭い責務に保ってください。

- 1 つの spec ファイルは通常 1 つのプロダクト領域に集中する
- 1 つのテストは通常 1 つのユーザーフローを検証する
- 大きな JSON を各テストに貼るより、小さな helper / fixture を用意する
- snapshot builder はできるだけ再利用し、`App.test.jsx` と揃える

良い例:

- 「キュー中のターンは実際に開始するまで会話に入らない」
- 「stop すると送信ボタンが戻る」
- 「Feishu の bootstrap タブが初回送信前にネイティブ session user に解決される」

価値の低い例:

- 「ボタンがこの utility class を正確に持つ」
- 「無関係な 3 つのフローを 1 テストに詰め込む」
- 「route mock で十分なのに実リモートサービスを使う」

## ローカル実行

最初に Playwright ブラウザを一度インストールします。

```bash
npm run test:e2e:install
```

ブラウザ e2e を実行:

```bash
npm run test:e2e
```

ブラウザを表示して実行:

```bash
npm run test:e2e:headed
```

Playwright UI を使う:

```bash
npm run test:e2e:ui
```

## CI の期待値

CI にはブラウザ e2e 専用ジョブがあり、[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) に定義されています。

このジョブは小さく安定しているべきです。

- ブラウザスイートは各 PR で安定して回る規模に保つ
- 幅広い探索的シナリオより先に、高価値の回帰を追加する
- flaky wait や長い sleep を持ち込まない

新しいブラウザテストが遅すぎる、または環境依存が強すぎる場合は、まず単純化または安定化するまで既定の `test:e2e` に入れないでください。

## 推奨レビュー項目

ブラウザ e2e をマージする前に確認すること:

- 本当にブラウザ e2e が必要か。それとも `App` / controller カバレッジで十分か
- 実装の細部ではなくユーザー可視の挙動を検証しているか
- 必要なネットワーク状態を決定的に制御しているか
- 6 か月後に UI の見た目が変わっても意味のあるテストか
- 私たちが本当に気にしているユーザー回帰で失敗するテストか

## 関連ファイル

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
