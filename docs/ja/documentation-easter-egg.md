[English](../en/documentation-easter-egg.md) | [中文](../zh/documentation-easter-egg.md) | [日本語](../ja/documentation-easter-egg.md) | [Français](../fr/documentation-easter-egg.md) | [Español](../es/documentation-easter-egg.md) | [Português](../pt/documentation-easter-egg.md)

[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [キーボードショートカット](./documentation-shortcuts.md)

# イースターエッグ

## 入口

左上のブランド領域にある `🦞` アイコンは、単なる装飾ではなくクリック可能なイースターエッグです。

見つかる場所:

- フルヘッダーレイアウトでは `LalaClaw` の左側
- コンパクトな tab-brand レイアウトでも表示される

## 動作

クリックすると、ロブスターがページ上を歩くアニメーションが始まります。

- ブランド位置から出発する
- アニメーション中は元のロブスターが一時的に隠れる
- 終了すると左上のロブスターが再び表示される

これはセッションや chat state、inspector data には影響せず、純粋なフロントエンド演出です。

## ルール

- 同時に走るアニメーションは 1 つだけ
- 実行中に何度押しても重ねて開始しない
- アニメーション層は `pointer-events: none` のため、通常操作を妨げない

## 関連ページ

- レイアウト全体は [画面概要](./documentation-interface.md)
- デモ案は [プロダクトショーケース](./showcase.md)
