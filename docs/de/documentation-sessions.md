[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Zur Startseite](./documentation.md) | [Chat, Anhänge und Befehle](./documentation-chat.md) | [Lokale Persistenz und Wiederherstellung](./documentation-persistence.md)

# Sitzungen, Agenten und Ausführungsmodi

## Sitzungen

- Tabs werden nach Agent organisiert
- Die tatsächliche Sitzungsidentität ist agentId + sessionUser
- Das Schließen eines Tabs blendet nur die Ansicht aus und löscht die Sitzung nicht

## Agenten und Modelle

- Agenten kommen aus der erlaubten Laufzeitkonfiguration
- Modelle und Denkmodi werden aus den vom Backend gemeldeten Optionen gelesen
- Fast Mode und Think Mode werden pro Sitzung synchronisiert

## Ausführungsmodi

- Standardmäßig kann die App im mock-Modus laufen
- Mit aktivem Gateway verwendet sie einen echten OpenClaw-Endpunkt
- Runtime-, Auth- und Queue-Status sind im Kopfbereich sichtbar