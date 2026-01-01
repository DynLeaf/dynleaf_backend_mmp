import { describe, it, expect } from 'vitest';
import { tokenService } from '../tokenService';

describe('tokenService', () => {
    it('should generate a token', () => {
        const token = tokenService.generateToken({ id: 1 });
        expect(token).toBeDefined();
    });

    it('should verify a token', () => {
        const token = tokenService.generateToken({ id: 1 });
        const verified = tokenService.verifyToken(token);
        expect(verified).toEqual({ id: 1 });
    });

    it('should throw an error for an invalid token', () => {
        expect(() => tokenService.verifyToken('invalidToken')).toThrow();
    });
});