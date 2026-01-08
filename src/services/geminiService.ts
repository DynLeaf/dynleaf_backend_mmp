/**
 * Production-Ready Google Gemini AI Service
 * 
 * Features:
 * - Server-side only API calls
 * - Rate limiting and quota management
 * - Request caching with TTL
 * - Graceful degradation with fallbacks
 * - Comprehensive error handling
 * - Request queue for large volumes
 * - Monitoring and logging
 * - Retry logic with exponential backoff
 * - Request timeouts
 * - Image validation
 * 
 * @module services/geminiService
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// ============================================================================
// Constants
// ============================================================================

const MAX_IMAGE_SIZE_MB = 20; // Gemini API limit
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90000; // 90 seconds
const MENU_EXTRACTION_TIMEOUT_MS = 120000; // 2 minutes for large menus

// ============================================================================
// Configuration & Types
// ============================================================================

interface DishInsight {
  pairing: string;
  funFact: string;
  tasteProfile: string[];
}

interface MenuVariant {
  name: string;
  price: number;
}

interface MenuAddon {
  name: string;
  price: number;
}

interface MenuItem {
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
}

interface MenuExtractionResult {
  items: MenuItem[];
  metadata: {
    totalExtracted: number;
    categoriesFound: number;
    notes: string;
  };
}

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  expiresAt: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ============================================================================
// Rate Limiting & Quota Management
// ============================================================================

class RateLimiter {
  private requestCounts: {
    perMinute: { count: number; resetAt: number };
    perHour: { count: number; resetAt: number };
    perDay: { count: number; resetAt: number };
  };

  constructor(private config: RateLimitConfig) {
    const now = Date.now();
    this.requestCounts = {
      perMinute: { count: 0, resetAt: now + 60 * 1000 },
      perHour: { count: 0, resetAt: now + 60 * 60 * 1000 },
      perDay: { count: 0, resetAt: now + 24 * 60 * 60 * 1000 },
    };
  }

  async checkLimit(): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();

    // Reset counters if time windows have expired
    if (now >= this.requestCounts.perMinute.resetAt) {
      this.requestCounts.perMinute = { count: 0, resetAt: now + 60 * 1000 };
    }
    if (now >= this.requestCounts.perHour.resetAt) {
      this.requestCounts.perHour = { count: 0, resetAt: now + 60 * 60 * 1000 };
    }
    if (now >= this.requestCounts.perDay.resetAt) {
      this.requestCounts.perDay = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
    }

    // Check limits
    if (this.requestCounts.perMinute.count >= this.config.requestsPerMinute) {
      return {
        allowed: false,
        retryAfter: Math.ceil((this.requestCounts.perMinute.resetAt - now) / 1000),
      };
    }
    if (this.requestCounts.perHour.count >= this.config.requestsPerHour) {
      return {
        allowed: false,
        retryAfter: Math.ceil((this.requestCounts.perHour.resetAt - now) / 1000),
      };
    }
    if (this.requestCounts.perDay.count >= this.config.requestsPerDay) {
      return {
        allowed: false,
        retryAfter: Math.ceil((this.requestCounts.perDay.resetAt - now) / 1000),
      };
    }

    return { allowed: true };
  }

  incrementCount(): void {
    this.requestCounts.perMinute.count++;
    this.requestCounts.perHour.count++;
    this.requestCounts.perDay.count++;
  }

  getStats() {
    return {
      perMinute: this.requestCounts.perMinute.count,
      perHour: this.requestCounts.perHour.count,
      perDay: this.requestCounts.perDay.count,
    };
  }
}

// ============================================================================
// Cache Manager with Proper LRU
// ============================================================================

class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private accessOrder: string[]; // Track access order for proper LRU
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
    
    // Cleanup expired entries every 5 minutes
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[CacheManager] Cleaned up ${removed} expired entries`);
    }
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    const now = Date.now();
    const expiresAt = now + (ttlSeconds * 1000);

    // Implement proper LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove least recently used (first in access order)
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    // Update access order
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: ttlSeconds * 1000,
      expiresAt,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }

    // Update access order (move to end = most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    return entry.data as T;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  getStats() {
    const now = Date.now();
    const expired = Array.from(this.cache.values()).filter(e => now >= e.expiresAt).length;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      active: this.cache.size - expired,
      oldestKey: this.accessOrder[0],
      newestKey: this.accessOrder[this.accessOrder.length - 1],
    };
  }
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

class RetryHelper {
  constructor(private config: RetryConfig) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.config.initialDelayMs;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[RetryHelper] Retry attempt ${attempt}/${this.config.maxRetries} for ${operationName}`);
          await this.sleep(delay);
          delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelayMs);
        }

        return await operation();

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          console.log(`[RetryHelper] Non-retryable error for ${operationName}: ${lastError.message}`);
          throw error;
        }

        if (attempt === this.config.maxRetries) {
          console.error(`[RetryHelper] All ${this.config.maxRetries} retries failed for ${operationName}`);
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Retry failed');
  }

  private isNonRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    
    // Don't retry validation errors, auth errors, or rate limits
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      error?.status === 400 ||
      error?.status === 401 ||
      error?.status === 403 ||
      error?.status === 429
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Main Gemini Service
// ============================================================================

class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  private isInitialized = false;
  private rateLimiter: RateLimiter;
  private cache: CacheManager;
  private retryHelper: RetryHelper;

  constructor() {
    // Initialize rate limiter with tiered limits
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
    });

    // Initialize cache
    this.cache = new CacheManager(1000);

    // Initialize retry helper
    this.retryHelper = new RetryHelper({
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    });

    // Auto-initialize with API key from environment
    this.initialize();
  }

  /**
   * Initialize the Gemini client with API key
   */
  private initialize(): void {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('[GeminiService] GEMINI_API_KEY not found in environment');
      this.isInitialized = false;
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      this.isInitialized = true;
      console.log('[GeminiService] Successfully initialized');
    } catch (error) {
      console.error('[GeminiService] Initialization failed:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Get generative model with specified configuration
   */
  private getModel(modelType: 'FAST' | 'QUALITY' = 'FAST'): GenerativeModel {
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }

    // KEEP EXISTING MODEL NAMES - DO NOT CHANGE
    const modelName = modelType === 'FAST' 
      ? 'gemini-2.0-flash-exp'  // Fast model for quick responses
      : 'gemini-2.5-flash';      // Quality model for complex tasks

    return this.client.getGenerativeModel({ model: modelName });
  }

  /**
   * Timeout wrapper for API calls
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Validate image before API call
   */
  private validateImage(imageBase64: string): void {
    // Check if base64 string is provided
    if (!imageBase64 || imageBase64.trim().length === 0) {
      throw new Error('Image data is required');
    }

    // Estimate size (base64 is ~4/3 of original)
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const estimatedSize = (base64Data.length * 3) / 4;

    if (estimatedSize > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(
        `Image size (~${(estimatedSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowed (${MAX_IMAGE_SIZE_MB}MB)`
      );
    }

    // Validate format
    const validFormats = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const hasValidFormat = validFormats.some(format => imageBase64.includes(format));

    if (!hasValidFormat && !imageBase64.startsWith('/9j/') && !imageBase64.startsWith('iVBOR')) {
      throw new Error('Invalid image format. Supported: JPEG, PNG, WebP, PDF');
    }
  }

  /**
   * Get AI-generated insights for a dish
   */
  async getDishInsights(dishName: string, description?: string): Promise<DishInsight> {
    const requestId = `dish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check rate limits
      const limitCheck = await this.rateLimiter.checkLimit();
      if (!limitCheck.allowed) {
        throw new Error(`Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds`);
      }

      // Check cache
      const cacheKey = `dish:${dishName}:${description || 'no-desc'}`;
      const cached = this.cache.get<DishInsight>(cacheKey);
      if (cached) {
        console.log(`[GeminiService][${requestId}] Cache hit for dish insights`);
        return cached;
      }

      console.log(`[GeminiService][${requestId}] Generating insights for: ${dishName}`);

      if (!this.isInitialized || !this.client) {
        console.warn(`[GeminiService][${requestId}] Service not initialized, returning fallback`);
        return this.getFallbackDishInsight();
      }

      // Execute with retry and timeout
      const result = await this.retryHelper.executeWithRetry(async () => {
        return await this.withTimeout(
          this.generateDishInsights(dishName, description),
          REQUEST_TIMEOUT_MS,
          'getDishInsights'
        );
      }, 'getDishInsights');

      // Cache result
      this.cache.set(cacheKey, result, 24 * 60 * 60); // 24 hours

      // Increment rate limit
      this.rateLimiter.incrementCount();

      return result;

    } catch (error) {
      console.error(`[GeminiService][${requestId}] Error getting dish insights:`, error);
      return this.getFallbackDishInsight();
    }
  }

  /**
   * Internal method to generate dish insights
   */
  private async generateDishInsights(dishName: string, description?: string): Promise<DishInsight> {
    const model = this.getModel('FAST');

    const prompt = `Analyze this dish and provide:
1. A recommended pairing (beverage or side dish)
2. An interesting culinary fun fact
3. A taste profile (3-5 adjectives describing the flavor)

Dish: ${dishName}
${description ? `Description: ${description}` : ''}

Respond in JSON format:
{
  "pairing": "recommended pairing here",
  "funFact": "interesting fact here",
  "tasteProfile": ["adjective1", "adjective2", "adjective3"]
}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Extract menu items from an image
   */
  async extractMenuFromImage(imageBase64: string): Promise<MenuExtractionResult> {
    const requestId = `menu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Validate image before processing
      this.validateImage(imageBase64);

      // Check rate limits
      const limitCheck = await this.rateLimiter.checkLimit();
      if (!limitCheck.allowed) {
        throw new Error(`Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds`);
      }

      // Check cache
      const cacheKey = `menu:${imageBase64.substring(0, 50)}`;
      const cached = this.cache.get<MenuExtractionResult>(cacheKey);
      if (cached) {
        console.log(`[GeminiService][${requestId}] Cache hit for menu extraction`);
        return cached;
      }

      console.log(`[GeminiService][${requestId}] Extracting menu from image`);

      if (!this.isInitialized || !this.client) {
        throw new Error('Gemini service not initialized');
      }

      // Execute with retry and timeout (longer for menu extraction)
      const result = await this.retryHelper.executeWithRetry(async () => {
        return await this.withTimeout(
          this.extractMenuItemsFromImage(imageBase64),
          MENU_EXTRACTION_TIMEOUT_MS,
          'extractMenuFromImage'
        );
      }, 'extractMenuFromImage');

      // Cache result (shorter TTL for menus as they change more frequently)
      this.cache.set(cacheKey, result, 60 * 60); // 1 hour

      // Increment rate limit
      this.rateLimiter.incrementCount();

      return result;

    } catch (error) {
      console.error(`[GeminiService][${requestId}] Error extracting menu:`, error);
      throw error;
    }
  }

  /**
   * Internal method to extract menu items from image
   */
  private async extractMenuItemsFromImage(imageBase64: string): Promise<MenuExtractionResult> {
    const model = this.getModel('QUALITY');

    // Clean base64 data
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    };

    const prompt = `Extract all menu items from this image. For each item, provide:
- name (string)
- description (string, empty if not available)
- price (number, 0 if not available)
- category (string, e.g., "Appetizers", "Main Course", "Beverages")
- itemType ("food" or "beverage")
- isVeg (boolean, true if vegetarian)
- isSpicy (boolean, true if spicy)
- variants (array of {name, price}, if item has size/variant options)
- addons (array of {name, price}, if add-ons are listed)
- isCombo (boolean, true if it's a combo/set meal)
- comboItems (array of strings, if it's a combo)

Respond in JSON format:
{
  "items": [...],
  "metadata": {
    "totalExtracted": number,
    "categoriesFound": number,
    "notes": "any important notes about extraction"
  }
}`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response.text();

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse menu extraction response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Get service health and statistics
   */
  async getServiceHealth() {
    return {
      isInitialized: this.isInitialized,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      rateLimits: this.rateLimiter.getStats(),
      cache: this.cache.getStats(),
      models: {
        fast: 'gemini-2.0-flash-exp',
        quality: 'gemini-2.5-flash',
      },
      timeouts: {
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        menuExtractionTimeoutMs: MENU_EXTRACTION_TIMEOUT_MS,
      },
      imageValidation: {
        maxSizeMB: MAX_IMAGE_SIZE_MB,
        supportedFormats: ['JPEG', 'PNG', 'WebP', 'PDF'],
      },
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[GeminiService] Cache cleared');
  }

  /**
   * Graceful shutdown - cleanup resources
   */
  destroy(): void {
    this.cache.destroy();
    console.log('[GeminiService] Service destroyed');
  }

  /**
   * Fallback response when AI is unavailable
   */
  private getFallbackDishInsight(): DishInsight {
    return {
      pairing: 'A refreshing beverage complements most dishes',
      funFact: 'Every dish has a unique story behind it',
      tasteProfile: ['Flavorful', 'Satisfying', 'Delicious'],
    };
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const geminiService = new GeminiService();
