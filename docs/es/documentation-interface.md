[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Volver al inicio](./documentation.md) | [Inicio rápido](./documentation-quick-start.md) | [Detalle visual](./documentation-easter-egg.md) | [Conversación, adjuntos y comandos](./documentation-chat.md) | [Inspector, vista previa de archivos y rastreo](./documentation-inspector.md)

# Resumen de la interfaz

La pantalla principal de LalaClaw se entiende mejor como tres zonas: un encabezado de control de sesión, el espacio de chat y el inspector de la derecha.

## Encabezado y controles de sesión

La parte superior incluye:

- Cambio de modelo desde la lista disponible
- Indicador del uso actual de contexto frente al máximo
- Un toggle de modo rápido
- Selección del modo de pensamiento entre `off / minimal / low / medium / high / xhigh / adaptive`
- Cambio de idioma para `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Cambio de tema `system / light / dark`
- Ayuda de atajos de teclado en la esquina superior derecha
- La langosta clicable de la esquina superior izquierda, descrita en [Detalle visual](./documentation-easter-egg.md)

## Espacio de chat

El panel principal incluye:

- Una barra de pestañas para sesiones de agente y conversaciones IM, además de un selector para abrir otro agente o hilo IM
- Un encabezado con el agente actual, el estado de actividad, el tamaño de fuente y la acción de nueva sesión
- Una conversación con mensajes del usuario, respuestas del asistente, streaming y vistas previas de adjuntos
- Un composer con texto, menciones `@`, adjuntos y parada de la respuesta activa

Comportamientos visibles:

- Los mensajes del usuario se alinean a la derecha y los del asistente a la izquierda
- Mientras una respuesta está en curso aparece primero un thinking placeholder temporal
- Las respuestas Markdown largas pueden generar un índice para saltar entre títulos
- Si te alejas del final aparece un botón para volver a lo más reciente

## Inspector derecho

El inspector ahora se organiza en cuatro superficies:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

Está acoplado a la sesión activa y reúne la actividad de archivos, los resúmenes, los registros de ejecución y los metadatos de runtime de esa misma sesión.

## Pestañas de múltiples sesiones

Las pestañas siguen estas reglas:

- Se identifican por la sesión real subyacente, es decir `agentId + sessionUser`
- El selector puede abrir sesiones de agente y conversaciones IM como DingTalk, Feishu o WeCom
- Cerrar una pestaña solo la oculta en la vista actual, no elimina el estado real de la sesión
- Las pestañas de agente ya abiertas y los canales IM ya abiertos se excluyen del selector

## Insignia del workspace de desarrollo

- En modo desarrollo aparece una insignia flotante cerca de la esquina inferior derecha con la rama, el worktree, el puerto y la ruta actuales
- Puedes contraerla o expandirla y elegir un worktree de destino y una rama de destino sin salir del navegador
- La insignia puede reiniciar los servicios de desarrollo en el sitio y, cuando cambias de rama o worktree, hace primero el cambio y luego espera a que vuelva la vista previa
