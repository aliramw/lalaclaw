[English](../en/showcase.md) | [中文](../zh/showcase.md) | [繁體中文（香港）](../zh-hk/showcase.md) | [日本語](../ja/showcase.md) | [한국어](../ko/showcase.md) | [Français](../fr/showcase.md) | [Español](../es/showcase.md) | [Português](../pt/showcase.md) | [Deutsch](../de/showcase.md) | [Bahasa Melayu](../ms/showcase.md) | [தமிழ்](../ta/showcase.md)

# 製品紹介

> ナビゲーション: [ドキュメントホーム](./documentation.md) | [画面概要](./documentation-interface.md) | [イースターエッグ](./documentation-easter-egg.md) | [インスペクター、ファイルプレビュー、トレース](./documentation-inspector.md) | [アーキテクチャ概要](./architecture.md) | [リファクタリングロードマップ](./refactor-roadmap.md)

この文書は、LalaClaw を紹介する際に何をデモし、何を撮影し、何を記録すべきかを簡潔にまとめたものです。

## 主要画面

- 概要バー: エージェントとモデルの切替、高速モード、思考モード、キュー、テーマ、言語切替
- チャットパネル: 保留中のアシスタントターン、Markdown 返信、添付チップ、リセット操作
- インスペクターパネル: タイムライン、ファイル一覧、成果物、スナップショット、エージェント関係図、ランタイム情報

## デモ構成

1. `mock` モードで既定の command center レイアウトを見せる
2. 添付付き prompt を送り、composer 挙動と pending 状態を見せる
3. インスペクタータブを開き、同一セッションからタイムライン、ファイル、スナップショットが更新される様子を見せる
4. モデル、高速モード、思考モード、テーマ、言語を切り替えてセッション単位の制御を見せる
5. OpenClaw 接続環境に切り替え、同じ UI が live gateway 上でも動くことを見せる

## 推奨素材

- 既定 workspace のフル幅デスクトップ画面
- 保留中ターンのチャットパネルにフォーカスした画面
- 完了後のインスペクターパネルにフォーカスした画面
- prompt submission、status change、inspector update を見せる短い GIF

## メンテナ向けメモ

- 過去の mockup ではなく、現在の React app から撮影した画像を優先する
- Screenshot の言語とテーマは README で使うものと揃える
- 主要 UI や demo flow が変わったらこの文書も更新する
