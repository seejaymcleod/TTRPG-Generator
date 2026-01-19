// Utility script to decrypt the Gemini API key and update .env
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Read encryption key from .env
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const match = envContent.match(/^ENCRYPTION_KEY=([a-fA-F0-9]{64})$/m);
if (!match) {
    console.error('ENCRYPTION_KEY not found in .env');
    process.exit(1);
}
const encryptionKey = Buffer.from(match[1], 'hex');

// Read user file
const userPath = path.resolve(__dirname, '../data/users/SeeJayMac.json');
const userData = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
const encryptedKey = userData.secrets?.geminiApiKey;

if (!encryptedKey) {
    console.error('geminiApiKey not found in user file');
    process.exit(1);
}

// Decrypt
function decrypt(ciphertext) {
    const combined = Buffer.from(ciphertext, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}

const apiKey = decrypt(encryptedKey);
console.log('Decrypted API Key:', apiKey);

// Update .env to add GEMINI_API_KEY if not present
if (!envContent.includes('GEMINI_API_KEY=')) {
    const newEnvContent = envContent.trim() + `\nGEMINI_API_KEY=${apiKey}\n`;
    fs.writeFileSync(envPath, newEnvContent);
    console.log('.env updated with GEMINI_API_KEY');
} else {
    console.log('GEMINI_API_KEY already present in .env');
}
