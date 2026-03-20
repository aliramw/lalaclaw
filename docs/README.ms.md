[Baca README ini dalam bahasa lain: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Cara yang lebih baik untuk bekerjasama dan berkarya bersama ejen.

Pengarang: Marila Wang

## Sorotan

- Antara muka command center berasaskan React + Vite dengan chat, timeline, inspector, tema, bahasa dan lampiran
- Penerokaan fail gaya VS Code dengan pokok sesi, pokok ruang kerja dan tindakan pratonton
- Antara muka tersedia dalam 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu dan தமிழ்
- Backend Node.js yang boleh disambungkan ke gateway OpenClaw tempatan atau jauh
- Ujian, CI, lint, panduan sumbangan dan nota keluaran sudah tersedia

## Lawatan produk

- Bar atas untuk agent, model, fast mode, think mode, context, queue, tema dan bahasa
- Ruang chat utama untuk prompt, lampiran, jawapan streaming dan set semula sesi
- Inspector untuk timeline, fail, artifacts, snapshots dan aktiviti runtime
- Permukaan Environment dalam Inspector untuk diagnostik OpenClaw, tindakan pengurusan, penyuntingan konfigurasi yang selamat, serta laluan fail/direktori dengan gelagat buka yang berbeza
- Runtime boleh digunakan dalam mod `mock` secara lalai dan boleh ditukar ke gateway OpenClaw sebenar

Penerangan yang lebih panjang ada di [ms/showcase.md](./ms/showcase.md).

## Dokumentasi

- Indeks bahasa: [README.md](./README.md)
- Panduan Bahasa Melayu: [ms/documentation.md](./ms/documentation.md)
- Mula cepat: [ms/documentation-quick-start.md](./ms/documentation-quick-start.md)
- Panduan antara muka: [ms/documentation-interface.md](./ms/documentation-interface.md)
- Sesi dan runtime: [ms/documentation-sessions.md](./ms/documentation-sessions.md)
- Seni bina: [ms/architecture.md](./ms/architecture.md)

Nota struktur tambahan ada di [server/README.md](../server/README.md) dan [src/features/README.md](../src/features/README.md).

## Panduan pemasangan

### Pasang dari npm

Untuk pemasangan paling mudah:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Kemudian buka [http://127.0.0.1:5678](http://127.0.0.1:5678).

Nota:

- `lalaclaw init` menulis konfigurasi tempatan ke `~/.config/lalaclaw/.env.local` pada macOS dan Linux
- Secara lalai, `lalaclaw init` menggunakan `HOST=127.0.0.1`, `PORT=5678` dan `FRONTEND_PORT=4321`
- Dalam source checkout, `lalaclaw init` akan memulakan Server dan Vite Dev Server di latar belakang kemudian mencadangkan untuk membuka URL Dev Server
- Dalam pemasangan npm di macOS, `lalaclaw init` akan memasang dan memulakan servis `launchd` untuk Server kemudian mencadangkan untuk membuka URL Server
- Dalam pemasangan npm di Linux, `lalaclaw init` akan memulakan Server di latar belakang kemudian mencadangkan untuk membuka URL Server
- Gunakan `lalaclaw init --no-background` jika anda hanya mahu menulis konfigurasi tanpa memulakan servis
- Selepas `--no-background`, jalankan `lalaclaw doctor`, kemudian gunakan `lalaclaw dev` untuk source checkout atau `lalaclaw start` untuk pemasangan pakej
- `lalaclaw status`, `lalaclaw restart` dan `lalaclaw stop` hanya mengawal servis `launchd` Server di macOS
- Pratonton fail `doc`, `ppt` dan `pptx` memerlukan LibreOffice. Di macOS, gunakan `lalaclaw doctor --fix` atau `brew install --cask libreoffice`

### Pasang melalui OpenClaw

Gunakan OpenClaw untuk memasang LalaClaw pada mesin Mac atau Linux jauh, kemudian aksesnya secara tempatan melalui pemajuan port SSH.

Jika anda sudah mempunyai mesin dengan OpenClaw terpasang dan anda boleh log masuk ke mesin itu melalui SSH, anda boleh meminta OpenClaw memasang projek ini dari GitHub, memulakannya di hos jauh, kemudian memajukan port tersebut ke mesin tempatan anda.

Beritahu OpenClaw:

```text
Install https://github.com/aliramw/lalaclaw
```

Aliran biasa:

1. OpenClaw mengklon repositori ini pada mesin jauh.
2. OpenClaw memasang kebergantungan dan memulakan LalaClaw.
3. Aplikasi mendengar pada `127.0.0.1:5678` di mesin jauh.
4. Anda memajukan port jauh itu ke mesin tempatan melalui SSH.
5. Anda membuka alamat tempatan yang telah dimajukan dalam pelayar.

Contoh pemajuan port SSH:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Kemudian buka alamat tempatan ini:

```text
http://127.0.0.1:3000
```

### Pasang dari GitHub

Jika anda mahu source checkout untuk pembangunan atau perubahan setempat:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Kemudian buka [http://127.0.0.1:4321](http://127.0.0.1:4321).

Nota:

- `npm run lalaclaw:init` kini memulakan Server dan Vite Dev Server di latar belakang secara lalai, kecuali jika anda menghantar `--no-background`
- Selepas startup selesai, arahan itu akan mencadangkan untuk membuka URL Dev Server, yang lalainya ialah `http://127.0.0.1:4321`
- Jika anda hanya mahu menjana konfigurasi, gunakan `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` berjalan dalam terminal semasa dan akan berhenti apabila terminal itu ditutup
- Jika anda mahu persekitaran pembangunan langsung selepas itu, jalankan `npm run dev:all` dan buka `http://127.0.0.1:4321` atau `FRONTEND_PORT` anda

### Kemas kini LalaClaw

Jika anda memasang LalaClaw melalui npm dan mahu versi terbaru:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Jika anda mahu versi tertentu, contohnya `2026.3.21-1`:

```bash
npm install -g lalaclaw@2026.3.21-1
lalaclaw init
```

Jika anda memasang LalaClaw dari GitHub dan mahu versi terbaru:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

Jika anda mahu versi tertentu, contohnya `2026.3.21-1`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.21-1
npm ci
npm run build
npm run lalaclaw:start
```

## Arahan biasa

- `npm run dev:all` memulakan aliran pembangunan tempatan standard
- `npm run doctor` memeriksa Node.js, pengesanan OpenClaw, port dan konfigurasi tempatan
- `npm run lalaclaw:init` menulis atau menyegarkan konfigurasi bootstrap tempatan
- `npm run lalaclaw:start` memulakan aplikasi build selepas memeriksa `dist/`
- `npm run build` membina bundle pengeluaran
- `npm test` menjalankan Vitest sekali
- `npm run lint` menjalankan ESLint

Untuk senarai penuh arahan dan aliran sumbangan, lihat [CONTRIBUTING.md](../CONTRIBUTING.md).

## Sumbangan

Sumbangan dialu-alukan. Untuk ciri besar, perubahan seni bina atau perubahan yang jelas kepada pengguna, buka issue dahulu.

Sebelum membuka PR:

- Kekalkan perubahan supaya fokus dan elakkan refactor yang tidak berkaitan
- Tambah atau kemas kini ujian untuk perubahan tingkah laku
- Semua teks yang dilihat pengguna perlu melalui `src/locales/*.js`
- Kemas kini dokumentasi untuk perubahan tingkah laku yang boleh dilihat
- Kemas kini [CHANGELOG.md](../CHANGELOG.md) untuk perubahan berversi

Senarai semak penuh ada di [CONTRIBUTING.md](../CONTRIBUTING.md).

## Nota pembangunan

- Gunakan `npm run dev:all` untuk aliran pembangunan tempatan standard
- Dalam pembangunan, URL frontend lalai ialah [http://127.0.0.1:4321](http://127.0.0.1:4321), atau `FRONTEND_PORT` yang anda tetapkan
- Simpan `npm run lalaclaw:start` dan `npm start` untuk semakan yang bergantung pada `dist/`
- Aplikasi akan mengesan gateway OpenClaw tempatan secara automatik apabila tersedia
- Untuk memaksa mod `mock`, gunakan `COMMANDCENTER_FORCE_MOCK=1`
- Sebelum PR, disyorkan menjalankan `npm run lint`, `npm test` dan `npm run build`

## Pemversian

LalaClaw menggunakan pemversian kalendar yang serasi dengan npm.

- Kemas kini [CHANGELOG.md](../CHANGELOG.md) setiap kali versi berubah
- Jika ada beberapa release pada hari yang sama, gunakan `YYYY.M.D-N`, contohnya `2026.3.21-1`
- Perubahan yang memecahkan keserasian perlu dinyatakan dengan jelas dalam nota keluaran dan dokumen migrasi
- Untuk pembangunan, versi Node.js yang disyorkan ialah `22` seperti dalam [`.nvmrc`](../.nvmrc). Pakej npm yang diterbitkan menyokong `^20.19.0 || ^22.12.0 || >=24.0.0`

## Integrasi OpenClaw

Jika `~/.openclaw/openclaw.json` wujud, LalaClaw akan mengesan gateway OpenClaw tempatan anda secara automatik dan menggunakan semula endpoint loopback serta tokennya.

Untuk source checkout baharu, persediaan biasa kelihatan seperti ini:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Jika anda mahu menunjuk ke gateway lain yang serasi dengan OpenClaw, tetapkan:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

Jika gateway anda lebih hampir kepada OpenAI Responses API, gunakan:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Tanpa pemboleh ubah ini, aplikasi akan berjalan dalam mod `mock`, jadi UI dan gelung chat masih boleh digunakan semasa bootstrap.
