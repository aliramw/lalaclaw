[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md) | [Raccourcis clavier](./documentation-shortcuts.md) | [Persistance locale et reprise](./documentation-persistence.md)

# Chat, pièces jointes et commandes

## Envoi de messages

Le composer propose désormais deux modes d'envoi commutables :

- `Entrée pour envoyer`
  - `Enter` : envoyer immédiatement
  - `Shift + Enter` : nouvelle ligne
- `Double Entrée pour envoyer`
  - Double `Enter` : envoyer immédiatement
  - `Shift + Enter` : envoyer immédiatement
  - `Enter` : nouvelle ligne

Dans les deux modes :

- `ArrowUp / ArrowDown` : historique de prompts de la conversation courante

Après l'envoi :

- Le frontend insère d'abord un message utilisateur optimiste
- Si ce n'est pas une slash command, il ajoute un placeholder de réflexion côté assistant
- Le backend renvoie la réponse en NDJSON streamé par défaut
- Le bouton `Stop` interrompt la réponse en cours

## File d'attente

Si l'onglet courant est déjà occupé :

- Le nouveau message est mis en file d'attente
- Le message utilisateur apparaît tout de suite, sans lancer un second placeholder
- La file reprend automatiquement dans l'ordre à la fin de la réponse active

## Mentions `@`

Deux entrées :

- Taper `@` dans le composer
- Cliquer sur le bouton `@`

Les candidats proviennent :

- Des agents autorisés par `subagents.allowAgents`
- Des skills visibles pour l'agent courant et les subagents autorisés

## Pièces jointes

Entrées possibles :

- Le bouton trombone
- Le collage direct depuis le presse-papiers

Traitement selon le type :

- Images : lecture en `data URL` avec aperçu inline
- Fichiers texte : lecture texte, tronquée à `120000` caractères, incluse dans la requête modèle
- Autres fichiers : envoi des métadonnées uniquement

## Reprise après rechargement

Si la page recharge pendant une réponse :

- Le frontend sauvegarde séparément le tour utilisateur en attente et le placeholder assistant
- Au rechargement, il tente de restaurer ce tour en cours
- Si le backend a déjà terminé, le placeholder est remplacé par la réponse finale

## Commandes slash

### `/fast`

- `/fast`
- `/fast status`
- `/fast on`
- `/fast off`

### `/think <mode>`

Modes pris en charge :

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`
- `adaptive`

### `/model [id]` et `/models`

- `/model`
- `/model status`
- `/model <id>`
- `/model list`
- `/models`

### `/new [prompt]` et `/reset [prompt]`

- Créent un nouveau `sessionUser`
- Reprennent les préférences courantes de model, agent, fast mode et thinking mode
- Peuvent continuer immédiatement avec un prompt fourni
