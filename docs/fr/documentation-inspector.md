[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Discussion, pièces jointes et commandes](./documentation-chat.md) | [API et dépannage](./documentation-api-troubleshooting.md)

# Inspecteur, aperçu de fichiers et traçage

L'inspecteur de droite est l'une des surfaces centrales de LalaClaw. Il regroupe maintenant les informations de session en quatre onglets : `Files`, `Artifacts`, `Timeline` et `Environment`.

## Files

L'onglet `Files` a deux surfaces :

- `Session Files` : les fichiers touchés dans la conversation en cours, regroupés en `Created`, `Modified` et `Viewed`
- `Workspace Files` : un arbre enraciné dans le workspace courant

Comportements notables :

- L'arbre du workspace charge un niveau de dossier à la fois
- Les badges de compteur restent visibles même quand une section est repliée
- Les sections `Session Files` vides restent masquées
- Les filtres acceptent le texte brut et des motifs glob simples

Interactions :

- Cliquer sur un fichier ouvre l'aperçu
- Le clic droit copie le chemin absolu
- Le clic droit sur un dossier du workspace recharge seulement ce niveau

## Artifacts

`Artifacts` liste les résumés de réponses assistant pour la session courante.

- Un clic renvoie vers le message correspondant
- Cela aide à naviguer dans les longues conversations
- `View Context` permet d'inspecter le contexte de session envoyé au modèle

## Timeline

`Timeline` regroupe les enregistrements par exécution :

- Titre et heure
- Résumé du prompt et résultat
- Entrées, sorties et état des outils
- Changements de fichiers associés
- Relations de collaboration pour le travail délégué

## Environment

`Environment` agrège les détails runtime comme :

- Un résumé `diagnostic OpenClaw` en tête, regroupé par `Vue d'ensemble`, `Connectivité`, `Doctor` et `Logs`
- La version OpenClaw, le profil runtime, le chemin de configuration, la racine du workspace, l'état du gateway, l'URL de santé et les points d'entrée des logs
- Le transport runtime, l'état du socket runtime, les tentatives de reconnexion et la raison du fallback
- Des groupes techniques inférieurs pour le contexte de session, la synchronisation temps réel, la configuration du gateway, l'application et les autres champs

Comportements notables :

- Les champs déjà remontés dans le résumé supérieur sont retirés des groupes techniques inférieurs pour éviter les doublons
- Les valeurs longues comme les clés de session JSON se replient dans le conteneur au lieu de déborder horizontalement
- Les chemins absolus vérifiés, comme les logs ou fichiers de configuration, ouvrent l'aperçu partagé au clic
- Les chemins de répertoire, comme le dossier des logs ou le répertoire de travail de l'Agent de la session courante, n'ouvrent pas d'aperçu inline et vont directement vers le gestionnaire de fichiers du système
- L'onglet Environment combine désormais les diagnostics OpenClaw, les actions de gestion, les outils de configuration et les détails runtime dans une seule vue
