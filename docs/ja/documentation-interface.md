[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [イースターエッグ](./documentation-easter-egg.md) | [チャット、添付、コマンド](./documentation-chat.md) | [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md)

# 画面概要

LalaClaw のメイン画面は、上部のセッションバー、チャットワークスペース、右側のインスペクターの 3 つで構成されています。

## ヘッダーとセッション制御

上部のセッションバーには次が含まれます。

- 利用可能なモデル一覧からのモデル切替
- 現在のコンテキスト使用量表示
- 高速モードの切替
- `off / minimal / low / medium / high / xhigh / adaptive` の思考モード選択
- `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்` の言語切替
- `system / light / dark` の外観切替
- 右上のショートカットヘルプ
- 左上のロブスターをクリックして開くブランド演出。詳しくは [イースターエッグ](./documentation-easter-egg.md)

## チャットワークスペース

主な構成:

- Agent ごとのセッションタブ
- 現在の Agent、稼働状態、文字サイズ、新規セッション操作を持つヘッダー
- ユーザーメッセージ、アシスタントメッセージ、ストリーミング返信、添付プレビューを表示する会話領域
- テキスト、`@` メンション、添付、返信停止を扱う composer

見た目の挙動:

- ユーザーメッセージは右寄せ、アシスタントメッセージは左寄せ
- 返信中は一時的な thinking プレースホルダーが表示される
- 長い Markdown 返信ではアウトラインが生成される場合がある
- 下端から離れると最新返信へ戻るボタンが出る

## 右側インスペクター

インスペクターには 6 つの主要なタブがあります。

- `実行ログ`
- `ファイル`
- `要約`
- `環境`
- `協調`
- `プレビュー`

これらはチャットセッションと強く連動しており、同じ実行に紐づくファイル操作、ツール呼び出し、要約、環境スナップショットがまとめて表示されます。

## レイアウトとサイズ

- チャットとインスペクターの境界はドラッグ可能
- インスペクター幅はローカル保存され次回も復元される
- チャット文字サイズは `small / medium / large` のグローバル設定

## 複数セッションタブ

タブの基本ルール:

- タブは Agent 単位で整理される
- 実際のセッション識別は `agentId + sessionUser`
- タブを閉じてもセッション自体は削除されない
- 既に開いている Agent は切替メニューに重複表示されない

## 次に読むもの

- 送信、添付、キュー、Slash コマンドは [チャット、添付、コマンド](./documentation-chat.md)
- 右側パネルの詳細は [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md)
