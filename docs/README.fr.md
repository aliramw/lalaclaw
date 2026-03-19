[Lire ce README dans une autre langue : English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Une meilleure façon de co-creer avec des agents.

Auteure : Marila Wang

## Points forts

- Interface command center en React + Vite avec chat, timeline, inspector, themes, langues et pieces jointes
- Exploration de fichiers de style VS Code avec arbre de session, arbre d'espace de travail et actions de previsualisation
- Interface disponible en 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu et தமிழ்
- Backend Node.js capable de se connecter a un gateway OpenClaw local ou distant
- Tests, CI, lint, guide de contribution et notes de release deja inclus

## Tour du produit

- Barre superieure pour l'agent, le modele, le fast mode, le think mode, le contexte, la file, le theme et la langue
- Zone de chat principale pour les prompts, les pieces jointes, les reponses en streaming et la reinitialisation de session
- Inspector pour la timeline, les fichiers, les artefacts, les snapshots et l'activite runtime
- Surface Environment dans l'Inspector pour les diagnostics OpenClaw, les actions de gestion, l'edition de configuration securisee et les chemins de fichiers/repertoires avec des ouvertures distinctes
- Runtime utilisable en mode `mock` par defaut, avec bascule possible vers un vrai gateway OpenClaw

Une presentation plus longue est disponible dans [fr/showcase.md](./fr/showcase.md).

## Documentation

- Index des langues : [README.md](./README.md)
- Guide francais : [fr/documentation.md](./fr/documentation.md)
- Demarrage rapide : [fr/documentation-quick-start.md](./fr/documentation-quick-start.md)
- Guide de l'interface : [fr/documentation-interface.md](./fr/documentation-interface.md)
- Sessions et runtime : [fr/documentation-sessions.md](./fr/documentation-sessions.md)
- Architecture : [fr/architecture.md](./fr/architecture.md)

Des notes de structure supplementaires sont disponibles dans [server/README.md](../server/README.md) et [src/features/README.md](../src/features/README.md).

## Guide d'installation

### Installer depuis npm

Pour l'installation utilisateur la plus simple :

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Ensuite, ouvrez [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notes :

- `lalaclaw init` ecrit la configuration locale dans `~/.config/lalaclaw/.env.local` sur macOS et Linux
- Par defaut, `lalaclaw init` utilise `HOST=127.0.0.1`, `PORT=5678` et `FRONTEND_PORT=4321`
- Dans un checkout source, `lalaclaw init` lance Server et Vite Dev Server en arriere-plan puis propose d'ouvrir l'URL du Dev Server
- Sur macOS avec une installation npm, `lalaclaw init` installe et demarre le service `launchd` du Server puis propose d'ouvrir l'URL du Server
- Sur Linux avec une installation npm, `lalaclaw init` demarre le Server en arriere-plan puis propose d'ouvrir l'URL du Server
- Utilisez `lalaclaw init --no-background` si vous voulez seulement ecrire la configuration sans demarrer de services
- Apres `--no-background`, lancez `lalaclaw doctor`, puis utilisez `lalaclaw dev` pour un checkout source ou `lalaclaw start` pour une installation packagee
- `lalaclaw status`, `lalaclaw restart` et `lalaclaw stop` ne pilotent que le service `launchd` du Server sur macOS
- La previsualisation des fichiers `doc`, `ppt` et `pptx` necessite LibreOffice. Sur macOS, utilisez `lalaclaw doctor --fix` ou `brew install --cask libreoffice`

### Installer via OpenClaw

Utilisez OpenClaw pour installer LalaClaw sur une machine Mac ou Linux distante, puis accedez-y en local via un transfert de port SSH.

Si vous avez deja une machine avec OpenClaw installe et que vous pouvez vous y connecter en SSH, vous pouvez demander a OpenClaw d'installer ce projet depuis GitHub, de le demarrer a distance, puis de renvoyer le port vers votre machine locale.

Dites a OpenClaw :

```text
Install https://github.com/aliramw/lalaclaw
```

Flux typique :

1. OpenClaw clone ce depot sur la machine distante.
2. OpenClaw installe les dependances et demarre LalaClaw.
3. L'application ecoute sur `127.0.0.1:5678` sur la machine distante.
4. Vous transferez ce port distant vers votre machine locale via SSH.
5. Vous ouvrez l'adresse locale transferee dans votre navigateur.

Exemple de transfert de port SSH :

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Ouvrez ensuite l'adresse locale suivante :

```text
http://127.0.0.1:3000
```

### Installer depuis GitHub

Si vous voulez un checkout source pour le developpement ou des modifications locales :

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Ensuite, ouvrez [http://127.0.0.1:4321](http://127.0.0.1:4321).

Notes :

- `npm run lalaclaw:init` lance maintenant Server et Vite Dev Server en arriere-plan par defaut, sauf si vous passez `--no-background`
- Une fois le demarrage termine, la commande propose d'ouvrir l'URL du Dev Server, par defaut `http://127.0.0.1:4321`
- Si vous voulez seulement generer la configuration, utilisez `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` s'execute dans le terminal courant et s'arrete quand ce terminal se ferme
- Si vous voulez ensuite l'environnement de developpement en direct, lancez `npm run dev:all` et ouvrez `http://127.0.0.1:4321` ou votre `FRONTEND_PORT`

### Mettre a jour LalaClaw

Pour mettre a jour une installation npm vers la derniere version :

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Pour installer une version precise, par exemple `2026.3.20-1` :

```bash
npm install -g lalaclaw@2026.3.20-1
lalaclaw init
```

Pour mettre a jour une installation GitHub vers la derniere version :

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Pour passer a une version precise, par exemple `2026.3.20-1` :

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-1
npm ci
npm run build
npm run lalaclaw:start
```

## Commandes courantes

- `npm run dev:all` demarre le flux standard de developpement local
- `npm run doctor` verifie Node.js, la detection OpenClaw, les ports et la configuration locale
- `npm run lalaclaw:init` ecrit ou rafraichit la configuration locale de bootstrap
- `npm run lalaclaw:start` demarre l'application build apres verification de `dist/`
- `npm run build` cree le bundle de production
- `npm test` execute Vitest une fois
- `npm run lint` execute ESLint

Pour la liste complete des commandes et le flux de contribution, voir [CONTRIBUTING.md](../CONTRIBUTING.md).

## Contribution

Les contributions sont les bienvenues. Pour les grosses fonctionnalites, les changements d'architecture ou les comportements visibles, ouvrez d'abord une issue.

Avant d'ouvrir une PR :

- Gardez les changements concentres et evitez les refactors sans rapport
- Ajoutez ou mettez a jour les tests pour tout changement de comportement
- Faites passer tout texte visible par `src/locales/*.js`
- Mettez a jour la documentation pour tout changement visible
- Mettez a jour [CHANGELOG.md](../CHANGELOG.md) pour tout changement versionne

La checklist complete est dans [CONTRIBUTING.md](../CONTRIBUTING.md).

## Notes de developpement

- Utilisez `npm run dev:all` pour le flux standard de developpement local
- En developpement, l'URL frontend par defaut est [http://127.0.0.1:4321](http://127.0.0.1:4321), ou votre `FRONTEND_PORT`
- Reserve `npm run lalaclaw:start` et `npm start` aux verifications basees sur `dist/`
- L'application detecte automatiquement un gateway OpenClaw local quand il est disponible
- Pour forcer le mode `mock`, utilisez `COMMANDCENTER_FORCE_MOCK=1`
- Avant une PR, il est recommande de lancer `npm run lint`, `npm test` et `npm run build`

## Versioning

LalaClaw utilise un versionnement calendaire compatible avec npm.

- Mettez a jour [CHANGELOG.md](../CHANGELOG.md) a chaque changement de version
- Pour plusieurs releases le meme jour, utilisez `YYYY.M.D-N`, par exemple `2026.3.20-1`
- Signalez clairement les changements cassants dans les release notes et les documents de migration
- Pour le developpement, la version Node.js recommandee est `22` via [`.nvmrc`](../.nvmrc). Le package npm publie prend en charge `^20.19.0 || ^22.12.0 || >=24.0.0`

## Integration OpenClaw

Si `~/.openclaw/openclaw.json` existe, LalaClaw detecte automatiquement votre gateway OpenClaw local et reutilise son endpoint loopback ainsi que son token.

Pour un nouveau checkout source, l'initialisation typique ressemble a ceci :

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Si vous voulez utiliser un autre gateway compatible OpenClaw, definissez :

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

Si votre gateway ressemble davantage a l'API OpenAI Responses, utilisez :

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Sans ces variables, l'application demarre en mode `mock`, ce qui permet de tester l'interface et la boucle de chat pendant l'initialisation.
