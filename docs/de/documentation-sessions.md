[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Zur Startseite](./documentation.md) | [Schnellstart](./documentation-quick-start.md) | [Chat, Anhänge und Befehle](./documentation-chat.md) | [Tastenkürzel](./documentation-shortcuts.md) | [Lokale Persistenz und Wiederherstellung](./documentation-persistence.md)

# Sitzungen, Agenten und Ausführungsmodi

## Wie eine Sitzung identifiziert wird

Frontend und Backend organisieren den Sitzungszustand um zwei Kernwerte:

- `agentId`
- `sessionUser`

In der Praxis:

- `agentId` beschreibt, mit welchem Agenten du zusammenarbeitest
- `sessionUser` beschreibt, welche Gesprächslinie den aktuellen Kontext besitzt

Ein Agent kann mehrere `sessionUser` haben. So lässt sich neuer Kontext aufbauen, ohne den Agenten zu wechseln.

## Agent- und IM-Tabs

Chat-Tabs werden nach der echten Sitzungsidentität organisiert, nicht nur nach dem sichtbaren Namen.

- Der Standard-Haupttab ist `agent:main`
- Zusätzliche Agent-Tabs verwenden oft dieselbe `agentId`, aber eine eigene `sessionUser`
- IM-Unterhaltungen können ebenfalls direkt aus dem Umschalter geöffnet werden, zum Beispiel DingTalk-, Feishu- oder WeCom-Threads
- Jeder geöffnete Tab behält eigene Nachrichten, Entwürfe, Scroll-Positionen und Teile der Sitzungsmetadaten
- Das Schließen eines Tabs blendet ihn nur aus der UI aus; der zugrunde liegende Verlauf bleibt erhalten

Das bedeutet:

- Zwei Tabs können auf denselben Agenten mit unterschiedlichem `sessionUser` zeigen
- IM-Tabs werden intern ebenfalls als `agentId + sessionUser` aufgelöst
- Bereits geöffnete Agent-Tabs und IM-Kanäle tauchen im Umschalter nicht erneut auf

## Einstellungen auf Sitzungsebene

Diese Einstellungen werden pro Sitzung im Backend gespeichert:

- Agent
- Modell
- Fast mode
- Think mode

## Neue Sitzung starten

Die wichtigsten Wege zum Leeren des Kontexts sind:

- Die Aktion für neue Sitzung im Chat-Header
- `Cmd/Ctrl + N`
- `/new` oder `/reset`

## `mock`-Modus

Die App wechselt in den `mock`-Modus, wenn kein lokales OpenClaw-Gateway erkannt wird oder wenn `COMMANDCENTER_FORCE_MOCK=1` gesetzt ist.

## `openclaw`-Modus

Die App wechselt in den `openclaw`-Modus, wenn `~/.openclaw/openclaw.json` erkannt wird oder wenn `OPENCLAW_BASE_URL` und zugehörige Umgebungsvariablen gesetzt sind.
