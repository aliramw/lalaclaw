[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[முகப்பிற்கு திரும்பு](./documentation.md) | [விரைவு தொடக்கம்](./documentation-quick-start.md) | [மறைச்சிறப்பு](./documentation-easter-egg.md) | [அரட்டை, இணைப்புகள் மற்றும் கட்டளைகள்](./documentation-chat.md) | [ஆய்விப் பலகம், கோப்பு முன்னோட்டம் மற்றும் தடமறிதல்](./documentation-inspector.md)

# இடைமுக அறிமுகம்

LalaClaw இன் முக்கிய திரை மூன்று பகுதிகளாகப் புரிந்துகொள்ளலாம்: மேலுள்ள அமர்வு கட்டுப்பாட்டு header, நடுவிலுள்ள chat workspace, மற்றும் வலப்புற inspector.

## தலைப்பு பகுதி மற்றும் அமர்வு கட்டுப்பாடுகள்

மேல் பகுதியில் உள்ளவை:

- தற்போது கிடைக்கும் பட்டியலிலிருந்து model மாற்றம்
- தற்போதைய மற்றும் அதிகபட்ச context பயன்பாட்டு காட்சி
- fast mode toggle
- `off / minimal / low / medium / high / xhigh / adaptive` எண்ணும் முறைத் தேர்வு
- `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்` மொழி மாற்றம்
- `system / light / dark` theme மாற்றம்
- மேல் வலப்புற keyboard shortcut உதவி
- மேல் இடப்புற clickable lobster, [மறைச்சிறப்பு](./documentation-easter-egg.md) இல் விளக்கம் உள்ளது

## அரட்டை பணிப்பரப்பு

முக்கிய chat panel இல் உள்ளவை:

- agent sessions மற்றும் IM conversations க்கான tab strip, மேலும் மற்ற agent அல்லது IM thread திறக்கும் switcher entry
- தற்போதைய agent, activity state, font size, மற்றும் new-session action காட்டும் panel header
- user messages, assistant messages, streaming replies, attachment previews காட்டும் conversation area
- text, `@` mentions, attachments, மற்றும் active reply stop ஆதரவு கொண்ட composer

காணக்கூடிய நடத்தை:

- user messages வலப்பக்கம், assistant messages இடப்பக்கம்
- பதில் உருவாகும் போது தற்காலிக thinking placeholder முதலில் தோன்றும்
- நீளமான Markdown replies க்கு heading jump செய்ய outline உருவாகலாம்
- கீழே இல்லாதபோது latest reply க்கு திரும்பும் button தோன்றும்

## வலப்புற inspector

Inspector இப்போது நான்கு முக்கிய tabs ஆக அமைந்துள்ளது:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

இது தற்போதைய chat session உடன் இணைந்து, அதே session இன் file activity, summaries, execution records, runtime metadata ஆகியவற்றைக் காட்டுகிறது.

## பல session tabs

Tabs சில எளிய விதிகளைப் பின்பற்றுகின்றன:

- ஒவ்வொரு tab உமும் underlying real session identity ஆன `agentId + sessionUser` மூலம் பிரிக்கப்படுகிறது
- switcher மூலம் agent sessions மட்டுமல்ல, DingTalk, Feishu, WeCom போன்ற IM conversations யும் திறக்கலாம்
- tab ஐ மூடுவது தற்போதைய view இலிருந்து மறைப்பதற்கே; உண்மையான session state நீக்கப்படாது
- ஏற்கனவே திறந்த agent tabs மற்றும் IM channels switcher இல் மீண்டும் காட்டப்படாது
