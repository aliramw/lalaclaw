[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Kembali ke utama](./documentation.md) | [Mula cepat](./documentation-quick-start.md) | [Sembang, lampiran dan arahan](./documentation-chat.md) | [Pintasan papan kekunci](./documentation-shortcuts.md) | [Persistensi tempatan dan pemulihan](./documentation-persistence.md)

# Sesi, Ejen dan Mod Pelaksanaan

## Cara sesi dikenal pasti

Frontend dan backend menyusun sesi berdasarkan dua nilai teras:

- `agentId`
- `sessionUser`

Dalam amalan:

- `agentId` menjawab ejen mana yang sedang anda gunakan
- `sessionUser` menjawab baris perbualan mana yang memiliki konteks semasa

Ejen yang sama boleh mempunyai beberapa `sessionUser`, jadi konteks baharu boleh dibuka tanpa menukar ejen.

## Tab ejen dan IM

Tab sembang disusun mengikut identiti sesi sebenar, bukan sekadar label yang dipaparkan.

- Tab utama lalai ialah `agent:main`
- Tab ejen tambahan biasanya menggunakan `agentId` yang sama tetapi mempunyai `sessionUser` sendiri
- Perbualan IM juga boleh dibuka terus daripada switcher, contohnya thread DingTalk, Feishu, atau WeCom
- Setiap tab yang dibuka menyimpan mesej, draf, kedudukan skrol, dan sebahagian metadata sesi sendiri
- Menutup tab hanya menyembunyikannya daripada UI, bukan memadam sejarah asas

Ini bermaksud:

- Dua tab boleh menunjuk kepada ejen yang sama tetapi dengan `sessionUser` berbeza
- Tab IM juga akhirnya dipetakan sebagai `agentId + sessionUser`
- Tab ejen yang sudah terbuka dan saluran IM yang sudah terbuka dikecualikan daripada switcher

## Tetapan per sesi

Keutamaan ini disimpan pada backend mengikut sesi:

- Ejen
- Model
- Fast mode
- Think mode

## Memulakan sesi baharu

Cara utama untuk mengosongkan konteks ialah:

- Klik tindakan sesi baharu pada pengepala sembang
- Guna `Cmd/Ctrl + N`
- Hantar `/new` atau `/reset`

## Mod `mock`

App masuk ke mod `mock` apabila tiada OpenClaw gateway tempatan dikesan atau apabila `COMMANDCENTER_FORCE_MOCK=1` ditetapkan.

## Mod `openclaw`

App masuk ke mod `openclaw` apabila `~/.openclaw/openclaw.json` dikesan atau apabila `OPENCLAW_BASE_URL` dan pembolehubah berkaitan dikonfigurasikan.
