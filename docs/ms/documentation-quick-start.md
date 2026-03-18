[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Kembali ke utama](./documentation.md) | [Gambaran antara muka](./documentation-interface.md) | [Sesi, ejen dan mod pelaksanaan](./documentation-sessions.md) | [API dan penyelesaian masalah](./documentation-api-troubleshooting.md)

# Mula Cepat

## Keperluan

- Gunakan versi Node.js dalam [`.nvmrc`](../../.nvmrc), kini `22`
- Pemasangan melalui npm disyorkan untuk penggunaan tempatan biasa
- Gunakan source checkout GitHub hanya jika anda mahu mod pembangunan atau perubahan kod setempat

## Pasang melalui OpenClaw

Gunakan OpenClaw untuk memasang LalaClaw pada mesin Mac atau Linux jauh, kemudian aksesnya secara tempatan melalui pemajuan port SSH.

```text
Install https://github.com/aliramw/lalaclaw
```

Contoh:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Kemudian buka:

```text
http://127.0.0.1:3000
```

## Pasang dari npm

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Kemudian buka [http://127.0.0.1:5678](http://127.0.0.1:5678).

Nota:

- `lalaclaw init` menulis konfigurasi tempatan ke `~/.config/lalaclaw/.env.local`
- Nilai lalai ialah `HOST=127.0.0.1`, `PORT=5678` dan `FRONTEND_PORT=4321`
- Dalam source checkout, `lalaclaw init` akan memulakan Server dan Vite Dev Server di latar belakang
- Dalam pemasangan npm di macOS, `lalaclaw init` akan memasang dan memulakan servis `launchd` untuk Server
- Dalam pemasangan npm di Linux, `lalaclaw init` akan memulakan Server di latar belakang

## Pasang dari GitHub

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Kemudian buka [http://127.0.0.1:4321](http://127.0.0.1:4321).

## Mod pembangunan

Untuk pembangunan repositori, gunakan port tetap berikut:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

Atau:

```bash
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Titik masuk pelayar: `http://127.0.0.1:5173`

## Browser Access Tokens

Jika pelayar memaparkan skrin buka kunci token, anda boleh mencari atau menjana semula token seperti berikut:

- `lalaclaw access token` untuk melihat token semasa
- `lalaclaw access token --rotate` untuk menjana dan menyimpan token baharu
- semak `COMMANDCENTER_ACCESS_TOKENS` atau `COMMANDCENTER_ACCESS_TOKENS_FILE` dalam `~/.config/lalaclaw/.env.local`
- jika instans ini bukan anda yang pasang, minta token daripada pentadbirnya
