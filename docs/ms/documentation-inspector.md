[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Kembali ke utama](./documentation.md) | [Gambaran antara muka](./documentation-interface.md) | [Sembang, lampiran dan arahan](./documentation-chat.md) | [API dan penyelesaian masalah](./documentation-api-troubleshooting.md)

# Pemeriksa, Pratonton Fail dan Penjejakan

Pemeriksa di sebelah kanan ialah salah satu permukaan teras LalaClaw. Kini ia menyusun maklumat sesi kepada empat tab: `Files`, `Artifacts`, `Timeline`, dan `Environment`.

## Files

Tab `Files` mempunyai dua permukaan:

- `Session Files`: fail yang disentuh dalam perbualan semasa, masih dikelompokkan sebagai `Created`, `Modified`, dan `Viewed`
- `Workspace Files`: pokok fail berakar pada workspace semasa

Tingkah laku penting:

- Pokok workspace memuat satu aras direktori pada satu masa
- Lencana kiraan kekal dipaparkan walaupun seksyen dilipat
- Seksion `Session Files` yang kosong kekal tersembunyi
- Penapis menyokong padanan teks biasa dan corak glob ringkas

Interaksi:

- Klik fail untuk membuka pratonton
- Klik kanan fail untuk menyalin laluan mutlak
- Klik kanan folder workspace untuk menyegar semula aras itu sahaja

## Artifacts

`Artifacts` menyenaraikan ringkasan balasan pembantu bagi sesi semasa.

- Klik ringkasan untuk lompat semula ke mesej sembang yang sepadan
- Ia memudahkan navigasi perbualan panjang
- `View Context` menunjukkan konteks sesi semasa yang dihantar kepada model

## Timeline

`Timeline` mengumpulkan rekod mengikut run:

- Tajuk dan masa run
- Ringkasan prompt dan keputusan
- Input, output, dan status alat
- Perubahan fail berkaitan
- Hubungan kerjasama untuk kerja yang dihantar

## Environment

`Environment` menghimpunkan butiran runtime seperti:

- Ringkasan `diagnostik OpenClaw` di bahagian atas, dikelompokkan kepada `Overview`, `Connectivity`, `Doctor`, dan `Logs`
- Versi OpenClaw, profil runtime, laluan config, akar workspace, status gateway, URL health, dan pintu masuk log
- Pengangkutan runtime, status socket runtime, percubaan sambung semula, dan sebab fallback
- Kumpulan teknikal bawah untuk konteks sesi, penyegerakan masa nyata, konfigurasi gateway, aplikasi, dan medan lain

Tingkah laku penting:

- Medan yang sudah dipromosikan ke ringkasan atas akan dibuang daripada kumpulan teknikal bawah untuk mengelakkan pendua
- Nilai panjang seperti kunci sesi JSON akan dibungkus dalam bekas dan tidak melimpah secara mendatar
- Laluan mutlak yang telah disahkan, seperti log atau fail konfigurasi, boleh dibuka dalam pratonton fail bersama dengan satu klik
- Laluan direktori seperti direktori log atau direktori ruang kerja Agent sesi semasa tidak membuka pratonton sebaris, sebaliknya terus membuka pengurus fail sistem
- Permukaan Environment kini menggabungkan diagnostik OpenClaw, tindakan pengurusan, alat konfigurasi dan butiran runtime dalam satu tempat
