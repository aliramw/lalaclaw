[English](../en/architecture.md) | [中文](../zh/architecture.md) | [繁體中文（香港）](../zh-hk/architecture.md) | [日本語](../ja/architecture.md) | [한국어](../ko/architecture.md) | [Français](../fr/architecture.md) | [Español](../es/architecture.md) | [Português](../pt/architecture.md) | [Deutsch](../de/architecture.md) | [Bahasa Melayu](../ms/architecture.md) | [தமிழ்](../ta/architecture.md)

# Vue d'ensemble de l'architecture

> Navigation: [Documentation Home](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Showcase produit](./showcase.md) | [Feuille de route de refactorisation](./refactor-roadmap.md)

LalaClaw est organisé autour d'une entrée UI légère, d'une entrée serveur légère et de modules intermédiaires faciles à tester.

## Interface frontend

- `src/App.jsx` sert de shell de page
- `src/features/app/controllers/` orchestre le comportement global
- `src/features/chat/controllers/` gère le composer et le flux d'exécution du chat
- `src/features/session/runtime/` gère le polling runtime et l'hydratation de snapshot
- `storage`, `state` et `utils` isolent la persistance et les helpers purs

## Backend serveur

- `server.js` démarre l'application
- `server/core/` gère la configuration runtime et le stockage de session
- `server/routes/` traite les requêtes API
- `server/services/` gère OpenClaw, les transcripts et le dashboard
- `server/formatters/` contient les parseurs et formateurs purs
- `server/http/` contient les helpers HTTP bas niveau
