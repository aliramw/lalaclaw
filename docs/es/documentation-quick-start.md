[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md) | [API y solucion de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Usa la version de Node.js definida en [`.nvmrc`](../../.nvmrc), actualmente `22`
- La instalacion con npm es la opcion recomendada para el uso normal
- Usa un checkout de GitHub solo si quieres modo desarrollo o cambios locales de codigo

## Instalar mediante OpenClaw

Usa OpenClaw para instalar LalaClaw en una maquina remota Mac o Linux y acceder desde tu equipo local con redireccion SSH.

```text
Install https://github.com/aliramw/lalaclaw
```

Ejemplo:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Luego abre:

```text
http://127.0.0.1:3000
```

## Instalar desde npm

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Despues abre [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notas:

- `lalaclaw init` guarda la configuracion local en `~/.config/lalaclaw/.env.local`
- Los valores por defecto son `HOST=127.0.0.1`, `PORT=5678` y `FRONTEND_PORT=4321`
- En un checkout fuente, `lalaclaw init` inicia Server y Vite Dev Server en segundo plano
- En macOS con npm, `lalaclaw init` instala e inicia el servicio `launchd` del Server
- En Linux con npm, `lalaclaw init` inicia el Server en segundo plano

## Instalar desde GitHub

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Despues abre [http://127.0.0.1:4321](http://127.0.0.1:4321).

## Modo desarrollo

Para el desarrollo del repositorio usa estos puertos fijos:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

O:

```bash
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Entrada del navegador: `http://127.0.0.1:5173`

## Browser Access Tokens

Si el navegador muestra la pantalla para desbloquear con token, puedes encontrar o renovar el token asi:

- `lalaclaw access token` para ver el token actual
- `lalaclaw access token --rotate` para generar y guardar un token nuevo
- revisa `COMMANDCENTER_ACCESS_TOKENS` o `COMMANDCENTER_ACCESS_TOKENS_FILE` en `~/.config/lalaclaw/.env.local`
- si no desplegaste esta instancia tu mismo, pide el token a quien la administre
