[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Kembali ke utama](./documentation.md) | [Mula cepat](./documentation-quick-start.md) | [Telur paskah](./documentation-easter-egg.md) | [Sembang, lampiran dan arahan](./documentation-chat.md) | [Pemeriksa, pratonton fail dan penjejakan](./documentation-inspector.md)

# Gambaran Antara Muka

Skrin utama LalaClaw boleh difahami sebagai tiga bahagian: pengepala kawalan sesi, ruang kerja sembang, dan pemeriksa di sebelah kanan.

## Pengepala dan kawalan sesi

Bahagian atas merangkumi:

- Pertukaran model daripada senarai yang tersedia
- Paparan penggunaan konteks semasa berbanding had maksimum
- Togol fast mode
- Pemilihan mod pemikiran antara `off / minimal / low / medium / high / xhigh / adaptive`
- Pertukaran bahasa untuk `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Pertukaran tema `system / light / dark`
- Bantuan pintasan papan kekunci di penjuru kanan atas
- Lobster boleh klik di penjuru kiri atas, diterangkan dalam [Telur paskah](./documentation-easter-egg.md)

## Ruang kerja sembang

Panel utama mengandungi:

- Jalur tab untuk sesi ejen dan perbualan IM, bersama entri switcher untuk membuka ejen atau thread IM lain
- Pengepala panel yang menunjukkan ejen semasa, status aktiviti, saiz fon, dan tindakan sesi baharu
- Kawasan perbualan untuk mesej pengguna, mesej pembantu, balasan penstriman, dan pratonton lampiran
- Composer yang menyokong teks, mention `@`, lampiran, dan hentian balasan aktif

Tingkah laku yang kelihatan:

- Mesej pengguna sejajar ke kanan, mesej pembantu sejajar ke kiri
- Balasan yang sedang berjalan akan memaparkan thinking placeholder sementara terlebih dahulu
- Balasan Markdown yang panjang boleh menghasilkan outline untuk lompat cepat antara tajuk
- Jika anda tidak berada di bahagian paling bawah, butang lompat ke mesej terkini akan muncul

## Pemeriksa kanan

Pemeriksa kini memaparkan empat permukaan utama:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

Ia terikat rapat dengan sesi sembang semasa dan mengumpulkan aktiviti fail, ringkasan, rekod pelaksanaan, serta metadata runtime daripada sesi yang sama.

## Tab berbilang sesi

Tab mengikuti beberapa peraturan mudah:

- Setiap tab dibezakan oleh identiti sesi sebenar, iaitu `agentId + sessionUser`
- Switcher boleh membuka sesi ejen dan juga perbualan IM seperti DingTalk, Feishu, dan WeCom
- Menutup tab hanya menyembunyikannya daripada paparan semasa; keadaan sesi sebenar tidak dipadam
- Tab ejen yang sudah terbuka dan saluran IM yang sudah terbuka tidak dipaparkan lagi dalam switcher
