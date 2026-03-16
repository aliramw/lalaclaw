[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [セッション、Agent、ランタイムモード](./documentation-sessions.md) | [キーボードショートカット](./documentation-shortcuts.md) | [ローカル保存と復元](./documentation-persistence.md)

# チャット、添付、コマンド

## メッセージ送信

Composer は「まず書く、必要なら素早く送る」という流れで設計されています。

- `Enter`: 改行
- `Shift + Enter`: 送信
- `Enter` を素早く 2 回: 送信
- `ArrowUp / ArrowDown`: 現在の会話の prompt history を移動

送信後の流れ:

- フロントエンドはまず楽観的なユーザーメッセージを挿入
- Slash コマンドでなければ、アシスタントの thinking プレースホルダーを挿入
- バックエンドは既定で NDJSON ストリームを返す
- 返信中は `Stop` を押せる

## キュー動作

現在のタブが処理中の場合:

- 新しいメッセージは破棄されず、そのタブのキューに入る
- キュー済みユーザーメッセージはすぐ会話に表示されるが、2 つ目の thinking プレースホルダーは開始しない
- 現在の返信が終わると、キューは順番に自動再開される

## `@` メンション

開き方は 2 つあります。

- Composer に直接 `@` を入力する
- Composer 近くの `@` ボタンをクリックする

候補の由来:

- メンション可能 Agent: 現在の Agent の `subagents.allowAgents`
- メンション可能 Skill: 現在の Agent、許可された subagent、ローカルに見つかった skill

操作:

- 入力に応じたリアルタイム絞り込み
- `ArrowUp / ArrowDown` で移動
- `Enter / Tab` で挿入
- `Escape` で閉じる

## 添付

添付の入口:

- クリップボタンをクリック
- クリップボードから直接ファイルを貼り付け

型ごとの処理:

- 画像: `data URL` として読み込み、インラインプレビューを表示
- テキスト添付: テキストとして読み込み、`120000` 文字で切り詰め、モデル向け payload に含める
- その他のファイル: メタデータのみ送信

ローカルパスが取得できる環境では、添付には `path/fullPath` も含まれ、後続の inspector や preview に役立ちます。

## リロード復元

返信中にページを再読み込みした場合:

- フロントエンドは pending のユーザーターンとアシスタント占位を別保存する
- 再読み込み後、その進行中ターンの復元を試みる
- バックエンドが既に完了していれば、占位は最終返信に置き換えられる

## Slash コマンド

### `/fast`

対応形式:

- `/fast`
- `/fast status`
- `/fast on`
- `/fast off`

動作:

- `status` は現在の fast mode を表示
- `on/off` は現在のセッションに fast mode 設定を保存する

### `/think <mode>`

対応モード:

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`
- `adaptive`

動作:

- 現在セッションの thinking depth を更新
- `openclaw` モードではリモート session にも patch する

### `/new [prompt]` と `/reset [prompt]`

動作:

- 新しい `sessionUser` を作成
- 現在の model、agent、fast mode、thinking mode を引き継ぐ
- 後ろに prompt があれば、そのまま新セッションで続行する

よく使う場面:

- context が大きくなってきたとき
- 会話履歴はリセットしたいが制御設定は残したいとき

## 利用のヒント

- 長い作業の前に current agent、model、thinking mode を確認する
- 長文素材は text attachment、画像素材は image attachment にする
- context をきれいに分けたいときは新規セッションまたは `/new` を使う
- 現在の返信を待たずに追加入力をキューに積んでよい
