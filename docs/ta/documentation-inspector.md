[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [இடைமுக அறிமுகம்](./documentation-interface.md) | [அரட்டை, இணைப்புகள் மற்றும் கட்டளைகள்](./documentation-chat.md) | [API மற்றும் சிக்கல் தீர்வு](./documentation-api-troubleshooting.md)

# ஆய்விப் பலகம், கோப்பு முன்னோட்டம் மற்றும் தடமறிதல்

வலப்புற inspector என்பது LalaClaw இன் முக்கியமான பகுதிகளில் ஒன்று. இது இப்போது session தகவலை `Files`, `Artifacts`, `Timeline`, `Environment` என்ற நான்கு tabs ஆக ஒழுங்குபடுத்துகிறது.

## Files

`Files` tab இரண்டு பகுதிகளாக பிரிகிறது:

- `Session Files`: தற்போதைய உரையாடலில் தொடப்பட்ட கோப்புகள், `Created`, `Modified`, `Viewed` என குழுவாக்கம்
- `Workspace Files`: தற்போதைய workspace root அடிப்படையிலான tree

முக்கிய நடத்தை:

- workspace tree ஒவ்வொரு directory level ஆக மட்டுமே ஏற்றப்படும்
- section collapse ஆனாலும் count badges தென்படும்
- காலியான `Session Files` பகுதிகள் மறைந்தே இருக்கும்
- filters plain text மற்றும் எளிய glob patterns ஐ ஆதரிக்கும்

செயல்பாடுகள்:

- கோப்பை சொடுக்கினால் preview திறக்கும்
- right click செய்து absolute path ஐ copy செய்யலாம்
- workspace folder இல் right click செய்து அந்த level மட்டும் refresh செய்யலாம்

## Artifacts

`Artifacts` தற்போதைய session இன் assistant reply summaries ஐ காட்டுகிறது.

- summary ஐ சொடுக்கினால் அதற்கான chat message க்கு திரும்பலாம்
- நீளமான conversation இல் முக்கியமான பதில்களை விரைவாகக் கண்டுபிடிக்கலாம்
- `View Context` மூலம் model க்கு அனுப்பப்படும் session context ஐப் பார்க்கலாம்

## Timeline

`Timeline` execution records ஐ run அடிப்படையில் குழுவாக்குகிறது:

- run title மற்றும் நேரம்
- prompt summary மற்றும் முடிவு
- tool input, output, status
- தொடர்புடைய file changes
- delegated work க்கான collaboration relationships

## Environment

`Environment` runtime விவரங்களைச் சேர்த்து காட்டுகிறது:

- மேல் பகுதியில் `OpenClaw diagnostics` சுருக்கம் இருக்கும்; அது `Overview`, `Connectivity`, `Doctor`, `Logs` என்று பிரிக்கப்படும்
- OpenClaw version, runtime profile, config path, workspace root, gateway status, health URL, log entry points
- runtime transport, runtime socket நிலை, reconnect attempts, fallback reason
- கீழே session context, realtime sync, gateway config, application, other என்ற technical groups

கவனிக்க வேண்டியவை:

- மேல் diagnostics summary இல் ஏற்கனவே காட்டப்படும் fields கீழே duplicate ஆக மீண்டும் காட்டப்படாது
- JSON session key போன்ற நீளமான values container உட்பகுதிக்குள் wrap ஆகும்; right side ஐ தாண்டாது
- logs அல்லது config files போன்ற verify செய்யப்பட்ட absolute paths ஐ click செய்தால் shared file preview திறக்கும்
- log directory அல்லது தற்போதைய session Agent workspace directory போன்ற folder paths inline preview திறக்காது; அவை system file manager-இல் நேரடியாக திறக்கும்
- Environment பகுதி இப்போது OpenClaw diagnostics, management actions, config tools, மற்றும் runtime details அனைத்தையும் ஒரே view-இல் சேர்க்கிறது
