[Lire ce README dans une autre langue : English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Une meilleure façon de co-créer avec des agents.

Auteur : Marila Wang

## Points forts

- Interface command center en React + Vite avec chat, timeline, inspector, thèmes, langues et pièces jointes
- Backend Node.js capable de se connecter à un gateway OpenClaw local ou distant
- Interface disponible en anglais, chinois simplifié, chinois traditionnel (Hong Kong), japonais, coréen, français, espagnol, portugais, allemand, malais et tamoul
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
npm install -g lalaclaw@latest
lalaclaw init
```

Ensuite, ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000).

Notes :

- Sur macOS, `lalaclaw init` démarre aussi automatiquement un service `launchd`
- Dans un checkout source sur macOS, `lalaclaw init` construit `dist/` si nécessaire avant de lancer le service de production
- Si vous voulez seulement écrire la configuration, utilisez `lalaclaw init --no-background`
- Sous Linux, ou si vous désactivez le démarrage en arrière-plan, continuez avec `lalaclaw doctor` et `lalaclaw start`
- La previsualisation des fichiers `doc`, `ppt` et `pptx` nécessite LibreOffice
- Sur macOS, vous pouvez lancer `lalaclaw doctor --fix` ou `brew install --cask libreoffice`

Pour développer localement :

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

En développement, utilisez [http://127.0.0.1:5173](http://127.0.0.1:5173).

Si vous voulez le service de production en arrière-plan depuis un checkout source sur macOS, exécutez `npm run doctor` puis `npm run lalaclaw:init`.

## Installer sur un hôte distant via OpenClaw

Si vous avez déjà une machine distante gérée par OpenClaw et que vous pouvez aussi vous y connecter en SSH, vous pouvez demander à OpenClaw d'installer ce projet depuis GitHub, de le démarrer sur la machine distante, puis d'accéder au dashboard en local grâce au transfert de port SSH.

Exemple d'instruction à envoyer à OpenClaw :

```text
安装这个 https://github.com/aliramw/lalaclaw
```

Flux typique :

1. OpenClaw clone ce dépôt sur la machine distante
2. OpenClaw installe les dépendances et démarre LalaClaw
3. L'application écoute sur `127.0.0.1:3000` sur cette machine distante
4. Vous transférez ce port distant vers votre machine locale avec SSH
5. Vous ouvrez ensuite l'adresse locale transférée dans votre navigateur

Exemple de transfert de port SSH :

```bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
```

Puis ouvrez :

```text
http://127.0.0.1:3000
```

Remarques :

- Dans cette configuration, votre `127.0.0.1:3000` local pointe en fait vers le `127.0.0.1:3000` de la machine distante
- Le processus de l'application, la configuration OpenClaw, les transcripts, les logs et les workspaces restent sur la machine distante
- Cette approche est plus sure que d'exposer directement le dashboard sur l'internet public, car sinon toute personne qui connait l'URL peut utiliser cette console sans mot de passe
- Si le port local `3000` est déjà utilisé, vous pouvez transférer un autre port local comme `3300:127.0.0.1:3000`, puis ouvrir `http://127.0.0.1:3300`

## Mise à jour

Mettre à jour vers la dernière version :

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Installer une version précise :

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

## Notes de développement

- Pour le développement, utilisez `npm run dev:all` plutôt que `npm start`
- Réservez `npm run lalaclaw:start` et `npm start` aux vérifications basées sur `dist/`
- L'application détecte automatiquement un OpenClaw local quand il est disponible
- Pour forcer le mode `mock`, utilisez `COMMANDCENTER_FORCE_MOCK=1`
- `npm run doctor -- --fix` installe automatiquement LibreOffice sur macOS quand le support de previsualisation base sur LibreOffice est manquant

## Versioning

LalaClaw utilise un versionnement calendaire compatible avec npm.

- Mettez à jour [CHANGELOG.md](./CHANGELOG.md) à chaque changement de version
- Pour plusieurs releases le même jour, utilisez le format `YYYY.M.D-N`, par exemple `2026.3.17-5`
