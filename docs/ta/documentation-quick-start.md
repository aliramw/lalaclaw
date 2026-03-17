[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [இடைமுக அறிமுகம்](./documentation-interface.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md)

# விரைவு தொடக்கம்

## npm நிறுவல்

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

பிறகு [http://127.0.0.1:3000](http://127.0.0.1:3000) ஐ திறக்கவும்.

## வளர்ச்சி முறை

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

பிறகு [http://127.0.0.1:5173](http://127.0.0.1:5173) ஐ திறக்கவும்.

## OpenClaw மூலம் remote host இல் நிறுவுதல்

OpenClaw கட்டுப்படுத்தக்கூடிய ஒரு remote machine உங்களிடம் இருந்தும், அதே machine இல் SSH மூலம் உள்நுழையவும் முடிந்தால், OpenClaw ஐ பயன்படுத்தி LalaClaw ஐ remote ஆக நிறுவி தொடங்கவிட்டு, பின்னர் SSH port forwarding மூலம் local ஆக அணுகலாம்.

OpenClaw க்கு அனுப்பும் உதாரண கட்டளை:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

பொதுவான நடைமுறை:

1. OpenClaw repository ஐ remote machine இல் clone செய்யும்
2. OpenClaw dependencies ஐ நிறுவி application ஐ தொடங்கும்
3. LalaClaw remote machine இன் `127.0.0.1:3000` இல் listen செய்யும்
4. அந்த remote port ஐ SSH மூலம் local machine க்கு forward செய்வீர்கள்
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

- இந்த முறையில் உங்கள் local `127.0.0.1:3000` உண்மையில் remote machine இன் `127.0.0.1:3000` க்கு map செய்யப்படுகிறது
- Application process, OpenClaw configuration, transcript, logs, workspace ஆகிய அனைத்தும் remote machine இல்தான் இருக்கும்
- இந்த முறை dashboard ஐ நேரடியாக public internet இல் வெளியிடுவதைவிட பாதுகாப்பானது, இல்லையெனில் அந்த URL ஐ அறிந்த யாரும் password இல்லாமல் இந்த console ஐ பயன்படுத்த முடியும்
- local `3000` port ஏற்கனவே பயன்படுத்தப்பட்டால் `3300:127.0.0.1:3000` போன்ற வேறு local port ஐ பயன்படுத்தி `http://127.0.0.1:3300` ஐ திறக்கலாம்

## முக்கிய குறிப்புகள்

- உள்ளூர் UI வளர்ச்சிக்கு npm run dev:all ஐ பயன்படுத்தவும்; npm start அல்ல
- doc, ppt, pptx preview க்கு LibreOffice தேவை
- COMMANDCENTER_FORCE_MOCK=1 மூலம் mock முறையை கட்டாயப்படுத்தலாம்
