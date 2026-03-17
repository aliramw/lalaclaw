[別の言語の README: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Agent と一緒に共同制作するための、より扱いやすいワークスペースです。

著者: Marila Wang

## ハイライト

- React + Vite ベースの command center UI。チャット、タイムライン、Inspector、テーマ、ロケール、添付ファイルに対応
- ローカル OpenClaw とリモート OpenClaw gateway の両方に接続可能な Node.js バックエンド
- 英語、中国語、香港繁體字、日本語、韓国語、フランス語、スペイン語、ポルトガル語、ドイツ語、マレー語、タミル語の UI を同梱
- テスト、CI、lint、カバレッジ、貢献ドキュメントを整備

## ドキュメント

- 言語インデックス: [docs/README.md](./docs/README.md)
- 日本語ドキュメント: [docs/ja/documentation.md](./docs/ja/documentation.md)
- クイックスタート: [docs/ja/documentation-quick-start.md](./docs/ja/documentation-quick-start.md)
- 画面概要: [docs/ja/documentation-interface.md](./docs/ja/documentation-interface.md)
- セッションとランタイム: [docs/ja/documentation-sessions.md](./docs/ja/documentation-sessions.md)

## クイックスタート

通常利用なら npm インストールが最短です。

```bash
npm install -g lalaclaw
lalaclaw init
```

その後 [http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。

補足:

- macOS では `lalaclaw init` が `launchd` のバックグラウンドサービスも自動で起動します
- macOS のソースチェックアウトでは、`lalaclaw init` が必要に応じて先に `dist/` をビルドしてから本番サービスを起動します
- 設定ファイルだけ書きたい場合は `lalaclaw init --no-background` を使います
- Linux やバックグラウンド起動を無効にした場合は、そのまま `lalaclaw doctor` と `lalaclaw start` を実行します
- `doc`、`ppt`、`pptx` ファイルのプレビューには LibreOffice が必要です
- macOS では `lalaclaw doctor --fix` または `brew install --cask libreoffice` を実行できます

ローカルで開発したい場合:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

開発時のブラウザ入口は [http://127.0.0.1:5173](http://127.0.0.1:5173) です。

macOS のソースチェックアウトで本番用の常駐サービスを使いたい場合は `npm run doctor` の後に `npm run lalaclaw:init` を実行してください。

## 更新

最新版へ更新:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

特定バージョンへ切り替え:

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

## 開発メモ

- 開発では `npm start` ではなく `npm run dev:all` を使ってください
- ビルド済み `dist/` を使う確認だけ `npm run lalaclaw:start` または `npm start` を使います
- 既定ではローカル OpenClaw を自動検出します
- UI を安定して確認したい場合は `COMMANDCENTER_FORCE_MOCK=1` で `mock` モードを強制できます
- `npm run doctor -- --fix` は macOS で不足している LibreOffice を自動インストールし、LibreOffice 依存のプレビューを有効にします

## バージョン

LalaClaw は npm 互換のカレンダーバージョニングを使います。

- バージョン変更時は [CHANGELOG.md](./CHANGELOG.md) を更新します
- 同日の複数リリースは `YYYY.M.D-N` 形式を使います。例: `2026.3.17-5`
