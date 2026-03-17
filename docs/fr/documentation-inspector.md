[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Discussion, pièces jointes et commandes](./documentation-chat.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Inspecteur, aperçu de fichiers et traçage

L'inspecteur de droite est l'une des surfaces les plus importantes de LalaClaw. Il rassemble la trace d'exécution, l'activité fichiers, les résumés et les données d'environnement d'une session.

## Journal d'execution

Le `Journal d'exécution` affiche, par exécution :

- Le titre et l'heure
- Le résumé du prompt
- La liste des appels d'outils
- L'entrée, la sortie et l'état de chaque outil
- Les changements de fichiers associés
- Les snapshots correspondants

## Fichiers

Le panneau `Fichiers` classe l'activité en :

- Créés
- Modifiés
- Consultés

Actions :

- Cliquer pour ouvrir l'aperçu
- Clic droit pour copier le chemin absolu

## Résumés

Le panneau `Résumés` liste les résumés des réponses assistant de la session et permet de revenir rapidement au bon message de la discussion.

## Environnement

Le panneau `Environnement` agrège :

- Le mode courant `mock` ou `openclaw`
- L'agent, le modèle, la session et le workspace
- L'URL de la gateway, les ports, le chemin API et le style API
- Les états de contexte, file d'attente, runtime et auth

## Collaboration

`Collaboration` montre les relations et tâches dérivées :

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

## Aperçu

`Aperçu` offre quatre vues en lecture seule :

- Aperçu de l'espace de travail
- Aperçu du terminal
- Aperçu du navigateur
- Aperçu de l'environnement

## Capacités d'aperçu de fichiers

L'aperçu prend en charge :

- Le surlignage syntaxique pour texte, JSON et Markdown
- Le rendu séparé du front matter Markdown
- Le zoom et la rotation d'image
- L'aperçu intégré de vidéo, audio et PDF
- L'ouverture dans VS Code
- La révélation dans le gestionnaire de fichiers du système
