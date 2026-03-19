[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Zur Startseite](./documentation.md) | [Schnellstart](./documentation-quick-start.md) | [Inspektor, Dateivorschau und Ablaufverfolgung](./documentation-inspector.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md)

# API und Fehlerbehebung

## API-Überblick

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Häufige Probleme

### Die Seite lädt nicht und das Backend meldet fehlendes `dist`

- Für den Produktionsmodus zuerst `npm run build`, dann `npm start`
- Für die Entwicklung [Schnellstart](./documentation-quick-start.md) folgen und Vite plus Node parallel starten

### Die installierte App zeigt nur einen weißen Bildschirm und in der Konsole erscheint `mermaid-vendor`

Typisches Symptom:

- Das Bundle lädt, aber der Bildschirm bleibt leer
- Die Browser-Konsole zeigt einen Fehler aus `mermaid-vendor-*.js`

Wahrscheinlichste Ursache:

- Du verwendest noch den älteren Paket-Build `2026.3.19-1`
- Dieser Build nutzte ein manuelles Mermaid-Vendor-Splitting, das den Produktionsstart nach der Installation brechen konnte

Lösung:

- Auf `lalaclaw@2026.3.19-2` oder neuer aktualisieren
- Wenn du aus einem Source-Checkout startest, den neuesten `main` ziehen und `npm run build` erneut ausführen

### Die Seite lädt in der Entwicklung, aber API-Aufrufe schlagen fehl

Zuerst prüfen:

- Frontend auf `127.0.0.1:5173`
- Backend auf `127.0.0.1:3000`
- Verwendung des Vite-Einstiegs statt des Produktionsservers

### OpenClaw ist installiert, aber die App bleibt in `mock`

Prüfen:

- Ob `~/.openclaw/openclaw.json` existiert
- Ob `COMMANDCENTER_FORCE_MOCK=1` gesetzt ist
- Ob `OPENCLAW_BASE_URL` und `OPENCLAW_API_KEY` leer oder falsch sind

### Modell- oder Agent-Wechsel scheinen keine Wirkung zu haben

Mögliche Gründe:

- Du bist noch in `mock`, daher ändern sich nur lokale Präferenzen
- Das Patchen der Remote-Sitzung ist in `openclaw` fehlgeschlagen
- Das gewählte Modell ist bereits das Standardmodell des Agenten

Sinnvolle Prüfstellen:

- Der Tab `Environment` in [Inspektor, Dateivorschau und Ablaufverfolgung](./documentation-inspector.md)
- Die Backend-Konsole

Wenn das Problem nur nach dem Wechsel in einen anderen Tab auftritt:

- Prüfen, ob der Umschalter die Zielsitzung vollständig geöffnet hat, bevor der nächste Turn gesendet wird
- In `Environment` `runtime.transport`, `runtime.socket` und `runtime.fallbackReason` kontrollieren
