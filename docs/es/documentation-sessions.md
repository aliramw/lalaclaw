[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Volver al inicio](./documentation.md) | [Inicio rápido](./documentation-quick-start.md) | [Conversación, adjuntos y comandos](./documentation-chat.md) | [Atajos de teclado](./documentation-shortcuts.md) | [Persistencia local y recuperación](./documentation-persistence.md)

# Sesiones, agentes y modos de ejecución

## Cómo se identifica una sesión

El frontend y el backend organizan cada sesión alrededor de dos valores:

- `agentId`
- `sessionUser`

En la práctica:

- `agentId` indica con qué agente colaboras
- `sessionUser` indica qué línea de conversación posee el contexto actual

El mismo agente puede tener varios `sessionUser`, lo que permite crear contexto nuevo sin cambiar de agente.

## Pestañas de agente e IM

Las pestañas de chat se organizan por la identidad real de la sesión, no solo por la etiqueta visible.

- La pestaña principal por defecto es `agent:main`
- Las pestañas adicionales de agente suelen reutilizar el mismo `agentId`, pero con su propio `sessionUser`
- Las conversaciones IM también pueden abrirse directamente desde el selector, por ejemplo hilos de DingTalk, Feishu o WeCom
- Cada pestaña abierta mantiene sus propios mensajes, borradores, posición de scroll y parte de sus metadatos
- Cerrar una pestaña solo la oculta en la interfaz; no borra el historial subyacente

Esto significa:

- Dos pestañas pueden apuntar al mismo agente con distinto `sessionUser`
- Las pestañas IM también se resuelven internamente como `agentId + sessionUser`
- Las pestañas de agente ya abiertas y los canales IM ya abiertos se excluyen del selector

## Ajustes a nivel de sesión

Estas preferencias se guardan en el backend por sesión:

- Agente
- Modelo
- Fast mode
- Think mode

## Empezar una nueva sesión

Las formas principales de limpiar el contexto son:

- Hacer clic en la acción de nueva sesión del encabezado
- Usar `Cmd/Ctrl + N`
- Enviar `/new` o `/reset`

Los botones resetean de forma simple, mientras que `/new` y `/reset` pueden incluir un prompt final para continuar de inmediato.

## Modo `mock`

La aplicación entra en `mock` cuando no detecta un gateway local de OpenClaw o cuando `COMMANDCENTER_FORCE_MOCK=1` está activo.

## Modo `openclaw`

La aplicación entra en `openclaw` cuando detecta `~/.openclaw/openclaw.json` o cuando configuras `OPENCLAW_BASE_URL` y variables relacionadas.
