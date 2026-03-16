[Lies dieses README in einer anderen Sprache: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Ein besserer Weg, gemeinsam mit Agenten zu arbeiten.

Autor: Marila Wang

## Highlights

- Command-Center-Oberfläche mit React + Vite, Chat, Timeline, Inspector, Themes, Sprachen und Anhängen
- VS-Code-ähnliche Dateiansicht mit getrennten Bäumen für Sitzung und Workspace sowie Vorschauaktionen
- Oberfläche verfügbar auf 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu und தமிழ்
- Node.js-Backend für lokale oder entfernte OpenClaw-Gateways

## Dokumentation

- Sprachindex: [docs/README.md](./docs/README.md)
- Deutsche Dokumentation: [docs/de/documentation.md](./docs/de/documentation.md)
- Schnellstart: [docs/de/documentation-quick-start.md](./docs/de/documentation-quick-start.md)
- Oberflächenüberblick: [docs/de/documentation-interface.md](./docs/de/documentation-interface.md)
- Sitzungen und Runtime: [docs/de/documentation-sessions.md](./docs/de/documentation-sessions.md)

## Schnellstart

~~~bash
npm install -g lalaclaw
lalaclaw init
~~~

Danach [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen.

Hinweise:

- Für die Vorschau von doc, ppt und pptx wird LibreOffice benötigt
- Unter macOS kannst du lalaclaw doctor --fix oder brew install --cask libreoffice ausführen

Für lokale Entwicklung:

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

Im Entwicklungsmodus verwende [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Aktualisierung

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

Bestimmte Version installieren:

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## Entwicklungshinweise

- Für Entwicklung npm run dev:all statt npm start verwenden
- npm run lalaclaw:start oder npm start nur für Prüfungen mit dist verwenden
- Die App erkennt ein lokales OpenClaw automatisch
- Für erzwungenen mock-Modus COMMANDCENTER_FORCE_MOCK=1 verwenden

## Versionierung

- CHANGELOG.md bei jeder Versionsänderung aktualisieren
- Für mehrere Releases am selben Tag YYYY.M.D-N verwenden, zum Beispiel 2026.3.17-5