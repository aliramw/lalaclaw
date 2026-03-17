[இந்த README-ஐ வேறு மொழியில் படிக்க: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

ஏஜென்ட்களுடன் சேர்ந்து வேலை செய்து உருவாக்குவதற்கான இன்னும் நல்ல வழி.

ஆசிரியர்: Marila Wang

## முக்கிய அம்சங்கள்

- React + Vite அடிப்படையிலான command center இடைமுகம்: chat, timeline, inspector, theme, locale மற்றும் attachments
- VS Code பாணியில் session tree, workspace tree மற்றும் preview actions உடன் file exploration
- இடைமுகம் 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu மற்றும் தமிழ் மொழிகளில் கிடைக்கும்
- உள்ளூர் அல்லது தொலை OpenClaw gateway-களுடன் இணையக்கூடிய Node.js backend
- tests, CI, lint, contribution guide மற்றும் release notes ஏற்கனவே சேர்க்கப்பட்டுள்ளன

## தயாரிப்பு வழிகாட்டி

- மேல் பட்டையில் agent, model, fast mode, think mode, context, queue, theme மற்றும் locale கட்டுப்பாடுகள்
- முக்கிய chat பகுதி prompt, attachment, streaming reply மற்றும் session reset க்காக
- Inspector பகுதியில் timeline, files, artifacts, snapshots மற்றும் runtime activity
- Runtime இயல்பாக `mock` mode-இல் வேலை செய்யும்; தேவையானால் உண்மையான OpenClaw gateway-க்கு மாறலாம்

விரிவான அறிமுகம் [ta/showcase.md](./ta/showcase.md) இல் உள்ளது.

## ஆவணங்கள்

- மொழி குறியீட்டு பக்கம்: [README.md](./README.md)
- தமிழ் வழிகாட்டி: [ta/documentation.md](./ta/documentation.md)
- விரைவு தொடக்கம்: [ta/documentation-quick-start.md](./ta/documentation-quick-start.md)
- இடைமுக வழிகாட்டி: [ta/documentation-interface.md](./ta/documentation-interface.md)
- அமர்வுகள் மற்றும் runtime: [ta/documentation-sessions.md](./ta/documentation-sessions.md)
- கட்டமைப்பு: [ta/architecture.md](./ta/architecture.md)

கூடுதல் அமைப்பு குறிப்புகள் [server/README.md](../server/README.md) மற்றும் [src/features/README.md](../src/features/README.md) இல் உள்ளன.

## நிறுவல் வழிகாட்டி

### npm மூலம் நிறுவல்

எளிய பயனர் நிறுவல் இதுதான்:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

பிறகு [http://127.0.0.1:5678](http://127.0.0.1:5678) ஐ திறக்கவும்.

குறிப்புகள்:

- `lalaclaw init` macOS மற்றும் Linux இல் உள்ளூர் configuration-ஐ `~/.config/lalaclaw/.env.local` இல் எழுதும்
- இயல்பாக `lalaclaw init` `HOST=127.0.0.1`, `PORT=5678`, `FRONTEND_PORT=4321` ஐ பயன்படுத்தும்
- source checkout-இல் `lalaclaw init` Server மற்றும் Vite Dev Server ஐ background-இல் தொடங்கி, பின்னர் Dev Server URL ஐத் திறக்க அறிவுறுத்தும்
- macOS npm install சூழலில் `lalaclaw init` Server `launchd` service-ஐ நிறுவி தொடங்கி, பின்னர் Server URL ஐத் திறக்க அறிவுறுத்தும்
- Linux npm install சூழலில் `lalaclaw init` Server ஐ background-இல் தொடங்கி, பின்னர் Server URL ஐத் திறக்க அறிவுறுத்தும்
- configuration மட்டும் எழுத வேண்டும் என்றால் `lalaclaw init --no-background` பயன்படுத்தவும்
- `--no-background` க்கு பிறகு `lalaclaw doctor` இயக்கி, source checkout என்றால் `lalaclaw dev`, package install என்றால் `lalaclaw start` பயன்படுத்தவும்
- `lalaclaw status`, `lalaclaw restart`, `lalaclaw stop` ஆகியவை macOS `launchd` Server service-ஐ மட்டுமே கட்டுப்படுத்தும்
- `doc`, `ppt`, `pptx` preview க்கு LibreOffice தேவை. macOS இல் `lalaclaw doctor --fix` அல்லது `brew install --cask libreoffice` பயன்படுத்தலாம்

### OpenClaw மூலம் நிறுவல்

OpenClaw ஐ பயன்படுத்தி LalaClaw ஐ ஒரு தொலை Mac அல்லது Linux இயந்திரத்தில் நிறுவி, பின்னர் SSH port forwarding மூலம் உள்ளூரில் அணுகலாம்.

உங்களிடம் OpenClaw நிறுவப்பட்ட ஒரு இயந்திரம் ஏற்கனவே இருந்து, அதில் SSH மூலம் உள்நுழைய முடிந்தால், OpenClaw க்கு GitHub இலிருந்து இந்த project ஐ நிறுவ, தொலை host இல் அதை தொடங்க, அதன் port ஐ உங்கள் உள்ளூர் கணினிக்கு forward செய்யச் சொல்லலாம்.

OpenClaw க்கு இப்படி சொல்லலாம்:

```text
Install https://github.com/aliramw/lalaclaw
```

வழக்கமான ஓட்டம்:

1. OpenClaw தொலை இயந்திரத்தில் இந்த repository ஐ clone செய்கிறது.
2. OpenClaw dependencies ஐ நிறுவி LalaClaw ஐ தொடங்குகிறது.
3. app தொலை இயந்திரத்தின் `127.0.0.1:5678` இல் கேட்கிறது.
4. அந்த தொலை port ஐ SSH மூலம் உங்கள் உள்ளூர் கணினிக்கு forward செய்கிறீர்கள்.
5. browser இல் அந்த forwarded local address ஐ திறக்கிறீர்கள்.

SSH port forwarding உதாரணம்:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

பிறகு இந்த local address ஐ திறக்கவும்:

```text
http://127.0.0.1:3000
```

### GitHub மூலம் நிறுவல்

development அல்லது உள்ளூர் மாற்றங்களுக்கு source checkout வேண்டும் என்றால்:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

பிறகு [http://127.0.0.1:4321](http://127.0.0.1:4321) ஐ திறக்கவும்.

குறிப்புகள்:

- `npm run lalaclaw:init` இப்போது இயல்பாக Server மற்றும் Vite Dev Server ஐ background-இல் தொடங்கும்; வேண்டாம் என்றால் `--no-background` கொடுக்கலாம்
- startup முடிந்ததும், command Dev Server URL ஐத் திறக்க அறிவுறுத்தும்; இயல்பான URL `http://127.0.0.1:4321`
- configuration மட்டும் உருவாக்க வேண்டும் என்றால் `npm run lalaclaw:init -- --no-background` பயன்படுத்தவும்
- `npm run lalaclaw:start` தற்போதைய terminal-இல் இயங்கும்; terminal மூடினால் அது நின்றுவிடும்
- பின்னர் live development environment வேண்டுமெனில் `npm run dev:all` இயக்கி `http://127.0.0.1:4321` அல்லது உங்கள் `FRONTEND_PORT` ஐத் திறக்கவும்

### LalaClaw ஐ புதுப்பித்தல்

npm install-ஐ சமீபத்திய பதிப்புக்கு புதுப்பிக்க:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

குறிப்பிட்ட பதிப்பை, உதாரணமாக `2026.3.17-9`, நிறுவ:

```bash
npm install -g lalaclaw@2026.3.17-9
lalaclaw init
```

GitHub install-ஐ சமீபத்திய பதிப்புக்கு புதுப்பிக்க:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

குறிப்பிட்ட பதிப்பை, உதாரணமாக `2026.3.17-9`, பயன்படுத்த:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-9
npm ci
npm run build
npm run lalaclaw:start
```

## பொதுவான கட்டளைகள்

- `npm run dev:all` வழக்கமான local development flow ஐ தொடங்கும்
- `npm run doctor` Node.js, OpenClaw detection, ports மற்றும் local configuration ஐச் சரிபார்க்கும்
- `npm run lalaclaw:init` local bootstrap configuration ஐ எழுதும் அல்லது refresh செய்யும்
- `npm run lalaclaw:start` `dist/` ஐச் சரிபார்த்த பின் built app ஐ தொடங்கும்
- `npm run build` production bundle ஐ உருவாக்கும்
- `npm test` Vitest ஐ ஒருமுறை இயக்கும்
- `npm run lint` ESLint ஐ இயக்கும்

முழு command பட்டியல் மற்றும் contribution flow க்கு [CONTRIBUTING.md](../CONTRIBUTING.md) பார்க்கவும்.

## பங்களிப்பு

பங்களிப்புகள் வரவேற்கப்படுகின்றன. பெரிய feature, architecture change அல்லது user-visible behavior change இருந்தால் முதலில் issue திறக்கவும்.

PR திறக்கும் முன்:

- மாற்றங்களை கவனம் செலுத்தப்பட்டதாக வைத்துக் கொள்ளவும்; தொடர்பில்லாத refactor தவிர்க்கவும்
- behavior change க்கு tests சேர்க்கவும் அல்லது புதுப்பிக்கவும்
- user-facing copy அனைத்தும் `src/locales/*.js` வழியாக செல்ல வேண்டும்
- user-visible behavior மாறினால் documentation-யும் புதுப்பிக்கவும்
- versioned change இருந்தால் [CHANGELOG.md](../CHANGELOG.md) புதுப்பிக்கவும்

முழு checklist [CONTRIBUTING.md](../CONTRIBUTING.md) இல் உள்ளது.

## வளர்ச்சி குறிப்புகள்

- வழக்கமான local development க்கு `npm run dev:all` பயன்படுத்தவும்
- development நேரத்தில் இயல்பான frontend URL [http://127.0.0.1:4321](http://127.0.0.1:4321), அல்லது நீங்கள் அமைக்கும் `FRONTEND_PORT`
- `npm run lalaclaw:start` மற்றும் `npm start` ஆகியவை `dist/` அடிப்படையிலான சரிபார்ப்புக்கு மட்டும்
- app உள்ளூர் OpenClaw gateway ஐ தானாகக் கண்டறியும்
- `mock` mode-ஐ கட்டாயப்படுத்த `COMMANDCENTER_FORCE_MOCK=1` பயன்படுத்தவும்
- PR க்கு முன் `npm run lint`, `npm test`, `npm run build` இயக்குவது பரிந்துரைக்கப்படுகிறது

## பதிப்பமைப்பு

LalaClaw npm-க்கு ஏற்ற calendar versioning ஐ பயன்படுத்துகிறது.

- version மாறும் ஒவ்வொரு முறையும் [CHANGELOG.md](../CHANGELOG.md) புதுப்பிக்கவும்
- அதே நாளில் பல release இருந்தால் `YYYY.M.D-N` வடிவம் பயன்படுத்தவும், உதாரணம் `2026.3.17-9`
- breaking changes இருந்தால் release notes மற்றும் migration documents இல் தெளிவாக குறிப்பிடவும்
- Node.js இலக்கு பதிப்பு [`.nvmrc`](../.nvmrc) இல் உள்ள `22`

## OpenClaw இணைப்பு

`~/.openclaw/openclaw.json` இருந்தால், LalaClaw உள்ளூர் OpenClaw gateway ஐ தானாகக் கண்டறிந்து அதன் loopback endpoint மற்றும் token ஐ மீண்டும் பயன்படுத்தும்.

புதிய source checkout க்கு வழக்கமான setup இதுதான்:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

வேறு OpenClaw-compatible gateway ஒன்றை பயன்படுத்த வேண்டுமெனில்:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

உங்கள் gateway OpenAI Responses API போல இருந்தால்:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

இந்த variables இல்லாமல் இருந்தால், app `mock` mode-இல் இயங்கும்; அதனால் bootstrap நேரத்திலும் UI மற்றும் chat loop பயன்படுத்த முடியும்.
