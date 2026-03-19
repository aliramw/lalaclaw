[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Discussion, pièces jointes et commandes](./documentation-chat.md) | [Raccourcis clavier](./documentation-shortcuts.md) | [Persistance locale et reprise](./documentation-persistence.md)

# Sessions, agents et modes d'exécution

## Comment une session est identifiée

Le frontend et le backend organisent l'état de session autour de deux valeurs :

- `agentId`
- `sessionUser`

En pratique :

- `agentId` indique avec quel agent vous collaborez
- `sessionUser` indique quelle ligne de conversation porte le contexte courant

Le même agent peut avoir plusieurs `sessionUser`, ce qui permet de créer un nouveau contexte sans changer d'agent.

## Onglets d'agent et IM

Les onglets du chat sont organisés selon l'identité réelle de la session, pas seulement selon le libellé visible.

- L'onglet principal par défaut est `agent:main`
- Les onglets d'agent supplémentaires réutilisent souvent le même `agentId`, mais avec leur propre `sessionUser`
- Les conversations IM peuvent aussi s'ouvrir directement depuis le switcher, par exemple des fils DingTalk, Feishu ou WeCom
- Chaque onglet ouvert conserve ses messages, brouillons, position de scroll et une partie de ses métadonnées de session
- Fermer un onglet le masque dans l'interface mais ne supprime pas l'historique sous-jacent

Cela signifie :

- Deux onglets peuvent pointer vers le même agent avec des `sessionUser` différents
- Les onglets IM se résolvent eux aussi en interne comme `agentId + sessionUser`
- Les onglets d'agent déjà ouverts et les canaux IM déjà ouverts sont exclus du switcher

## Réglages au niveau de la session

Ces préférences sont persistées côté backend pour chaque session :

- Agent
- Modèle
- Fast mode
- Think mode

## Démarrer une nouvelle session

Les principales façons de vider le contexte sont :

- Cliquer sur l'action de nouvelle session dans l'en-tête du chat
- Utiliser `Cmd/Ctrl + N`
- Envoyer `/new` ou `/reset`

## Mode `mock`

L'application passe en `mock` quand aucun gateway OpenClaw local n'est détecté ou quand `COMMANDCENTER_FORCE_MOCK=1` est défini.

## Mode `openclaw`

L'application passe en `openclaw` quand `~/.openclaw/openclaw.json` est détecté ou quand `OPENCLAW_BASE_URL` et les variables liées sont configurés.
