[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Volver al inicio](./documentation.md) | [Inicio rapido](./documentation-quick-start.md) | [Chat, adjuntos y comandos](./documentation-chat.md) | [Atajos de teclado](./documentation-shortcuts.md) | [Persistencia local y recuperacion](./documentation-persistence.md)

# Sesiones, agentes y modos de ejecucion

## Identidad de sesion

La sesion se organiza alrededor de:

- `agentId`
- `sessionUser`

`agentId` indica con quien colaboras y `sessionUser` indica que linea de conversacion posee el contexto actual.

## Modo `mock`

Se usa cuando no se detecta una gateway OpenClaw local o cuando `COMMANDCENTER_FORCE_MOCK=1` esta activo.

## Modo `openclaw`

Se usa cuando existe `~/.openclaw/openclaw.json` o cuando configuras `OPENCLAW_BASE_URL` y variables relacionadas.
