[English](../en/testing-e2e.md) | [தமிழ்](../ta/testing-e2e.md)

# உலாவி E2E சோதனை

இந்த வழிகாட்டி LalaClaw க்கான உலாவி நிலை end-to-end சோதனை எதிர்பார்ப்புகளை வரையறுக்கிறது.

இதை [CONTRIBUTING.md](../../CONTRIBUTING.md) உடன் சேர்த்து பயன்படுத்தவும். `CONTRIBUTING.md` மொத்த பங்களிப்பு செயல்முறையை விளக்குகிறது; இந்த கோப்பு Playwright கவரேஜை எப்போது சேர்க்க வேண்டும், அதை எப்படி நிலையாக வைத்திருக்க வேண்டும், மற்றும் தற்போது இந்த repository உலாவி சோதனைகளில் என்ன எதிர்பார்க்கிறது என்பதைக் குறிப்பிடுகிறது.

## தற்போதைய அடுக்கு

- Framework: Playwright
- சோதனை அடைவு: `tests/e2e/`
- முக்கிய அமைப்பு: [`playwright.config.js`](../../playwright.config.js)
- சோதனை சேவையக bootstrap script: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

தற்போதைய அமைப்பு துவக்குவது:

- frontend dev server `http://127.0.0.1:5173`
- backend dev server `http://127.0.0.1:3000`

Playwright bootstrap script backend ஐ `COMMANDCENTER_FORCE_MOCK=1` முறையில் இயக்குகிறது. அதனால் இயல்பாக browser tests உண்மையான OpenClaw சூழலை சார்ந்து இருக்காது.

## எப்போது browser E2E அவசியம்

மாற்றம் கீழ்கண்ட ஒன்று அல்லது அதற்கு மேற்பட்ட பகுதிகளை பாதித்தால் browser e2e ஐ சேர்க்கவும் அல்லது புதுப்பிக்கவும்:

- message send / stop / retry நடத்தை
- queue ஆன turns மற்றும் conversation இல் தாமதமாக நுழைவு
- session bootstrap, session switching, அல்லது tab routing
- உண்மையான render க்கு பிறகே தெரியும் hydration மற்றும் recovery நடத்தை
- hook அல்லது controller tests மட்டும் போதுமான நம்பிக்கையை தராத browser-visible regressions

சுத்தமான state transitions க்கு controller-level அல்லது `App`-level Vitest tests ஐ முன்னுரிமை கொடுங்கள். அபாயம் உண்மையான DOM timing, focus behavior, routing, request ordering, அல்லது multi-step UI flow ஐ சார்ந்திருக்கும்போது browser e2e சேர்க்கவும்.

## முதலில் எதை cover செய்ய வேண்டும்

அதிக அபாயம் கொண்ட user paths க்கு நிலையான கவரேஜ் இல்லாமல் repository க்கு பரந்த browser coverage தேவை இல்லை.

இந்த flows க்கு முன்னுரிமை கொடுக்கவும்:

1. app boot மற்றும் first render
2. ஒரு சாதாரண send / reply cycle
3. queue ஆன sends தங்களது turn வரும்வரை conversation இல் வராமல் இருப்பது
4. ஓடிக்கொண்டிருக்கும் reply இன் போது stop / abort
5. IM tabs அல்லது agent switching போன்ற session bootstrap paths

ஒரு bug fix queueing, streaming, stop, hydration, அல்லது session/runtime sync ஐ மாற்றினால், பொதுவாக ஒரு browser regression test அந்த user-visible failure mode ஐ நேராக target செய்ய வேண்டும்.

## நிலைத்தன்மை விதிகள்

Browser e2e கள் visual trivia க்காக அல்ல, நிலையான behavior verification க்காக எழுதப்பட வேண்டும்.

- உள்ளக implementation விவரங்களை விட user-visible behavior மீது assertions வை முன்னுரிமை கொடுக்கவும்
- text, role, label, மற்றும் stable controls மீது assertions இடவும்
- bug animation timing ஐப் பற்றியதாக இல்லையெனில் animation timing ஐ சார்ந்து விட வேண்டாம்
- class தான் test செய்யும் behavior ஆக இல்லையெனில் fragile Tailwind class assertions ஐத் தவிர்க்கவும்
- தொடர்புடைய `/api/*` calls ஐ test இல் route mock செய்து network behavior ஐ deterministic ஆக வைத்திருக்கவும்
- typing, clicking, tab focus, request ordering க்கு real browser interaction ஐப் பயன்படுத்தவும்

Queueing அல்லது streaming flows க்கு, இவையே முக்கிய assertions:

- message conversation பகுதியில் தெரிகிறதா
- அது queue பகுதியில் மட்டும் தங்குகிறதா
- முந்தைய turn முடிந்த பிறகே அது தோன்றுகிறதா
- தெரியும் வரிசை உண்மையான turn order உடன் பொருந்துகிறதா

## Mock strategy

Browser e2e ஐ இயல்பாக உண்மையான OpenClaw deployment க்கு அனுப்ப வேண்டாம்.

முன்னுரிமை வரிசை:

1. Playwright test குள் தேவையான `/api/*` calls ஐ route செய்யவும்
2. repository backend mock mode ஐப் பயன்படுத்தவும்
3. task வெளிப்படையாக equivalent live validation கோரும்போது மட்டும் உண்மையான external dependency ஐப் பயன்படுத்தவும்

தற்போதைய [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) இந்த pattern ஐப் பின்பற்றுகிறது:

- `/api/auth/state` stubbed செய்யப்பட்டுள்ளது
- `/api/lalaclaw/update` stubbed செய்யப்பட்டுள்ளது
- `/api/runtime` stubbed செய்யப்பட்டுள்ளது
- `/api/chat` ஒவ்வொரு test மூலமும் கட்டுப்படுத்தப்படுகிறது; queue order மற்றும் completion timing deterministic ஆக இருக்கும்

## எழுதும் வழிகாட்டி

ஒவ்வொரு browser e2e கும் குறுகிய scope வைத்திருக்கவும்.

- ஒரு spec file பொதுவாக ஒரு product area மீது மட்டும் கவனம் செலுத்த வேண்டும்
- ஒரு test பொதுவாக ஒரு user flow ஐ மட்டும் verify செய்ய வேண்டும்
- ஒவ்வொரு test க்கும் பெரிய JSON payload களை copy செய்வதை விட சிறிய helper / fixture file ஐ விரும்பவும்
- browser tests `App.test.jsx` உடன் align ஆக snapshot builders ஐ மீண்டும் பயன்படுத்தவும்

நல்ல எடுத்துக்காட்டுகள்:

- "queue ஆன turns உண்மையில் தொடங்கும்வரை conversation இல் வராது"
- "stop செய்த பிறகு send button திரும்ப வருகிறது"
- "Feishu bootstrap tab முதல் send க்கு முன் native session user ஆக resolve ஆகிறது"

அவ்வளவாக பயனில்லை என்ற எடுத்துக்காட்டுகள்:

- "button க்கு இந்த utility classes துல்லியமாக இருக்க வேண்டும்"
- "ஒரே test இல் தொடர்பில்லாத மூன்று flows"
- "route mock போதுமானபோதும் உண்மையான remote service ஐ பயன்படுத்துவது"

## உள்ளூரில் இயக்குவது

Playwright browser ஐ ஒருமுறை install செய்யவும்:

```bash
npm run test:e2e:install
```

Browser e2e ஐ இயக்கவும்:

```bash
npm run test:e2e
```

காணக்கூடிய browser உடன் இயக்கவும்:

```bash
npm run test:e2e:headed
```

Playwright UI உடன் இயக்கவும்:

```bash
npm run test:e2e:ui
```

## CI எதிர்பார்ப்புகள்

CI இல் [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) உள்ள dedicated browser e2e job ஏற்கனவே உள்ளது.

அந்த job focus மற்றும் stability உடன் இருக்க வேண்டும்:

- browser suite ஒவ்வொரு PR இலும் நம்பகமாக ஓடுமளவு சிறியதாக இருக்க வேண்டும்
- பரந்த exploratory scenarios க்கு முன் high-value regressions ஐச் சேர்க்கவும்
- flaky waits அல்லது நீண்ட sleeps ஐத் தவிர்க்கவும்

ஒரு புதிய browser test மிகவும் மெதுவாகவோ அல்லது default CI க்கு மிகவும் environment-sensitive ஆகவோ இருந்தால், அது simplify அல்லது stabilize செய்யப்படும்வரை `test:e2e` default path இல் போகக்கூடாது.

## பரிந்துரைக்கப்படும் review checklist

Browser e2e மாற்றத்தை merge செய்யும் முன் சரிபார்க்கவும்:

- இதற்கு உண்மையாக browser e2e தேவைப்படுகிறதா, அல்லது `App` / controller coverage போதுமா?
- test implementation trivia ஐ அல்ல, user-visible behavior ஐ assert செய்கிறதா?
- தேவையான network state deterministic ஆக கட்டுப்படுத்தப்பட்டுள்ளதா?
- ஆறு மாதங்களுக்கு பிறகு UI styling மாறினாலும் இந்த test இன்னும் பொருத்தமாக இருக்குமா?
- நமக்கு முக்கியமான user regression இல் இந்த test உண்மையில் தோல்வியுறுமா?

## தொடர்புடைய கோப்புகள்

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
