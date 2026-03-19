[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [விரைவு தொடக்கம்](./documentation-quick-start.md) | [அரட்டை, இணைப்புகள் மற்றும் கட்டளைகள்](./documentation-chat.md) | [விசைப்பலகை குறுக்கு வழிகள்](./documentation-shortcuts.md) | [உள்ளூர் நிலைபேர் மற்றும் மீட்பு](./documentation-persistence.md)

# அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்

## ஒரு அமர்வு எப்படி அடையாளம் காணப்படுகிறது

Frontend மற்றும் backend இரண்டும் இரண்டு முக்கிய மதிப்புகளை அடிப்படையாகக் கொண்டு session state ஐ அமைக்கின்றன:

- `agentId`
- `sessionUser`

அதாவது:

- `agentId` நீங்கள் எந்த agent உடன் இணைந்து பணிபுரிகிறீர்கள் என்பதைச் சொல்கிறது
- `sessionUser` தற்போதைய context எந்த conversation line உடையது என்பதைச் சொல்கிறது

அதே agent க்கு பல `sessionUser` மதிப்புகள் இருக்கலாம். அதனால் agent மாற்றாமல் புதிய context தொடங்க முடியும்.

## Agent மற்றும் IM tabs

Chat tabs கள் திரையில் தோன்றும் பெயரால் மட்டும் அல்ல, உண்மையான session identity அடிப்படையிலும் அமைக்கப்படுகின்றன.

- இயல்புநிலை main tab என்பது `agent:main`
- கூடுதல் agent tabs கள் அதே `agentId` ஐப் பயன்படுத்தினாலும் தனிப்பட்ட `sessionUser` பெறும்
- DingTalk, Feishu, WeCom போன்ற IM conversations களையும் switcher மூலம் நேரடியாகத் திறக்கலாம்
- ஒவ்வொரு திறந்த tab இலும் தனித்த messages, drafts, scroll position, மற்றும் சில session metadata கள் இருக்கும்
- tab ஐ மூடுவது UI இலிருந்து மட்டும் மறைக்கும்; underlying history நீக்கப்படாது

இதன் பொருள்:

- இரண்டு tabs அதே agent ஐக் காட்டியபோதும் வேறு `sessionUser` ஐக் கொண்டிருக்கலாம்
- IM tabs களும் உள்ளார்ந்த முறையில் `agentId + sessionUser` ஆகவே தீர்மானிக்கப்படும்
- ஏற்கனவே திறந்த agent tabs மற்றும் IM channels switcher இல் மறைக்கப்படும்

## Session-level settings

இந்த preferences backend இல் ஒவ்வொரு session க்கும் சேமிக்கப்படுகின்றன:

- Agent
- Model
- Fast mode
- Think mode

## புதிய session தொடங்குதல்

Context ஐ clear செய்ய முக்கிய வழிகள்:

- Chat header இல் உள்ள new-session action ஐ சொடுக்குதல்
- `Cmd/Ctrl + N`
- `/new` அல்லது `/reset` அனுப்புதல்

## `mock` mode

Local OpenClaw gateway கண்டறியப்படாவிட்டால் அல்லது `COMMANDCENTER_FORCE_MOCK=1` அமைக்கப்பட்டிருந்தால் app `mock` mode க்கு செல்லும்.

## `openclaw` mode

`~/.openclaw/openclaw.json` கண்டறியப்பட்டாலோ அல்லது `OPENCLAW_BASE_URL` மற்றும் தொடர்புடைய environment variables அமைக்கப்பட்டாலோ app `openclaw` mode க்கு செல்லும்.
