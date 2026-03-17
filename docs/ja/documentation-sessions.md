[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [チャット、添付、コマンド](./documentation-chat.md) | [キーボードショートカット](./documentation-shortcuts.md) | [ローカル保存と復元](./documentation-persistence.md)

# セッション、エージェント、ランタイムモード

## セッション識別

フロントエンドとバックエンドは 2 つの値を中心にセッション状態を管理します。

- `agentId`
- `sessionUser`

意味は次のとおりです。

- `agentId`: 誰と協調しているか
- `sessionUser`: 現在のコンテキストがどの会話線に属するか

同じエージェントでも複数の `sessionUser` を持てるため、エージェントを変えずに新しいコンテキストを作れます。

## エージェントセッションタブ

フロントエンドのチャットタブはエージェント単位で整理されます。

- 既定のメインタブは `agent:main`
- 開いた各エージェントタブは独自のメッセージ、下書き、スクロール位置、タブメタデータを持つ
- タブを閉じてもセッション履歴自体は削除されない

## セッション単位の設定

バックエンドに保存される主な設定:

- エージェント
- モデル
- 高速モード
- 思考モード

切替ルール:

- エージェント切替時にモデルを明示しなければ、そのエージェントの既定モデルに戻る
- モデルは既定値から外れたときだけ保存される
- 思考モードは妥当性確認後に反映される

## 新しいセッションの開始

コンテキストをクリアする主な方法は 3 つあります。

- チャットヘッダーの新規セッション操作
- `Cmd/Ctrl + N`
- `/new` または `/reset`

違い:

- UI ボタンとショートカットは単純なリセット用途
- `/new` と `/reset` は trailing prompt を持てるため、新しいセッションですぐ継続できる

## `mock` モード

次の場合に `mock` になります。

- ローカル OpenClaw gateway が見つからない
- または `COMMANDCENTER_FORCE_MOCK=1` が設定されている

特徴:

- live gateway がなくても UI 全体を使用できる
- チャット、インスペクター、ファイル、環境がデモ用の mock データを返す
- ローカル開発、UI 結合、テストに向く

## `openclaw` モード

次の場合に `openclaw` になります。

- `~/.openclaw/openclaw.json` を検出した場合
- または `OPENCLAW_BASE_URL` などを明示設定した場合

特徴:

- `/api/chat` は実際の gateway に送信する
- `/api/runtime` とインスペクターは transcript、セッション状態、browser-control 情報を読む
- モデルや思考モードの変更はリモートセッションを patch できる

## メンション可能なエージェント / スキルの由来

`@` メニューは固定ではなく、ランタイム設定から導出されます。

- メンション可能なエージェント: 現在のエージェントの `subagents.allowAgents`
- 利用可能なスキル: 現在のエージェント、許可された subagent、ローカル skill ディレクトリ、skill lock 情報

そのため、メニューに出ないエージェントや skill があっても、原因は表示より設定範囲や権限であることが多いです。

## 新しいセッションを始めるべきタイミング

- 会話履歴が長くなりコンテキスト使用量が増えたとき
- タスクの方向が変わり、古い文脈を引きずりたくないとき
- モデルとモードは維持したまま会話だけリセットしたいとき
