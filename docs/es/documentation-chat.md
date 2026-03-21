[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md) | [Atajos de teclado](./documentation-shortcuts.md) | [Persistencia local y recuperacion](./documentation-persistence.md)

# Conversacion, adjuntos y comandos

## Envio de mensajes

El composer admite dos modos de envio intercambiables:

- `Enter para enviar`
  - `Enter`: enviar
  - `Shift + Enter`: nueva linea
- `Doble Enter para enviar`
  - Doble `Enter`: enviar
  - `Shift + Enter`: enviar
  - `Enter`: nueva linea

En ambos modos:

- `ArrowUp / ArrowDown`: historial de prompts

Despues de enviar:

- El frontend inserta primero un mensaje optimista del usuario
- Si no es un comando slash, agrega un marcador de pensamiento
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

- Imagenes: `data URL` con vista previa
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

## Entrada de voz

- En los navegadores que exponen la API Web Speech, el compositor muestra un boton de microfono junto a los controles de adjuntar y enviar
- Un clic inicia el dictado y otro clic lo detiene. El texto reconocido se inserta en el borrador actual en lugar de enviarse automaticamente
- Mientras la entrada de voz esta activa, el boton late y el compositor muestra un estado de escucha / transcripcion en tiempo real
- Si el reconocimiento de voz no esta disponible o se deniega el permiso del microfono, el compositor muestra un estado no disponible o de error en lugar de fallar en silencio
