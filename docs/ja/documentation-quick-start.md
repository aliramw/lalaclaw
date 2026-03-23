[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[ホームへ戻る](./documentation.md) | [画面概要](./documentation-interface.md) | [セッション、エージェント、ランタイムモード](./documentation-sessions.md) | [API とトラブルシューティング](./documentation-api-troubleshooting.md)

# クイックスタート

## 必要環境

- 開発時はリポジトリの [`.nvmrc`](../../.nvmrc) に定義されている Node.js を使用します。現在は `22` です。公開済み npm パッケージは `^20.19.0 || ^22.12.0 || >=24.0.0` をサポートします。
- 通常のローカル利用では npm インストールを推奨します。
- 開発モードやローカルでのコード変更が必要な場合だけ GitHub のソース checkout を使ってください。

## OpenClaw 経由でインストール

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

## npm からインストール

通常ユーザー向けの最も簡単なセットアップ:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

その後 [http://127.0.0.1:5678](http://127.0.0.1:5678) を開きます。

補足:

- `lalaclaw init` は macOS と Linux では `~/.config/lalaclaw/.env.local` にローカル設定を書き込みます
- 既定では `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321` を使います
- ローカル OpenClaw が見つかった場合、`lalaclaw init` は解決済みの `OPENCLAW_BIN` と現在の Node 実行環境を含む `launchd` `PATH` も書き込みます
- ソース checkout では `lalaclaw init` が Server と Vite Dev Server をバックグラウンド起動し、Dev Server URL を開く案内を出します
- macOS の npm インストールでは `lalaclaw init` が Server の `launchd` サービスをインストールして起動し、Server URL を開く案内を出します
- Linux の npm インストールでは `lalaclaw init` が Server をバックグラウンド起動し、Server URL を開く案内を出します
- 設定ファイルだけ書きたい場合は `lalaclaw init --no-background` を使います
- `--no-background` の後は `lalaclaw doctor` を実行し、ソース checkout なら `lalaclaw dev`、配布パッケージなら `lalaclaw start` を使います
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` は macOS の `launchd` Server サービス専用です
- `doc`、`ppt`、`pptx` のプレビューには LibreOffice が必要です。macOS では `lalaclaw doctor --fix` または `brew install --cask libreoffice` を使えます

## GitHub からインストール

開発やローカル修正のためにソース checkout が欲しい場合はこちらを使います。

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
- `npm run lalaclaw:start` は現在の terminal 上で動くため、その terminal を閉じると停止します
- すでに設定が揃っている場合は `npm run lalaclaw:init` を省略できます
- 手動で設定したい場合は [`.env.local.example`](../../.env.local.example) を出発点にできます

## 既存インストールを更新

npm でインストールしていて最新版に更新したい場合:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

`2026.3.24` のような特定の公開版を使いたい場合:

```bash
npm install -g lalaclaw@2026.3.24
lalaclaw init
```

GitHub からインストールした場合は次の手順で更新します。

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

特定のリリース版を使いたい場合:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.24
npm ci
npm run build
npm run lalaclaw:start
```

## 開発モード

開発モードには GitHub のソース checkout と、事前に実行した `npm ci` が必要です。

リポジトリの通常の開発では、固定の開発ポートを使います。

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

1コマンドで起動することもできます。

```bash
npm run dev:all
```

開発用 URL:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- ブラウザ入口: `http://127.0.0.1:5173`

開発中の `/api/*` は `vite.config.mjs` により `http://127.0.0.1:3000` にプロキシされます。

## 本番ビルドモード

ビルド済みアプリを確認したい場合は次を実行します。

```bash
npm run build
npm run lalaclaw:start
```

## `mock` と OpenClaw

起動時にバックエンドは `~/.openclaw/openclaw.json` を読み取ろうとします。

- ローカル gateway と token が見つかれば `openclaw` モード
- 見つからなければ既定で `mock` モード

`mock` を強制:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

## Browser Access Tokens

ブラウザでアクセストークンの解除画面が表示された場合は、次の方法で token を確認または更新できます。

- `lalaclaw access token` で現在の token を表示する
- `lalaclaw access token --rotate` で新しい token を生成して保存する
- `~/.config/lalaclaw/.env.local` の `COMMANDCENTER_ACCESS_TOKENS` または `COMMANDCENTER_ACCESS_TOKENS_FILE` を確認する
- 自分でデプロイしていない環境なら、管理者に token を確認する

## 起動診断

- `lalaclaw doctor` と `npm run doctor` は、色付きステータス、利用可能な場合の macOS `launchd` サービス情報、プレビュー前提条件、最後の要約行を表示するようになり、アプリを開く前に起動ブロッカーを確認できます
- `lalaclaw start` と `npm run lalaclaw:start` は起動前に同じ doctor 事前チェックを実行し、重大なエラーが残っている場合はそのまま起動を止めます
- macOS では、doctor 出力に LaunchAgent plist のパスとログディレクトリも表示されるため、`lalaclaw init` 後のバックグラウンド起動を追跡しやすくなります
