[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[ホームへ戻る](./documentation.md) | [キーボードショートカット](./documentation-shortcuts.md) | [チャット、添付、コマンド](./documentation-chat.md) | [セッション、エージェント、ランタイムモード](./documentation-sessions.md)

# ローカル保存と復元

## ローカルに保存されるもの

フロントエンドは次の内容をブラウザに保存します。

- アクティブなチャットタブとインスペクタータブ
- タブごとのメッセージ履歴
- 会話ごとのプロンプト下書き
- プロンプト履歴
- テーマと言語
- インスペクターの幅
- チャットの文字サイズ
- チャットのスクロール位置
- 保留中のチャット送信

## 添付の保存方法

添付は 2 層で保存されます。

- 軽量な参照情報と会話構造は `localStorage`
- 画像 `data URL` やテキスト添付本文など大きな payload は利用可能なら `IndexedDB`

これにより:

- 送信済み添付はリロード後も復元されやすい
- 進行中ターンも添付参照込みで復元できる

## リロード復元の範囲

主に次のケースを対象にしています。

- 返信中にページを再読み込みした
- runtime snapshot より先にローカル chat state が復元された
- バックエンドは完了済みだが、フロントエンドには pending 占位しか残っていない

ブラウザが `localStorage` や `IndexedDB` を使えない場合、復元品質は低下します。

## 実用メモ

- 長い実行中にリロードする前でも、通常は prompt を手動保存する必要はありません
- リロード後に添付が消えたら、まず IndexedDB の利用可否を確認してください
- thinking 占位が一瞬見えてから最終回答に置き換わるのは、通常の同期挙動です
