[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[Zur Startseite](./documentation.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md) | [API und Fehlerbehebung](./documentation-api-troubleshooting.md)

# Lokale Persistenz und Wiederherstellung

LalaClaw speichert einen Teil des UI-Zustands lokal, damit die Oberfläche nach einem Reload schnell wiederhergestellt werden kann.

- Offene Tabs und aktive Sitzung
- Breite des Inspectors
- Schriftgröße im Chat
- Gewählte Sprache und Theme

Beim Wiederherstellen versucht die App, Laufzeitdaten und gespeicherten Zustand erneut zu synchronisieren, statt die Unterhaltung stillschweigend zu verwerfen.