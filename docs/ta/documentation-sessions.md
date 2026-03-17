[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [அரட்டை, இணைப்புகள் மற்றும் கட்டளைகள்](./documentation-chat.md) | [உள்ளூர் நிலைபேர் மற்றும் மீட்பு](./documentation-persistence.md)

# அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்

## அமர்வுகள்

- தாவல்கள் ஏஜென்ட் அடிப்படையில் ஒழுங்குபடுத்தப்படுகின்றன
- உண்மையான அமர்வு அடையாளம் agentId + sessionUser ஆகும்
- தாவலை மூடுவது பார்வையை மட்டும் மறைக்கும்; அமர்வு அழிக்கப்படாது

## ஏஜென்ட்கள் மற்றும் மாதிரிகள்

- ஏஜென்ட்கள் அனுமதிக்கப்பட்ட runtime configuration-இலிருந்து வருகின்றன
- மாதிரிகளும் think mode-களும் backend அறிவிக்கும் options-இலிருந்து வாசிக்கப்படுகின்றன
- fast mode மற்றும் think mode ஒவ்வொரு அமர்வுடனும் sync ஆகின்றன

## இயக்க முறைகள்

- app இயல்பாக mock முறையில் இயங்க முடியும்
- gateway செயல்பாட்டில் இருந்தால் உண்மையான OpenClaw endpoint பயன்படுத்தப்படும்
- runtime, auth மற்றும் queue நிலைகள் தலைப்புப் பகுதியில் காணப்படும்