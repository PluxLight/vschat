import * as crypto from 'crypto';

export class Encryption {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly IV_LENGTH = 16;
    private static readonly SALT_LENGTH = 64;
    private static readonly TAG_LENGTH = 16;
    private static readonly KEY_LENGTH = 32;

    /**
     * 암호화 키 생성 (서버에서 사용)
     */
    public static generateKey(): string {
        return crypto.randomBytes(this.KEY_LENGTH).toString('hex');
    }

    /**
     * 메시지 암호화
     */
    public static encrypt(text: string, key: string): string {
        try {
            const keyBuffer = Buffer.from(key, 'hex');
            const iv = crypto.randomBytes(this.IV_LENGTH);
            const cipher = crypto.createCipheriv(this.ALGORITHM, keyBuffer, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const tag = cipher.getAuthTag();

            // IV + Tag + Encrypted Data 형식으로 결합
            return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('암호화 오류:', error);
            throw error;
        }
    }

    /**
     * 메시지 복호화
     */
    public static decrypt(encryptedData: string, key: string): string {
        try {
            const keyBuffer = Buffer.from(key, 'hex');
            const parts = encryptedData.split(':');
            
            if (parts.length !== 3) {
                throw new Error('잘못된 암호화 데이터 형식');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const tag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];

            const decipher = crypto.createDecipheriv(this.ALGORITHM, keyBuffer, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('복호화 오류:', error);
            throw error;
        }
    }

    /**
     * 암호화된 데이터인지 확인
     */
    public static isEncrypted(data: string): boolean {
        return data.includes(':') && data.split(':').length === 3;
    }
}
