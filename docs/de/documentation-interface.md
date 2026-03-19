[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Zur Startseite](./documentation.md) | [Schnellstart](./documentation-quick-start.md) | [Überraschungseffekt](./documentation-easter-egg.md) | [Chat, Anhänge und Befehle](./documentation-chat.md) | [Inspektor, Dateivorschau und Ablaufverfolgung](./documentation-inspector.md)

# Oberflächenüberblick

Der Hauptbildschirm von LalaClaw lässt sich in drei Bereiche aufteilen: den Sitzungs-Header oben, den Chat-Arbeitsbereich und den Inspektor auf der rechten Seite.

## Kopfbereich und Sitzungssteuerung

Der obere Bereich enthält:

- Modellwechsel aus der aktuell verfügbaren Liste
- Anzeige der aktuellen und maximalen Kontextnutzung
- Einen Schnellmodus-Schalter
- Auswahl des Denkmodus zwischen `off / minimal / low / medium / high / xhigh / adaptive`
- Sprachwechsel für `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Themenwechsel `system / light / dark`
- Hilfe zu Tastenkürzeln oben rechts
- Den anklickbaren Hummer oben links, dokumentiert unter [Überraschungseffekt](./documentation-easter-egg.md)

## Chat-Arbeitsbereich

Das Hauptpanel enthält:

- Eine Tab-Leiste für Agent-Sitzungen und IM-Unterhaltungen sowie einen Umschalter zum Öffnen weiterer Agenten oder IM-Threads
- Einen Kopfbereich mit aktuellem Agenten, Aktivitätsstatus, Schriftgröße und Aktion für neue Sitzung
- Eine Gesprächsansicht für Nutzernachrichten, Assistentenantworten, Streaming-Antworten und Anhangsvorschauen
- Einen Composer mit Text, `@`-Mentions, Anhängen und Stoppen einer laufenden Antwort

Sichtbares Verhalten:

- Nutzernachrichten sind rechtsbündig, Assistentennachrichten linksbündig
- Während einer laufenden Antwort erscheint zuerst ein temporärer Thinking-Placeholder
- Längere Markdown-Antworten können ein Inhaltsverzeichnis für Überschriften erzeugen
- Wenn du nicht am Ende bist, erscheint ein Sprung-zum-Neuesten-Button

## Rechter Inspektor

Der Inspektor ist jetzt auf vier Hauptflächen reduziert:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

Er ist eng mit der aktiven Chat-Sitzung gekoppelt und zeigt Dateiaktivität, Zusammenfassungen, Ausführungsprotokolle und Laufzeitmetadaten derselben Sitzung an.

## Mehrere Sitzungstabs

Für Tabs gelten ein paar einfache Regeln:

- Jeder Tab wird über die echte Sitzungsidentität `agentId + sessionUser` unterschieden
- Der Umschalter kann sowohl Agent-Sitzungen als auch IM-Unterhaltungen wie DingTalk, Feishu oder WeCom öffnen
- Das Schließen eines Tabs blendet ihn nur in der aktuellen Ansicht aus; der eigentliche Sitzungszustand bleibt erhalten
- Bereits geöffnete Agent-Tabs und bereits geöffnete IM-Kanäle werden im Umschalter nicht erneut angeboten
