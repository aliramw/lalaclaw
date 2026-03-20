[English](../en/testing-e2e.md) | [Bahasa Melayu](../ms/testing-e2e.md)

# Ujian E2E Pelayar

Panduan ini mentakrifkan jangkaan ujian hujung-ke-hujung pada peringkat pelayar untuk LalaClaw.

Gunakan dokumen ini bersama [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` menerangkan aliran sumbangan keseluruhan; fail ini pula menerangkan bila liputan Playwright perlu ditambah, bagaimana mengekalkannya stabil, dan apa yang dijangkakan oleh repositori ini daripada ujian pelayar.

## Susunan semasa

- Rangka kerja: Playwright
- Direktori ujian: `tests/e2e/`
- Konfigurasi utama: [`playwright.config.js`](../../playwright.config.js)
- Skrip bootstrap pelayan ujian: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

Konfigurasi semasa memulakan:

- pelayan pembangunan frontend pada `http://127.0.0.1:5173`
- pelayan pembangunan backend pada `http://127.0.0.1:3000`

Skrip bootstrap Playwright menjalankan backend dalam mod `COMMANDCENTER_FORCE_MOCK=1`, jadi ujian pelayar secara lalai tidak bergantung pada persekitaran OpenClaw sebenar.

## Bila E2E pelayar diperlukan

Tambah atau kemas kini liputan e2e pelayar apabila perubahan menyentuh satu atau lebih kawasan berikut:

- tingkah laku hantar / stop / cuba semula mesej
- giliran beratur dan kemasukan tertunda ke kawasan perbualan
- bootstrap sesi, pertukaran sesi, atau penghalaan tab
- hydration dan pemulihan yang hanya kelihatan selepas render sebenar
- regresi yang kelihatan dalam pelayar dan sukar diyakini dengan ujian hook atau controller sahaja

Untuk peralihan keadaan tulen, utamakan ujian Vitest pada peringkat controller atau `App`. Tambah e2e pelayar apabila risikonya bergantung pada masa DOM sebenar, tingkah laku fokus, penghalaan, turutan permintaan, atau aliran UI berbilang langkah.

## Apa yang perlu diliputi dahulu

Repositori ini tidak memerlukan liputan pelayar yang luas sebelum laluan pengguna berisiko tinggi mempunyai liputan yang stabil.

Utamakan aliran ini:

1. permulaan aplikasi dan render pertama
2. satu kitaran hantar / balas biasa
3. mesej beratur kekal di luar perbualan sehingga gilirannya bermula
4. stop / abort semasa balasan sedang berjalan
5. laluan bootstrap sesi seperti tab IM atau pertukaran agent

Jika pembaikan pepijat mengubah queueing, streaming, stop, hydration, atau penyegerakan session/runtime, biasanya satu regresi pelayar perlu menyasarkan tepat mod kegagalan yang dapat dilihat oleh pengguna.

## Peraturan kestabilan

E2E pelayar mesti ditulis untuk kestabilan, bukan untuk butiran visual yang remeh.

- Utamakan asersi terhadap tingkah laku yang kelihatan kepada pengguna berbanding butiran pelaksanaan dalaman
- Buat asersi pada teks, role, label dan kawalan yang stabil
- Jangan jadikan ujian bergantung pada masa animasi kecuali pepijat memang berkaitan dengannya
- Elakkan asersi rapuh pada kelas Tailwind kecuali kelas itu sendiri ialah tingkah laku yang diuji
- Pastikan tingkah laku rangkaian deterministik dengan route mock panggilan `/api/*` yang berkaitan dalam ujian
- Gunakan interaksi pelayar sebenar untuk menaip, klik, fokus tab dan turutan permintaan

Untuk aliran beratur atau streaming, utamakan asersi ini:

- adakah mesej kelihatan dalam kawasan perbualan
- adakah ia masih hanya berada dalam kawasan beratur
- adakah ia hanya muncul selepas giliran sebelumnya selesai
- adakah susunan yang kelihatan sepadan dengan susunan giliran sebenar

## Strategi mock

Jangan arahkan e2e pelayar ke deployment OpenClaw sebenar secara lalai.

Turutan keutamaan:

1. route panggilan `/api/*` yang berkaitan dalam ujian Playwright
2. gunakan mod mock backend yang sedia ada dalam repositori
3. gunakan kebergantungan luaran sebenar hanya apabila tugasan secara jelas memerlukan pengesahan setara secara langsung

Contoh semasa dalam [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) mengikut corak ini:

- `/api/auth/state` sudah stubbed
- `/api/lalaclaw/update` sudah stubbed
- `/api/runtime` sudah stubbed
- `/api/chat` dikawal mengikut ujian supaya turutan beratur dan masa penyiapan kekal deterministik

## Garis panduan penulisan

Pastikan setiap e2e pelayar mempunyai skop yang sempit.

- Satu fail spec biasanya patut fokus pada satu kawasan produk
- Satu ujian biasanya patut mengesahkan satu aliran pengguna
- Lebih baik guna fail helper / fixture kecil daripada menyalin JSON besar ke setiap ujian
- Guna semula pembina snapshot apabila boleh supaya ujian pelayar sejajar dengan `App.test.jsx`

Contoh yang baik:

- "giliran beratur kekal di luar perbualan sehingga benar-benar bermula"
- "stop memulangkan butang hantar selepas membatalkan balasan yang sedang berjalan"
- "tab bootstrap Feishu diselesaikan kepada session user asli sebelum penghantaran pertama"

Contoh yang kurang berguna:

- "butang mempunyai set kelas utiliti ini dengan tepat"
- "tiga aliran yang tidak berkaitan dalam satu ujian"
- "menggunakan perkhidmatan jauh sebenar walaupun route mock sudah mencukupi"

## Cara menjalankan secara tempatan

Pasang pelayar Playwright sekali:

```bash
npm run test:e2e:install
```

Jalankan e2e pelayar:

```bash
npm run test:e2e
```

Jalankan dengan pelayar yang kelihatan:

```bash
npm run test:e2e:headed
```

Jalankan dengan UI Playwright:

```bash
npm run test:e2e:ui
```

## Jangkaan CI

CI kini mempunyai job e2e pelayar khusus dalam [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Job ini perlu kekal fokus dan stabil:

- pastikan suite pelayar cukup kecil untuk berjalan dengan andal pada setiap PR
- tambah regresi bernilai tinggi dahulu sebelum senario penerokaan yang lebih luas
- elakkan flaky wait atau sleep yang panjang

Jika ujian pelayar baharu terlalu perlahan atau terlalu sensitif kepada persekitaran untuk CI lalai, ia tidak patut masuk ke laluan `test:e2e` sehingga dipermudahkan atau distabilkan terlebih dahulu.

## Senarai semak review yang disyorkan

Sebelum menggabungkan perubahan e2e pelayar, semak:

- adakah perubahan ini benar-benar memerlukan e2e pelayar, atau liputan `App` / controller sudah memadai?
- adakah ujian mengesahkan tingkah laku yang kelihatan kepada pengguna dan bukannya butiran pelaksanaan?
- adakah keadaan rangkaian yang diperlukan dikawal secara deterministik?
- adakah ujian ini masih masuk akal enam bulan dari sekarang jika gaya UI berubah?
- adakah ujian ini gagal untuk regresi pengguna yang benar-benar kita mahu tangkap?

## Fail berkaitan

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
