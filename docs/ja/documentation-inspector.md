[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [チャット、添付、コマンド](./documentation-chat.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# インスペクター、ファイルプレビュー、トレース

右側のインスペクターは LalaClaw を特徴づける重要な UI です。現在のセッションに関する実行履歴、ファイル操作、要約、環境情報を 1 か所にまとめて表示します。

## 実行ログ

`実行ログ` は実行ラウンド単位で以下を表示します。

- ラウンド名と時刻
- プロンプト要約
- ツール呼び出し一覧
- 各ツールの入力、出力、状態
- そのラウンドに紐づくファイル変更
- 関連スナップショット

次の問いに向いています。

- 直前にエージェントはどんなツールを使ったか
- ある結果はどのラウンドで発生したか

## ファイル

`ファイル` は次の分類で表示されます。

- 作成
- 更新
- 閲覧

操作:

- クリックでプレビューを開く
- 右クリックで絶対パスをコピー

この一覧は OpenClaw の transcript だけでなく、添付や楽観状態から拾ったローカルのファイル情報も含みます。

## 要約

`要約` には現在セッションのアシスタント返信要約が並びます。

- クリックすると対応するチャット位置へ戻れる
- 長い会話の中で重要な返答を探すのに便利

## 環境

`環境` には以下のような情報が集約されます。

- 現在が `mock` か `openclaw` か
- 選択中のエージェント、モデル、セッションキー、workspace root
- Gateway URL、port、API path、API style
- コンテキスト、キュー、ランタイム、認証の状態表示

期待と違う挙動のとき、まずここを見るのが有効です。

## 協調

`協調` は協調関係や派生作業を表示します。

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

失敗した分岐は短時間表示が残るので、どこで問題が起きたか見つけやすくなっています。

## プレビュー

`プレビュー` は 4 種類の読み取り専用 peek を表示します。

- ワークスペースプレビュー
- ターミナルプレビュー
- ブラウザプレビュー
- 環境プレビュー

補足:

- `mock` モードではブラウザプレビューは未接続表示
- `openclaw` モードでは Control UI、health、browser-control の情報読み取りを試みる

## ファイルプレビュー機能

ファイル一覧、Markdown リンク、画像サムネイルからプレビューを開くと、次を利用できます。

- テキスト、JSON、Markdown のシンタックスハイライト
- Markdown front matter の分離表示
- 画像のズーム、回転、リセット
- 動画、音声、PDF の埋め込みプレビュー
- VS Code で開く
- Finder / Explorer / システムファイルマネージャで表示

ファイルプレビュー API は絶対パスを必要とするため、絶対パスがない項目は表示のみで終わることがあります。

## 先にインスペクターを開くべき場面

- 返信内容が怪しく、ツール履歴を確認したいとき
- Agent がどのファイルを変更したか見たいとき
- 長い会話から特定の返答に戻りたいとき
- 現在が `mock` か live gateway か確認したいとき
