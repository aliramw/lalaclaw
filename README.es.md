[Lee este README en otro idioma: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Una mejor forma de co-crear con agentes.

Autor: Marila Wang

## Puntos clave

- UI tipo command center con React + Vite, chat, timeline, inspector, temas, idiomas y adjuntos
- Backend Node.js que puede conectarse a un gateway OpenClaw local o remoto
- Interfaz disponible en chino simplificado, chino tradicional (Hong Kong), ingles, japones, coreano, frances, espanol, portugues, aleman, malayo y tamil
- Tests, CI, lint, cobertura y documentacion de contribucion ya integrados

## Documentacion

- Indice de idiomas: [docs/README.md](./docs/README.md)
- Documentacion en espanol: [docs/es/documentation.md](./docs/es/documentation.md)
- Inicio rapido: [docs/es/documentation-quick-start.md](./docs/es/documentation-quick-start.md)
- Resumen de la interfaz: [docs/es/documentation-interface.md](./docs/es/documentation-interface.md)
- Sesiones y runtime: [docs/es/documentation-sessions.md](./docs/es/documentation-sessions.md)

## Inicio rapido

Para la instalacion mas simple:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Despues abre [http://127.0.0.1:3000](http://127.0.0.1:3000).

Notas:

- En macOS, `lalaclaw init` tambien inicia automaticamente un servicio `launchd`
- En un checkout del codigo fuente en macOS, `lalaclaw init` construye `dist/` primero si hace falta para arrancar el servicio de produccion
- Si solo quieres escribir la configuracion, usa `lalaclaw init --no-background`
- En Linux, o si desactivas el inicio en segundo plano, sigue con `lalaclaw doctor` y `lalaclaw start`
- La vista previa de archivos `doc`, `ppt` y `pptx` requiere LibreOffice
- En macOS puedes ejecutar `lalaclaw doctor --fix` o `brew install --cask libreoffice`

Para desarrollo local:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
```

En desarrollo usa [http://127.0.0.1:5173](http://127.0.0.1:5173).

Si quieres el servicio de produccion en segundo plano desde un checkout del codigo en macOS, ejecuta `npm run doctor` y luego `npm run lalaclaw:init`.

## Actualizacion

Actualizar a la ultima version:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Instalar una version concreta:

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

## Notas de desarrollo

- Para desarrollo usa `npm run dev:all` y no `npm start`
- Usa `npm run lalaclaw:start` o `npm start` solo cuando dependas del build en `dist/`
- La app detecta automaticamente un OpenClaw local cuando esta disponible
- Para forzar el modo `mock`, usa `COMMANDCENTER_FORCE_MOCK=1`
- `npm run doctor -- --fix` instala LibreOffice automaticamente en macOS cuando falta el soporte de vista previa basado en LibreOffice

## Versiones

LalaClaw usa versionado de calendario compatible con npm.

- Actualiza [CHANGELOG.md](./CHANGELOG.md) cada vez que cambie la version
- Si hay varias releases el mismo dia, usa `YYYY.M.D-N`, por ejemplo `2026.3.17-5`
