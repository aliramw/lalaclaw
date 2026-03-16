[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Kembali ke utama](./documentation.md) | [Chat, lampiran dan arahan](./documentation-chat.md) | [Persistensi tempatan dan pemulihan](./documentation-persistence.md)

# Sesi, Ejen dan Mod Pelaksanaan

## Sesi

- Tab disusun mengikut agent
- Identiti sebenar sesi ialah agentId + sessionUser
- Menutup tab hanya menyembunyikan paparan, bukan memadamkan sesi

## Ejen dan model

- Agent datang daripada konfigurasi runtime yang dibenarkan
- Model dan mod pemikiran dibaca daripada pilihan yang dilaporkan backend
- Fast mode dan think mode disegerakkan mengikut sesi

## Mod pelaksanaan

- Aplikasi boleh berjalan dalam mod mock secara lalai
- Dengan gateway aktif, ia akan menggunakan endpoint OpenClaw sebenar
- Status runtime, auth dan queue dipaparkan pada header