[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Kembali ke utama](./documentation.md) | [Gambaran antara muka](./documentation-interface.md) | [Sesi, ejen dan mod pelaksanaan](./documentation-sessions.md)

# Mula Cepat

## Pemasangan npm

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

Kemudian buka [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Mod pembangunan

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

Kemudian buka [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Nota penting

- Untuk pembangunan tempatan gunakan `npm run dev:all`, bukan `npm start`
- LibreOffice diperlukan untuk pratonton doc, ppt dan pptx
- COMMANDCENTER_FORCE_MOCK=1 boleh memaksa mod mock
