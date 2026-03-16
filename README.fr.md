[Lire ce README dans une autre langue : English](./README.md) | [中文](./README.zh.md) | [日本語](./README.ja.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Une meilleure façon de co-créer avec des agents.

## Points forts

- Interface command center en React + Vite avec chat, timeline, inspector, thèmes, langues et pièces jointes
- Backend Node.js capable de se connecter à un gateway OpenClaw local ou distant
- Interface disponible en anglais, chinois, japonais, français, espagnol et portugais
- Tests, CI, lint, couverture et documentation de contribution déjà intégrés

## Documentation

- Index des langues : [docs/README.md](./docs/README.md)
- Documentation française : [docs/fr/documentation.md](./docs/fr/documentation.md)
- Démarrage rapide : [docs/fr/documentation-quick-start.md](./docs/fr/documentation-quick-start.md)
- Vue d'ensemble de l'interface : [docs/fr/documentation-interface.md](./docs/fr/documentation-interface.md)
- Sessions et runtime : [docs/fr/documentation-sessions.md](./docs/fr/documentation-sessions.md)

## Démarrage rapide

Pour l'installation la plus simple :

```bash
npm install -g lalaclaw
lalaclaw init
```

Ensuite, ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000).

Pour développer localement :

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

En développement, utilisez [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Mise à jour

Mettre à jour vers la dernière version :

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Installer une version précise :

```bash
npm install -g lalaclaw@2026.3.17-4
lalaclaw init
```

## Notes de développement

- Pour le développement, utilisez `npm run dev:all` plutôt que `npm start`
- Réservez `npm run lalaclaw:start` et `npm start` aux vérifications basées sur `dist/`
- L'application détecte automatiquement un OpenClaw local quand il est disponible
- Pour forcer le mode `mock`, utilisez `COMMANDCENTER_FORCE_MOCK=1`

## Versioning

LalaClaw utilise un versionnement calendaire compatible avec npm.

- Mettez à jour [CHANGELOG.md](./CHANGELOG.md) à chaque changement de version
- Pour plusieurs releases le même jour, utilisez le format `YYYY.M.D-N`, par exemple `2026.3.17-4`
