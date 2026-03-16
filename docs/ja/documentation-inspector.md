[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md)

[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [チャット、添付、コマンド](./documentation-chat.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# インスペクター、ファイルプレビュー、トレース

右側の inspector は LalaClaw を特徴づける重要な UI です。現在のセッションに関する実行履歴、ファイル活動、要約、環境情報を 1 か所に投影します。

## 実行ログ

`Run Log` は実行ラウンド単位で以下を表示します。

- ラウンド名と時刻
- Prompt 要約
- ツール呼び出し一覧
- 各ツールの input、output、status
- そのラウンドに紐づくファイル変更
- 関連 snapshot

次の問いに向いています。

- 直前に agent はどんなツールを使ったか
- ある結果はどのラウンドで発生したか

## ファイル

`Files` は次の分類で表示されます。

- Created
- Modified
- Viewed

操作:

- クリックで preview を開く
- 右クリックで絶対パスをコピー

この一覧は OpenClaw transcript だけでなく、添付や楽観状態から拾ったローカルのファイル情報も含みます。

## 要約

`Summaries` には現在セッションのアシスタント返信要約が並びます。

- クリックすると対応するチャット位置へ戻れる
- 長い会話の中で重要な返答を探すのに便利

## 環境

`Environment` には以下のような情報が集約されます。

- 現在が `mock` か `openclaw` か
- 選択中の agent、model、session key、workspace root
- Gateway URL、port、API path、API style
- Context、queue、runtime、auth の状態表示

期待と違う挙動のとき、まずここを見るのが有効です。

## 協調

`Collab` は協調関係や派生作業を表示します。

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

失敗した分岐は短時間表示が残るので、どこで問題が起きたか見つけやすくなっています。

## プレビュー

`Preview` は 4 種類の読み取り専用 peek を表示します。

- Workspace preview
- Terminal preview
- Browser preview
- Environment preview

補足:

- `mock` モードでは browser preview は未接続表示
- `openclaw` モードでは Control UI、health、browser-control の情報読み取りを試みる

## ファイルプレビュー機能

ファイル一覧、Markdown リンク、画像サムネイルから preview を開くと、次を利用できます。

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
