/**
 * Migration Script: Run once to migrate users and set up SeeJayMac's API key.
 * Usage: npx ts-node scripts/migrate-users.ts
 */

import { migrateLegacyUsers, loadUser, saveUser, setUserSecrets } from '../src/services/UserService';
import { initEncryption } from '../src/services/Encryption';

async function main() {
    console.log('=== User Migration Script ===\n');

    // Initialize encryption (generates key if needed)
    initEncryption();

    // Migrate legacy users.json
    migrateLegacyUsers();

    // Set SeeJayMac's Gemini API Key
    const seejaymac = loadUser('SeeJayMac');
    if (seejaymac) {
        console.log('\n[Migration] Setting SeeJayMac Gemini API Key...');
        setUserSecrets('SeeJayMac', {
            geminiApiKey: 'AIzaSyBkA-E8Ar6XBtncNEXY6Q0RB_l3Mp2p1UY'
        });

        // Update preferences
        seejaymac.preferences = {
            theme: 'dark',
            defaultLLMProvider: 'gemini'
        };
        saveUser(seejaymac);

        console.log('[Migration] SeeJayMac configured with Gemini as default provider.');
    } else {
        console.log('[Migration] SeeJayMac user not found after migration!');
    }

    console.log('\n=== Migration Complete ===');
}

main().catch(console.error);
