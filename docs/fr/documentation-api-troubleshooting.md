[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md)

# API et dépannage

## Vue d'ensemble API

### `GET /api/session`

Récupère les métadonnées de session et les listes disponibles.

### `POST /api/session`

Met à jour `agentId`, `model`, `fastMode` et `thinkMode`.

### `GET /api/runtime`

Récupère le snapshot runtime complet : `conversation`, `timeline`, `files`, `artifacts`, `snapshots`, `agents`, `peeks`.

### `POST /api/chat`

Envoie un tour de chat, en flux NDJSON par défaut.

### `POST /api/chat/stop`

Interrompt la réponse active.

### `GET /api/file-preview`

Retourne les métadonnées d'aperçu et éventuellement un `contentUrl`.

### `GET /api/file-preview/content`

Retourne le contenu réel d'un fichier à partir d'un chemin absolu.

### `POST /api/file-manager/reveal`

Révèle le fichier dans le gestionnaire du système.

## Problèmes fréquents

### `dist` est manquant

- Exécutez `npm run build` avant `npm start`
- En développement, utilisez Vite et Node ensemble

### Les API échouent en développement

- Vérifiez `127.0.0.1:5173` pour le frontend
- Vérifiez `127.0.0.1:3000` pour le backend
- Vérifiez que vous utilisez bien l'entrée Vite

### L'application reste en `mock`

- Vérifiez `~/.openclaw/openclaw.json`
- Vérifiez `COMMANDCENTER_FORCE_MOCK=1`
- Vérifiez `OPENCLAW_BASE_URL` et `OPENCLAW_API_KEY`

### Un fichier ne peut pas être prévisualisé

- Il manque peut-être un chemin absolu
- Le fichier n'existe plus
- La cible n'est pas un fichier régulier
