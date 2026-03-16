[Retour à l'accueil](./documentation.md) | [Vue d'ensemble de l'interface](./documentation-interface.md) | [Raccourcis clavier](./documentation-shortcuts.md)

# Easter egg

## Point d'entrée

L'icône `🦞` en haut à gauche n'est pas seulement décorative. C'est un easter egg cliquable.

## Effet

Un clic déclenche une animation où le homard traverse la page :

- Il démarre depuis la zone de marque
- L'icône statique disparaît temporairement pendant l'animation
- Elle réapparaît une fois l'animation terminée

## Règles d'interaction

- Une seule animation tourne à la fois
- Les clics répétés ne cumulent pas plusieurs exécutions
- La couche d'animation utilise `pointer-events: none`
