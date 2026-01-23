const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Logic mapped from src/services/Encryption.ts
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
    // Read from .env in project root
    const envPath = path.resolve(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) {
        console.error("No .env found at", envPath);
        process.exit(1);
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^ENCRYPTION_KEY=([a-fA-F0-9]{64})$/m);
    if (!match) {
        console.error("No ENCRYPTION_KEY found in .env");
        process.exit(1);
    }
    return Buffer.from(match[1], 'hex');
}

function decrypt(ciphertext) {
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

const encryptedInput = process.argv[2];
if (!encryptedInput) {
    console.error("Usage: node decrypt_key.js <encrypted_string>");
    process.exit(1);
}

try {
    const result = decrypt(encryptedInput);
    console.log(result);
} catch (e) {
    console.error("Decryption Failed:", e.message);
    process.exit(1);
}
