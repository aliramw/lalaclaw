[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md)

[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Easter egg](./documentation-easter-egg.md) | [Chat, pièces jointes et commandes](./documentation-chat.md) | [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md)

# Vue d'ensemble de l'interface

L'écran principal de LalaClaw se compose de trois parties : un en-tête de contrôle de session, un espace de chat et un inspecteur à droite.

## En-tête et contrôles de session

La zone supérieure, pilotée par `SessionOverview`, inclut :

- La sélection du modèle courant
- L'affichage de l'usage du contexte
- Le basculement du fast mode
- Le choix du thinking mode parmi `off / minimal / low / medium / high / xhigh / adaptive`
- Le changement de langue
- Le changement de thème `system / light / dark`
- L'aide des raccourcis clavier
- Le homard cliquable en haut à gauche, documenté dans [Easter egg](./documentation-easter-egg.md)

## Espace de chat

Le panneau principal contient :

- Une barre d'onglets de session
- Un en-tête avec l'agent courant, l'état d'activité, la taille de police et l'action de nouvelle session
- Une zone de conversation pour les messages, les réponses streamées et les aperçus de pièces jointes
- Un composer prenant en charge le texte, les mentions `@`, les pièces jointes et l'arrêt d'une réponse en cours

## Inspecteur à droite

L'inspecteur expose six surfaces principales :

- `Run Log`
- `Files`
- `Summaries`
- `Environment`
- `Collab`
- `Preview`

Il est synchronisé avec la session de chat : activité fichiers, appels d'outils, résumés et snapshots d'environnement y apparaissent.

## Où aller ensuite

- Pour l'envoi, les pièces jointes, les files d'attente et les commandes : [Chat, pièces jointes et commandes](./documentation-chat.md)
- Pour le détail de l'inspecteur : [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md)
