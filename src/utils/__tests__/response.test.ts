import { describe, it, expect } from 'vitest';
import { responseUtility } from '../response';

describe('Response Utility', () => {
    it('should return the correct response', () => {
        const result = responseUtility();
        expect(result).toEqual('expected response');
    });
});