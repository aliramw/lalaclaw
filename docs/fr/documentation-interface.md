[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Retour à l'accueil](./documentation.md) | [Démarrage rapide](./documentation-quick-start.md) | [Clin d'oeil visuel](./documentation-easter-egg.md) | [Discussion, pièces jointes et commandes](./documentation-chat.md) | [Inspecteur, aperçu de fichiers et traçage](./documentation-inspector.md)

# Vue d'ensemble de l'interface

L'écran principal de LalaClaw se comprend comme trois zones : un en-tête de contrôle de session, l'espace de chat et l'inspecteur à droite.

## En-tête et contrôles de session

La zone supérieure inclut :

- Le changement de modèle depuis la liste disponible
- L'affichage de l'usage actuel du contexte par rapport au maximum
- Un basculement du mode rapide
- Le choix du mode de réflexion parmi `off / minimal / low / medium / high / xhigh / adaptive`
- Le changement de langue pour `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Le changement de thème `system / light / dark`
- L'aide des raccourcis clavier en haut à droite
- Le homard cliquable en haut à gauche, documenté dans [Clin d'oeil visuel](./documentation-easter-egg.md)

## Espace de chat

Le panneau principal contient :

- Une barre d'onglets pour les sessions d'agent et les conversations IM, plus une entrée de switcher pour ouvrir un autre agent ou un autre fil IM
- Un en-tête avec l'agent courant, l'état d'activité, la taille de police et l'action de nouvelle session
- Une zone de conversation pour les messages utilisateur, les réponses assistant, le streaming et les aperçus de pièces jointes
- Un composer qui prend en charge le texte, les mentions `@`, les pièces jointes et l'arrêt d'une réponse active

Comportements visibles :

- Les messages utilisateur sont alignés à droite et les messages assistant à gauche
- Pendant une réponse en cours, un thinking placeholder temporaire apparaît d'abord
- Les longues réponses Markdown peuvent générer un plan pour sauter entre les titres
- Si vous n'êtes pas tout en bas, un bouton permet de revenir au plus récent

## Inspecteur à droite

L'inspecteur est maintenant organisé en quatre surfaces principales :

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

Il reste couplé à la session active et rassemble l'activité fichiers, les résumés, les enregistrements d'exécution et les métadonnées runtime de cette même session.

## Onglets multi-sessions

Les onglets suivent quelques règles simples :

- Chaque onglet est identifié par la session réelle sous-jacente, c'est-à-dire `agentId + sessionUser`
- Le switcher peut ouvrir des sessions d'agent et des conversations IM comme DingTalk, Feishu ou WeCom
- Fermer un onglet le masque seulement dans la vue courante ; l'état réel de la session n'est pas supprimé
- Les onglets d'agent déjà ouverts et les canaux IM déjà ouverts sont exclus du switcher

## Badge de workspace de developpement

- En mode developpement, un badge flottant apparait en bas a droite avec la branche, le worktree, le port et le chemin courants
- Vous pouvez le reduire ou l'ouvrir, puis choisir un worktree cible et une branche cible sans quitter le navigateur
- Le badge peut relancer les services de developpement sur place et, si vous changez de branche ou de worktree, il effectue d'abord la bascule puis attend le retour de l'aperçu
