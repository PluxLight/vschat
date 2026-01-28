# VSChat

VSCode Extension으로 구현된 로컬 네트워크 채팅 기능입니다. 같은 네트워크에 있는 컴퓨터끼리 실시간으로 채팅을 주고받을 수 있습니다.
이 프로젝트는 Cursor AI의 도움을 받아 작성되었습니다

## 기능

- ✅ VSCode 우측 사이드바에 채팅 패널 표시
- ✅ WebSocket 기반 실시간 채팅
- ✅ 로컬 네트워크 멀티 유저 지원
- ✅ 사용자 이름 설정 및 실시간 접속자 목록
- ✅ 메시지 타임스탬프 표시
- ✅ 서버 시작/중지 및 클라이언트 연결 기능
- ✅ **AES-256-GCM 암호화** - 네트워크 전송 시 메시지 암호화
- ✅ 접속자 목록 접기/펼치기 기능
- ✅ 자동 재연결 기능

## 설치 방법

1. 프로젝트 디렉토리에서 의존성 설치:
```bash
npm install
```

2. 프로젝트 컴파일:
```bash
npm run compile
```

3. F5 키를 눌러 Extension Development Host에서 실행하거나, `vsce package`로 VSIX 파일 생성 후 설치

## 사용 방법

### 서버 시작하기

1. Command Palette (Ctrl+Shift+P)를 엽니다
2. "VSChat: 서버 시작" 명령을 실행합니다
3. 포트 번호를 입력합니다 (기본값: 8080)
4. 서버가 시작되면 IP 주소와 포트가 표시됩니다

### 다른 컴퓨터에서 연결하기

1. 서버를 실행한 컴퓨터의 IP 주소와 포트를 확인합니다
2. 같은 네트워크에 있는 다른 컴퓨터에서도 이 Extension을 실행합니다
3. 서버를 실행한 컴퓨터의 IP 주소로 자동 연결됩니다

### 채팅하기

1. Command Palette에서 "VSChat: 채팅 열기" 명령을 실행합니다
2. 사용자 이름을 입력합니다 (기본값: UserXXX)
3. 메시지를 입력하고 전송합니다

## 개발

### 프로젝트 구조

```
vschat/
├── src/
│   ├── extension.ts      # Extension 메인 진입점
│   ├── chatPanel.ts      # 채팅 패널 및 Webview 관리
│   ├── server.ts         # WebSocket 서버 구현
│   ├── chatClient.ts     # WebSocket 클라이언트 구현
│   └── crypto.ts         # 암호화/복호화 유틸리티
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript 설정
└── README.md
```

### 빌드

```bash
npm run compile
```

### 디버깅

1. VS Code에서 F5를 눌러 Extension Development Host를 실행합니다
2. 새 창에서 Extension을 테스트합니다

## 보안

- **AES-256-GCM 암호화**: 모든 메시지가 네트워크를 통해 암호화되어 전송됩니다
- **고유 IV**: 각 메시지마다 다른 초기화 벡터를 사용합니다
- **인증 태그**: 메시지 무결성을 보장합니다

## 기술 스택

- TypeScript
- VSCode Extension API
- WebSocket (ws 라이브러리)
- Node.js Crypto 모듈 (암호화)

## 라이선스

MIT
