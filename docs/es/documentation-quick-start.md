[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md)

[Volver al inicio](./documentation.md) | [Resumen de la interfaz](./documentation-interface.md) | [Sesiones, agentes y modos de ejecucion](./documentation-sessions.md) | [API y solucion de problemas](./documentation-api-troubleshooting.md)

# Inicio rapido

## Requisitos

- Usa la version de Node.js definida en [`.nvmrc`](../../.nvmrc), actualmente `22`
- La instalacion con npm es la opcion recomendada para el uso normal
- Usa un checkout de GitHub solo si quieres modo desarrollo o cambios locales de codigo

## Instalar desde npm

Para la configuracion mas simple como usuario final:

```bash
npm install -g lalaclaw
lalaclaw init
```

Notas:

- `lalaclaw init` guarda tu configuracion local en `~/.config/lalaclaw/.env.local` en macOS y Linux
- En instalaciones npm sobre macOS, `lalaclaw init` tambien inicia automaticamente un servicio `launchd`
- En Linux, o si desactivas el arranque en segundo plano, continua con `lalaclaw doctor` y despues `lalaclaw start`

## Instalar desde GitHub

Usa esta opcion si quieres un checkout del codigo fuente para desarrollo o cambios locales.

Si OpenClaw ya esta instalado en la maquina y `~/.openclaw/openclaw.json` esta disponible:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

Notas:

- `npm run doctor` verifica Node.js, OpenClaw, la configuracion local y los puertos
- `npm run doctor -- --json` devuelve el mismo diagnostico en JSON con `summary.status` y `summary.exitCode`
- `npm run lalaclaw:init` ayuda a crear o actualizar `.env.local`
- `npm run lalaclaw:init -- --write-example` copia `.env.local.example` al archivo de configuracion objetivo sin preguntas interactivas
- `npm run lalaclaw:start` es la entrada recomendada de produccion despues de `npm run build`
- `npm run lalaclaw:start` se ejecuta en el terminal actual, asi que si cierras ese terminal el servicio se detiene
- Si tu configuracion ya esta lista, puedes omitir `npm run lalaclaw:init`
- Si prefieres configurar todo a mano, usa [`.env.local.example`](../../.env.local.example) como base

## Actualizar una instalacion existente

Si instalaste LalaClaw con npm y quieres la version mas reciente:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Si quieres una version publicada especifica, como `2026.3.17-5`:

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

Si instalaste LalaClaw desde GitHub, actualizalo asi:

Si ya instalaste LalaClaw desde GitHub y quieres la version mas reciente:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Si prefieres una version publicada especifica, como `2026.3.17-5`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-5
npm ci
npm run build
npm run lalaclaw:start
```

Notas:

- `npm install -g lalaclaw@latest` actualiza el paquete global instalado con npm
- `git pull` actualiza tu copia local a la version mas reciente en GitHub
- `npm ci` instala las dependencias requeridas por esa version
- `npm run build` actualiza los archivos web usados por el servidor de produccion
- Si usas la configuracion de `launchd` en macOS, reinicia el servicio despues de actualizar con `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app`
- Si Git dice que tienes cambios locales, haz una copia de seguridad o confírmalos antes de actualizar

## Modo desarrollo

El modo desarrollo requiere un checkout de GitHub con `npm ci` ya ejecutado.

En desarrollo, inicia frontend y backend al mismo tiempo y usa la pagina de Vite como entrada del navegador.

Tambien puedes hacerlo con un solo comando:

```bash
npm run dev:all
```

Si prefieres iniciarlos por separado:

### Frontend web

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

### Backend del servidor

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

### Entrada del navegador

- Usa `http://127.0.0.1:5173`
- `/api/*` se proxya a `http://127.0.0.1:3000`

## Modo build

```bash
npm run build
npm run lalaclaw:start
```

Notas:

- `npm run lalaclaw:start` requiere `dist/`
- Si omites `npm run build`, el backend devolvera `503 Web app build is missing`
- El modo build no es la mejor opcion para el desarrollo diario del frontend

## Despliegue persistente en macOS

Si quieres que la aplicacion siga activa despues de cerrar el terminal en macOS, usa `launchd`.

1. Construye la aplicacion:

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. Genera el plist con el script del repositorio:

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. Cargalo:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

Comandos utiles:

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

La guia completa de macOS esta en [deploy/macos/README.md](../../deploy/macos/README.md).

## `mock` y OpenClaw

Al iniciar, el backend intenta leer primero `~/.openclaw/openclaw.json`.

- Si encuentra una pasarela local y un token, usa el modo `openclaw`
- Si no, usa `mock` por defecto

Forzar `mock`:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

Si usas la CLI para inicializar la configuracion:

```bash
npm run lalaclaw:init
npm run doctor
```

En modo `remote-gateway`, `doctor` tambien hace una comprobacion real del gateway remoto y envia una peticion minima para validar el modelo y el agent configurados.

Configurar un gateway remoto:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

Si tu gateway se parece mas a la API Responses:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## Siguientes pasos

- Para entender la interfaz: [Resumen de la interfaz](./documentation-interface.md)
- Para ir directo al flujo de uso: [Chat, adjuntos y comandos](./documentation-chat.md)
