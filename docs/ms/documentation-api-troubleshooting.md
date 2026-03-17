[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Kembali ke utama](./documentation.md) | [Sesi, ejen dan mod pelaksanaan](./documentation-sessions.md) | [Persistensi tempatan dan pemulihan](./documentation-persistence.md)

# API dan Penyelesaian Masalah

## Persediaan pembangunan

- Frontend: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
- Backend: `PORT=3000 HOST=127.0.0.1 node server.js`
- Vite memproxy /api/* ke http://127.0.0.1:3000

## Semakan biasa

- Pastikan OpenClaw atau mod mock aktif seperti yang dijangka
- Lihat tab Persekitaran untuk maklumat gateway, auth dan runtime
- Gunakan `npm run doctor` untuk menyemak port, konfigurasi dan dependensi
- Untuk masalah pratonton Office, pasang LibreOffice
