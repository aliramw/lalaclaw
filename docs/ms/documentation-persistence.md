[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[Kembali ke utama](./documentation.md) | [Sesi, ejen dan mod pelaksanaan](./documentation-sessions.md) | [API dan penyelesaian masalah](./documentation-api-troubleshooting.md)

# Persistensi Tempatan dan Pemulihan

LalaClaw menyimpan sebahagian keadaan UI secara tempatan supaya antara muka boleh dipulihkan dengan cepat selepas dimuat semula.

- Tab yang sedang dibuka dan sesi aktif
- Lebar inspector
- Saiz fon chat
- Bahasa dan tema yang dipilih

Semasa pemulihan, aplikasi cuba menyegerakkan semula runtime dan keadaan yang disimpan tanpa menggugurkan perbualan secara senyap.