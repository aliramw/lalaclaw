[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[Zur Startseite](./documentation.md) | [Oberflächenüberblick](./documentation-interface.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md) | [Tastenkürzel](./documentation-shortcuts.md) | [Lokale Persistenz und Wiederherstellung](./documentation-persistence.md)

# Chat, Anhänge und Befehle

## Nachrichten senden

- Enter zum Senden: Enter sendet, Shift + Enter fügt einen Zeilenumbruch ein
- Doppeltes Enter zum Senden: zweimal Enter sendet, Shift + Enter sendet ebenfalls, Enter fügt einen Zeilenumbruch ein
- ArrowUp und ArrowDown durchlaufen den Prompt-Verlauf
- Stop bricht die aktive Antwort ab

## Warteschlange

Wenn ein Tab bereits beschäftigt ist, wird die neue Nachricht eingereiht und automatisch gesendet, sobald die aktuelle Antwort abgeschlossen ist.

## Anhänge und Befehle

- Bilder erhalten eine Vorschau
- Textdateien werden eingelesen und bei Bedarf gekürzt
- Slash-Befehle wie /model, /think, /new und /reset werden unterstützt

## Spracheingabe

- In Browsern mit Web Speech API zeigt der Composer neben Anhang- und Senden-Aktionen eine Mikrofon-Schaltflaeche an
- Ein Klick startet das Diktat, ein weiterer Klick stoppt es. Erkannter Text wird in den aktuellen Entwurf eingefuegt und nicht automatisch gesendet
- Waehrend die Spracheingabe aktiv ist, pulsiert die Schaltflaeche und der Composer zeigt einen Live-Status fuer Zuhoeren / Transkription an
- Wenn Spracherkennung nicht verfuegbar ist oder die Mikrofonberechtigung verweigert wird, zeigt der Composer einen Nicht-verfuegbar- oder Fehlerstatus statt still zu scheitern
