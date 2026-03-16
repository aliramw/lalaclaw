[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Zur Startseite](./documentation.md) | [Oberflächenüberblick](./documentation-interface.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md)

# Schnellstart

## npm-Installation

~~~bash
npm install -g lalaclaw
lalaclaw init
~~~

Danach [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen.

## Entwicklungsmodus

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

Danach [http://127.0.0.1:5173](http://127.0.0.1:5173) öffnen.

## Wichtige Hinweise

- Für lokale UI-Entwicklung npm run dev:all statt npm start verwenden
- Für doc, ppt und pptx wird LibreOffice für die Vorschau benötigt
- Mit COMMANDCENTER_FORCE_MOCK=1 lässt sich der Mock-Modus erzwingen