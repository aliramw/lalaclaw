[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[Retour à l'accueil](./documentation.md) | [Raccourcis clavier](./documentation-shortcuts.md) | [Chat, pièces jointes et commandes](./documentation-chat.md) | [Sessions, agents et modes d'exécution](./documentation-sessions.md)

# Persistance locale et reprise

## Ce qui est stocké localement

Le frontend stocke dans le navigateur :

- L'onglet de chat actif et l'onglet inspecteur actif
- L'historique des messages par onglet
- Les brouillons par conversation
- L'historique des prompts
- Le thème et la langue
- La largeur de l'inspecteur
- La taille de police du chat
- L'état de scroll
- Les tours de chat en attente

## Stockage des pièces jointes

Deux couches sont utilisées :

- Les références légères dans `localStorage`
- Les charges plus volumineuses dans `IndexedDB` quand il est disponible

## Notes pratiques

- Les pièces jointes envoyées survivent généralement à un rechargement
- Les tours en cours peuvent être restaurés avec leurs références de pièces jointes
- Si `localStorage` ou `IndexedDB` est bloqué, la qualité de la reprise baisse
