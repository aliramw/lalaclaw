[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Zur Startseite](./documentation.md) | [Oberflächenüberblick](./documentation-interface.md) | [Chat, Anhänge und Befehle](./documentation-chat.md) | [API und Fehlerbehebung](./documentation-api-troubleshooting.md)

# Inspektor, Dateivorschau und Ablaufverfolgung

Der rechte Inspektor ist eine der wichtigsten Flächen in LalaClaw. Er gruppiert Sitzungsinformationen jetzt in vier Tabs: `Files`, `Artifacts`, `Timeline` und `Environment`.

## Files

Der Tab `Files` hat zwei Bereiche:

- `Session Files`: Dateien aus der aktuellen Unterhaltung, gruppiert nach `Created`, `Modified` und `Viewed`
- `Workspace Files`: Ein Baum mit Wurzel im aktuellen Workspace

Wichtige Eigenschaften:

- Der Workspace-Baum lädt jeweils nur eine Verzeichnisebene
- Zähler-Badges bleiben auch im eingeklappten Zustand sichtbar
- Leere `Session Files`-Abschnitte bleiben verborgen
- Filter unterstützen Klartext und einfache Glob-Muster

Interaktionen:

- Klick öffnet die Vorschau
- Rechtsklick kopiert den absoluten Pfad
- Rechtsklick auf einen Workspace-Ordner aktualisiert nur diese Ebene

## Artifacts

`Artifacts` listet die Antwortzusammenfassungen des Assistenten für die aktuelle Sitzung auf.

- Ein Klick springt zur passenden Chat-Nachricht
- So lassen sich lange Gespräche schneller durchsuchen
- `View Context` zeigt den aktuellen Sitzungskontext, der an das Modell gesendet wird

## Timeline

`Timeline` gruppiert Ausführungsdaten nach Lauf:

- Titel und Uhrzeit
- Prompt-Zusammenfassung und Ergebnis
- Tool-Eingaben, -Ausgaben und -Status
- Zugehörige Dateiänderungen
- Kollaborationsbeziehungen für delegierte Arbeit

## Environment

`Environment` bündelt Laufzeitdetails wie:

- Eine zusammengefasste `OpenClaw-Diagnose` oben, gruppiert in `Überblick`, `Konnektivität`, `Doctor` und `Logs`
- OpenClaw-Version, Laufzeitprofil, Konfigurationspfad, Workspace-Wurzel, Gateway-Status, Health-URL und Log-Einstiegspunkte
- Runtime-Transport, Runtime-Socket-Status sowie Wiederverbindungsversuche und Fallback-Grund
- Technische Detailgruppen für Sitzungskontext, Echtzeit-Synchronisierung, Gateway-Konfiguration, Anwendung und sonstige Felder

Wichtige Hinweise:

- Felder, die bereits in der Diagnose-Zusammenfassung erscheinen, werden in den unteren Technikgruppen absichtlich dedupliziert
- Lange Werte wie JSON-Session-Keys umbrechen innerhalb des Containers, statt horizontal überzulaufen
- Verifizierte absolute Dateipfade, etwa Log- oder Konfigurationsdateien, lassen sich direkt in der gemeinsamen Dateivorschau öffnen
- Verzeichnis-Pfade wie Log-Ordner oder das Arbeitsverzeichnis des Agenten der aktuellen Sitzung oeffnen keine Inline-Vorschau, sondern direkt den System-Dateimanager
- Die Environment-Oberflaeche kombiniert jetzt OpenClaw-Diagnosen, Verwaltungsaktionen, Konfigurationswerkzeuge und Laufzeitdetails in einem Bereich

## Verzeichnisse einfuegen und Ordner oeffnen

- In `Workspace Files` kannst du per Rechtsklick auf ein Verzeichnis Uploads aus der Zwischenablage oder bereits kopierte lokale Dateien direkt in diesen Ordner einfuegen
- Nach erfolgreichem Einfuegen in ein Verzeichnis wird dieser Ordner neu geladen und die neuen Dateien erscheinen auch in der Dateiliste der aktuellen Sitzung
- Ordnerpfade im Inspector oeffnen weiterhin Finder, Explorer oder den System-Dateimanager statt eine Inline-Vorschau zu versuchen
