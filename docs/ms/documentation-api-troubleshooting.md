[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Kembali ke utama](./documentation.md) | [Mula cepat](./documentation-quick-start.md) | [Pemeriksa, pratonton fail dan penjejakan](./documentation-inspector.md) | [Sesi, ejen dan mod pelaksanaan](./documentation-sessions.md)

# API dan Penyelesaian Masalah

## Gambaran API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Masalah biasa

### Halaman tidak dibuka dan backend menyatakan `dist` tiada

- Untuk mod production, jalankan `npm run build` dahulu kemudian `npm start`
- Untuk pembangunan, ikut [Mula cepat](./documentation-quick-start.md) dan jalankan Vite serta Node serentak

### App yang dipasang memaparkan skrin putih dan console menyebut `mermaid-vendor`

Gejala biasa:

- Bundle app dimuatkan tetapi skrin kekal kosong
- Console pelayar menunjukkan ralat daripada `mermaid-vendor-*.js`

Punca paling mungkin:

- Anda masih menggunakan binaan pakej lama `2026.3.19-1`
- Binaan itu menggunakan pemisahan vendor khusus Mermaid yang boleh merosakkan permulaan production selepas pemasangan

Penyelesaian:

- Naik taraf kepada `lalaclaw@2026.3.19-2` atau lebih baharu
- Jika anda menjalankan daripada source checkout, tarik `main` terkini dan bina semula dengan `npm run build`

### Halaman terbuka dalam pembangunan tetapi panggilan API gagal

Semak dahulu:

- Frontend pada `127.0.0.1:5173`
- Backend pada `127.0.0.1:3000`
- Menggunakan entri Vite dan bukannya entri server production

### OpenClaw dipasang tetapi app masih berada dalam `mock`

Semak:

- Sama ada `~/.openclaw/openclaw.json` wujud
- Sama ada `COMMANDCENTER_FORCE_MOCK=1` ditetapkan
- Sama ada `OPENCLAW_BASE_URL` dan `OPENCLAW_API_KEY` kosong atau salah

### Pertukaran model atau ejen nampak tidak berkesan

Punca yang mungkin:

- Anda masih dalam `mock`, jadi hanya keutamaan tempatan berubah
- Patch sesi jauh gagal dalam `openclaw`
- Model yang dipilih sebenarnya sama dengan model lalai ejen

Tempat terbaik untuk memeriksa:

- Tab `Environment` dalam [Pemeriksa, pratonton fail dan penjejakan](./documentation-inspector.md)
- Output console backend

Jika isu hanya berlaku selepas bertukar ke tab lain:

- Pastikan switcher selesai membuka sesi sasaran sebelum menghantar giliran seterusnya
- Semak `runtime.transport`, `runtime.socket`, dan `runtime.fallbackReason` dalam `Environment`
