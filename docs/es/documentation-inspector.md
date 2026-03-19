[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Conversación, adjuntos y comandos](./documentation-chat.md) | [API y solución de problemas](./documentation-api-troubleshooting.md)

# Inspector, vista previa de archivos y rastreo

El inspector derecho es una de las superficies más importantes de LalaClaw. Ahora agrupa la información de la sesión en cuatro pestañas: `Files`, `Artifacts`, `Timeline` y `Environment`.

## Files

La pestaña `Files` tiene dos superficies:

- `Session Files`: archivos tocados en la conversación actual, agrupados en `Created`, `Modified` y `Viewed`
- `Workspace Files`: árbol con raíz en el workspace actual

Comportamiento destacado:

- El árbol del workspace carga un nivel de directorio cada vez
- Los contadores se mantienen visibles aunque una sección esté colapsada
- Las secciones vacías de `Session Files` permanecen ocultas
- Los filtros admiten texto plano y patrones glob simples

Interacciones:

- Clic para abrir la vista previa
- Clic derecho para copiar la ruta absoluta
- Clic derecho en una carpeta del workspace para refrescar solo ese nivel

## Artifacts

`Artifacts` muestra los resúmenes de respuesta del asistente para la sesión actual.

- Puedes hacer clic en un resumen para volver al mensaje correspondiente
- Sirve para navegar conversaciones largas sin revisar toda la transcripción
- `View Context` permite inspeccionar el contexto de sesión que se envía al modelo

## Timeline

`Timeline` agrupa los registros por ejecución:

- Título y hora
- Resumen del prompt y resultado
- Entradas, salidas y estado de herramientas
- Cambios de archivos asociados
- Relaciones de colaboración para trabajo delegado

## Environment

`Environment` reúne detalles de runtime como:

- Un resumen superior de `diagnóstico de OpenClaw`, agrupado en `Resumen`, `Conectividad`, `Doctor` y `Logs`
- Versión de OpenClaw, perfil de runtime, ruta de configuración, raíz del workspace, estado del gateway, URL de salud y entradas de logs
- Transporte runtime, estado del socket runtime, reintentos de reconexión y motivo de fallback
- Grupos técnicos inferiores para contexto de sesión, sincronización en tiempo real, configuración del gateway, aplicación y otros campos

Comportamiento destacado:

- Los campos promovidos al resumen superior se eliminan de los grupos técnicos inferiores para evitar duplicados
- Los valores largos, como claves de sesión en JSON, se ajustan dentro del contenedor en lugar de desbordarse horizontalmente
- Las rutas absolutas verificadas, como logs o archivos de configuración, pueden abrir la vista previa compartida con un clic
- Las rutas de directorio, como el directorio de logs o el directorio de trabajo del Agent de la sesión actual, no abren vista previa en línea y van directo al gestor de archivos del sistema
- La superficie de Environment ahora combina diagnósticos de OpenClaw, acciones de gestión, herramientas de configuración y detalles de runtime en una sola vista
