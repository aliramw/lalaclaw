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

## Pasang pada hos jauh melalui OpenClaw

Jika anda mempunyai mesin jauh yang boleh dikawal oleh OpenClaw dan anda juga boleh log masuk ke mesin itu melalui SSH, anda boleh membiarkan OpenClaw memasang dan memulakan LalaClaw dari jauh, kemudian mengaksesnya secara tempatan melalui port forwarding SSH.

Contoh arahan kepada OpenClaw:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

Aliran biasa:

1. OpenClaw mengklon repositori ke mesin jauh
2. OpenClaw memasang dependensi dan memulakan aplikasi
3. LalaClaw mendengar pada `127.0.0.1:3000` di mesin jauh
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

- Dalam mod ini, `127.0.0.1:3000` tempatan anda sebenarnya menghala ke `127.0.0.1:3000` pada mesin jauh
- Proses aplikasi, konfigurasi OpenClaw, transcript, log dan workspace semuanya kekal pada mesin jauh
- Pendekatan ini lebih selamat berbanding mendedahkan dashboard terus ke internet awam, kerana jika tidak sesiapa sahaja yang mengetahui URL itu boleh menggunakan konsol ini tanpa kata laluan
- Jika port tempatan `3000` sudah digunakan, anda boleh guna port tempatan lain seperti `3300:127.0.0.1:3000` dan kemudian buka `http://127.0.0.1:3300`

## Nota penting

- Untuk pembangunan tempatan gunakan `npm run dev:all`, bukan `npm start`
- LibreOffice diperlukan untuk pratonton doc, ppt dan pptx
- COMMANDCENTER_FORCE_MOCK=1 boleh memaksa mod mock
