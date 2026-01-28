import * as WebSocket from 'ws';
import * as os from 'os';
import * as vscode from 'vscode';
import { Encryption } from './crypto';

export interface ChatMessage {
    type: 'message' | 'system' | 'userList' | 'setUsername' | 'requestUserList' | 'encryptionKey';
    username: string;
    message: string;
    timestamp: number;
    userList?: UserInfo[];
    encrypted?: boolean;
    encryptionKey?: string;
}

export interface UserInfo {
    username: string;
    ip: string;
    connectedAt: number;
}

interface ClientInfo {
    username: string;
    ip: string;
    connectedAt: number;
}

export class ChatServer {
    private wss: WebSocket.Server | undefined;
    private clients: Set<WebSocket> = new Set();
    private clientInfo: Map<WebSocket, ClientInfo> = new Map();
    private _port: number;
    private _isRunning: boolean = false;
    private _encryptionKey: string | undefined;

    constructor(port: number) {
        this._port = port;
    }

    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // 암호화 키 생성
                this._encryptionKey = Encryption.generateKey();
                console.log('암호화 키가 생성되었습니다.');

                this.wss = new WebSocket.Server({ port: this._port });

                this.wss.on('listening', () => {
                    this._isRunning = true;
                    console.log(`채팅 서버가 포트 ${this._port}에서 시작되었습니다.`);
                    resolve();
                });

                this.wss.on('error', (error: Error) => {
                    this._isRunning = false;
                    reject(error);
                });

                this.wss.on('connection', (ws: WebSocket, req) => {
                    console.log('새 클라이언트 연결됨');
                    this.clients.add(ws);

                    // 클라이언트 IP 주소 추출
                    const clientIp = req.socket.remoteAddress || 'unknown';
                    const ip = clientIp.replace('::ffff:', ''); // IPv4 매핑 제거

                    // 기본 클라이언트 정보 저장 (닉네임은 나중에 설정)
                    const clientInfo: ClientInfo = {
                        username: `User${this.clients.size}`,
                        ip: ip,
                        connectedAt: Date.now()
                    };
                    this.clientInfo.set(ws, clientInfo);

                    // 연결 환영 메시지
                    this.broadcast({
                        type: 'system',
                        username: 'System',
                        message: '새 사용자가 채팅방에 입장했습니다.',
                        timestamp: Date.now()
                    }, ws);

                    // 암호화 키 전송 (새로 들어온 클라이언트에게)
                    if (this._encryptionKey) {
                        const keyMessage: ChatMessage = {
                            type: 'encryptionKey',
                            username: 'System',
                            message: '',
                            timestamp: Date.now(),
                            encryptionKey: this._encryptionKey
                        };
                        ws.send(JSON.stringify(keyMessage));
                    }

                    // 현재 접속자 목록 전송 (새로 들어온 클라이언트에게)
                    this.sendUserList(ws);
                    
                    // 모든 클라이언트에게 접속자 목록 업데이트 브로드캐스트
                    this.broadcastUserList();

                    ws.on('message', (data: WebSocket.Data) => {
                        try {
                            const message: ChatMessage = JSON.parse(data.toString());
                            
                            if (message.type === 'message') {
                                // 메시지 전송 시 현재 닉네임 사용
                                const info = this.clientInfo.get(ws);
                                if (info) {
                                    message.username = info.username;
                                }
                                
                                // 메시지 암호화
                                if (this._encryptionKey && message.message) {
                                    try {
                                        message.message = Encryption.encrypt(message.message, this._encryptionKey);
                                        message.encrypted = true;
                                    } catch (error) {
                                        console.error('메시지 암호화 실패:', error);
                                    }
                                }
                                
                                this.broadcast(message, ws);
                            } else if (message.type === 'setUsername') {
                                // 닉네임 설정
                                const info = this.clientInfo.get(ws);
                                if (info) {
                                    const oldUsername = info.username;
                                    info.username = message.username || info.username;
                                    console.log(`닉네임 변경: ${oldUsername} -> ${info.username}`);
                                    
                                    // 접속자 목록 업데이트 브로드캐스트
                                    this.broadcastUserList();
                                }
                            } else if (message.type === 'requestUserList') {
                                // 접속자 목록 요청
                                this.sendUserList(ws);
                            }
                        } catch (error) {
                            console.error('메시지 처리 오류:', error);
                        }
                    });

                    ws.on('close', () => {
                        console.log('클라이언트 연결 종료');
                        this.clients.delete(ws);
                        this.clientInfo.delete(ws);
                        
                        this.broadcast({
                            type: 'system',
                            username: 'System',
                            message: '사용자가 채팅방을 나갔습니다.',
                            timestamp: Date.now()
                        });
                        
                        // 접속자 목록 업데이트
                        this.broadcastUserList();
                    });

                    ws.on('error', (error: Error) => {
                        console.error('WebSocket 오류:', error);
                        this.clients.delete(ws);
                        this.clientInfo.delete(ws);
                        this.broadcastUserList();
                    });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    public stop(): void {
        if (this.wss) {
            // 모든 클라이언트에게 연결 종료 알림
            this.broadcast({
                type: 'system',
                username: 'System',
                message: '서버가 종료됩니다.',
                timestamp: Date.now()
            });

            // 모든 클라이언트 연결 종료
            this.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
            this.clients.clear();
            this.clientInfo.clear();

            // 서버 종료
            this.wss.close(() => {
                console.log('채팅 서버가 종료되었습니다.');
            });
            this.wss = undefined;
            this._isRunning = false;
        }
    }

    private broadcast(message: ChatMessage, excludeClient?: WebSocket): void {
        const messageStr = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    private getUserList(): UserInfo[] {
        const userList: UserInfo[] = [];
        this.clientInfo.forEach((info) => {
            userList.push({
                username: info.username,
                ip: info.ip,
                connectedAt: info.connectedAt
            });
        });
        return userList;
    }

    private sendUserList(ws: WebSocket): void {
        if (ws.readyState === WebSocket.OPEN) {
            const message: ChatMessage = {
                type: 'userList',
                username: 'System',
                message: '',
                timestamp: Date.now(),
                userList: this.getUserList()
            };
            ws.send(JSON.stringify(message));
        }
    }

    private broadcastUserList(): void {
        const message: ChatMessage = {
            type: 'userList',
            username: 'System',
            message: '',
            timestamp: Date.now(),
            userList: this.getUserList()
        };
        this.broadcast(message);
    }

    public isRunning(): boolean {
        return this._isRunning;
    }

    public getPort(): number {
        return this._port;
    }

    public getHostname(): string {
        const interfaces = os.networkInterfaces();
        
        // IPv4 주소 찾기 (로컬호스트 제외)
        for (const name of Object.keys(interfaces)) {
            const nets = interfaces[name];
            if (nets) {
                for (const net of nets) {
                    if (net.family === 'IPv4' && !net.internal) {
                        return net.address;
                    }
                }
            }
        }
        
        // 로컬호스트 주소 반환
        return 'localhost';
    }

    public getClientCount(): number {
        return this.clients.size;
    }
}
