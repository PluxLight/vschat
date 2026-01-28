import WebSocket = require('ws');
import { ChatMessage } from './server';
import { Encryption } from './crypto';

export class ChatClient {
    private ws: WebSocket | undefined;
    private _hostname: string;
    private _port: number;
    private _isConnected: boolean = false;
    private _messageHandlers: Array<(message: ChatMessage) => void> = [];
    private _encryptionKey: string | undefined;

    constructor(hostname: string, port: number) {
        this._hostname = hostname;
        this._port = port;
    }

    public async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = `ws://${this._hostname}:${this._port}`;
                console.log(`WebSocket 연결 시도: ${wsUrl}`);
                this.ws = new WebSocket(wsUrl);

                let connectionTimeout: NodeJS.Timeout | undefined;

                this.ws.on('open', () => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                    }
                    this._isConnected = true;
                    console.log(`WebSocket 클라이언트 연결됨: ${wsUrl}`);
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message: ChatMessage = JSON.parse(data.toString());
                        
                        // 암호화 키 수신
                        if (message.type === 'encryptionKey' && message.encryptionKey) {
                            this._encryptionKey = message.encryptionKey;
                            console.log('암호화 키를 받았습니다.');
                            return;
                        }
                        
                        // 메시지 복호화
                        if (message.encrypted && message.message && this._encryptionKey) {
                            try {
                                message.message = Encryption.decrypt(message.message, this._encryptionKey);
                                message.encrypted = false;
                            } catch (error) {
                                console.error('메시지 복호화 실패:', error);
                            }
                        }
                        
                        this._messageHandlers.forEach(handler => handler(message));
                    } catch (error) {
                        console.error('메시지 파싱 오류:', error);
                    }
                });

                this.ws.on('error', (error: Error) => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                    }
                    console.error(`WebSocket 클라이언트 오류 (${wsUrl}):`, error);
                    this._isConnected = false;
                    const errorMessage = error.message || `서버 ${this._hostname}:${this._port}에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.`;
                    reject(new Error(errorMessage));
                });

                this.ws.on('close', (code: number, reason: Buffer) => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                    }
                    console.log(`WebSocket 클라이언트 연결 종료: ${code} - ${reason.toString()}`);
                    this._isConnected = false;
                    if (!this._isConnected) {
                        // 연결이 열리기 전에 닫힌 경우
                        reject(new Error(`서버 ${this._hostname}:${this._port}에 연결할 수 없습니다.`));
                    }
                });

                // 5초 타임아웃
                connectionTimeout = setTimeout(() => {
                    if (this.ws && !this._isConnected) {
                        this.ws.close();
                        reject(new Error(`서버 ${this._hostname}:${this._port} 연결 시간 초과. 서버가 실행 중인지 확인하세요.`));
                    }
                }, 5000);
            } catch (error: any) {
                reject(new Error(`연결 실패: ${error.message || error}`));
            }
        });
    }

    public send(message: ChatMessage): void {
        if (this.ws && this._isConnected && this.ws.readyState === WebSocket.OPEN) {
            // 메시지 타입이고 암호화 키가 있으면 암호화
            if (message.type === 'message' && message.message && this._encryptionKey) {
                try {
                    const originalMessage = message.message;
                    message.message = Encryption.encrypt(originalMessage, this._encryptionKey);
                    message.encrypted = true;
                } catch (error) {
                    console.error('메시지 암호화 실패:', error);
                }
            }
            
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket이 연결되지 않았습니다.');
        }
    }

    public onMessage(handler: (message: ChatMessage) => void): void {
        this._messageHandlers.push(handler);
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
            this._isConnected = false;
            this._encryptionKey = undefined; // 연결 종료 시 키 제거
        }
    }

    public isConnected(): boolean {
        return this._isConnected;
    }
}
