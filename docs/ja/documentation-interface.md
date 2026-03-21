[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [イースターエッグ](./documentation-easter-egg.md) | [チャット、添付、コマンド](./documentation-chat.md) | [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md)

# 画面概要

LalaClaw のメイン画面は、上部のセッション制御ヘッダー、中央のチャットワークスペース、右側のインスペクターの 3 つで構成されます。

## ヘッダーとセッション制御

上部エリアには次が含まれます。

- 利用可能なモデル一覧からのモデル切替
- 現在のコンテキスト使用量と最大値の表示
- fast mode の切替
- `off / minimal / low / medium / high / xhigh / adaptive` から選ぶ思考モード
- `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்` の言語切替
- `system / light / dark` のテーマ切替
- 右上のショートカットヘルプ
- 左上のクリック可能なロブスター。詳しくは [イースターエッグ](./documentation-easter-egg.md)

## チャットワークスペース

主な構成:

- Agent セッションと IM 会話をまとめて並べるタブ列。別の Agent や IM スレッドを開く switcher 入口もある
- 現在の Agent、活動状態、文字サイズ、新規セッション操作を持つヘッダー
- ユーザーメッセージ、アシスタントメッセージ、ストリーミング返信、添付プレビューを表示する会話領域
- テキスト、`@` メンション、添付、返信停止を扱う composer

見た目の挙動:

- ユーザーメッセージは右寄せ、アシスタントメッセージは左寄せ
- 返信中は一時的な thinking placeholder が先に表示される
- 長い Markdown 返信では見出しジャンプ用の outline が生成されることがある
- 最下部から離れると最新位置へ戻るボタンが表示される

## 右側インスペクター

インスペクターは現在 4 つの主要タブに整理されています。

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

このパネルはアクティブなチャットセッションと強く連動し、同じセッションのファイル操作、要約、実行記録、ランタイム情報をまとめて表示します。

## 複数セッションタブ

タブは次のルールで動作します。

- タブは見た目の名前ではなく、実際のセッション識別子 `agentId + sessionUser` で区別される
- switcher は Agent セッションだけでなく DingTalk、Feishu、WeCom などの IM 会話も開ける
- タブを閉じてもセッション状態は削除されず、現在の表示から隠れるだけ
- すでに開いている Agent タブと IM チャンネルは switcher の一覧から除外される

## 開発ワークスペースバッジ

- 開発モードでは、右下に現在のブランチ、worktree、ポート、パスを表示するフローティングバッジが出ます
- バッジは折りたたみ / 展開でき、ブラウザを離れずに対象 worktree と対象ブランチを選べます
- このバッジから開発サービスをその場で再起動でき、別のブランチや worktree を選んだ場合は切り替え後にプレビュー復帰を待ちます
