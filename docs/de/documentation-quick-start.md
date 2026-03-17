[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Zur Startseite](./documentation.md) | [Oberflächenüberblick](./documentation-interface.md) | [Sitzungen, Agenten und Ausführungsmodi](./documentation-sessions.md)

# Schnellstart

## npm-Installation

~~~bash
npm install -g lalaclaw@latest
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

## Über OpenClaw auf einem entfernten Host installieren

Wenn du eine Remote-Maschine hast, die von OpenClaw gesteuert werden kann, und dich zusätzlich per SSH darauf anmelden kannst, kannst du OpenClaw die Installation und den Start von LalaClaw auf dem Remote-Host überlassen und danach per SSH-Portweiterleitung lokal darauf zugreifen.

Beispielanweisung für OpenClaw:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

Typischer Ablauf:

1. OpenClaw klont das Repository auf die Remote-Maschine
2. OpenClaw installiert die Abhängigkeiten und startet die Anwendung
3. LalaClaw lauscht auf der Remote-Maschine unter `127.0.0.1:3000`
4. Du leitest diesen Remote-Port per SSH auf deinen lokalen Rechner weiter
5. Anschließend öffnest du die weitergeleitete lokale Adresse im Browser

Beispiel für SSH-Portweiterleitung:

~~~bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
~~~

Danach öffnen:

~~~text
http://127.0.0.1:3000
~~~

Hinweise:

- In diesem Modus zeigt dein lokales `127.0.0.1:3000` tatsächlich auf das `127.0.0.1:3000` der Remote-Maschine
- App-Prozess, OpenClaw-Konfiguration, Transcripts, Logs und Workspaces bleiben auf der Remote-Maschine
- Dieser Ansatz ist sicherer, als das Dashboard direkt im öffentlichen Internet bereitzustellen, denn sonst kann jede Person mit der URL dieses Kontrollpanel ohne Passwort verwenden
- Wenn der lokale Port `3000` bereits belegt ist, kannst du einen anderen lokalen Port wie `3300:127.0.0.1:3000` verwenden und danach `http://127.0.0.1:3300` öffnen

## Wichtige Hinweise

- Für lokale UI-Entwicklung npm run dev:all statt npm start verwenden
- Für doc, ppt und pptx wird LibreOffice für die Vorschau benötigt
- Mit COMMANDCENTER_FORCE_MOCK=1 lässt sich der Mock-Modus erzwingen
