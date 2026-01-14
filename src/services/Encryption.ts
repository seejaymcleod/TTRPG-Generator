import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let encryptionKey: Buffer | null = null;

/**
 * Get or generate the encryption key.
 * Key is stored in .env file as ENCRYPTION_KEY (hex-encoded).
 */
function getEncryptionKey(): Buffer {
    if (encryptionKey) return encryptionKey;

    const envPath = path.resolve(process.cwd(), '.env');
    let keyHex: string | undefined;

    // Try to read from .env
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^ENCRYPTION_KEY=([a-fA-F0-9]{64})$/m);
        if (match) {
            keyHex = match[1];
        }
    }

    // Generate key if not found
    if (!keyHex) {
        console.log('[Encryption] Generating new encryption key...');
        const newKey = crypto.randomBytes(KEY_LENGTH);
        keyHex = newKey.toString('hex');

        // Append to .env
        const envLine = `\nENCRYPTION_KEY=${keyHex}\n`;
        fs.appendFileSync(envPath, envLine);
        console.log('[Encryption] Key saved to .env');
    }

    encryptionKey = Buffer.from(keyHex, 'hex');
    return encryptionKey;
}

/**
 * Encrypt a plaintext string.
 * Returns base64-encoded string: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine: IV + AuthTag + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext.
 * Expects format: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function decrypt(ciphertext: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext, 'base64');

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}

/**
 * Initialize encryption (call on server startup to ensure key exists).
 */
export function initEncryption(): void {
    getEncryptionKey();
    console.log('[Encryption] Initialized.');
}
