[다른 언어로 README 보기: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

에이전트와 함께 더 잘 협업하고 공동 창작할 수 있는 방법입니다.

저자: Marila Wang

## 핵심 내용

- React + Vite 기반 command center UI, chat, timeline, inspector, theme, locale, attachment 흐름 포함
- VS Code 스타일의 세션/워크스페이스 파일 트리와 preview 동작 지원
- UI는 中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ் 를 지원합니다
- 로컬 또는 원격 OpenClaw gateway에 연결할 수 있는 Node.js 백엔드

## 문서

- 언어 색인: [docs/README.md](./docs/README.md)
- 한국어 문서: [docs/ko/documentation.md](./docs/ko/documentation.md)
- 빠른 시작: [docs/ko/documentation-quick-start.md](./docs/ko/documentation-quick-start.md)
- 인터페이스 개요: [docs/ko/documentation-interface.md](./docs/ko/documentation-interface.md)
- 세션과 런타임: [docs/ko/documentation-sessions.md](./docs/ko/documentation-sessions.md)

## 빠른 시작

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

그다음 [http://127.0.0.1:3000](http://127.0.0.1:3000) 을 엽니다.

참고:

- macOS에서는 `lalaclaw init` 이 `launchd` 백그라운드 서비스도 자동으로 시작합니다
- macOS 소스 체크아웃에서는 `lalaclaw init` 이 필요하면 먼저 `dist/` 를 빌드한 뒤 프로덕션 서비스를 시작합니다
- 설정만 저장하려면 `lalaclaw init --no-background` 를 사용하세요
- Linux 이거나 백그라운드 시작을 끄면 `lalaclaw doctor` 와 `lalaclaw start` 를 이어서 실행하세요
- doc, ppt, pptx 미리보기에는 LibreOffice가 필요합니다
- macOS에서는 lalaclaw doctor --fix 또는 brew install --cask libreoffice 를 실행할 수 있습니다

로컬 개발용:

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

개발 모드에서는 [http://127.0.0.1:5173](http://127.0.0.1:5173) 을 사용합니다.

macOS 소스 체크아웃에서 프로덕션 백그라운드 서비스를 쓰려면 `npm run doctor` 다음에 `npm run lalaclaw:init` 을 실행하세요.

## OpenClaw를 통해 원격 호스트에 설치하기

OpenClaw가 제어할 수 있는 원격 머신이 있고, 동시에 그 머신에 SSH로 로그인할 수 있다면, OpenClaw에게 GitHub에서 이 프로젝트를 설치하고 원격에서 실행하게 한 뒤 SSH 포트 포워딩으로 로컬에서 대시보드에 접속할 수 있습니다.

OpenClaw에 보낼 예시 지시:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

일반적인 흐름:

1. OpenClaw가 원격 머신에서 이 저장소를 clone 합니다
2. OpenClaw가 의존성을 설치하고 LalaClaw를 시작합니다
3. 앱이 원격 머신의 `127.0.0.1:3000` 에서 수신 대기합니다
4. SSH로 그 포트를 로컬 머신으로 포워딩합니다
5. 로컬 브라우저에서 포워딩된 주소를 엽니다

예시 SSH 포트 포워딩:

~~~bash
ssh -N -L 3000:127.0.0.1:3000 root@your-remote-server-ip
~~~

그다음 여는 주소:

~~~text
http://127.0.0.1:3000
~~~

참고:

- 이 구성에서는 로컬의 `127.0.0.1:3000` 이 실제로 원격 머신의 `127.0.0.1:3000` 으로 연결됩니다
- 실행 중인 앱 프로세스, OpenClaw 설정, transcript, 로그, 워크스페이스는 모두 원격 머신에 있습니다
- 이 방식은 대시보드를 공용 인터넷에 직접 노출하는 것보다 더 안전합니다. 그렇게 하면 URL을 아는 누구나 비밀번호 없이 이 제어 콘솔을 사용할 수 있기 때문입니다
- 로컬 `3000` 포트가 이미 사용 중이면 `3300:127.0.0.1:3000` 처럼 다른 로컬 포트를 사용하고 `http://127.0.0.1:3300` 을 여세요

## 업데이트

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

특정 버전 설치:

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## 개발 메모

- 개발 시에는 npm start 대신 npm run dev:all 을 사용하세요
- dist 빌드를 확인할 때만 npm run lalaclaw:start 또는 npm start 를 사용하세요
- 앱은 로컬 OpenClaw 를 자동으로 감지합니다
- mock 모드를 강제로 사용하려면 COMMANDCENTER_FORCE_MOCK=1 을 사용하세요

## 버전 정책

- 버전이 바뀔 때마다 CHANGELOG.md 를 함께 업데이트합니다
- 같은 날 여러 번 릴리스하면 YYYY.M.D-N 형식을 사용합니다. 예: 2026.3.17-5
