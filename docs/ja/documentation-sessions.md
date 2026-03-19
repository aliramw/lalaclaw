[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [チャット、添付、コマンド](./documentation-chat.md) | [キーボードショートカット](./documentation-shortcuts.md) | [ローカル保存と復元](./documentation-persistence.md)

# セッション、エージェント、ランタイムモード

## セッションの識別方法

フロントエンドとバックエンドは、次の 2 つの値を中心にセッション状態を管理します。

- `agentId`
- `sessionUser`

実際には:

- `agentId` はどのエージェントと協調しているかを示す
- `sessionUser` は現在のコンテキストをどの会話線が所有しているかを示す

同じエージェントでも複数の `sessionUser` を持てるため、エージェントを変えずに新しいコンテキストを作れます。

## Agent と IM のタブ

チャットタブは表示ラベルではなく、実際のセッション識別子で整理されます。

- 既定のメインタブは `agent:main`
- 追加の Agent タブは同じ `agentId` を共有しつつ、それぞれ独自の `sessionUser` を持てる
- DingTalk、Feishu、WeCom などの IM 会話も switcher から直接タブとして開ける
- 各タブはメッセージ、下書き、スクロール位置、いくつかのセッションメタデータを個別に保持する
- タブを閉じても基礎となる履歴は削除されず、UI から一時的に隠れるだけ

つまり:

- 2 つのタブが同じ Agent を指しながら、異なる `sessionUser` を持つことがある
- IM タブも内部では `agentId + sessionUser` として解決される
- すでに開いている Agent タブと IM チャンネルは switcher から除外される

## セッション単位の設定

バックエンドに保存される主な設定:

- Agent
- Model
- Fast mode
- Think mode

## 新しいセッションの開始

コンテキストをリセットする主な方法:

- チャットヘッダーの新規セッション操作
- `Cmd/Ctrl + N`
- `/new` または `/reset`

## `mock` モード

ローカル OpenClaw gateway が見つからない場合、または `COMMANDCENTER_FORCE_MOCK=1` が設定されている場合に `mock` モードへ入ります。

## `openclaw` モード

`~/.openclaw/openclaw.json` が見つかった場合、または `OPENCLAW_BASE_URL` と関連する環境変数が設定されている場合に `openclaw` モードへ入ります。
