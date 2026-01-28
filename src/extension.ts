import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel';
import { ChatServer } from './server';

let chatPanel: ChatPanel | undefined;
let chatServer: ChatServer | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('VSChat extension이 활성화되었습니다.');

    // 채팅 패널 열기 명령
    const openChatCommand = vscode.commands.registerCommand('vschat.openChat', async () => {
        if (!chatPanel || chatPanel.isDisposed()) {
            chatPanel = new ChatPanel(context.extensionUri);
            
            // 서버가 실행 중이면 자동으로 재연결
            if (chatServer && chatServer.isRunning()) {
                try {
                    await chatPanel.setServer(chatServer);
                    vscode.window.showInformationMessage('서버에 재연결되었습니다.');
                } catch (error: any) {
                    vscode.window.showWarningMessage(`서버 재연결 실패: ${error.message}`);
                }
            } else {
                // 서버가 없으면 이전 연결 정보로 재연결 시도
                const lastConnection = chatPanel.getLastConnectionInfo();
                if (lastConnection) {
                    try {
                        await chatPanel.connectToServer(lastConnection.hostname, lastConnection.port);
                        vscode.window.showInformationMessage(`이전 연결(${lastConnection.hostname}:${lastConnection.port})로 재연결되었습니다.`);
                    } catch (error: any) {
                        vscode.window.showWarningMessage(`이전 연결로 재연결 실패: ${error.message}`);
                    }
                }
            }
        } else {
            // 패널이 이미 있지만 연결이 끊어진 경우
            if (chatServer && chatServer.isRunning()) {
                // 서버가 실행 중이면 재연결
                const isConnected = await chatPanel.checkConnection();
                if (!isConnected) {
                    try {
                        await chatPanel.setServer(chatServer);
                        vscode.window.showInformationMessage('서버에 재연결되었습니다.');
                    } catch (error: any) {
                        vscode.window.showWarningMessage(`서버 재연결 실패: ${error.message}`);
                    }
                }
            }
        }
        chatPanel.reveal();
    });

    // 서버 시작 명령
    const startServerCommand = vscode.commands.registerCommand('vschat.startServer', async () => {
        if (chatServer && chatServer.isRunning()) {
            vscode.window.showInformationMessage('서버가 이미 실행 중입니다.');
            return;
        }

        const port = await vscode.window.showInputBox({
            prompt: '서버 포트를 입력하세요 (기본값: 8080)',
            value: '8080',
            validateInput: (value) => {
                const portNum = parseInt(value);
                if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                    return '유효한 포트 번호를 입력하세요 (1024-65535)';
                }
                return null;
            }
        });

        if (!port) {
            return;
        }

        try {
            chatServer = new ChatServer(parseInt(port));
            await chatServer.start();
            
            // 채팅 패널이 없거나 dispose된 경우 새로 생성
            if (!chatPanel || chatPanel.isDisposed()) {
                chatPanel = new ChatPanel(context.extensionUri);
            }
            await chatPanel.setServer(chatServer);
            chatPanel.reveal();

            const hostname = chatServer.getHostname();
            vscode.window.showInformationMessage(
                `서버가 시작되었습니다! 다른 사용자는 ${hostname}:${port}에 연결하세요.`
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(`서버 시작 실패: ${error.message}`);
        }
    });

    // 서버 중지 명령
    const stopServerCommand = vscode.commands.registerCommand('vschat.stopServer', async () => {
        if (!chatServer || !chatServer.isRunning()) {
            vscode.window.showInformationMessage('실행 중인 서버가 없습니다.');
            return;
        }

        chatServer.stop();
        if (chatPanel) {
            await chatPanel.setServer(undefined);
        }
        vscode.window.showInformationMessage('서버가 중지되었습니다.');
    });

    // 서버에 연결 명령
    const connectToServerCommand = vscode.commands.registerCommand('vschat.connectToServer', async () => {
        // 채팅 패널이 없거나 dispose된 경우 새로 생성
        if (!chatPanel || chatPanel.isDisposed()) {
            chatPanel = new ChatPanel(context.extensionUri);
        }

        // 서버 주소 입력
        const address = await vscode.window.showInputBox({
            prompt: '서버 주소를 입력하세요 (예: localhost:8080 또는 192.168.1.100:9080)',
            placeHolder: 'localhost:8080',
            validateInput: (value) => {
                if (!value || !value.includes(':')) {
                    return '주소 형식이 올바르지 않습니다. (예: localhost:8080)';
                }
                const parts = value.split(':');
                if (parts.length !== 2) {
                    return '주소 형식이 올바르지 않습니다. (예: localhost:8080)';
                }
                const portNum = parseInt(parts[1]);
                if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                    return '유효한 포트 번호를 입력하세요 (1024-65535)';
                }
                return null;
            }
        });

        if (!address) {
            return;
        }

        const [hostname, portStr] = address.split(':');
        const port = parseInt(portStr);

        try {
            await chatPanel.connectToServer(hostname, port);
            chatPanel.reveal();
            vscode.window.showInformationMessage(`서버 ${address}에 연결되었습니다.`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`서버 연결 실패: ${error.message}`);
        }
    });

    context.subscriptions.push(openChatCommand, startServerCommand, stopServerCommand, connectToServerCommand);

    // Extension이 비활성화될 때 정리
    context.subscriptions.push({
        dispose: () => {
            if (chatServer) {
                chatServer.stop();
            }
            if (chatPanel) {
                chatPanel.dispose();
            }
        }
    });
}

export function deactivate() {
    if (chatServer) {
        chatServer.stop();
    }
    if (chatPanel) {
        chatPanel.dispose();
    }
}
