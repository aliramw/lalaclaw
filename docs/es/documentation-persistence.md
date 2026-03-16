[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md)

[Volver al inicio](./documentation.md) | [Atajos de teclado](./documentation-shortcuts.md) | [Chat, adjuntos y comandos](./documentation-chat.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md)

# Persistencia local y recuperacion

El frontend guarda localmente:

- Pestana activa de chat e inspector
- Historial de mensajes por pestana
- Borradores por conversacion
- Historial de prompts
- Tema e idioma
- Ancho del inspector
- Tamano de fuente
- Estado de scroll
- Turnos pendientes

Los adjuntos combinan `localStorage` e `IndexedDB` cuando esta disponible.
