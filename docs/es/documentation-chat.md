[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md)

[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md) | [Atajos de teclado](./documentation-shortcuts.md) | [Persistencia local y recuperacion](./documentation-persistence.md)

# Chat, adjuntos y comandos

## Envio de mensajes

- `Enter`: nueva linea
- `Shift + Enter`: enviar
- Doble `Enter`: enviar
- `ArrowUp / ArrowDown`: historial de prompts

Despues de enviar:

- El frontend inserta primero un mensaje optimista del usuario
- Si no es un slash command, agrega un placeholder de thinking
- El backend responde en NDJSON por streaming
- `Stop` interrumpe la respuesta activa

## Cola

Si la pestana ya esta ocupada:

- El nuevo mensaje entra en cola
- El mensaje del usuario aparece enseguida
- La cola continua automaticamente al terminar la respuesta actual

## Menciones `@`

- Se abren escribiendo `@` o pulsando el boton `@`
- Los agentes salen de `subagents.allowAgents`
- Las skills salen del agente actual, subagentes permitidos y directorios locales

## Adjuntos

- Imagenes: `data URL` con preview
- Texto: lectura y truncado a `120000` caracteres
- Otros archivos: solo metadatos

## Comandos slash

- `/fast`
- `/fast status`
- `/fast on`
- `/fast off`
- `/model`
- `/model status`
- `/model <id>`
- `/model list`
- `/models`
- `/think <mode>`
- `/new [prompt]`
- `/reset [prompt]`
