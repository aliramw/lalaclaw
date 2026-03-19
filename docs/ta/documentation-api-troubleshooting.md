[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [விரைவு தொடக்கம்](./documentation-quick-start.md) | [ஆய்விப் பலகம், கோப்பு முன்னோட்டம் மற்றும் தடமறிதல்](./documentation-inspector.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md)

# API மற்றும் சிக்கல் தீர்வு

## API அறிமுகம்

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## பொதுவான சிக்கல்கள்

### பக்கம் ஏறவில்லை; backend `dist` இல்லை என்று சொல்கிறது

- production mode க்கு முதலில் `npm run build`, பிறகு `npm start`
- development க்கு [விரைவு தொடக்கம்](./documentation-quick-start.md) படி Vite மற்றும் Node இரண்டையும் ஒன்றாக இயக்கவும்

### நிறுவிய app வெள்ளை திரையாகத் திறக்கிறது; console இல் `mermaid-vendor` தெரிகிறது

பொதுவான அறிகுறிகள்:

- app bundle load ஆகிறது, ஆனால் திரை வெறுமையாக உள்ளது
- browser console இல் `mermaid-vendor-*.js` error காணப்படும்

அதிக சாத்தியமான காரணம்:

- நீங்கள் இன்னும் பழைய packaged build `2026.3.19-1` ஐப் பயன்படுத்துகிறீர்கள்
- அந்த build Mermaid க்கான manual vendor split ஐ பயன்படுத்தியது; install ஆன பிறகு production startup உடைய வாய்ப்பு இருந்தது

சரிசெய்தல்:

- `lalaclaw@2026.3.19-2` அல்லது அதற்கு மேற்பட்ட பதிப்பிற்கு மேம்படுத்தவும்
- source checkout இலிருந்து இயக்கினால் புதிய `main` ஐ pull செய்து `npm run build` மீண்டும் இயக்கவும்

### Development இல் பக்கம் திறக்கிறது, ஆனால் API calls தோல்வியடைகின்றன

முதலில் சரிபார்க்கவும்:

- frontend `127.0.0.1:5173` இல் இயங்குகிறதா
- backend `127.0.0.1:3000` இல் இயங்குகிறதா
- production server entry அல்ல, Vite entry ஐ பயன்படுத்துகிறீர்களா

### OpenClaw நிறுவப்பட்டிருந்தும் app இன்னும் `mock` இல் உள்ளது

சரிபார்க்கவும்:

- `~/.openclaw/openclaw.json` உள்ளது தானா
- `COMMANDCENTER_FORCE_MOCK=1` அமைக்கப்பட்டுள்ளதா
- `OPENCLAW_BASE_URL` மற்றும் `OPENCLAW_API_KEY` காலியாகவோ தவறாகவோ உள்ளனவா

### Model அல்லது agent மாற்றங்கள் அமலாகவில்லை போல தெரிகிறது

சாத்தியமான காரணங்கள்:

- நீங்கள் இன்னும் `mock` mode இல் இருக்கிறீர்கள்; local preferences மட்டும் மாறுகிறது
- `openclaw` mode இல் remote session patch தோல்வியடைந்தது
- தேர்ந்தெடுத்த model ஏற்கனவே அந்த agent இன் default model ஆக இருக்கலாம்

சரிபார்க்க வேண்டிய இடங்கள்:

- [ஆய்விப் பலகம், கோப்பு முன்னோட்டம் மற்றும் தடமறிதல்](./documentation-inspector.md) இல் உள்ள `Environment`
- backend console output

இந்த சிக்கல் tab மாற்றத்தின் போது மட்டும் வந்தால்:

- switcher target session ஐ முழுமையாகத் திறந்த பிறகே அடுத்த turn அனுப்பப்பட்டதா என உறுதி செய்யவும்
- `Environment` இல் `runtime.transport`, `runtime.socket`, `runtime.fallbackReason` பார்க்கவும்
