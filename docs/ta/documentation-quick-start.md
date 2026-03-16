[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [இடைமுக அறிமுகம்](./documentation-interface.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md)

# விரைவு தொடக்கம்

## npm நிறுவல்

~~~bash
npm install -g lalaclaw
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

## முக்கிய குறிப்புகள்

- உள்ளூர் UI வளர்ச்சிக்கு npm run dev:all ஐ பயன்படுத்தவும்; npm start அல்ல
- doc, ppt, pptx preview க்கு LibreOffice தேவை
- COMMANDCENTER_FORCE_MOCK=1 மூலம் mock முறையை கட்டாயப்படுத்தலாம்