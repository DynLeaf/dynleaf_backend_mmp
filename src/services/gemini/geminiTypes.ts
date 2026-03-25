/**
 * Gemini AI Service - shared types, constants, and utility classes
 */

// ============================================================================
// Constants
// ============================================================================

export const MAX_IMAGE_SIZE_MB = 20;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const MAX_PDF_SIZE_MB = 30;
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 90000;
export const MENU_EXTRACTION_TIMEOUT_MS = 300000;
export const PDF_EXTRACTION_TIMEOUT_MS = 600000;

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_PAUSE_MS = 30000;

// ============================================================================
// Types
// ============================================================================

export interface DishInsight {
    pairing: string;
    funFact: string;
    tasteProfile: string[];
}

export interface MenuVariant { name: string; price: number; }
export interface MenuAddon { name: string; price: number; }

export interface MenuItem {
    name: string;
    description: string;
    price: number;
    category: string;
    itemType: 'food' | 'beverage';
    isVeg: boolean;
    isSpicy: boolean;
    variants?: MenuVariant[];
    addons?: MenuAddon[];
    isCombo?: boolean;
    comboItems?: string[];
    confidence?: 'high' | 'medium' | 'low';
    extractionNotes?: string;
}

export interface MenuExtractionResult {
    items: MenuItem[];
    metadata: {
        totalExtracted: number;
        categoriesFound: number;
        notes: string;
        confidence?: 'high' | 'medium' | 'low';
        imageQuality?: 'excellent' | 'good' | 'poor';
    };
}

export interface RateLimitConfig { requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number; }
export interface CacheEntry<T> { data: T; timestamp: number; ttl: number; expiresAt: number; }
export interface RetryConfig { maxRetries: number; initialDelayMs: number; maxDelayMs: number; backoffMultiplier: number; }

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
    private requestCounts: { perMinute: { count: number; resetAt: number }; perHour: { count: number; resetAt: number }; perDay: { count: number; resetAt: number } };

    constructor(private config: RateLimitConfig) {
        const now = Date.now();
        this.requestCounts = { perMinute: { count: 0, resetAt: now + 60000 }, perHour: { count: 0, resetAt: now + 3600000 }, perDay: { count: 0, resetAt: now + 86400000 } };
    }

    async checkLimit(): Promise<{ allowed: boolean; retryAfter?: number }> {
        const now = Date.now();
        if (now >= this.requestCounts.perMinute.resetAt) this.requestCounts.perMinute = { count: 0, resetAt: now + 60000 };
        if (now >= this.requestCounts.perHour.resetAt) this.requestCounts.perHour = { count: 0, resetAt: now + 3600000 };
        if (now >= this.requestCounts.perDay.resetAt) this.requestCounts.perDay = { count: 0, resetAt: now + 86400000 };
        if (this.requestCounts.perMinute.count >= this.config.requestsPerMinute) return { allowed: false, retryAfter: Math.ceil((this.requestCounts.perMinute.resetAt - now) / 1000) };
        if (this.requestCounts.perHour.count >= this.config.requestsPerHour) return { allowed: false, retryAfter: Math.ceil((this.requestCounts.perHour.resetAt - now) / 1000) };
        if (this.requestCounts.perDay.count >= this.config.requestsPerDay) return { allowed: false, retryAfter: Math.ceil((this.requestCounts.perDay.resetAt - now) / 1000) };
        return { allowed: true };
    }

    incrementCount(): void { this.requestCounts.perMinute.count++; this.requestCounts.perHour.count++; this.requestCounts.perDay.count++; }

    getStats() { return { perMinute: this.requestCounts.perMinute.count, perHour: this.requestCounts.perHour.count, perDay: this.requestCounts.perDay.count }; }
}

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager {
    private cache: Map<string, CacheEntry<unknown>>;
    private accessOrder: string[];
    private readonly maxSize: number;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.accessOrder = [];
        this.maxSize = maxSize;
        this.cleanupInterval = setInterval(() => { const now = Date.now(); for (const [k, e] of this.cache.entries()) { if (now >= e.expiresAt) { this.cache.delete(k); this.accessOrder = this.accessOrder.filter(x => x !== k); } } }, 300000);
    }

    set<T>(key: string, data: T, ttlSeconds: number): void {
        const now = Date.now(); const expiresAt = now + ttlSeconds * 1000;
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) { const lru = this.accessOrder.shift(); if (lru) this.cache.delete(lru); }
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
        this.cache.set(key, { data, timestamp: now, ttl: ttlSeconds * 1000, expiresAt });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiresAt) { this.cache.delete(key); this.accessOrder = this.accessOrder.filter(k => k !== key); return null; }
        this.accessOrder = this.accessOrder.filter(k => k !== key); this.accessOrder.push(key);
        return entry.data as T;
    }

    clear(): void { this.cache.clear(); this.accessOrder = []; }

    destroy(): void { if (this.cleanupInterval) { clearInterval(this.cleanupInterval); this.cleanupInterval = null; } this.clear(); }

    getStats() { const now = Date.now(); const expired = Array.from(this.cache.values()).filter(e => now >= e.expiresAt).length; return { size: this.cache.size, maxSize: this.maxSize, expired, active: this.cache.size - expired }; }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export class CircuitBreaker {
    private consecutiveFailures = 0;
    private pausedUntil: number | null = null;

    recordSuccess(): void { this.consecutiveFailures = 0; }

    recordFailure(): void {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) { this.pausedUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS; console.warn(`[CircuitBreaker] Opened after ${this.consecutiveFailures} consecutive 503s.`); }
    }

    async checkAndWait(): Promise<void> {
        if (this.pausedUntil !== null && Date.now() < this.pausedUntil) {
            const waitMs = this.pausedUntil - Date.now();
            await new Promise(resolve => setTimeout(resolve, waitMs));
            this.consecutiveFailures = 0; this.pausedUntil = null;
        }
    }

    getStats() { return { consecutiveFailures: this.consecutiveFailures, isOpen: this.pausedUntil !== null && Date.now() < this.pausedUntil, pausedUntil: this.pausedUntil }; }
}

// ============================================================================
// Retry Helper
// ============================================================================

export class RetryHelper {
    constructor(private config: RetryConfig) { }

    async executeWithRetry<T>(operation: () => Promise<T>, operationName: string, requestId?: string): Promise<T> {
        let lastError: Error | null = null;
        let delay = this.config.initialDelayMs;
        const tag = requestId ? `[${requestId}]` : '';

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                if (attempt > 0) { await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 2000))); delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelayMs); }
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (this.isNonRetryableError(error)) throw error;
                if (attempt === this.config.maxRetries) { console.error(`[RetryHelper]${tag} All ${this.config.maxRetries} retries failed for ${operationName}`); throw lastError; }
            }
        }
        throw lastError || new Error('Retry failed');
    }

    isNonRetryableError(error: unknown): boolean {
        const err = error as { message?: string; status?: number; httpStatus?: number; statusCode?: number };
        const message = err?.message?.toLowerCase() || '';
        const status = err?.status ?? err?.httpStatus ?? err?.statusCode;
        if (status === 503 || message.includes('service unavailable') || message.includes('high demand')) return false;
        return message.includes('rate limit') || message.includes('quota') || message.includes('invalid') || message.includes('unauthorized') || message.includes('forbidden') || status === 400 || status === 401 || status === 403 || status === 429;
    }

    isServiceUnavailable(error: unknown): boolean {
        const err = error as { message?: string; status?: number; httpStatus?: number; statusCode?: number };
        const message = err?.message?.toLowerCase() || '';
        const status = err?.status ?? err?.httpStatus ?? err?.statusCode;
        return status === 503 || message.includes('service unavailable') || message.includes('high demand');
    }
}
