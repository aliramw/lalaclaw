[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md)

[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Démarrage rapide

## Prérequis

- Utilisez la version Node.js définie dans [`.nvmrc`](../../.nvmrc), actuellement `22`
- L'installation npm est recommandée pour un usage local normal
- Utilisez un checkout GitHub uniquement si vous voulez le mode développement ou modifier le code localement

## Installer depuis npm

Pour l'installation la plus simple côté utilisateur :

```bash
npm install -g lalaclaw
lalaclaw init
```

Remarques :

- `lalaclaw init` écrit votre configuration locale dans `~/.config/lalaclaw/.env.local` sur macOS et Linux
- Pour les installations npm sur macOS, `lalaclaw init` démarre aussi automatiquement un service `launchd`
- Sur Linux, ou si vous désactivez le démarrage en arrière-plan, poursuivez avec `lalaclaw doctor` puis `lalaclaw start`

## Installer depuis GitHub

Utilisez ce chemin si vous voulez un checkout des sources pour le développement ou des modifications locales.

Si OpenClaw est déjà installé sur la machine et que `~/.openclaw/openclaw.json` est disponible :

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

Remarques :

- `npm run doctor` vérifie Node.js, OpenClaw, la configuration locale et les ports
- `npm run doctor -- --json` renvoie le meme diagnostic en JSON avec `summary.status` et `summary.exitCode`
- `npm run lalaclaw:init` aide à créer ou mettre à jour `.env.local`
- `npm run lalaclaw:init -- --write-example` copie `.env.local.example` vers le fichier cible sans interaction
- `npm run lalaclaw:start` est le point d'entrée recommandé en production après `npm run build`
- `npm run lalaclaw:start` s'exécute dans le terminal courant, donc fermer ce terminal arrête le service
- Si votre configuration locale est déjà prête, vous pouvez ignorer `npm run lalaclaw:init`
- Si vous préférez une configuration manuelle, partez de [`.env.local.example`](../../.env.local.example)

## Mettre à jour une installation existante

Si vous avez installé LalaClaw avec npm et voulez la version la plus récente :

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Si vous préférez une version publiée précise, comme `2026.3.17-5` :

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

Si vous avez installé LalaClaw depuis GitHub, mettez-le à jour ainsi :

Si vous avez déjà installé LalaClaw depuis GitHub et voulez la version la plus récente :

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Si vous préférez une version publiée précise, comme `2026.3.17-5` :

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-5
npm ci
npm run build
npm run lalaclaw:start
```

Remarques :

- `npm install -g lalaclaw@latest` met à jour le paquet npm installé globalement
- `git pull` met à jour votre copie locale vers la version la plus récente sur GitHub
- `npm ci` installe les dépendances requises par cette version
- `npm run build` régénère les fichiers web utilisés par le serveur de production
- Si vous utilisez la configuration `launchd` sur macOS, redémarrez le service après la mise à jour avec `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app`
- Si Git indique des modifications locales, sauvegardez-les ou validez-les avant la mise à jour

## Mode développement

Le mode développement nécessite un checkout GitHub avec `npm ci` déjà exécuté.

En développement, lancez le frontend et le backend en même temps, puis utilisez la page Vite comme point d'entrée dans le navigateur.

Vous pouvez le faire avec une seule commande :

```bash
npm run dev:all
```

Ou lancer les deux serveurs séparément :

### 1. Démarrer le frontend

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

### 2. Démarrer le backend

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

### 3. Ouvrir l'application

- En développement, utilisez `http://127.0.0.1:5173`
- Les requêtes `/api/*` sont proxyfiées vers `http://127.0.0.1:3000`

## Mode build

```bash
npm run build
npm run lalaclaw:start
```

Remarques :

- `npm run lalaclaw:start` suppose que `dist/` existe déjà
- Sans `npm run build`, le backend renvoie `503 Web app build is missing`
- Le mode build n'est donc pas adapté au développement frontend quotidien

## Déploiement persistant sur macOS

Si vous voulez que l'application reste disponible après la fermeture du terminal sur macOS, utilisez `launchd`.

1. Construisez l'application :

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. Générez le plist avec le script du dépôt :

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. Chargez le service :

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

Commandes utiles :

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

Le guide macOS complet se trouve dans [deploy/macos/README.md](../../deploy/macos/README.md).

## `mock` et OpenClaw

Au démarrage, le backend essaie d'abord de lire `~/.openclaw/openclaw.json`.

- S'il trouve une passerelle locale et un token, il passe en mode `openclaw`
- Sinon, il tombe par défaut en mode `mock`

Forcer `mock` :

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

Si vous utilisez la CLI pour initialiser la configuration :

```bash
npm run lalaclaw:init
npm run doctor
```

En mode `remote-gateway`, `doctor` effectue aussi une vérification réelle de la passerelle distante et envoie une requête minimale pour valider le modèle et l'agent configurés.

Configurer explicitement une passerelle :

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

Si votre passerelle ressemble davantage à l'API Responses :

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## Étapes suivantes

- Pour la structure visuelle : [Vue d'ensemble de l'interface](./documentation-interface.md)
- Pour le flux d'interaction : [Chat, pièces jointes et commandes](./documentation-chat.md)
