// Integration test for User System API
import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:1337';

describe('User Authentication System Integration', () => {
    // Unique user for this test run to avoid conflicts
    const TEST_USER = `testuser_${Date.now()}`;
    const TEST_PASS = 'password123';

    it('should register a new user', async () => {
        const res = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user).toBeDefined();
        expect(data.user.username).toBe(TEST_USER);
        expect(data.user.passwordHash).toBeUndefined(); // Should not return hash
        expect(data.user.favorites).toEqual([]);
    });

    it('should fail to register existing user', async () => {
        const res = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
        });

        expect(res.status).toBe(409); // Conflict
    });

    it('should login successfully', async () => {
        const res = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user).toBeDefined();
        expect(data.user.username).toBe(TEST_USER);
    });

    it('should fail login with wrong password', async () => {
        const res = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, password: 'wrongpassword' })
        });

        expect(res.status).toBe(401); // Unauthorized
    });

    it('should toggle favorites', async () => {
        const TABLE_ID = 'Test_Table.yaml';

        // Add Favorite
        const res1 = await fetch(`${BASE_URL}/api/user/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, tableFilename: TABLE_ID })
        });

        expect(res1.status).toBe(200);
        const data1 = await res1.json();
        expect(data1.isFavorite).toBe(true);
        expect(data1.favorites).toContain(TABLE_ID);

        // Remove Favorite
        const res2 = await fetch(`${BASE_URL}/api/user/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER, tableFilename: TABLE_ID })
        });

        expect(res2.status).toBe(200);
        const data2 = await res2.json();
        expect(data2.isFavorite).toBe(false);
        expect(data2.favorites).not.toContain(TABLE_ID);
    });
});
