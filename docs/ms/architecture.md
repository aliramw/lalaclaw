[English](../en/architecture.md) | [中文](../zh/architecture.md) | [繁體中文（香港）](../zh-hk/architecture.md) | [日本語](../ja/architecture.md) | [한국어](../ko/architecture.md) | [Français](../fr/architecture.md) | [Español](../es/architecture.md) | [Português](../pt/architecture.md) | [Deutsch](../de/architecture.md) | [Bahasa Melayu](../ms/architecture.md) | [தமிழ்](../ta/architecture.md)

# Ringkasan Seni Bina

> Navigation: [Halaman utama dokumentasi](./documentation.md) | [Mula cepat](./documentation-quick-start.md) | [Gambaran antara muka](./documentation-interface.md) | [Showcase produk](./showcase.md) | [Pelan hala tuju refaktor](./refactor-roadmap.md)

LalaClaw dibahagikan kepada titik masuk UI yang ringan, titik masuk server yang ringan dan modul pertengahan yang mudah diuji.

- src menempatkan UI React dan controller ciri
- server menempatkan route, service dan integrasi runtime
- docs menyelaraskan dokumentasi pelbagai bahasa dengan tingkah laku sebenar aplikasi