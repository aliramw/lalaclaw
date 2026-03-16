[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md) | [API y solucion de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Usa la version de Node.js definida en [`.nvmrc`](../../.nvmrc), actualmente `22`
- Ejecuta `npm ci` en la raiz del proyecto antes del primer inicio local

## Modo desarrollo

En desarrollo, inicia frontend y backend al mismo tiempo y usa la pagina de Vite como entrada del navegador.

### Frontend

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

### Backend

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

### Entrada del navegador

- Usa `http://127.0.0.1:5173`
- `/api/*` se proxya a `http://127.0.0.1:3000`

## Modo build

```bash
npm run build
npm start
```

`npm start` requiere `dist/`; si lo omites, el backend devolvera `503 Web app build is missing`.
