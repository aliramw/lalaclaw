[別の言語の README: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Agent と一緒に共同制作するための、より扱いやすいワークスペースです。

著者: Marila Wang

## ハイライト

- React + Vite ベースの command center UI。チャット、タイムライン、Inspector、テーマ、ロケール、添付ファイルに対応
- セッションツリーとワークスペースツリーを分けた VS Code 風のファイル探索とプレビュー操作
- 中文、繁體中文（香港）、English、日本語、한국어、Français、Español、Português、Deutsch、Bahasa Melayu、தமிழ் の UI を同梱
- ローカルまたはリモートの OpenClaw gateway に接続できる Node.js バックエンド
- テスト、CI、lint、貢献ガイド、リリースノートを整備

## プロダクトツアー

- 上部バーで Agent、モデル、fast mode、think mode、context、queue、theme、locale を操作
- メインチャット領域でプロンプト入力、添付、ストリーミング応答、セッションリセットを実行
- Inspector で timeline、files、artifacts、snapshots、runtime activity を確認
- Inspector の Environment 面で OpenClaw 診断、管理アクション、安全な設定編集、そしてファイル/ディレクトリごとに異なる開き方を確認
- ランタイムは既定で `mock` モードに対応し、必要に応じて実際の OpenClaw gateway に切り替え可能

詳しい紹介は [ja/showcase.md](./ja/showcase.md) を参照してください。

## ドキュメント

- 言語インデックス: [README.md](./README.md)
- 日本語ガイド: [ja/documentation.md](./ja/documentation.md)
- クイックスタート: [ja/documentation-quick-start.md](./ja/documentation-quick-start.md)
- 画面ガイド: [ja/documentation-interface.md](./ja/documentation-interface.md)
- セッションとランタイム: [ja/documentation-sessions.md](./ja/documentation-sessions.md)
- アーキテクチャ: [ja/architecture.md](./ja/architecture.md)

構成メモは [server/README.md](../server/README.md) と [src/features/README.md](../src/features/README.md) にあります。

## インストールガイド

### npm からインストール

通常利用なら次が最短です。

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

その後 [http://127.0.0.1:5678](http://127.0.0.1:5678) を開きます。

補足:

- `lalaclaw init` は macOS と Linux でローカル設定を `~/.config/lalaclaw/.env.local` に書き込みます
- 既定では `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321` を使います
- ソースチェックアウトでは `lalaclaw init` が Server と Vite Dev Server をバックグラウンド起動し、Dev Server URL を開く案内を出します
- macOS の npm インストールでは `lalaclaw init` が Server の `launchd` サービスをインストールして起動し、Server URL を開く案内を出します
- Linux の npm インストールでは `lalaclaw init` が Server をバックグラウンド起動し、Server URL を開く案内を出します
- 設定ファイルだけ書きたい場合は `lalaclaw init --no-background` を使います
- `--no-background` の後は `lalaclaw doctor` を実行し、ソースチェックアウトなら `lalaclaw dev`、配布パッケージなら `lalaclaw start` を使います
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` は macOS の `launchd` Server サービス専用です
- `doc`、`ppt`、`pptx` のプレビューには LibreOffice が必要です。macOS では `lalaclaw doctor --fix` または `brew install --cask libreoffice` を使えます

### OpenClaw 経由でインストール

OpenClaw を使って LalaClaw をリモートの Mac または Linux マシンにインストールし、SSH ポートフォワード経由でローカルからアクセスできます。

すでに OpenClaw が入ったマシンがあり、そのマシンに SSH でログインできるなら、OpenClaw に GitHub からこのプロジェクトをインストールさせ、リモート側で起動し、そのポートをローカルへ転送できます。

OpenClaw には次のように伝えます。

```text
Install https://github.com/aliramw/lalaclaw
```

典型的な流れ:

1. OpenClaw がリモートマシンでこのリポジトリを clone します。
2. OpenClaw が依存関係をインストールして LalaClaw を起動します。
3. アプリはリモートマシンの `127.0.0.1:5678` で待ち受けます。
4. SSH でそのリモートポートをローカルへ転送します。
5. 転送されたローカルアドレスをブラウザで開きます。

SSH ポートフォワード例:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

その後、ローカルで次を開きます。

```text
http://127.0.0.1:3000
```

### GitHub からインストール

開発やローカル修正のためにソースチェックアウトを使う場合:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

その後 [http://127.0.0.1:4321](http://127.0.0.1:4321) を開きます。

補足:

- `npm run lalaclaw:init` は既定で Server と Vite Dev Server をバックグラウンド起動します。止めたい場合は `--no-background` を付けます
- 起動後は Dev Server URL を開く案内が表示され、既定値は `http://127.0.0.1:4321` です
- 設定生成だけ行いたい場合は `npm run lalaclaw:init -- --no-background` を使います
- `npm run lalaclaw:start` は現在のターミナルで動作し、そのターミナルを閉じると停止します
- 後で通常の開発環境を使いたい場合は `npm run dev:all` を実行し、`http://127.0.0.1:4321` または設定した `FRONTEND_PORT` を開きます

### LalaClaw を更新

npm インストールを最新版に更新する場合:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

特定バージョン、たとえば `2026.3.20-3` に切り替える場合:

```bash
npm install -g lalaclaw@2026.3.20-3
lalaclaw init
```

GitHub からインストールした環境を最新版に更新する場合:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

特定バージョン、たとえば `2026.3.20-3` に切り替える場合:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-3
npm ci
npm run build
npm run lalaclaw:start
```

## よく使うコマンド

- `npm run dev:all` は標準のローカル開発フローを起動します
- `npm run doctor` は Node.js、OpenClaw 検出、ポート、ローカル設定を確認します
- `npm run lalaclaw:init` はローカルの初期設定ファイルを書き込みまたは更新します
- `npm run lalaclaw:start` は `dist/` を確認した上でビルド済みアプリを起動します
- `npm run build` は本番ビルドを作成します
- `npm test` は Vitest を 1 回実行します
- `npm run lint` は ESLint を実行します

完全なコマンド一覧と貢献フローは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

## 貢献

貢献を歓迎します。大きな機能、構成変更、ユーザーに見える挙動変更では、まず issue を開いて方向性を合わせてください。

PR を開く前に:

- 変更を絞り、無関係なリファクタを避ける
- 挙動変更にはテストを追加または更新する
- 新しいユーザー向け文言は `src/locales/*.js` に入れる
- ユーザー向け挙動が変わる場合はドキュメントも更新する
- バージョン化された変更では [CHANGELOG.md](../CHANGELOG.md) を更新する

詳細なチェックリストは [CONTRIBUTING.md](../CONTRIBUTING.md) にあります。

## 開発メモ

- 標準のローカル開発には `npm run dev:all` を使います
- 開発時の既定フロントエンド URL は [http://127.0.0.1:4321](http://127.0.0.1:4321) です。必要に応じて `FRONTEND_PORT` を変更できます
- `npm run lalaclaw:start` や `npm start` は `dist/` に依存するビルド確認時だけ使います
- 既定ではローカル OpenClaw gateway を自動検出します
- UI やフロントエンドの再現確認には `COMMANDCENTER_FORCE_MOCK=1` で `mock` モードを強制できます
- PR 前には `npm run lint`、`npm test`、`npm run build` の実行を推奨します

## バージョン

LalaClaw は npm 互換のカレンダーバージョニングを使います。

- バージョン変更時は [CHANGELOG.md](../CHANGELOG.md) を更新します
- 同日の複数リリースは `YYYY.M.D-N` 形式を使います。例: `2026.3.20-3`
- 破壊的変更はリリースノートと移行向けドキュメントで明示してください
- 開発時は [`.nvmrc`](../.nvmrc) の Node.js `22` を推奨します。公開済み npm パッケージは `^20.19.0 || ^22.12.0 || >=24.0.0` をサポートします

## OpenClaw 接続

`~/.openclaw/openclaw.json` が存在する場合、LalaClaw はローカル OpenClaw gateway を自動検出し、その loopback endpoint と gateway token を再利用します。

新しいソースチェックアウトでは、よくある初期手順は次のとおりです。

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

別の OpenClaw 互換 gateway を使いたい場合は、次を設定します。

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

OpenAI Responses API に近い gateway の場合は次を使います。

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

これらの変数がなければ、アプリは `mock` モードで起動し、初期段階でも UI とチャットループを確認できます。
