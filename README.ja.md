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
npm install -g lalaclaw@latest
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

## OpenClaw 経由でリモートホストへインストール

OpenClaw が操作できるリモートマシンがあり、そのマシンへ SSH でもログインできる場合は、OpenClaw に GitHub からこのプロジェクトをインストールさせ、リモート側で起動したあと、SSH ポートフォワードでローカルからアクセスできます。

OpenClaw への指示例:

```text
安装这个 https://github.com/aliramw/lalaclaw
```

典型的な流れ:

1. OpenClaw がリモートマシン上でこのリポジトリを clone します
2. OpenClaw が依存関係をインストールし、LalaClaw を起動します
3. アプリはリモートマシンの `127.0.0.1:3000` で待ち受けます
4. SSH でそのポートをローカルへ転送します
5. ローカルのブラウザで転送先 URL を開きます

SSH ポートフォワード例:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
```

その後に開く URL:

```text
http://127.0.0.1:3000
```

補足:

- この構成では、ローカルの `127.0.0.1:3000` はリモートマシンの `127.0.0.1:3000` に転送されています
- アプリ本体、OpenClaw 設定、transcript、ログ、workspace はすべてリモートマシン側にあります
- これはダッシュボードを公開インターネットへ直接さらすより安全です。直接公開すると、その URL を知っている人は誰でもパスワードなしでこのコントロールパネルを使えてしまいます
- ローカルの `3000` が使用中なら `3300:127.0.0.1:3000` のように別ポートへ転送し、`http://127.0.0.1:3300` を開いてください

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
