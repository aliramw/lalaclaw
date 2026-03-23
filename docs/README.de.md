[Lies dieses README in einer anderen Sprache: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Ein besserer Weg, gemeinsam mit OpenClaw zu arbeiten.

Autorin: Marila Wang

## Highlights

- React- und Vite-basiertes command center mit Chat, Timeline, Inspector, Themes, Sprachen und Anhaengen
- VS-Code-aehnliche Dateiansicht mit Sitzungsbaum, Workspace-Baum und Vorschauaktionen
- Oberflaeche verfuegbar auf 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu und தமிழ்
- Node.js-Backend fuer lokale oder entfernte OpenClaw-Gateways
- Tests, CI, Linting, Beitragsdoku und Release-Notizen sind bereits enthalten

## Produktueberblick

- Obere Leiste fuer Agent, Modell, fast mode, think mode, Kontext, Queue, Theme und Sprache
- Haupt-Chatbereich fuer Prompts, Anhaenge, Streaming-Antworten und Sitzungsreset
- Inspector fuer Timeline, Dateien, Artefakte, Snapshots und Runtime-Aktivitaet
- Environment-Bereich im Inspector fuer OpenClaw-Diagnosen, Verwaltungsaktionen, sichere Konfigurationsbearbeitung und Datei/Ordner-Pfade mit unterschiedlichem Oeffnungsverhalten
- Runtime laeuft standardmaessig im `mock`-Modus und kann auf echte OpenClaw-Gateways umgeschaltet werden

Eine laengere Vorstellung steht in [de/showcase.md](./de/showcase.md).

## Dokumentation

- Sprachindex: [README.md](./README.md)
- Deutscher Leitfaden: [de/documentation.md](./de/documentation.md)
- Schnellstart: [de/documentation-quick-start.md](./de/documentation-quick-start.md)
- Oberflaechenleitfaden: [de/documentation-interface.md](./de/documentation-interface.md)
- Sitzungen und Runtime: [de/documentation-sessions.md](./de/documentation-sessions.md)
- Architektur: [de/architecture.md](./de/architecture.md)

Weitere Strukturhinweise stehen in [server/README.md](../server/README.md) und [src/features/README.md](../src/features/README.md).

## Installationsanleitung

### Installation ueber npm

Fuer die einfachste Nutzung:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Danach [http://127.0.0.1:5678](http://127.0.0.1:5678) oeffnen.

Hinweise:

- `lalaclaw init` schreibt die lokale Konfiguration unter macOS und Linux nach `~/.config/lalaclaw/.env.local`
- Standardmaessig verwendet `lalaclaw init` `HOST=127.0.0.1`, `PORT=5678` und `FRONTEND_PORT=4321`
- In einem Source-Checkout startet `lalaclaw init` Server und Vite Dev Server im Hintergrund und bietet danach an, die Dev-Server-URL zu oeffnen
- Bei npm-Installationen unter macOS installiert und startet `lalaclaw init` den `launchd`-Dienst fuer den Server und bietet danach die Server-URL an
- Bei npm-Installationen unter Linux startet `lalaclaw init` den Server im Hintergrund und bietet danach die Server-URL an
- Wenn du nur Konfiguration schreiben willst, verwende `lalaclaw init --no-background`
- Nach `--no-background` fuehre `lalaclaw doctor` aus und nutze dann `lalaclaw dev` fuer Source-Checkouts oder `lalaclaw start` fuer Paketinstallationen
- `lalaclaw status`, `lalaclaw restart` und `lalaclaw stop` steuern nur den macOS-`launchd`-Dienst des Servers
- Fuer die Vorschau von `doc`-, `ppt`- und `pptx`-Dateien wird LibreOffice benoetigt. Unter macOS nutze `lalaclaw doctor --fix` oder `brew install --cask libreoffice`

### Installation ueber OpenClaw

Nutze OpenClaw, um LalaClaw auf einem entfernten Mac- oder Linux-Rechner zu installieren und anschliessend per SSH-Portweiterleitung lokal darauf zuzugreifen.

Wenn du bereits einen Rechner mit installiertem OpenClaw hast und dich per SSH dort anmelden kannst, kannst du OpenClaw anweisen, dieses Projekt von GitHub zu installieren, es auf dem entfernten Host zu starten und den Port dann auf deinen lokalen Rechner weiterzuleiten.

Sage OpenClaw:

```text
Install https://github.com/aliramw/lalaclaw
```

Typischer Ablauf:

1. OpenClaw klont dieses Repository auf dem entfernten Rechner.
2. OpenClaw installiert die Abhaengigkeiten und startet LalaClaw.
3. Die App lauscht auf dem entfernten Rechner auf `127.0.0.1:5678`.
4. Du leitest diesen entfernten Port per SSH auf deinen lokalen Rechner weiter.
5. Du oeffnest die weitergeleitete lokale Adresse im Browser.

Beispiel fuer SSH-Portweiterleitung:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Danach oeffnest du lokal:

```text
http://127.0.0.1:3000
```

### Installation ueber GitHub

Wenn du einen Source-Checkout fuer Entwicklung oder lokale Anpassungen willst:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Danach [http://127.0.0.1:4321](http://127.0.0.1:4321) oeffnen.

Hinweise:

- `npm run lalaclaw:init` startet jetzt standardmaessig Server und Vite Dev Server im Hintergrund, ausser du uebergibst `--no-background`
- Nach dem Start wird angeboten, die Dev-Server-URL zu oeffnen. Standard ist `http://127.0.0.1:4321`
- Wenn du nur Konfiguration erzeugen willst, verwende `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` laeuft im aktuellen Terminal und endet, wenn dieses Terminal geschlossen wird
- Wenn du spaeter die Live-Entwicklungsumgebung willst, fuehre `npm run dev:all` aus und oeffne `http://127.0.0.1:4321` oder deinen gesetzten `FRONTEND_PORT`

### LalaClaw aktualisieren

Wenn du eine npm-Installation auf die neueste Version aktualisieren willst:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Wenn du eine bestimmte Version installieren willst, zum Beispiel `2026.3.24`:

```bash
npm install -g lalaclaw@2026.3.24
lalaclaw init
```

Wenn du eine GitHub-Installation auf die neueste Version aktualisieren willst:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Wenn du eine bestimmte Version installieren willst, zum Beispiel `2026.3.24`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.24
npm ci
npm run build
npm run lalaclaw:start
```

## Haeufige Befehle

- `npm run dev:all` startet den Standard-Workflow fuer lokale Entwicklung
- `npm run doctor` prueft Node.js, OpenClaw-Erkennung, Ports und lokale Konfiguration
- `npm run lalaclaw:init` schreibt oder aktualisiert die lokale Bootstrap-Konfiguration
- `npm run lalaclaw:start` startet die gebaute App nach Pruefung von `dist/`
- `npm run build` erstellt das Produktionsbundle
- `npm test` fuehrt Vitest einmal aus
- `npm run lint` fuehrt ESLint aus

Die vollstaendige Befehlsliste und den Beitragsablauf findest du in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Beitragen

Beitraege sind willkommen. Fuer groessere Features, Architekturveraenderungen oder sichtbare Verhaltensaenderungen solltest du zuerst ein Issue eroeffnen.

Vor einem PR:

- Aendere nur den noetigen Umfang und vermeide unzusammenhaengende Refactors
- Fuege fuer Verhaltensaenderungen Tests hinzu oder aktualisiere sie
- Neue sichtbare Texte gehoeren in `src/locales/*.js`
- Aktualisiere die Dokumentation bei sichtbaren Verhaltensaenderungen
- Aktualisiere [CHANGELOG.md](../CHANGELOG.md) bei versionierten Aenderungen

Die vollstaendige Checkliste steht in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Entwicklungshinweise

- Nutze `npm run dev:all` fuer den Standard-Workflow der lokalen Entwicklung
- In der Entwicklung ist die Standard-Frontend-URL [http://127.0.0.1:4321](http://127.0.0.1:4321), alternativ dein gesetzter `FRONTEND_PORT`
- `npm run lalaclaw:start` und `npm start` sind nur fuer Pruefungen mit `dist/` gedacht
- Die App erkennt ein lokales OpenClaw-Gateway automatisch
- Fuer erzwungenen `mock`-Modus nutze `COMMANDCENTER_FORCE_MOCK=1`
- Vor einem PR sind `npm run lint`, `npm test` und `npm run build` empfehlenswert

## Versionierung

LalaClaw verwendet npm-kompatible Kalenderversionen.

- Aktualisiere [CHANGELOG.md](../CHANGELOG.md) bei jeder Versionsaenderung
- Fuer mehrere Releases am selben Tag nutze `YYYY.M.D-N`, zum Beispiel `2026.3.24`
- Inkompatible Aenderungen sollten in Release-Notizen und Migrationsdoku klar genannt werden
- Fuer die Entwicklung wird Node.js `22` gemaess [`.nvmrc`](../.nvmrc) empfohlen. Das veroeffentlichte npm-Paket unterstuetzt `^20.19.0 || ^22.12.0 || >=24.0.0`

## OpenClaw-Anbindung

Wenn `~/.openclaw/openclaw.json` existiert, erkennt LalaClaw dein lokales OpenClaw-Gateway automatisch und nutzt dessen Loopback-Endpoint und Token weiter.

Fuer einen neuen Source-Checkout sieht ein typischer Start so aus:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Wenn du stattdessen ein anderes OpenClaw-kompatibles Gateway nutzen willst, setze:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

Wenn dein Gateway eher der OpenAI-Responses-API entspricht, nutze:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Ohne diese Variablen startet die App im `mock`-Modus, sodass UI und Chat-Loop waehrend des Bootstraps nutzbar bleiben.
