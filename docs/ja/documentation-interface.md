[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md)

[ホームへ戻る](./documentation.md) | [クイックスタート](./documentation-quick-start.md) | [イースターエッグ](./documentation-easter-egg.md) | [チャット、添付、コマンド](./documentation-chat.md) | [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md)

# 画面概要

LalaClaw のメイン画面は、セッション制御ヘッダー、チャットワークスペース、右側 inspector の 3 つで構成されています。

## ヘッダーとセッション制御

上部の `SessionOverview` には次が含まれます。

- 利用可能な model 一覧からの model 切替
- 現在の context 使用量表示
- fast mode の切替
- `off / minimal / low / medium / high / xhigh / adaptive` の thinking mode 選択
- `中文 / English / 日本語 / Français / Español / Português` の言語切替
- `system / light / dark` のテーマ切替
- 右上のショートカットヘルプ
- 左上のロブスターをクリックするブランド彩蛋。詳しくは [イースターエッグ](./documentation-easter-egg.md)

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

Inspector には 6 つの主要面があります。

- `Run Log`
- `Files`
- `Summaries`
- `Environment`
- `Collab`
- `Preview`

これらはチャットセッションと強く連動しており、同じ実行に紐づくファイル操作、ツール呼び出し、要約、環境スナップショットがまとめて表示されます。

## レイアウトとサイズ

- チャットと inspector の境界はドラッグ可能
- Inspector 幅はローカル保存され次回も復元される
- チャット文字サイズは `small / medium / large` のグローバル設定

## 複数セッションタブ

タブの基本ルール:

- タブは Agent 単位で整理される
- 実際のセッション識別は `agentId + sessionUser`
- タブを閉じてもセッション自体は削除されない
- 既に開いている Agent は切替メニューに重複表示されない

## 次に読むもの

- 送信、添付、キュー、Slash コマンドは [チャット、添付、コマンド](./documentation-chat.md)
- 右側パネルの詳細は [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md)
