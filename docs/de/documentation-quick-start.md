[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Zur Startseite](./documentation.md) | [Oberflächenüberblick](./documentation-interface.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md) | [API und Troubleshooting](./documentation-api-troubleshooting.md)

# Schnellstart

## Voraussetzungen

- Fuer die Entwicklung nutze die in [`.nvmrc`](../../.nvmrc) definierte Node.js-Version, aktuell `22`. Das veroeffentlichte npm-Paket unterstuetzt `^20.19.0 || ^22.12.0 || >=24.0.0`
- Fuer normale lokale Nutzung wird die Installation ueber npm empfohlen
- Verwende einen GitHub-Source-Checkout nur fuer Entwicklungsmodus oder lokale Codeaenderungen

## Installation ueber OpenClaw

Nutze OpenClaw, um LalaClaw auf einem entfernten Mac- oder Linux-Rechner zu installieren und anschliessend per SSH-Portweiterleitung lokal darauf zuzugreifen.

```text
Install https://github.com/aliramw/lalaclaw
```

Beispiel:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Danach oeffnen:

```text
http://127.0.0.1:3000
```

## Installation ueber npm

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Danach [http://127.0.0.1:5678](http://127.0.0.1:5678) oeffnen.

### Windows

Unter Windows dieselben Befehle in PowerShell ausfuehren:

```powershell
npm install -g lalaclaw@latest
lalaclaw init
```

Danach [http://127.0.0.1:5678](http://127.0.0.1:5678) oeffnen.

Windows-Hinweise:

- `lalaclaw init` schreibt die lokale Konfiguration in der Regel nach `%APPDATA%\\LalaClaw\\.env.local`
- Mit `lalaclaw init --no-background` wird nur die Konfiguration geschrieben, ohne Dienste automatisch zu starten
- Nach `--no-background` zuerst `lalaclaw doctor` ausfuehren und fuer Paketinstallationen danach `lalaclaw start` verwenden
- `lalaclaw start` laeuft in der aktuellen PowerShell-Sitzung; wenn das Fenster geschlossen wird, stoppt auch die App
- Falls `lalaclaw` nicht erkannt wird, PowerShell neu starten oder pruefen, ob das globale npm-bin-Verzeichnis im `PATH` ist

Hinweise:

- `lalaclaw init` schreibt die lokale Konfiguration nach `~/.config/lalaclaw/.env.local`
- Standardwerte sind `HOST=127.0.0.1`, `PORT=5678` und `FRONTEND_PORT=4321`
- In einem Source-Checkout startet `lalaclaw init` Server und Vite Dev Server im Hintergrund
- Unter macOS mit npm installiert `lalaclaw init` den `launchd`-Dienst des Servers und startet ihn
- Unter Linux mit npm startet `lalaclaw init` den Server im Hintergrund

## Installation ueber GitHub

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Danach [http://127.0.0.1:4321](http://127.0.0.1:4321) oeffnen.

## Entwicklungsmodus

Fuer die Entwicklung im Repository gelten diese festen Ports:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Oder:

```bash
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Browser-Einstieg: `http://127.0.0.1:5173`

## Browser Access Tokens

Wenn im Browser der Entsperrbildschirm fuer das Token erscheint, kannst du das token so finden oder erneuern:

- `lalaclaw access token` zeigt das aktuelle token an
- `lalaclaw access token --rotate` erzeugt und speichert ein neues token
- pruefe `COMMANDCENTER_ACCESS_TOKENS` oder `COMMANDCENTER_ACCESS_TOKENS_FILE` in `~/.config/lalaclaw/.env.local`
- wenn die Instanz nicht von dir bereitgestellt wurde, frage die zustaendige Person nach dem token

## Startdiagnose

- `lalaclaw doctor` und `npm run doctor` zeigen jetzt farbige Statuslabels, vorhandene macOS-`launchd`-Servicedetails, Vorschau-Voraussetzungen und eine abschliessende Zusammenfassungszeile an, damit Startblocker vor dem Oeffnen der App sichtbar werden
- `lalaclaw start` und `npm run lalaclaw:start` fuehren vor dem Start dieselbe Doctor-Vorpruefung aus und brechen sofort ab, wenn noch blockierende Fehler vorhanden sind
- Unter macOS verweist die Doctor-Ausgabe ausserdem auf den LaunchAgent-plist-Pfad und das Log-Verzeichnis, was beim Debuggen des Hintergrundstarts nach `lalaclaw init` hilft
