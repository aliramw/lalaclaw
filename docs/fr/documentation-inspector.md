[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Chat, pièces jointes et commandes](./documentation-chat.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Inspecteur, aperçu de fichiers et traçage

L'inspecteur de droite est l'une des surfaces les plus importantes de LalaClaw. Il rassemble la trace d'exécution, l'activité fichiers, les résumés et les données d'environnement d'une session.

## Run Log

Le `Run Log` affiche, par exécution :

- Le titre et l'heure
- Le résumé du prompt
- La liste des appels d'outils
- L'entrée, la sortie et l'état de chaque outil
- Les changements de fichiers associés
- Les snapshots correspondants

## Files

Le panneau `Files` classe l'activité en :

- Created
- Modified
- Viewed

Actions :

- Cliquer pour ouvrir l'aperçu
- Clic droit pour copier le chemin absolu

## Summaries

Le panneau `Summaries` liste les résumés des réponses assistant de la session et permet de revenir rapidement au bon message du chat.

## Environment

Le panneau `Environment` agrège :

- Le mode courant `mock` ou `openclaw`
- L'agent, le modèle, la session et le workspace
- L'URL de la gateway, les ports, le chemin API et le style API
- Les états de contexte, file d'attente, runtime et auth

## Collab

`Collab` montre les relations et tâches dérivées :

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

## Preview

`Preview` offre quatre vues en lecture seule :

- Workspace preview
- Terminal preview
- Browser preview
- Environment preview

## Capacités d'aperçu de fichiers

L'aperçu prend en charge :

- Le surlignage syntaxique pour texte, JSON et Markdown
- Le rendu séparé du front matter Markdown
- Le zoom et la rotation d'image
- L'aperçu intégré de vidéo, audio et PDF
- L'ouverture dans VS Code
- La révélation dans le gestionnaire de fichiers du système
