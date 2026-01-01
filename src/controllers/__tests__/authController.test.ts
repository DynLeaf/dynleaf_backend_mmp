import { describe, it, expect } from 'vitest';
import { authenticate } from '../../controllers/authController';

describe('Authentication Controller', () => {
    it('should authenticate a user with valid credentials', async () => {
        const result = await authenticate('validUser', 'validPassword');
        expect(result).toBeTruthy();
    });

    it('should not authenticate a user with invalid credentials', async () => {
        const result = await authenticate('invalidUser', 'invalidPassword');
        expect(result).toBeFalsy();
    });
});