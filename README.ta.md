[இந்த README-ஐ வேறு மொழியில் படிக்க: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

ஏஜென்ட்களுடன் சேர்ந்து வேலை செய்து உருவாக்குவதற்கான இன்னும் நல்ல வழி.

ஆசிரியர்: Marila Wang

## முக்கிய அம்சங்கள்

- React + Vite அடிப்படையிலான command center இடைமுகம்: chat, timeline, inspector, theme, locale மற்றும் attachments
- VS Code போன்று session/workspace கோப்பு மரங்கள், preview actions மற்றும் media handling
- இடைமுகம் 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu மற்றும் தமிழ் மொழிகளில் கிடைக்கும்
- உள்ளூர் அல்லது தொலை OpenClaw gateway-களுடன் இணையக்கூடிய Node.js backend

## ஆவணங்கள்

- மொழி குறியீட்டு பக்கம்: [docs/README.md](./docs/README.md)
- தமிழ் ஆவணம்: [docs/ta/documentation.md](./docs/ta/documentation.md)
- விரைவு தொடக்கம்: [docs/ta/documentation-quick-start.md](./docs/ta/documentation-quick-start.md)
- இடைமுக அறிமுகம்: [docs/ta/documentation-interface.md](./docs/ta/documentation-interface.md)
- அமர்வுகள் மற்றும் runtime: [docs/ta/documentation-sessions.md](./docs/ta/documentation-sessions.md)

## விரைவு தொடக்கம்

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

பிறகு [http://127.0.0.1:3000](http://127.0.0.1:3000) ஐ திறக்கவும்.

குறிப்புகள்:

- macOS இல் `lalaclaw init` தானாகவே `launchd` பின்னணி சேவையையும் தொடங்கும்
- macOS source checkout இல், production சேவையை தொடங்க வேண்டுமெனில் `lalaclaw init` தேவையாயின் முதலில் `dist/` ஐ build செய்யும்
- configuration மட்டும் எழுத வேண்டுமெனில் `lalaclaw init --no-background` பயன்படுத்தவும்
- Linux இல், அல்லது background startup ஐ நிறுத்தினால், `lalaclaw doctor` மற்றும் `lalaclaw start` ஐ தொடரவும்
- doc, ppt, pptx preview க்கு LibreOffice தேவை
- macOS இல் lalaclaw doctor --fix அல்லது brew install --cask libreoffice இயக்கலாம்

உள்ளூர் வளர்ச்சிக்காக:

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

வளர்ச்சி முறையில் [http://127.0.0.1:5173](http://127.0.0.1:5173) ஐ பயன்படுத்தவும்.

macOS source checkout இலிருந்து production background service வேண்டும் என்றால் `npm run doctor` பிறகு `npm run lalaclaw:init` இயக்கவும்.

## OpenClaw மூலம் remote host இல் நிறுவுதல்

OpenClaw கட்டுப்படுத்தக்கூடிய ஒரு remote machine உங்களிடம் இருந்தும், அதே machine இல் SSH மூலம் உள்நுழையவும் முடிந்தால், இந்த project ஐ GitHub இலிருந்து OpenClaw மூலம் நிறுவச்செய்து, remote host இல் app ஐ தொடங்க வைத்து, பிறகு SSH port forwarding மூலம் உங்கள் local browser இல் dashboard ஐ பயன்படுத்தலாம்.

OpenClaw க்கு அனுப்பும் உதாரண கட்டளை:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

பொதுவான நடைமுறை:

1. OpenClaw remote machine இல் இந்த repository ஐ clone செய்யும்
2. OpenClaw dependencies ஐ நிறுவி LalaClaw ஐ தொடங்கும்
3. App remote machine இன் `127.0.0.1:3000` இல் listen செய்யும்
4. அந்த remote port ஐ SSH மூலம் உங்கள் local machine க்கு forward செய்வீர்கள்
5. பின்னர் forwarded local address ஐ browser இல் திறப்பீர்கள்

உதாரண SSH port forwarding:

~~~bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
~~~

பிறகு திறக்க:

~~~text
http://127.0.0.1:3000
~~~

குறிப்புகள்:

- இந்த அமைப்பில் உங்கள் local `127.0.0.1:3000` உண்மையில் remote machine இன் `127.0.0.1:3000` க்கு forward செய்யப்படுகிறது
- App process, OpenClaw configuration, transcript, logs, workspace ஆகிய அனைத்தும் remote machine இல்தான் இருக்கும்
- இந்த முறை dashboard ஐ நேரடியாக public internet இல் வெளியிடுவதைவிட பாதுகாப்பானது, இல்லையெனில் அந்த URL ஐ அறிந்த யாரும் password இல்லாமல் இந்த console ஐ பயன்படுத்த முடியும்
- உங்கள் local `3000` port ஏற்கனவே பயன்படுத்தப்பட்டால் `3300:127.0.0.1:3000` போன்ற வேறு local port ஐ பயன்படுத்தி `http://127.0.0.1:3300` ஐ திறக்கலாம்

## புதுப்பிப்பு

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

குறிப்பிட்ட பதிப்பை நிறுவ:

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## வளர்ச்சி குறிப்புகள்

- உள்ளூர் வளர்ச்சிக்கு npm run dev:all ஐ பயன்படுத்தவும்; npm start அல்ல
- dist build ஐச் சோதிக்க வேண்டுமெனில் மட்டும் npm run lalaclaw:start அல்லது npm start பயன்படுத்தவும்
- பயன்பாடு உள்ளூர் OpenClaw ஐ தானாகக் கண்டறியும்
- mock முறையை கட்டாயப்படுத்த COMMANDCENTER_FORCE_MOCK=1 பயன்படுத்தவும்

## பதிப்பமைப்பு

- பதிப்பு மாறும் ஒவ்வொரு முறையும் CHANGELOG.md ஐ புதுப்பிக்கவும்
- அதே நாளில் பல release இருந்தால் YYYY.M.D-N வடிவத்தை பயன்படுத்தவும்; உதாரணம் 2026.3.17-5
