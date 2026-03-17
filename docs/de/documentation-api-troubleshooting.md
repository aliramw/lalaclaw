[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Zur Startseite](./documentation.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md) | [Lokale Persistenz und Wiederherstellung](./documentation-persistence.md)

# API und Fehlerbehebung

## Entwicklungsumgebung

- Frontend: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
- Backend: `PORT=3000 HOST=127.0.0.1 node server.js`
- Vite leitet /api/* an http://127.0.0.1:3000 weiter

## Häufige Prüfungen

- Prüfe, ob OpenClaw oder der Mock-Modus aktiv ist
- Öffne den Bereich Umgebung im Inspektor für Gateway-, Auth- und Laufzeitinformationen
- Nutze `npm run doctor`, um Ports, Konfiguration und Abhängigkeiten zu prüfen
- Für Vorschauprobleme mit Office-Dateien installiere LibreOffice
