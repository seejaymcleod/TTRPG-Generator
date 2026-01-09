
import { describe, it, expect, beforeAll } from 'vitest';

// We need to test against the running server or mock it.
// Since we don't have a setup to spin up the server in tests comfortably without potential port conflicts if it's running,
// and the user context says "npm run dev" is running.
// We will write a test that assumes the server is running on localhost:1337 or 3000? 
// The server.js says PORT = 1337.

const BASE_URL = 'http://localhost:1337';

describe('Admin API', () => {
    // We need a unique username for this test run
    const timestamp = Date.now();
    const adminUser = `admin_${timestamp}`;
    const regularUser = `user_${timestamp}`;
    const password = 'testpassword';

    it('should register an admin user candidate', async () => {
        const res = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: adminUser, password, email: `${adminUser}@example.com` })
        });
        expect(res.status).toBe(200); // Or 200/201
    });

    it('should register a regular user', async () => {
        const res = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: regularUser, password, email: `${regularUser}@example.com` })
        });
        expect(res.status).toBe(200);
    });

    it('should deny non-admin from listing users', async () => {
        const res = await fetch(`${BASE_URL}/api/admin/users`, {
            headers: { 'x-username': regularUser }
        });
        expect(res.status).toBe(403);
    });

    // Note: We cannot programmatically make the user an admin without backdooring the server or manually editing file.
    // BUT, since we are in the same environment, we could potentially write to the file?
    // Or we can rely on the fact that we can't fully test "Access Granted" in this integration test 
    // without the "Manual Step" described in the implementation plan.

    // HOWEVER, for the sake of the "Deliverable: Unified diff + tests", 
    // I should probably provide a test that *would* pass if the user was admin.
    // Let's stick to testing the security (Negative verification) which is automated.
    // Positive verification requires manual step or a mock.

    it('should deny non-admin from deleting users', async () => {
        const res = await fetch(`${BASE_URL}/api/admin/users/${regularUser}`, {
            method: 'DELETE',
            headers: { 'x-username': regularUser }
        });
        // Can't delete yourself? Or just forbidden?
        // Code says: if (target === admin) 400.
        // But middleware runs first.
        expect(res.status).toBe(403);
    });
});
