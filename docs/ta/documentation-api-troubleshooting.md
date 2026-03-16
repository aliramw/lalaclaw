[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md) | [உள்ளூர் நிலைபேர் மற்றும் மீட்பு](./documentation-persistence.md)

# API மற்றும் சிக்கல் தீர்வு

## வளர்ச்சி அமைப்பு

- Frontend: npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
- Backend: PORT=3000 HOST=127.0.0.1 node server.js
- Vite, /api/* ஐ http://127.0.0.1:3000 க்கு proxy செய்கிறது

## பொதுவான சோதனைகள்

- OpenClaw அல்லது mock mode எதிர்பார்த்தபடி இயங்குகிறதா என பார்க்கவும்
- Environment tab-ல் gateway, auth, runtime தகவல்களைச் சரிபார்க்கவும்
- ports, config மற்றும் dependencies க்கு npm run doctor பயன்படுத்தவும்
- Office preview பிரச்சினைகளுக்கு LibreOffice நிறுவவும்