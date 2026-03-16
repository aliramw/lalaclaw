[別の言語の README: English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Agent と一緒に共同制作するための、より扱いやすいワークスペースです。

## ハイライト

- React + Vite ベースの command center UI。チャット、タイムライン、Inspector、テーマ、ロケール、添付ファイルに対応
- ローカル OpenClaw とリモート OpenClaw gateway の両方に接続可能な Node.js バックエンド
- 英語、中国語、日本語、フランス語、スペイン語、ポルトガル語の UI を同梱
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

ローカルで開発したい場合:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

開発時のブラウザ入口は [http://127.0.0.1:5173](http://127.0.0.1:5173) です。

## 更新

最新版へ更新:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

特定バージョンへ切り替え:

```bash
npm install -g lalaclaw@2026.3.17-4
lalaclaw init
```

## 開発メモ

- 開発では `npm start` ではなく `npm run dev:all` を使ってください
- ビルド済み `dist/` を使う確認だけ `npm run lalaclaw:start` または `npm start` を使います
- 既定ではローカル OpenClaw を自動検出します
- UI を安定して確認したい場合は `COMMANDCENTER_FORCE_MOCK=1` で `mock` モードを強制できます

## バージョン

LalaClaw は npm 互換のカレンダーバージョニングを使います。

- バージョン変更時は [CHANGELOG.md](./CHANGELOG.md) を更新します
- 同日の複数リリースは `YYYY.M.D-N` 形式を使います。例: `2026.3.17-4`

