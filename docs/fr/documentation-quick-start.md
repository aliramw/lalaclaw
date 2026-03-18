[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Démarrage rapide

## Prérequis

- Utilisez la version Node.js définie dans [`.nvmrc`](../../.nvmrc), actuellement `22`
- L'installation npm est recommandée pour un usage local normal
- Utilisez un checkout GitHub uniquement si vous voulez le mode développement ou modifier le code localement

## Installer via OpenClaw

Utilisez OpenClaw pour installer LalaClaw sur une machine Mac ou Linux distante, puis accedez-y en local via un transfert de port SSH.

```text
Install https://github.com/aliramw/lalaclaw
```

Exemple de transfert :

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Puis ouvrez :

```text
http://127.0.0.1:3000
```

## Installer depuis npm

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Ouvrez ensuite [http://127.0.0.1:5678](http://127.0.0.1:5678).

Remarques :

- `lalaclaw init` écrit votre configuration locale dans `~/.config/lalaclaw/.env.local`
- Les valeurs par défaut sont `HOST=127.0.0.1`, `PORT=5678` et `FRONTEND_PORT=4321`
- Dans un checkout source, `lalaclaw init` démarre Server et Vite Dev Server en arrière-plan
- Sur macOS avec npm, `lalaclaw init` installe et démarre le service `launchd` du Server
- Sur Linux avec npm, `lalaclaw init` démarre le Server en arrière-plan

## Installer depuis GitHub

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Ouvrez ensuite [http://127.0.0.1:4321](http://127.0.0.1:4321).

## Mode développement

Pour le développement du dépôt, utilisez les ports fixes suivants :

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Ou :

```bash
npm run dev:all
```

- Frontend : `http://127.0.0.1:5173`
- Backend : `http://127.0.0.1:3000`
- Entrée navigateur : `http://127.0.0.1:5173`

## Browser Access Tokens

Si l'ecran de deverrouillage par token apparait dans le navigateur, vous pouvez trouver ou regenerer le token ainsi :

- `lalaclaw access token` pour afficher le token actuel
- `lalaclaw access token --rotate` pour generer et enregistrer un nouveau token
- verifier `COMMANDCENTER_ACCESS_TOKENS` ou `COMMANDCENTER_ACCESS_TOKENS_FILE` dans `~/.config/lalaclaw/.env.local`
- si cette instance n'est pas la votre, demandez le token a la personne qui l'administre
