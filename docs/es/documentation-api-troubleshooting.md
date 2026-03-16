[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Volver al inicio](./documentation.md) | [Inicio rapido](./documentation-quick-start.md) | [Inspector, vista previa de archivos y trazas](./documentation-inspector.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md)

# API y solucion de problemas

## API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Problemas comunes

- Si falta `dist`, ejecuta `npm run build`
- Si falla el desarrollo, verifica `127.0.0.1:5173` y `127.0.0.1:3000`
- Si sigue en `mock`, revisa `~/.openclaw/openclaw.json` y las variables `OPENCLAW_*`
- Si el primer mensaje desaparece y el chat vuelve a quedar vacio:
  ejecuta `npm run doctor`, confirma que en `local-openclaw` no aparezca `OpenClaw CLI not found on PATH`, revisa `POST /api/chat` en Network y verifica si `conversation` vuelve vacio
- La causa mas comun es que `~/.openclaw/openclaw.json` existe pero el binario `openclaw` no esta instalado o no esta en `PATH`
- Prueba `which openclaw`; si no devuelve nada, instala OpenClaw CLI o agregalo al `PATH`
- Si el binario existe en una ruta personalizada, inicia el backend asi:

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw PORT=3000 HOST=127.0.0.1 node server.js
```
