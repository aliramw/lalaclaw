[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [அமர்வுகள், ஏஜென்ட்கள் மற்றும் இயக்க முறைகள்](./documentation-sessions.md) | [API மற்றும் சிக்கல் தீர்வு](./documentation-api-troubleshooting.md)

# உள்ளூர் நிலைபேர் மற்றும் மீட்பு

Reload பிறகு இடைமுகத்தை விரைவாக மீட்டமைக்க LalaClaw சில UI நிலைகளை உள்ளூரில் சேமிக்கிறது.

- திறந்த tabs மற்றும் செயலில் உள்ள session
- inspector அகலம்
- chat font size
- தேர்ந்தெடுத்த language மற்றும் theme

மீட்டமைக்கும் போது, runtime data மற்றும் saved state மீண்டும் sync செய்ய முயல்கிறது; உரையாடலை அமைதியாக கைவிடாது.