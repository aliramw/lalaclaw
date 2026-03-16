# LalaClaw ドキュメント

このドキュメントは、現在のフロントエンド、バックエンド、テスト、設定をもとに作成したものです。LalaClaw の実際の挙動を、たどりやすい Markdown ドキュメントツリーとして整理しています。

著者: Marila Wang

## ドキュメントツリー

- [クイックスタート](./documentation-quick-start.md)
- [画面概要](./documentation-interface.md)
- [チャット、添付、コマンド](./documentation-chat.md)
- [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md)
- [セッション、Agent、ランタイムモード](./documentation-sessions.md)
- [キーボードショートカット](./documentation-shortcuts.md)
- [ローカル保存と復元](./documentation-persistence.md)
- [API とトラブルシューティング](./documentation-api-troubleshooting.md)
- [イースターエッグ](./documentation-easter-egg.md)

## 推奨読書順

1. まず [クイックスタート](./documentation-quick-start.md) でフロントエンドとバックエンドを起動します。
2. 次に [画面概要](./documentation-interface.md) と [チャット、添付、コマンド](./documentation-chat.md) で主な操作フローを確認します。
3. ブランド演出の小さな仕掛けを見たい場合は [イースターエッグ](./documentation-easter-egg.md) を読みます。
4. 右側の追跡パネルを理解したい場合は [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md) を読みます。
5. Agent 切替、モデル選択、`mock` と `openclaw` の違いは [セッション、Agent、ランタイムモード](./documentation-sessions.md) です。
6. ショートカット、リロード復元、API 調査は [キーボードショートカット](./documentation-shortcuts.md)、[ローカル保存と復元](./documentation-persistence.md)、[API とトラブルシューティング](./documentation-api-troubleshooting.md) を参照してください。

## できること

- ブラウザ上で現在の Agent と会話し、画像、テキストファイル、通常ファイルを添付できます。
- Agent ごとに別々のセッションタブを開き、それぞれ独自の model、fast mode、thinking mode を保持できます。
- 右側の inspector で実行ログ、ファイル操作、要約、環境情報、協調状態、プレビューを確認できます。
- `mock` モードで UI 全体を試すことも、ローカル OpenClaw ゲートウェイに接続して実行することもできます。

## 関連資料

- [アーキテクチャ概要](./architecture.md)
- [プロダクトショーケース](./showcase.md)
- [リファクタリングロードマップ](./refactor-roadmap.md)

## クイックリンク

- セットアップ: [クイックスタート](./documentation-quick-start.md)
- 画面構成: [画面概要](./documentation-interface.md)
- Slash コマンド: [チャット、添付、コマンド](./documentation-chat.md)
- リロード復元: [ローカル保存と復元](./documentation-persistence.md)
- API: [API とトラブルシューティング](./documentation-api-troubleshooting.md)
