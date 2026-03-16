[English](../en/showcase.md) | [中文](../zh/showcase.md) | [繁體中文（香港）](../zh-hk/showcase.md) | [日本語](../ja/showcase.md) | [한국어](../ko/showcase.md) | [Français](../fr/showcase.md) | [Español](../es/showcase.md) | [Português](../pt/showcase.md) | [Deutsch](../de/showcase.md) | [Bahasa Melayu](../ms/showcase.md) | [தமிழ்](../ta/showcase.md)

# プロダクトショーケース

> Navigation: [Documentation Home](./documentation.md) | [画面概要](./documentation-interface.md) | [イースターエッグ](./documentation-easter-egg.md) | [Inspector、ファイルプレビュー、トレース](./documentation-inspector.md) | [アーキテクチャ概要](./architecture.md) | [リファクタリングロードマップ](./refactor-roadmap.md)

この文書は、LalaClaw を紹介する際に何をデモし、何を撮影し、何を記録すべきかを簡潔にまとめたものです。

## 主要画面

- Overview bar: agent/model selectors, fast mode, think mode, queue, theme, and locale toggles
- Chat panel: pending assistant turn, markdown answer, attachment chips, and reset affordance
- Inspector panel: timeline, file list, artifacts, snapshots, agent graph, and runtime peeks

## デモ構成

1. `mock` モードで既定の command center レイアウトを見せる
2. 添付付き prompt を送り、composer 挙動と pending 状態を見せる
3. Inspector タブを開き、同一 session から timeline、files、snapshots が更新される様子を見せる
4. Model、fast mode、think mode、theme、locale を切り替えて session-level control を見せる
5. OpenClaw 接続環境に切り替え、同じ UI が live gateway 上でも動くことを見せる

## 推奨素材

- 既定 workspace のフル幅デスクトップ screenshot
- pending turn 中の chat panel にフォーカスした screenshot
- 完了後の inspector panel にフォーカスした screenshot
- prompt submission、status change、inspector update を見せる短い GIF

## メンテナ向けメモ

- 過去の mockup ではなく、現在の React app から撮影した画像を優先する
- Screenshot の言語とテーマは README で使うものと揃える
- 主要 UI や demo flow が変わったらこの文書も更新する
