[다른 언어로 README 보기: English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

에이전트와 함께 더 잘 협업하고 공동 창작할 수 있는 방법입니다.

저자: Marila Wang

## 핵심 내용

- React + Vite 기반 command center UI로 chat, timeline, inspector, theme, locale, attachment 흐름을 지원합니다
- 세션 트리와 워크스페이스 트리를 분리한 VS Code 스타일의 파일 탐색과 preview 동작을 제공합니다
- 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu, தமிழ் UI를 제공합니다
- 로컬 또는 원격 OpenClaw gateway에 연결할 수 있는 Node.js 백엔드를 포함합니다
- 테스트, CI, lint, 기여 문서, 릴리스 노트를 함께 제공합니다

## 제품 둘러보기

- 상단 바에서 Agent, 모델, fast mode, think mode, context, queue, theme, locale를 제어합니다
- 메인 채팅 영역에서 프롬프트 입력, 첨부, 스트리밍 응답, 세션 초기화를 수행합니다
- Inspector에서 timeline, files, artifacts, snapshots, runtime activity를 확인할 수 있습니다
- 런타임은 기본적으로 `mock` 모드를 지원하며 필요할 때 실제 OpenClaw gateway로 전환할 수 있습니다

더 긴 소개는 [ko/showcase.md](./ko/showcase.md) 에 있습니다.

## 문서

- 언어 색인: [README.md](./README.md)
- 한국어 가이드: [ko/documentation.md](./ko/documentation.md)
- 빠른 시작: [ko/documentation-quick-start.md](./ko/documentation-quick-start.md)
- 인터페이스 가이드: [ko/documentation-interface.md](./ko/documentation-interface.md)
- 세션과 런타임: [ko/documentation-sessions.md](./ko/documentation-sessions.md)
- 아키텍처: [ko/architecture.md](./ko/architecture.md)

구조 관련 메모는 [server/README.md](../server/README.md) 와 [src/features/README.md](../src/features/README.md) 에 있습니다.

## 설치 가이드

### npm으로 설치

가장 간단한 사용자 설치 방법은 다음과 같습니다.

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

그다음 [http://127.0.0.1:5678](http://127.0.0.1:5678) 을 엽니다.

참고:

- `lalaclaw init` 은 macOS와 Linux에서 로컬 설정을 `~/.config/lalaclaw/.env.local` 에 기록합니다
- 기본값은 `HOST=127.0.0.1`, `PORT=5678`, `FRONTEND_PORT=4321` 입니다
- 소스 체크아웃에서는 `lalaclaw init` 이 Server와 Vite Dev Server를 백그라운드에서 시작하고 Dev Server URL을 여는 안내를 표시합니다
- macOS npm 설치 환경에서는 `lalaclaw init` 이 Server `launchd` 서비스를 설치하고 시작한 뒤 Server URL을 여는 안내를 표시합니다
- Linux npm 설치 환경에서는 `lalaclaw init` 이 Server를 백그라운드에서 시작한 뒤 Server URL을 여는 안내를 표시합니다
- 설정만 저장하려면 `lalaclaw init --no-background` 를 사용하세요
- `--no-background` 이후에는 `lalaclaw doctor` 를 실행하고, 소스 체크아웃이면 `lalaclaw dev`, 패키지 설치면 `lalaclaw start` 를 사용하세요
- `lalaclaw status`, `lalaclaw restart`, `lalaclaw stop` 은 macOS `launchd` Server 서비스 전용입니다
- `doc`, `ppt`, `pptx` 미리보기에는 LibreOffice가 필요합니다. macOS에서는 `lalaclaw doctor --fix` 또는 `brew install --cask libreoffice` 를 사용할 수 있습니다

### OpenClaw로 설치

OpenClaw를 사용해 원격 Mac 또는 Linux 머신에 LalaClaw를 설치한 뒤, SSH 포트 포워딩으로 로컬에서 접속할 수 있습니다.

이미 OpenClaw가 설치된 머신이 있고 그 머신에 SSH로 로그인할 수 있다면, OpenClaw에게 GitHub에서 이 프로젝트를 설치하고 원격에서 실행하게 한 다음, 해당 포트를 로컬로 포워딩하면 됩니다.

OpenClaw에게는 이렇게 말하면 됩니다.

```text
Install https://github.com/aliramw/lalaclaw
```

일반적인 흐름:

1. OpenClaw가 원격 머신에서 이 저장소를 clone합니다.
2. OpenClaw가 의존성을 설치하고 LalaClaw를 시작합니다.
3. 앱은 원격 머신의 `127.0.0.1:5678` 에서 대기합니다.
4. SSH로 그 원격 포트를 로컬로 포워딩합니다.
5. 포워딩된 로컬 주소를 브라우저에서 엽니다.

SSH 포트 포워딩 예시:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

그 다음 로컬에서 다음 주소를 엽니다.

```text
http://127.0.0.1:3000
```

### GitHub에서 설치

개발이나 로컬 수정을 위해 소스 체크아웃을 사용하려면:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

그다음 [http://127.0.0.1:4321](http://127.0.0.1:4321) 을 엽니다.

참고:

- `npm run lalaclaw:init` 은 기본적으로 Server와 Vite Dev Server를 백그라운드에서 시작하며, 원하지 않으면 `--no-background` 를 전달하면 됩니다
- 시작 후 Dev Server URL을 여는 안내가 나오며 기본값은 `http://127.0.0.1:4321` 입니다
- 설정 생성만 원하면 `npm run lalaclaw:init -- --no-background` 를 사용하세요
- `npm run lalaclaw:start` 는 현재 터미널에서 실행되며 터미널을 닫으면 함께 종료됩니다
- 이후 일반 개발 환경을 사용하려면 `npm run dev:all` 을 실행하고 `http://127.0.0.1:4321` 또는 설정한 `FRONTEND_PORT` 를 여세요

### LalaClaw 업데이트

npm 설치를 최신 버전으로 업데이트하려면:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

특정 버전, 예를 들어 `2026.3.17-9` 로 바꾸려면:

```bash
npm install -g lalaclaw@2026.3.17-9
lalaclaw init
```

GitHub로 설치한 환경을 최신 버전으로 업데이트하려면:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

특정 버전, 예를 들어 `2026.3.17-9` 로 바꾸려면:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-9
npm ci
npm run build
npm run lalaclaw:start
```

## 자주 쓰는 명령

- `npm run dev:all` 은 표준 로컬 개발 흐름을 시작합니다
- `npm run doctor` 는 Node.js, OpenClaw 감지, 포트, 로컬 설정을 점검합니다
- `npm run lalaclaw:init` 은 로컬 부트스트랩 설정을 생성하거나 갱신합니다
- `npm run lalaclaw:start` 는 `dist/` 를 확인한 뒤 빌드된 앱을 실행합니다
- `npm run build` 는 프로덕션 번들을 만듭니다
- `npm test` 는 Vitest를 한 번 실행합니다
- `npm run lint` 는 ESLint를 실행합니다

전체 명령 목록과 기여 흐름은 [CONTRIBUTING.md](../CONTRIBUTING.md) 를 참고하세요。

## 기여

기여를 환영합니다. 큰 기능, 구조 변경, 사용자에게 보이는 동작 변경은 먼저 issue로 방향을 맞춰 주세요.

PR을 열기 전에:

- 변경 범위를 좁게 유지하고 관련 없는 리팩터링을 피하세요
- 동작 변경에는 테스트를 추가하거나 업데이트하세요
- 새로운 사용자 노출 문구는 `src/locales/*.js` 로 넣으세요
- 사용자에게 보이는 동작이 바뀌면 문서도 함께 업데이트하세요
- 버전 관련 변경이 있으면 [CHANGELOG.md](../CHANGELOG.md) 를 업데이트하세요

자세한 체크리스트는 [CONTRIBUTING.md](../CONTRIBUTING.md) 에 있습니다。

## 개발 메모

- 표준 로컬 개발 흐름에는 `npm run dev:all` 을 사용하세요
- 개발 시 기본 프런트엔드 URL은 [http://127.0.0.1:4321](http://127.0.0.1:4321) 이며 필요하면 `FRONTEND_PORT` 를 바꿀 수 있습니다
- `npm run lalaclaw:start` 와 `npm start` 는 `dist/` 기반 검증이 필요할 때만 사용하세요
- 기본적으로 로컬 OpenClaw gateway를 자동 감지합니다
- UI나 프런트엔드 재현이 필요하면 `COMMANDCENTER_FORCE_MOCK=1` 로 `mock` 모드를 강제할 수 있습니다
- PR 전에는 `npm run lint`, `npm test`, `npm run build` 실행을 권장합니다

## 버전 정책

LalaClaw는 npm 호환 달력 버저닝을 사용합니다.

- 버전이 바뀌면 [CHANGELOG.md](../CHANGELOG.md) 를 업데이트하세요
- 같은 날 여러 번 릴리스하면 `YYYY.M.D-N` 형식을 사용하세요. 예: `2026.3.17-9`
- 호환성에 영향이 있는 변경은 릴리스 노트와 마이그레이션 문서에 명확히 적어 주세요
- 개발할 때는 [`.nvmrc`](../.nvmrc) 의 Node.js `22` 를 권장합니다. 배포된 npm 패키지는 `^20.19.0 || ^22.12.0 || >=24.0.0` 를 지원합니다

## OpenClaw 연결

`~/.openclaw/openclaw.json` 이 있으면 LalaClaw가 로컬 OpenClaw gateway를 자동으로 감지하고 loopback endpoint 와 gateway token 을 재사용합니다。

새 소스 체크아웃에서 흔한 초기 설정은 다음과 같습니다。

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

다른 OpenClaw 호환 gateway를 쓰고 싶다면 다음을 설정하세요。

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

OpenAI Responses API에 더 가까운 gateway라면 다음을 사용하세요。

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

이 변수들이 없으면 앱은 `mock` 모드로 실행되어 초기 단계에서도 UI와 채팅 루프를 확인할 수 있습니다。
