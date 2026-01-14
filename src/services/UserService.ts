import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { encrypt, decrypt, initEncryption } from './Encryption';

const USERS_DIR = path.resolve(process.cwd(), 'data', 'users');
const LEGACY_USERS_FILE = path.resolve(process.cwd(), 'data', 'users.json');

export interface UserSecrets {
    geminiApiKey?: string;
}

export interface UserFavorites {
    tables: string[];
    cards: any[];
}

export interface UserPreferences {
    theme?: 'dark' | 'light';
    defaultLLMProvider?: 'local' | 'gemini';
}

export interface User {
    username: string;
    email?: string;
    passwordHash: string;
    isAdmin?: boolean;
    secrets?: UserSecrets;
    favorites?: UserFavorites;
    preferences?: UserPreferences;
    resetToken?: string | null;
    resetTokenExpiry?: number | null;
}

/**
 * Ensure the users directory exists.
 */
function ensureUsersDir(): void {
    if (!fs.existsSync(USERS_DIR)) {
        fs.mkdirSync(USERS_DIR, { recursive: true });
        console.log('[UserService] Created users directory:', USERS_DIR);
    }
}

/**
 * Get the file path for a user.
 */
function getUserFilePath(username: string): string {
    // Sanitize username for filesystem safety
    const safeName = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(USERS_DIR, `${safeName}.json`);
}

/**
 * Load a user from their individual file.
 */
export function loadUser(username: string): User | null {
    ensureUsersDir();
    const filePath = getUserFilePath(username);

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as User;
    } catch (e) {
        console.error(`[UserService] Failed to load user ${username}:`, e);
        return null;
    }
}

/**
 * Save a user to their individual file.
 */
export function saveUser(user: User): void {
    ensureUsersDir();
    const filePath = getUserFilePath(user.username);

    try {
        fs.writeFileSync(filePath, JSON.stringify(user, null, 2));
    } catch (e) {
        console.error(`[UserService] Failed to save user ${user.username}:`, e);
        throw e;
    }
}

/**
 * List all usernames.
 */
export function listUsers(): string[] {
    ensureUsersDir();

    try {
        const files = fs.readdirSync(USERS_DIR);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        console.error('[UserService] Failed to list users:', e);
        return [];
    }
}

/**
 * Find a user by username (case-insensitive search).
 */
export function findUser(username: string): User | null {
    const users = listUsers();
    const match = users.find(u => u.toLowerCase() === username.toLowerCase());
    if (match) {
        return loadUser(match);
    }
    return null;
}

/**
 * Hash a password using SHA256.
 */
export function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Get decrypted secrets for a user.
 */
export function getUserSecrets(username: string): UserSecrets | null {
    const user = loadUser(username);
    if (!user || !user.secrets) return null;

    const decrypted: UserSecrets = {};

    if (user.secrets.geminiApiKey) {
        try {
            decrypted.geminiApiKey = decrypt(user.secrets.geminiApiKey);
        } catch (e) {
            console.error(`[UserService] Failed to decrypt geminiApiKey for ${username}`);
        }
    }

    return decrypted;
}

/**
 * Set encrypted secrets for a user.
 */
export function setUserSecrets(username: string, secrets: UserSecrets): void {
    const user = loadUser(username);
    if (!user) throw new Error('User not found');

    user.secrets = user.secrets || {};

    if (secrets.geminiApiKey) {
        user.secrets.geminiApiKey = encrypt(secrets.geminiApiKey);
    }

    saveUser(user);
}

/**
 * Migrate legacy users.json to individual files.
 */
export function migrateLegacyUsers(): void {
    ensureUsersDir();
    initEncryption();

    if (!fs.existsSync(LEGACY_USERS_FILE)) {
        console.log('[UserService] No legacy users.json found. Skipping migration.');
        return;
    }

    try {
        const content = fs.readFileSync(LEGACY_USERS_FILE, 'utf-8');
        const legacyUsers = JSON.parse(content) as any[];

        console.log(`[UserService] Migrating ${legacyUsers.length} users from legacy format...`);

        for (const legacy of legacyUsers) {
            // Skip test users (optional, but makes sense to clean up)
            if (legacy.username.startsWith('testuser_') ||
                legacy.username.startsWith('admin_') ||
                legacy.username.startsWith('user_')) {
                continue;
            }

            const newUser: User = {
                username: legacy.username,
                email: legacy.email || '',
                passwordHash: legacy.passwordHash,
                isAdmin: legacy.isAdmin || false,
                secrets: {},
                favorites: {
                    tables: legacy.favorites || [],
                    cards: []
                },
                preferences: {
                    theme: 'dark',
                    defaultLLMProvider: 'local'
                },
                resetToken: legacy.resetToken || null,
                resetTokenExpiry: legacy.resetTokenExpiry || null
            };

            // Check if user file already exists
            const filePath = getUserFilePath(newUser.username);
            if (!fs.existsSync(filePath)) {
                saveUser(newUser);
                console.log(`[UserService] Migrated user: ${newUser.username}`);
            } else {
                console.log(`[UserService] User ${newUser.username} already exists, skipping.`);
            }
        }

        // Rename legacy file to backup
        const backupPath = LEGACY_USERS_FILE.replace('.json', '.backup.json');
        fs.renameSync(LEGACY_USERS_FILE, backupPath);
        console.log(`[UserService] Legacy users.json backed up to ${backupPath}`);

    } catch (e) {
        console.error('[UserService] Migration failed:', e);
    }
}

/**
 * Create a new user.
 */
export function createUser(username: string, password: string, email?: string, isAdmin = false): User {
    ensureUsersDir();

    if (findUser(username)) {
        throw new Error('Username already exists');
    }

    const newUser: User = {
        username,
        email: email || '',
        passwordHash: hashPassword(password),
        isAdmin,
        secrets: {},
        favorites: {
            tables: [],
            cards: []
        },
        preferences: {
            theme: 'dark',
            defaultLLMProvider: 'local'
        },
        resetToken: null,
        resetTokenExpiry: null
    };

    saveUser(newUser);
    return newUser;
}

/**
 * Verify user credentials.
 */
export function verifyCredentials(username: string, password: string): User | null {
    const user = findUser(username);
    if (!user) return null;

    if (user.passwordHash === hashPassword(password)) {
        return user;
    }

    return null;
}
