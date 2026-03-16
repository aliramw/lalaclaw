[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Chat, pièces jointes et commandes](./documentation-chat.md) | [Raccourcis clavier](./documentation-shortcuts.md) | [Persistance locale et reprise](./documentation-persistence.md)

# Sessions, agents et modes d'exécution

## Identité d'une session

L'état de session repose sur deux valeurs :

- `agentId`
- `sessionUser`

En pratique :

- `agentId` indique avec quel agent vous collaborez
- `sessionUser` indique quelle ligne de conversation possède le contexte courant

## Onglets de session agent

- L'onglet principal par défaut est `agent:main`
- Chaque onglet d'agent garde ses messages, brouillons, position de scroll et métadonnées de session
- Fermer un onglet masque la session mais ne supprime pas son historique sous-jacent

## Préférences de session

Les préférences persistées côté backend comprennent :

- Agent
- Model
- Fast mode
- Think mode

## Nouveau contexte

Pour repartir avec un contexte propre :

- Utilisez l'action de nouvelle session
- Ou `Cmd/Ctrl + N`
- Ou `/new` et `/reset`

## Mode `mock`

Le mode `mock` est utilisé si :

- Aucune gateway OpenClaw locale n'est détectée
- Ou si `COMMANDCENTER_FORCE_MOCK=1` est défini

Il permet d'utiliser l'interface complète sans gateway réelle.

## Mode `openclaw`

Le mode `openclaw` est utilisé si :

- `~/.openclaw/openclaw.json` est détecté
- Ou si `OPENCLAW_BASE_URL` et les variables associées sont configurés

Dans ce mode, `/api/chat` et `/api/runtime` parlent au runtime réel.
