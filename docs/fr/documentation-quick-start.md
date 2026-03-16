[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Démarrage rapide

## Prérequis

- Utilisez la version Node.js définie dans [`.nvmrc`](../../.nvmrc), actuellement `22`
- Exécutez `npm ci` à la racine du projet avant le premier lancement local

## Mode développement

En développement, lancez le frontend et le backend en même temps, puis utilisez la page Vite comme point d'entrée dans le navigateur.

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
npm start
```

Remarques :

- `npm start` suppose que `dist/` existe déjà
- Sans `npm run build`, le backend renvoie `503 Web app build is missing`
- `npm start` n'est donc pas adapté au développement frontend quotidien

## `mock` et OpenClaw

Au démarrage, le backend essaie d'abord de lire `~/.openclaw/openclaw.json`.

- S'il trouve une passerelle locale et un token, il passe en mode `openclaw`
- Sinon, il tombe par défaut en mode `mock`

Forcer `mock` :

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

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

## Étapes suivantes

- Pour la structure visuelle : [Vue d'ensemble de l'interface](./documentation-interface.md)
- Pour le flux d'interaction : [Chat, pièces jointes et commandes](./documentation-chat.md)
