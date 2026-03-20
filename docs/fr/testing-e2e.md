[English](../en/testing-e2e.md) | [Français](../fr/testing-e2e.md)

# Tests E2E Navigateur

Ce guide définit les attentes de test end-to-end au niveau navigateur pour LalaClaw.

Utilisez ce document avec [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` décrit le flux global de contribution ; ce fichier explique quand ajouter une couverture Playwright, comment la garder stable et ce que le dépôt attend aujourd'hui des tests navigateur.

## Pile actuelle

- Framework : Playwright
- Répertoire de test : `tests/e2e/`
- Configuration principale : [`playwright.config.js`](../../playwright.config.js)
- Script de démarrage des serveurs de test : [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

La configuration actuelle démarre :

- le serveur frontend sur `http://127.0.0.1:5173`
- le serveur backend sur `http://127.0.0.1:3000`

Le script de démarrage Playwright lance le backend en mode `COMMANDCENTER_FORCE_MOCK=1`, donc les tests navigateur ne dépendent pas d'un environnement OpenClaw réel par défaut.

## Quand un E2E navigateur est requis

Ajoutez ou mettez à jour une couverture e2e navigateur si le changement touche un ou plusieurs de ces domaines :

- comportement d'envoi / stop / retry des messages
- tours en file d'attente et entrée différée dans la conversation
- bootstrap de session, changement de session ou routage d'onglet
- comportement de hydration ou de reprise visible seulement après un vrai rendu
- régression visible dans le navigateur difficile à fiabiliser avec seulement des tests hook ou controller

Préférez des tests Vitest au niveau controller ou `App` pour les transitions d'état pures. Ajoutez un e2e navigateur quand le risque dépend du vrai timing DOM, du focus, du routage, de l'ordre des requêtes ou d'un flux UI multi-étapes.

## Ce qu'il faut couvrir en premier

Le dépôt n'a pas besoin d'une large couverture navigateur avant d'avoir des tests stables sur les chemins utilisateur les plus risqués.

Priorité à ces flux :

1. démarrage de l'application et premier rendu
2. un cycle normal envoi / réponse
3. les envois en file d'attente restent hors de la conversation jusqu'au début de leur tour
4. stop / abort pendant une réponse en cours
5. chemins de bootstrap de session comme les onglets IM ou le changement d'agent

Si un correctif touche la file d'attente, le streaming, stop, la hydration ou la synchronisation session/runtime, un test de régression navigateur doit généralement viser précisément le mode d'échec visible par l'utilisateur.

## Règles de stabilité

Les e2e navigateur doivent être écrits pour la stabilité, pas pour des détails visuels triviaux.

- Préférez les assertions sur le comportement visible par l'utilisateur plutôt que sur les détails d'implémentation
- Vérifiez du texte, des rôles, des labels et des contrôles stables
- Ne rendez pas le test dépendant du timing d'animation sauf si le bug concerne ce timing
- Évitez les assertions fragiles sur des classes Tailwind si la classe elle-même n'est pas le comportement testé
- Gardez le réseau déterministe en routant les appels `/api/*` concernés dans le test
- Utilisez de vraies interactions navigateur pour la saisie, le clic, le focus et l'ordre des requêtes

Pour les flux de file d'attente ou de streaming, privilégiez ces assertions :

- le message est-il visible dans la zone de conversation ?
- reste-t-il uniquement dans la zone de file d'attente ?
- apparaît-il seulement après la fin du tour précédent ?
- l'ordre visible correspond-il à l'ordre réel des tours ?

## Stratégie de mock

N'envoyez pas les e2e navigateur vers un déploiement OpenClaw réel par défaut.

Ordre de préférence :

1. router les appels `/api/*` concernés dans le test Playwright
2. utiliser le mode mock du dépôt pour le backend
3. n'utiliser une dépendance externe réelle que si la tâche demande explicitement une validation équivalente en conditions réelles

Les exemples actuels dans [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) suivent ce modèle :

- `/api/auth/state` est stubbed
- `/api/lalaclaw/update` est stubbed
- `/api/runtime` est stubbed
- `/api/chat` est contrôlé par test pour garder l'ordre de file d'attente et le timing de fin déterministes

## Conseils de rédaction

Gardez chaque e2e navigateur très ciblé.

- Un fichier spec doit généralement se concentrer sur une seule zone produit
- Un test doit généralement vérifier un seul flux utilisateur
- Préférez un petit fichier helper / fixture plutôt que copier de gros JSON dans chaque test
- Réutilisez les builders de snapshot quand c'est possible pour garder l'alignement avec `App.test.jsx`

Bons exemples :

- « les tours en file d'attente restent hors de la conversation jusqu'à leur vrai démarrage »
- « stop rétablit le bouton d'envoi après l'abandon d'une réponse en cours »
- « un onglet bootstrap Feishu se résout vers le session user natif avant le premier envoi »

Exemples moins utiles :

- « le bouton possède exactement cet ensemble de classes utilitaires »
- « trois flux sans rapport dans un seul test »
- « utilise un vrai service distant alors qu'un route mock couvrirait déjà le comportement »

## Exécution locale

Installez d'abord le navigateur Playwright une fois :

```bash
npm run test:e2e:install
```

Lancer les e2e navigateur :

```bash
npm run test:e2e
```

Lancer avec un navigateur visible :

```bash
npm run test:e2e:headed
```

Lancer avec l'interface Playwright :

```bash
npm run test:e2e:ui
```

## Attentes CI

La CI dispose maintenant d'un job dédié aux e2e navigateur dans [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Ce job doit rester ciblé et stable :

- gardez la suite navigateur assez petite pour tourner de façon fiable sur chaque PR
- ajoutez d'abord des régressions à forte valeur avant des scénarios exploratoires plus larges
- évitez les waits flaky et les longs `sleep`

Si un nouveau test navigateur est trop lent ou trop sensible à l'environnement pour la CI par défaut, il ne doit pas entrer dans `test:e2e` avant d'avoir été simplifié ou stabilisé.

## Checklist de review recommandée

Avant de fusionner un changement e2e navigateur, vérifiez :

- ce changement a-t-il vraiment besoin d'un e2e navigateur, ou bien une couverture `App` / controller suffit-elle ?
- le test vérifie-t-il un comportement visible par l'utilisateur plutôt qu'un détail d'implémentation ?
- l'état réseau requis est-il contrôlé de manière déterministe ?
- ce test aura-t-il encore du sens dans six mois si le style UI change ?
- ce test échoue-t-il bien sur la régression utilisateur que nous voulons couvrir ?

## Fichiers associés

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
