[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[홈으로 돌아가기](./documentation.md) | [인터페이스 개요](./documentation-interface.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md)

# 빠른 시작

## npm 설치

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

그다음 [http://127.0.0.1:3000](http://127.0.0.1:3000) 을 엽니다.

## 개발 모드

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

그다음 [http://127.0.0.1:5173](http://127.0.0.1:5173) 을 엽니다.

## OpenClaw를 통해 원격 호스트에 설치하기

OpenClaw가 제어할 수 있는 원격 머신이 있고 그 머신에 SSH로도 로그인할 수 있다면, OpenClaw에게 원격에서 LalaClaw를 설치하고 시작하게 한 뒤 SSH 포트 포워딩으로 로컬에서 접속할 수 있습니다.

OpenClaw에 보낼 예시 지시:

~~~text
安装这个 https://github.com/aliramw/lalaclaw
~~~

일반적인 흐름:

1. OpenClaw가 원격 머신에서 저장소를 clone 합니다
2. OpenClaw가 의존성을 설치하고 앱을 시작합니다
3. LalaClaw가 원격 머신의 `127.0.0.1:3000` 에서 수신 대기합니다
4. SSH로 이 포트를 로컬 머신으로 포워딩합니다
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

- 이 방식에서는 로컬의 `127.0.0.1:3000` 이 실제로 원격 머신의 `127.0.0.1:3000` 으로 연결됩니다
- 앱 프로세스, OpenClaw 설정, transcript, 로그, 워크스페이스는 모두 원격 머신에 있습니다
- 이 방식은 대시보드를 공용 인터넷에 직접 노출하는 것보다 더 안전합니다. 그렇게 하면 URL을 아는 누구나 비밀번호 없이 이 제어 콘솔을 사용할 수 있기 때문입니다
- 로컬 `3000` 포트가 이미 사용 중이면 `3300:127.0.0.1:3000` 처럼 다른 로컬 포트를 사용하고 `http://127.0.0.1:3300` 을 여세요

## 중요 참고

- 로컬 UI 개발에는 `npm start` 가 아니라 `npm run dev:all` 을 사용합니다
- doc, ppt, pptx 미리보기에는 LibreOffice가 필요합니다
- COMMANDCENTER_FORCE_MOCK=1 로 mock 모드를 강제할 수 있습니다
