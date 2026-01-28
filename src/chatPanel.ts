import * as vscode from 'vscode';
import * as path from 'path';
import { ChatServer } from './server';
import { ChatClient } from './chatClient';

export class ChatPanel {
    public static readonly viewType = 'vschat.chatView';
    private _panel: vscode.WebviewPanel | undefined;
    private _server: ChatServer | undefined;
    private _client: ChatClient | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _lastConnectionInfo: { hostname: string; port: number } | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            'VSChat',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
            }
        );

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Webview에서 메시지 받기
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        if (this._client && this._client.isConnected()) {
                            this._client.send({
                                type: 'message',
                                username: message.username,
                                message: message.text,
                                timestamp: Date.now()
                            });
                        }
                        break;
                    case 'updateUsername':
                        // 서버에 닉네임 설정 요청
                        if (this._client && this._client.isConnected()) {
                            this._client.send({
                                type: 'setUsername',
                                username: message.username,
                                message: '',
                                timestamp: Date.now()
                            });
                        }
                        break;
                    case 'sendInitialUsername':
                        // 초기 닉네임 전송
                        if (this._client && this._client.isConnected()) {
                            this._client.send({
                                type: 'setUsername',
                                username: message.username,
                                message: '',
                                timestamp: Date.now()
                            });
                        }
                        break;
                    case 'refreshUserList':
                        // 접속자 목록 갱신 요청
                        if (this._client && this._client.isConnected()) {
                            this._client.send({
                                type: 'requestUserList',
                                username: '',
                                message: '',
                                timestamp: Date.now()
                            });
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        this._update();
    }

    public reveal() {
        if (this._panel) {
            this._panel.reveal();
        }
    }

    private _postMessageToWebview(message: any): void {
        if (this._panel) {
            try {
                this._panel.webview.postMessage(message);
            } catch (error: any) {
                // Webview가 dispose된 경우 무시
                if (error.message && error.message.includes('disposed')) {
                    console.log('Webview가 이미 dispose되었습니다.');
                } else {
                    console.error('Webview에 메시지 전송 실패:', error);
                }
            }
        }
    }

    public async setServer(server: ChatServer | undefined) {
        this._server = server;
        
        // 기존 클라이언트 연결 종료
        if (this._client) {
            this._client.disconnect();
            this._client = undefined;
        }

        // 서버가 있으면 클라이언트 연결
        if (server && server.isRunning()) {
            try {
                this._client = new ChatClient(server.getHostname(), server.getPort());
                await this._client.connect();
                
            // 메시지 수신 핸들러
            this._client.onMessage((message) => {
                if (message.type === 'userList') {
                    // 접속자 목록 업데이트
                    this._postMessageToWebview({
                        command: 'updateUserList',
                        userList: message.userList || []
                    });
                } else {
                    // 일반 메시지
                    this._postMessageToWebview({
                        command: 'receiveMessage',
                        message: message
                    });
                }
            });

            // 연결 성공 메시지
            this._postMessageToWebview({
                command: 'systemMessage',
                message: '서버에 연결되었습니다.'
            });
            
            // Webview에 초기 닉네임 요청 (약간의 지연을 두어 Webview가 준비될 때까지 대기)
            setTimeout(() => {
                this._postMessageToWebview({
                    command: 'requestInitialUsername'
                });
            }, 100);
            } catch (error) {
                console.error('클라이언트 연결 실패:', error);
                this._postMessageToWebview({
                    command: 'systemMessage',
                    message: '서버 연결에 실패했습니다.'
                });
            }
        }

        if (this._panel) {
            this._update();
        }
    }

    public async connectToServer(hostname: string, port: number) {
        // 기존 클라이언트 연결 종료
        if (this._client) {
            this._client.disconnect();
            this._client = undefined;
        }

        // 연결 정보 저장
        this._lastConnectionInfo = { hostname, port };

        try {
            this._client = new ChatClient(hostname, port);
            await this._client.connect();
            
            // 메시지 수신 핸들러
            this._client.onMessage((message) => {
                if (message.type === 'userList') {
                    // 접속자 목록 업데이트
                    this._postMessageToWebview({
                        command: 'updateUserList',
                        userList: message.userList || []
                    });
                } else {
                    // 일반 메시지
                    this._postMessageToWebview({
                        command: 'receiveMessage',
                        message: message
                    });
                }
            });

            // 연결 성공 메시지
            this._postMessageToWebview({
                command: 'systemMessage',
                message: `서버 ${hostname}:${port}에 연결되었습니다.`
            });
            
            this._update();
            
            // Webview에 초기 닉네임 요청 (약간의 지연을 두어 Webview가 준비될 때까지 대기)
            setTimeout(() => {
                this._postMessageToWebview({
                    command: 'requestInitialUsername'
                });
            }, 100);
        } catch (error: any) {
            console.error('클라이언트 연결 실패:', error);
            const errorMessage = error.message || '알 수 없는 오류';
            this._postMessageToWebview({
                command: 'systemMessage',
                message: `서버 ${hostname}:${port} 연결에 실패했습니다: ${errorMessage}`
            });
            throw error;
        }
    }

    private _update() {
        if (!this._panel) {
            return;
        }

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const isServerRunning = this._server?.isRunning() ?? false;
        const isClientConnected = this._client?.isConnected() ?? false;
        
        let serverInfo = '연결되지 않음';
        if (isServerRunning) {
            serverInfo = `서버: ${this._server!.getHostname()}:${this._server!.getPort()}`;
        } else if (isClientConnected && this._client) {
            // 클라이언트만 연결된 경우 (서버 정보는 클라이언트에서 가져올 수 없으므로 간단히 표시)
            serverInfo = '서버에 연결됨';
        }
        
        const isConnected = isServerRunning || isClientConnected;

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VSChat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }
        
        .server-status {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: ${isConnected ? '#4ec9b0' : '#f48771'};
        }
        
        .server-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .username-section {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .username-section input {
            flex: 1;
            padding: 5px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        
        .user-list-section {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .user-list-header {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
        }
        
        .user-list-header:hover {
            color: var(--vscode-foreground);
        }
        
        .user-list-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .user-list-toggle {
            font-size: 10px;
            opacity: 0.7;
            transition: transform 0.2s;
        }
        
        .user-list-toggle.collapsed {
            transform: rotate(-90deg);
        }
        
        .user-list-refresh {
            font-size: 10px;
            opacity: 0.7;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 2px;
        }
        
        .user-list-refresh:hover {
            opacity: 1;
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .user-list-section.collapsed .user-list {
            display: none;
        }
        
        .user-list {
            max-height: 150px;
            overflow-y: auto;
            font-size: 11px;
        }
        
        .user-item {
            padding: 4px 8px;
            margin: 2px 0;
            background-color: var(--vscode-input-background);
            border-radius: 3px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .user-name {
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .user-ip {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .message {
            padding: 8px;
            border-radius: 4px;
            max-width: 80%;
            word-wrap: break-word;
        }
        
        .message.own {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .message.other {
            align-self: flex-start;
            background-color: var(--vscode-input-background);
        }
        
        .message-header {
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 4px;
        }
        
        .message-content {
            font-size: 13px;
        }
        
        .input-section {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
        }
        
        .input-section input {
            flex: 1;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        
        .input-section button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
        }
        
        .input-section button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .input-section button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .empty-state {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="server-status">
            <div class="status-indicator"></div>
            <span class="server-info">${serverInfo}</span>
        </div>
        <div class="username-section">
            <input type="text" id="username" placeholder="사용자 이름" value="User${Math.floor(Math.random() * 1000)}">
        </div>
        <div class="user-list-section" id="userListSection">
            <div class="user-list-header" id="userListHeader">
                <div class="user-list-header-left">
                    <span class="user-list-toggle" id="userListToggle">▼</span>
                    <span>접속자 (<span id="userCount">0</span>)</span>
                </div>
                <span class="user-list-refresh" id="userListRefresh" title="갱신">⟳</span>
            </div>
            <div class="user-list" id="userList"></div>
        </div>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="empty-state">메시지를 입력하여 채팅을 시작하세요</div>
    </div>
    
    <div class="input-section">
        <input type="text" id="messageInput" placeholder="메시지 입력..." ${!isConnected ? 'disabled' : ''}>
        <button id="sendButton" ${!isConnected ? 'disabled' : ''}>전송</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let username = document.getElementById('username').value;
        
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const usernameInput = document.getElementById('username');
        const userList = document.getElementById('userList');
        const userCount = document.getElementById('userCount');
        const userListSection = document.getElementById('userListSection');
        const userListHeader = document.getElementById('userListHeader');
        const userListToggle = document.getElementById('userListToggle');
        const userListRefresh = document.getElementById('userListRefresh');
        
        const isConnected = ${isConnected};
        
        // 접기/펼치기 상태
        let isUserListExpanded = true;
        
        // 접기/펼치기 토글
        if (userListHeader && userListToggle) {
            userListHeader.addEventListener('click', (e) => {
                // 갱신 버튼 클릭은 제외
                if (e.target === userListRefresh) return;
                
                isUserListExpanded = !isUserListExpanded;
                if (userListSection) {
                    if (isUserListExpanded) {
                        userListSection.classList.remove('collapsed');
                        userListToggle.textContent = '▼';
                        userListToggle.classList.remove('collapsed');
                    } else {
                        userListSection.classList.add('collapsed');
                        userListToggle.textContent = '▶';
                        userListToggle.classList.add('collapsed');
                    }
                }
            });
        }
        
        // 갱신 버튼 클릭
        if (userListRefresh) {
            userListRefresh.addEventListener('click', (e) => {
                e.stopPropagation(); // 헤더 클릭 이벤트 전파 방지
                if (isConnected) {
                    vscode.postMessage({
                        command: 'refreshUserList'
                    });
                }
            });
        }
        
        function updateUserList(userListData) {
            if (!userList || !userCount) return;
            
            userCount.textContent = userListData.length;
            userList.innerHTML = '';
            
            if (userListData.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'text-align: center; color: var(--vscode-descriptionForeground); font-size: 11px; padding: 5px;';
                emptyMsg.textContent = '접속자가 없습니다';
                userList.appendChild(emptyMsg);
                return;
            }
            
            userListData.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                
                const userName = document.createElement('span');
                userName.className = 'user-name';
                userName.textContent = user.username;
                
                const userIp = document.createElement('span');
                userIp.className = 'user-ip';
                userIp.textContent = user.ip;
                
                userItem.appendChild(userName);
                userItem.appendChild(userIp);
                userList.appendChild(userItem);
            });
        }
        
        function addMessage(username, message, isOwn = false) {
            const emptyState = chatContainer.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isOwn ? 'own' : 'other'}\`;
            
            const header = document.createElement('div');
            header.className = 'message-header';
            header.textContent = \`\${username} - \${new Date().toLocaleTimeString()}\`;
            
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = message;
            
            messageDiv.appendChild(header);
            messageDiv.appendChild(content);
            chatContainer.appendChild(messageDiv);
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function addSystemMessage(message) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = 'text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px; padding: 5px;';
            messageDiv.textContent = message;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || !isConnected) {
                return;
            }
            
            // Extension으로 메시지 전송
            vscode.postMessage({
                command: 'sendMessage',
                username: username,
                text: message
            });
            
            // 로컬에서 즉시 표시 (서버에서 다시 받을 때까지)
            addMessage(username, message, true);
            messageInput.value = '';
        }
        
        // Extension에서 메시지 받기
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'receiveMessage':
                    const msg = message.message;
                    if (msg.type === 'message') {
                        addMessage(msg.username, msg.message, msg.username === username);
                    } else if (msg.type === 'system') {
                        addSystemMessage(msg.message);
                    }
                    break;
                case 'systemMessage':
                    addSystemMessage(message.message);
                    break;
                case 'updateUserList':
                    updateUserList(message.userList || []);
                    break;
                case 'requestInitialUsername':
                    // 초기 닉네임 전송 (현재 입력된 닉네임 사용)
                    if (isConnected) {
                        const currentUsername = usernameInput.value.trim() || username;
                        username = currentUsername;
                        vscode.postMessage({
                            command: 'sendInitialUsername',
                            username: currentUsername
                        });
                    }
                    break;
            }
        });
        
        sendButton.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // 닉네임 변경 감지 (change와 input 이벤트 모두 처리)
        function updateUsernameOnServer(newUsername) {
            if (newUsername && newUsername !== username) {
                username = newUsername;
                // 서버에 닉네임 변경 알림
                if (isConnected) {
                    vscode.postMessage({
                        command: 'updateUsername',
                        username: username
                    });
                }
            }
        }
        
        usernameInput.addEventListener('change', (e) => {
            const newUsername = e.target.value.trim() || 'User';
            updateUsernameOnServer(newUsername);
        });
        
        // 실시간 업데이트를 위한 input 이벤트 (Enter 키나 포커스 아웃 시)
        usernameInput.addEventListener('blur', (e) => {
            const newUsername = e.target.value.trim() || 'User';
            updateUsernameOnServer(newUsername);
        });
        
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const newUsername = e.target.value.trim() || 'User';
                updateUsernameOnServer(newUsername);
                e.target.blur(); // 포커스 해제
            }
        });
        
        // 초기 접속자 목록 요청 (빈 목록으로 시작)
        updateUserList([]);
    </script>
</body>
</html>`;
    }

    public dispose() {
        // 클라이언트 연결 종료
        if (this._client) {
            this._client.disconnect();
            this._client = undefined;
        }

        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public getLastConnectionInfo(): { hostname: string; port: number } | undefined {
        return this._lastConnectionInfo;
    }

    public isDisposed(): boolean {
        return this._panel === undefined;
    }

    public async checkConnection(): Promise<boolean> {
        // 서버가 실행 중이면 연결되어 있는지 확인
        if (this._server && this._server.isRunning()) {
            return this._client?.isConnected() ?? false;
        }
        // 클라이언트만 연결된 경우
        return this._client?.isConnected() ?? false;
    }
}
