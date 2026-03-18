[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[홈으로 돌아가기](./documentation.md) | [인터페이스 개요](./documentation-interface.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md) | [API 및 문제 해결](./documentation-api-troubleshooting.md)

# 빠른 시작

## 요구 사항

- 개발할 때는 저장소의 [`.nvmrc`](../../.nvmrc) 에 정의된 Node.js 버전을 사용하세요. 현재는 `22` 입니다. 배포된 npm 패키지는 `^20.19.0 || ^22.12.0 || >=24.0.0` 를 지원합니다
- 일반적인 로컬 사용에는 npm 설치를 권장합니다
- 개발 모드나 로컬 코드 수정이 필요한 경우에만 GitHub 소스 체크아웃을 사용하세요

## OpenClaw로 설치

OpenClaw를 사용해 원격 Mac 또는 Linux 머신에 LalaClaw를 설치한 뒤, SSH 포트 포워딩으로 로컬에서 접속할 수 있습니다.

이미 OpenClaw가 설치된 머신이 있고 그 머신에 SSH로 로그인할 수 있다면, OpenClaw에게 GitHub에서 이 프로젝트를 설치하고 원격에서 실행하게 한 다음, 해당 포트를 로컬로 포워딩하면 됩니다.

```text
Install https://github.com/aliramw/lalaclaw
```

일반적인 흐름:

1. OpenClaw가 원격 머신에서 이 저장소를 clone합니다.
2. OpenClaw가 의존성을 설치하고 LalaClaw를 시작합니다.
3. 앱은 원격 머신의 `127.0.0.1:5678` 에서 대기합니다.
4. SSH로 그 원격 포트를 로컬로 포워딩합니다.
5. 포워딩된 로컬 주소를 브라우저에서 엽니다.

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

로컬에서 여는 주소:

```text
http://127.0.0.1:3000
```

## npm으로 설치

가장 간단한 사용자 설치 방법은 다음과 같습니다.

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

그다음 [http://127.0.0.1:5678](http://127.0.0.1:5678) 을 엽니다.

참고:

- `lalaclaw init` 은 macOS와 Linux에서 로컬 설정을 `~/.config/lalaclaw/.env.local` 에 기록합니다
- 기본값은 `HOST=127.0.0.1`, `PORT=5678`, `FRONTEND_PORT=4321` 입니다
- 로컬 OpenClaw가 감지되면 `lalaclaw init` 은 해석된 `OPENCLAW_BIN` 과 현재 Node 런타임이 포함된 `launchd` `PATH` 도 기록합니다
- 소스 체크아웃에서는 `lalaclaw init` 이 Server와 Vite Dev Server를 백그라운드에서 시작하고 Dev Server URL을 여는 안내를 표시합니다
- macOS npm 설치 환경에서는 `lalaclaw init` 이 Server `launchd` 서비스를 설치하고 시작한 뒤 Server URL을 여는 안내를 표시합니다
- Linux npm 설치 환경에서는 `lalaclaw init` 이 Server를 백그라운드에서 시작한 뒤 Server URL을 여는 안내를 표시합니다
- 설정만 저장하려면 `lalaclaw init --no-background` 를 사용하세요
- `--no-background` 이후에는 `lalaclaw doctor` 를 실행하고, 소스 체크아웃이면 `lalaclaw dev`, 패키지 설치면 `lalaclaw start` 를 사용하세요
- `lalaclaw status`, `lalaclaw restart`, `lalaclaw stop` 은 macOS `launchd` Server 서비스 전용입니다

## GitHub에서 설치

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

## 개발 모드

개발 모드에는 GitHub 소스 체크아웃과 `npm ci` 가 필요합니다.

저장소 개발용 고정 포트는 다음과 같습니다.

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PORT=3000 HOST=127.0.0.1 node server.js
```

또는 다음처럼 한 번에 실행할 수도 있습니다.

```bash
npm run dev:all
```

개발용 주소:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- 브라우저 진입점: `http://127.0.0.1:5173`

## Browser Access Tokens

브라우저에서 접근 토큰 잠금 해제 화면이 보이면 아래 방법으로 token 을 확인하거나 새로 만들 수 있습니다.

- `lalaclaw access token` 으로 현재 token 확인
- `lalaclaw access token --rotate` 로 새 token 생성 및 저장
- `~/.config/lalaclaw/.env.local` 의 `COMMANDCENTER_ACCESS_TOKENS` 또는 `COMMANDCENTER_ACCESS_TOKENS_FILE` 확인
- 직접 배포한 인스턴스가 아니라면 배포 관리자에게 token 요청
