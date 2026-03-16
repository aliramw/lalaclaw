# Feuille de route de refactorisation

> Navigation: [Documentation Home](./documentation.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md) | [API et dépannage](./documentation-api-troubleshooting.md) | [Vue d'ensemble de l'architecture](./architecture.md) | [Showcase produit](./showcase.md)

## Objectifs

- Réduire le risque de maintenance de `src/App.jsx` et `server.js`
- Séparer la composition UI, l'orchestration de données et l'intégration OpenClaw
- Garder le comportement actuel stable tout en rendant les tests plus ciblés

## Forme cible

### Frontend

- `src/app/bootstrap/`
- `src/features/session/`
- `src/features/chat/`
- `src/features/inspector/`
- `src/shared/`

### Backend

- `server/config.js`
- `server/session-store.js`
- `server/openclaw-client.js`
- `server/transcript.js`
- `server/routes.js`
- `server/index.js`

## Premiers PR suggérés

1. Extraire la configuration runtime côté serveur
2. Extraire le flux d'envoi du chat côté frontend
3. Extraire le polling runtime côté frontend
4. Ajouter des fixtures de transcript
5. Supprimer définitivement l'ancienne app statique
