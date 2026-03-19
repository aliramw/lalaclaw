[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Volver al inicio](./documentation.md) | [Inicio rápido](./documentation-quick-start.md) | [Inspector, vista previa de archivos y rastreo](./documentation-inspector.md) | [Sesiones, agentes y modos de ejecución](./documentation-sessions.md)

# API y solución de problemas

## Resumen de la API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Problemas comunes

### La página no carga y el backend dice que falta `dist`

- Para producción, ejecuta primero `npm run build` y luego `npm start`
- Para desarrollo, sigue [Inicio rápido](./documentation-quick-start.md) y levanta Vite y Node al mismo tiempo

### La app instalada abre una pantalla en blanco y la consola menciona `mermaid-vendor`

Síntoma típico:

- El bundle carga, pero la pantalla queda vacía
- La consola del navegador muestra un error de `mermaid-vendor-*.js`

Causa más probable:

- Estás usando el build empaquetado antiguo `2026.3.19-1`
- Ese build usaba una separación manual de Mermaid que podía romper el arranque en producción tras instalarlo

Solución:

- Actualiza a `lalaclaw@2026.3.19-2` o una versión más nueva
- Si ejecutas desde el código fuente, trae el último `main` y reconstruye con `npm run build`

### La página abre en desarrollo, pero las llamadas API fallan

Comprueba primero:

- Frontend en `127.0.0.1:5173`
- Backend en `127.0.0.1:3000`
- Uso de la entrada de Vite en lugar de la entrada del servidor de producción

### OpenClaw está instalado, pero la app sigue en `mock`

Revisa:

- Si existe `~/.openclaw/openclaw.json`
- Si `COMMANDCENTER_FORCE_MOCK=1` está activo
- Si `OPENCLAW_BASE_URL` y `OPENCLAW_API_KEY` están vacíos o mal configurados

### Los cambios de modelo o agente no parecen aplicarse

Posibles motivos:

- Sigues en `mock`, así que solo cambian preferencias locales
- Falló el patch de la sesión remota en `openclaw`
- El modelo elegido coincide con el valor por defecto del agente

Lugares recomendados para inspeccionar:

- La pestaña `Environment` en [Inspector, vista previa de archivos y rastreo](./documentation-inspector.md)
- La salida de consola del backend

Si solo ocurre al cambiar a otra pestaña:

- Confirma que el selector terminó de abrir la sesión destino antes de enviar el siguiente turno
- Revisa `runtime.transport`, `runtime.socket` y `runtime.fallbackReason` en `Environment`
