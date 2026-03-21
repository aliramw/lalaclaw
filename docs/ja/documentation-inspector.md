[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [チャット、添付、コマンド](./documentation-chat.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# インスペクター、ファイルプレビュー、トレース

右側のインスペクターは LalaClaw の中核 UI のひとつです。現在はセッション情報を `Files`、`Artifacts`、`Timeline`、`Environment` の 4 タブに整理しています。

## Files

`Files` タブは 2 つの面で構成されます。

- `Session Files`: 現在の会話で触れたファイルを `Created`、`Modified`、`Viewed` で整理
- `Workspace Files`: 現在の workspace を根にしたツリー

主な挙動:

- workspace ツリーは 1 ディレクトリ階層ずつ読み込まれる
- 折りたたんでも件数バッジは表示されたまま
- 空の `Session Files` セクションは隠れたままになる
- フィルターは通常テキストと簡単な glob をサポートする

操作:

- クリックでプレビューを開く
- 右クリックで絶対パスをコピーする
- workspace フォルダを右クリックすると、その階層だけ更新できる

## Artifacts

`Artifacts` は現在セッションのアシスタント返信要約を一覧表示します。

- 要約をクリックすると対応するチャット位置へ戻れる
- 長い会話の中から重要な返答を探しやすい
- `View Context` ではモデルに送られている現在のセッションコンテキストを確認できる

## Timeline

`Timeline` は記録を run 単位でまとめます。

- run のタイトルと時刻
- prompt 要約と結果
- tool の入力、出力、状態
- 関連するファイル変更
- 委譲された作業の協調関係

## Environment

`Environment` には次のようなランタイム情報が集約されます。

- 上部の `OpenClaw 診断` サマリー。`Overview`、`Connectivity`、`Doctor`、`Logs` に分かれて表示されます
- OpenClaw のバージョン、runtime profile、config path、workspace root、gateway status、health URL、log の入口
- runtime transport、runtime socket の状態、reconnect 回数、fallback reason
- 下位の技術グループとして、session context、realtime sync、gateway config、application、other

補足:

- 上部サマリーに昇格した項目は、重複を避けるため下位グループから取り除かれます
- JSON session key のような長い値は横にはみ出さず、コンテナ内で折り返されます
- ログや設定ファイルなど、確認済みの絶対パスは共有ファイルプレビューをクリックで開けます
- ログディレクトリや現在のセッション Agent ワークスペースディレクトリのようなフォルダーパスはインラインプレビューを開かず、そのままシステムのファイルマネージャーを開きます
- Environment は OpenClaw 診断、管理アクション、設定ツール、runtime 詳細を一つの面にまとめる構成になりました

## ディレクトリ貼り付けとフォルダーを開く挙動

- `Workspace Files` では、ディレクトリを右クリックすると、クリップボード内のアップロードやコピー済みローカルファイルをそのフォルダーへ直接貼り付けられます
- ディレクトリへの貼り付けが成功すると、そのフォルダーが再読込され、新しく保存されたファイルは現在のセッションファイル一覧にも反映されます
- inspector 内のフォルダーパスは、引き続きインラインプレビューではなく Finder / Explorer / システムのファイルマネージャーを直接開きます
