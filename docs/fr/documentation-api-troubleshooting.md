[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md)

# API et dépannage

## Vue d'ensemble API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Problèmes fréquents

### La page ne charge pas et le backend dit que `dist` manque

- Pour le mode production, lancez d'abord `npm run build`, puis `npm start`
- Pour le développement, suivez [Démarrage rapide](./documentation-quick-start.md) et démarrez Vite et Node ensemble

### L'application installée ouvre un écran blanc et la console mentionne `mermaid-vendor`

Symptômes typiques :

- Le bundle se charge, mais l'écran reste vide
- La console du navigateur affiche une erreur venant de `mermaid-vendor-*.js`

Cause la plus probable :

- Vous utilisez encore l'ancien build empaqueté `2026.3.19-1`
- Ce build utilisait un découpage manuel spécifique à Mermaid qui pouvait casser le démarrage en production après installation

Correction :

- Mettez à jour vers `lalaclaw@2026.3.19-2` ou une version plus récente
- Si vous lancez depuis un checkout source, récupérez le dernier `main` puis reconstruisez avec `npm run build`

### La page s'ouvre en développement, mais les appels API échouent

Vérifiez d'abord :

- Frontend sur `127.0.0.1:5173`
- Backend sur `127.0.0.1:3000`
- Utilisation de l'entrée Vite plutôt que de l'entrée serveur de production

### OpenClaw est installé, mais l'application reste en `mock`

Vérifiez :

- Si `~/.openclaw/openclaw.json` existe
- Si `COMMANDCENTER_FORCE_MOCK=1` est défini
- Si `OPENCLAW_BASE_URL` et `OPENCLAW_API_KEY` sont vides ou incorrects

### Les changements de modèle ou d'agent semblent sans effet

Causes possibles :

- Vous êtes encore en `mock`, donc seules les préférences locales changent
- Le patch de session distante a échoué en `openclaw`
- Le modèle choisi est déjà le modèle par défaut de l'agent

Où regarder :

- L'onglet `Environment` dans [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md)
- La sortie console du backend

Si le problème n'apparaît qu'après passage vers un autre onglet :

- Vérifiez que le switcher a fini d'ouvrir la session cible avant d'envoyer le tour suivant
- Contrôlez `runtime.transport`, `runtime.socket` et `runtime.fallbackReason` dans `Environment`
