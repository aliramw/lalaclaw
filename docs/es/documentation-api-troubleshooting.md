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
