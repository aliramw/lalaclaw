[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [இடைமுக அறிமுகம்](./documentation-interface.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md) | [API மற்றும் சிக்கல் தீர்வு](./documentation-api-troubleshooting.md)

# விரைவு தொடக்கம்

## தேவைகள்

- மேம்பாட்டு சூழலில் [`.nvmrc`](../../.nvmrc) இல் உள்ள Node.js பதிப்பைப் பயன்படுத்தவும், தற்போது `22`. வெளியிடப்பட்ட npm package `^20.19.0 || ^22.12.0 || >=24.0.0` ஐ ஆதரிக்கிறது
- பொதுவான உள்ளூர் பயன்பாட்டுக்கு npm நிறுவல் பரிந்துரைக்கப்படுகிறது
- development mode அல்லது உள்ளூர் code மாற்றங்களுக்கு மட்டுமே GitHub source checkout பயன்படுத்தவும்

## OpenClaw மூலம் நிறுவல்

OpenClaw ஐ பயன்படுத்தி LalaClaw ஐ ஒரு தொலை Mac அல்லது Linux இயந்திரத்தில் நிறுவி, பின்னர் SSH port forwarding மூலம் உள்ளூரில் அணுகலாம்.

```text
Install https://github.com/aliramw/lalaclaw
```

உதாரணம்:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

பிறகு திறக்கவும்:

```text
http://127.0.0.1:3000
```

## npm மூலம் நிறுவல்

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

பிறகு [http://127.0.0.1:5678](http://127.0.0.1:5678) ஐ திறக்கவும்.

குறிப்புகள்:

- `lalaclaw init` உள்ளூர் configuration-ஐ `~/.config/lalaclaw/.env.local` இல் எழுதும்
- இயல்பான values `HOST=127.0.0.1`, `PORT=5678`, `FRONTEND_PORT=4321`
- source checkout-இல் `lalaclaw init` Server மற்றும் Vite Dev Server ஐ background-இல் தொடங்கும்
- macOS npm install சூழலில் `lalaclaw init` Server `launchd` service-ஐ நிறுவி தொடங்கும்
- Linux npm install சூழலில் `lalaclaw init` Server ஐ background-இல் தொடங்கும்

## GitHub மூலம் நிறுவல்

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

பிறகு [http://127.0.0.1:4321](http://127.0.0.1:4321) ஐ திறக்கவும்.

## வளர்ச்சி முறை

repository development க்கு இந்த fixed ports பயன்படுத்தவும்:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

அல்லது:

```bash
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Browser entrypoint: `http://127.0.0.1:5173`

## Browser Access Tokens

Browserல் token unlock screen தெரிந்தால், tokenஐ கண்டுபிடிக்க அல்லது புதிதாக மாற்ற இதைப் பயன்படுத்தலாம்:

- `lalaclaw access token` மூலம் தற்போதைய token பார்க்கலாம்
- `lalaclaw access token --rotate` மூலம் புதிய token உருவாக்கி சேமிக்கலாம்
- `~/.config/lalaclaw/.env.local` உள்ள `COMMANDCENTER_ACCESS_TOKENS` அல்லது `COMMANDCENTER_ACCESS_TOKENS_FILE` ஐ பார்க்கலாம்
- இந்த instanceஐ நீங்கள் deploy செய்யவில்லை என்றால், deploy செய்தவரிடம் token கேளுங்கள்
