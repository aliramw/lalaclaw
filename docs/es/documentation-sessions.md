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
