[Lee este README en otro idioma: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Una mejor forma de co-crear con agentes.

Autora: Marila Wang

## Puntos clave

- UI de command center con React + Vite, chat, timeline, inspector, temas, idiomas y adjuntos
- Exploracion de archivos estilo VS Code con arbol de sesion, arbol de workspace y acciones de vista previa
- Interfaz disponible en 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu y தமிழ்
- Backend Node.js que puede conectarse a un gateway OpenClaw local o remoto
- Tests, CI, lint, guia de contribucion y notas de release ya integrados

## Recorrido del producto

- Barra superior para agent, modelo, fast mode, think mode, contexto, cola, tema e idioma
- Area principal de chat para prompts, adjuntos, respuestas en streaming y reinicio de sesion
- Inspector para timeline, archivos, artifacts, snapshots y actividad del runtime
- Superficie de Environment dentro del Inspector para diagnósticos de OpenClaw, acciones de gestión, edición segura de configuración y rutas de archivos/directorios con aperturas distintas
- Runtime utilizable en modo `mock` por defecto, con opcion de cambiar a gateways OpenClaw reales

Una demostracion mas larga esta en [es/showcase.md](./es/showcase.md).

## Documentacion

- Indice de idiomas: [README.md](./README.md)
- Guia en espanol: [es/documentation.md](./es/documentation.md)
- Inicio rapido: [es/documentation-quick-start.md](./es/documentation-quick-start.md)
- Guia de interfaz: [es/documentation-interface.md](./es/documentation-interface.md)
- Sesiones y runtime: [es/documentation-sessions.md](./es/documentation-sessions.md)
- Arquitectura: [es/architecture.md](./es/architecture.md)

Mas notas de estructura viven en [server/README.md](../server/README.md) y [src/features/README.md](../src/features/README.md).

## Guia de instalacion

### Instalar desde npm

Para la instalacion mas simple:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Despues abre [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notas:

- `lalaclaw init` escribe la configuracion local en `~/.config/lalaclaw/.env.local` en macOS y Linux
- Por defecto, `lalaclaw init` usa `HOST=127.0.0.1`, `PORT=5678` y `FRONTEND_PORT=4321`
- En un checkout del codigo fuente, `lalaclaw init` inicia Server y Vite Dev Server en segundo plano y luego sugiere abrir la URL del Dev Server
- En instalaciones npm sobre macOS, `lalaclaw init` instala e inicia el servicio `launchd` del Server y luego sugiere abrir la URL del Server
- En instalaciones npm sobre Linux, `lalaclaw init` inicia el Server en segundo plano y luego sugiere abrir la URL del Server
- Usa `lalaclaw init --no-background` si solo quieres escribir la configuracion sin iniciar servicios
- Despues de `--no-background`, ejecuta `lalaclaw doctor` y luego usa `lalaclaw dev` para un checkout fuente o `lalaclaw start` para una instalacion empaquetada
- `lalaclaw status`, `lalaclaw restart` y `lalaclaw stop` solo controlan el servicio `launchd` del Server en macOS
- La vista previa de archivos `doc`, `ppt` y `pptx` requiere LibreOffice. En macOS puedes usar `lalaclaw doctor --fix` o `brew install --cask libreoffice`

### Instalar mediante OpenClaw

Usa OpenClaw para instalar LalaClaw en una maquina remota Mac o Linux, y luego accede desde tu equipo local mediante redireccion de puertos SSH.

Si ya tienes una maquina con OpenClaw instalado y puedes iniciar sesion en ella por SSH, puedes pedirle a OpenClaw que instale este proyecto desde GitHub, lo arranque en remoto y despues reenviar ese puerto a tu equipo local.

Dile a OpenClaw:

```text
Install https://github.com/aliramw/lalaclaw
```

Flujo tipico:

1. OpenClaw clona este repositorio en la maquina remota.
2. OpenClaw instala las dependencias y arranca LalaClaw.
3. La app escucha en `127.0.0.1:5678` en la maquina remota.
4. Reenvias ese puerto remoto a tu equipo local por SSH.
5. Abres en el navegador la direccion local reenviada.

Ejemplo de redireccion SSH:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Despues abre esta direccion local:

```text
http://127.0.0.1:3000
```

### Instalar desde GitHub

Si quieres un checkout del codigo para desarrollo o cambios locales:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Despues abre [http://127.0.0.1:4321](http://127.0.0.1:4321).

Notas:

- `npm run lalaclaw:init` ahora inicia Server y Vite Dev Server en segundo plano por defecto, salvo que pases `--no-background`
- Tras el arranque, la orden sugiere abrir la URL del Dev Server, que por defecto es `http://127.0.0.1:4321`
- Si solo quieres generar configuracion, usa `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` se ejecuta en el terminal actual y se detiene cuando ese terminal se cierra
- Si despues quieres el entorno de desarrollo en vivo, ejecuta `npm run dev:all` y abre `http://127.0.0.1:4321` o tu `FRONTEND_PORT`

### Actualizar LalaClaw

Si instalaste LalaClaw con npm y quieres la version mas nueva:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Si quieres una version concreta, por ejemplo `2026.3.20-3`:

```bash
npm install -g lalaclaw@2026.3.20-3
lalaclaw init
```

Si instalaste LalaClaw desde GitHub y quieres la ultima version:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Si quieres una version concreta, por ejemplo `2026.3.20-3`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-3
npm ci
npm run build
npm run lalaclaw:start
```

## Comandos habituales

- `npm run dev:all` inicia el flujo estandar de desarrollo local
- `npm run doctor` comprueba Node.js, la deteccion de OpenClaw, los puertos y la configuracion local
- `npm run lalaclaw:init` escribe o refresca la configuracion local de arranque
- `npm run lalaclaw:start` inicia la app construida tras comprobar `dist/`
- `npm run build` crea el bundle de produccion
- `npm test` ejecuta Vitest una vez
- `npm run lint` ejecuta ESLint

Para la lista completa de comandos y el flujo de contribucion, consulta [CONTRIBUTING.md](../CONTRIBUTING.md).

## Contribuir

Las contribuciones son bienvenidas. Para funciones grandes, cambios de arquitectura o cambios visibles para el usuario, abre primero un issue.

Antes de abrir un PR:

- Mantén los cambios enfocados y evita refactors no relacionados
- Añade o actualiza pruebas para cambios de comportamiento
- Lleva todo texto visible a `src/locales/*.js`
- Actualiza la documentacion cuando cambie el comportamiento visible
- Actualiza [CHANGELOG.md](../CHANGELOG.md) cuando haya cambios versionados

La checklist completa esta en [CONTRIBUTING.md](../CONTRIBUTING.md).

## Notas de desarrollo

- Usa `npm run dev:all` para el flujo estandar de desarrollo local
- En desarrollo, la URL frontend por defecto es [http://127.0.0.1:4321](http://127.0.0.1:4321), o la que configures en `FRONTEND_PORT`
- Reserva `npm run lalaclaw:start` y `npm start` para verificaciones basadas en `dist/`
- La app detecta automaticamente un gateway OpenClaw local cuando esta disponible
- Para forzar el modo `mock`, usa `COMMANDCENTER_FORCE_MOCK=1`
- Antes de un PR, se recomienda ejecutar `npm run lint`, `npm test` y `npm run build`

## Versiones

LalaClaw usa versionado de calendario compatible con npm.

- Actualiza [CHANGELOG.md](../CHANGELOG.md) cada vez que cambie la version
- Si hay varias releases el mismo dia, usa `YYYY.M.D-N`, por ejemplo `2026.3.20-3`
- Explica claramente los cambios rompientes en las release notes y en la documentacion de migracion
- Para desarrollo, la version recomendada de Node.js es `22` segun [`.nvmrc`](../.nvmrc). El paquete npm publicado admite `^20.19.0 || ^22.12.0 || >=24.0.0`

## Integracion con OpenClaw

Si existe `~/.openclaw/openclaw.json`, LalaClaw detecta automaticamente tu gateway OpenClaw local y reutiliza su endpoint loopback y su token.

Para un checkout fuente nuevo, una configuracion tipica es esta:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Si quieres apuntar a otro gateway compatible con OpenClaw, define:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

Si tu gateway se parece mas a la API OpenAI Responses, usa:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Sin esas variables, la aplicacion arranca en modo `mock`, de modo que la UI y el bucle de chat siguen siendo utilizables durante la puesta en marcha.
