[Baca README ini dalam bahasa lain: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Cara yang lebih baik untuk bekerjasama dan berkarya bersama ejen.

Pengarang: Marila Wang

## Sorotan

- Antara muka command center berasaskan React + Vite dengan chat, timeline, inspector, tema, bahasa dan lampiran
- Paparan fail ala VS Code dengan pokok session/workspace yang berasingan dan tindakan pratonton
- Antara muka tersedia dalam 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu dan தமிழ்
- Backend Node.js yang boleh disambungkan ke gateway OpenClaw tempatan atau jauh

## Dokumentasi

- Indeks bahasa: [docs/README.md](./docs/README.md)
- Dokumentasi Bahasa Melayu: [docs/ms/documentation.md](./docs/ms/documentation.md)
- Mula cepat: [docs/ms/documentation-quick-start.md](./docs/ms/documentation-quick-start.md)
- Gambaran antara muka: [docs/ms/documentation-interface.md](./docs/ms/documentation-interface.md)
- Sesi dan runtime: [docs/ms/documentation-sessions.md](./docs/ms/documentation-sessions.md)

## Mula Cepat

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

Kemudian buka [http://127.0.0.1:3000](http://127.0.0.1:3000).

Nota:

- Di macOS, `lalaclaw init` juga memulakan servis latar belakang `launchd` secara automatik
- Dalam source checkout di macOS, `lalaclaw init` akan membina `dist/` dahulu jika perlu supaya servis pengeluaran boleh bermula
- Jika anda hanya mahu menulis konfigurasi, gunakan `lalaclaw init --no-background`
- Di Linux, atau jika anda mematikan permulaan latar belakang, teruskan dengan `lalaclaw doctor` dan `lalaclaw start`
- Pratonton fail doc, ppt dan pptx memerlukan LibreOffice
- Di macOS anda boleh jalankan lalaclaw doctor --fix atau brew install --cask libreoffice

Untuk pembangunan tempatan:

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

Dalam mod pembangunan gunakan [http://127.0.0.1:5173](http://127.0.0.1:5173).

Jika anda mahu servis pengeluaran latar belakang daripada source checkout di macOS, jalankan `npm run doctor` kemudian `npm run lalaclaw:init`.

## Pasang pada hos jauh melalui OpenClaw

Jika anda sudah mempunyai mesin jauh yang diurus oleh OpenClaw dan anda juga boleh log masuk ke mesin itu melalui SSH, anda boleh meminta OpenClaw memasang projek ini terus dari GitHub, memulakannya pada hos jauh, kemudian mengakses dashboard itu secara tempatan melalui port forwarding SSH.

Contoh arahan kepada OpenClaw:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

Aliran biasa:

1. OpenClaw mengklon repositori ini pada mesin jauh
2. OpenClaw memasang dependensi dan memulakan LalaClaw
3. Aplikasi mendengar pada `127.0.0.1:3000` di mesin jauh
4. Anda memajukan port jauh itu ke mesin tempatan anda melalui SSH
5. Anda membuka alamat tempatan yang telah dimajukan dalam pelayar

Contoh port forwarding SSH:

~~~bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
~~~

Kemudian buka:

~~~text
http://127.0.0.1:3000
~~~

Nota:

- Dalam konfigurasi ini, `127.0.0.1:3000` tempatan anda sebenarnya menghala ke `127.0.0.1:3000` pada mesin jauh
- Proses aplikasi, konfigurasi OpenClaw, transcript, log dan workspace semuanya berada pada mesin jauh
- Pendekatan ini lebih selamat berbanding mendedahkan dashboard terus ke internet awam, kerana jika tidak sesiapa sahaja yang mengetahui URL itu boleh menggunakan konsol ini tanpa kata laluan
- Jika port tempatan `3000` sudah digunakan, anda boleh guna port tempatan lain seperti `3300:127.0.0.1:3000` dan kemudian buka `http://127.0.0.1:3300`

## Kemas Kini

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

Pasang versi tertentu:

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## Nota Pembangunan

- Untuk pembangunan gunakan npm run dev:all, bukan npm start
- Gunakan npm run lalaclaw:start atau npm start hanya jika anda bergantung pada build dalam dist
- Aplikasi mengesan OpenClaw tempatan secara automatik
- Untuk memaksa mod mock, gunakan COMMANDCENTER_FORCE_MOCK=1

## Pemversian

- Kemas kini CHANGELOG.md setiap kali versi berubah
- Jika ada beberapa release pada hari yang sama, gunakan format YYYY.M.D-N, contohnya 2026.3.17-5
