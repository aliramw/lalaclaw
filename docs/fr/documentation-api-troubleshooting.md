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

### Le premier message disparaît et le chat revient à l'etat vide

Symptomes habituels :

- La page s'ouvre bien sur `127.0.0.1:5173`
- Vous envoyez un premier `hi`
- Le panneau revient aussitot a l'etat vide

Verifiez d'abord :

- Lancez `npm run doctor`
- En mode `local-openclaw`, verifiez que la sortie ne dit pas `OpenClaw CLI not found on PATH`
- Dans l'onglet Network du navigateur, regardez si `POST /api/chat` revient avec `conversation: []`

Cause la plus frequente :

- `~/.openclaw/openclaw.json` existe, donc LalaClaw passe en `local-openclaw`
- Mais le binaire `openclaw` n'est pas installe correctement ou n'est pas sur le `PATH`
- Le backend ne peut pas terminer le flux de session OpenClaw local, puis le frontend est ecrase par un snapshot vide

Resolution :

- Executez `which openclaw`
- Si rien n'est retourne, installez OpenClaw CLI ou ajoutez-le au `PATH`
- Si le binaire est dans un chemin personnalise, demarrez le backend avec :

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw PORT=3000 HOST=127.0.0.1 node server.js
```

- Puis relancez :

```bash
npm run doctor
```

### Un fichier ne peut pas être prévisualisé

- Il manque peut-être un chemin absolu
- Le fichier n'existe plus
- La cible n'est pas un fichier régulier
