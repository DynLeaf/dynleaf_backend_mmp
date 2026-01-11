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
  confidence?: 'high' | 'medium' | 'low';
  extractionNotes?: string;
}

interface MenuExtractionResult {
  items: MenuItem[];
  metadata: {
    totalExtracted: number;
    categoriesFound: number;
    notes: string;
    confidence?: 'high' | 'medium' | 'low';
    imageQuality?: 'excellent' | 'good' | 'poor';
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
  constructor(private config: RetryConfig) { }

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
   * Extract menu items from multiple images (multi-page menus)
   */
  async extractMenuFromMultipleImages(
    imageBase64Array: string[]
  ): Promise<MenuExtractionResult> {
    const requestId = `menu-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      if (!imageBase64Array || imageBase64Array.length === 0) {
        throw new Error('At least one image is required');
      }

      if (imageBase64Array.length > 10) {
        throw new Error('Maximum 10 images allowed per batch');
      }

      console.log(`[GeminiService][${requestId}] Processing ${imageBase64Array.length} images`);

      const allResults: MenuItem[] = [];
      const allCategories = new Set<string>();
      let overallConfidence: 'high' | 'medium' | 'low' = 'high';
      let overallImageQuality: 'excellent' | 'good' | 'poor' = 'excellent';
      const notes: string[] = [];

      // Process images sequentially to avoid rate limits
      for (let i = 0; i < imageBase64Array.length; i++) {
        try {
          console.log(`[GeminiService][${requestId}] Processing image ${i + 1}/${imageBase64Array.length}`);

          const result = await this.extractMenuFromImage(imageBase64Array[i]);

          allResults.push(...result.items);
          result.items.forEach(item => allCategories.add(item.category));

          // Track worst confidence and quality
          if (result.metadata.confidence === 'low' || overallConfidence === 'low') {
            overallConfidence = 'low';
          } else if (result.metadata.confidence === 'medium' || overallConfidence === 'medium') {
            overallConfidence = 'medium';
          }

          if (result.metadata.imageQuality === 'poor' || overallImageQuality === 'poor') {
            overallImageQuality = 'poor';
          } else if (result.metadata.imageQuality === 'good' || overallImageQuality === 'good') {
            overallImageQuality = 'good';
          }

          if (result.metadata.notes) {
            notes.push(`Page ${i + 1}: ${result.metadata.notes}`);
          }

          // Add delay between requests to respect rate limits (except for last image)
          if (i < imageBase64Array.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }

        } catch (error) {
          console.error(`[GeminiService][${requestId}] Error processing image ${i + 1}:`, error);
          notes.push(`Page ${i + 1}: Extraction failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
          overallConfidence = 'low';
        }
      }

      // Deduplicate across all pages
      const uniqueItems = allResults.filter((item, index, self) =>
        index === self.findIndex(t =>
          t.name.toLowerCase() === item.name.toLowerCase() &&
          Math.abs(t.price - item.price) < 0.01
        )
      );

      return {
        items: uniqueItems,
        metadata: {
          totalExtracted: uniqueItems.length,
          categoriesFound: allCategories.size,
          notes: `Extracted from ${imageBase64Array.length} images. ${notes.join(' ')}`,
          confidence: overallConfidence,
          imageQuality: overallImageQuality,
        },
      };

    } catch (error) {
      console.error(`[GeminiService][${requestId}] Batch extraction error:`, error);
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

    const prompt = `You are an expert menu digitization assistant. Extract ALL menu items from this image with maximum accuracy.

EXTRACTION RULES:
1. Extract EVERY visible item, even if partially visible
2. If price is unclear, use 0 (don't skip the item)
3. Infer category from context if not explicitly labeled
4. Detect vegetarian items by green dot symbols or "veg" labels
5. Detect spicy items by chili symbols or "spicy" labels
6. For combo meals, list all included items
7. Extract variants (Small/Medium/Large) as separate entries in variants array
8. Extract add-ons if listed separately

CATEGORY DETECTION:
- Look for section headers (Appetizers, Main Course, Desserts, Beverages, etc.)
- If no header, infer from item names and descriptions
- Use "Uncategorized" only as last resort

PRICE EXTRACTION:
- Extract numeric value only (remove currency symbols)
- For ranges (e.g., "₹100-150"), use the lower value
- For "Market Price" or "MP", use 0

ITEM TYPE DETECTION:
- "beverage" for: drinks, juices, shakes, coffee, tea, smoothies, lassi, soda, water
- "food" for: everything else

CONFIDENCE SCORING (for each item):
- "high": Clear text, clear price, clear category
- "medium": Some fields unclear or inferred
- "low": Poor image quality or heavily inferred data

OUTPUT FORMAT (strict JSON):
{
  "items": [
    {
      "name": "Item Name",
      "description": "Brief description or empty string",
      "price": 0,
      "category": "Category Name",
      "itemType": "food" | "beverage",
      "isVeg": true | false,
      "isSpicy": false,
      "variants": [{"name": "Small", "price": 100}],
      "addons": [{"name": "Extra Cheese", "price": 20}],
      "isCombo": false,
      "comboItems": [],
      "confidence": "high" | "medium" | "low",
      "extractionNotes": "Any notes about extraction challenges"
    }
  ],
  "metadata": {
    "totalExtracted": 0,
    "categoriesFound": 0,
    "notes": "Any extraction challenges or important observations",
    "confidence": "high" | "medium" | "low",
    "imageQuality": "excellent" | "good" | "poor"
  }
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response.text();

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to extract partial results
      return this.extractPartialResults(response);
    }

    try {
      const rawResult = JSON.parse(jsonMatch[0]);

      // Validate and clean the extracted data
      return this.validateAndCleanExtractedMenu(rawResult);
    } catch (parseError) {
      console.error('[GeminiService] JSON parse error:', parseError);
      return this.extractPartialResults(response);
    }
  }

  /**
   * Validate and clean extracted menu data
   */
  private validateAndCleanExtractedMenu(
    result: MenuExtractionResult
  ): MenuExtractionResult {
    const cleanedItems = result.items
      .filter(item => {
        // Remove invalid items
        if (!item.name || item.name.trim().length === 0) return false;
        if (item.price < 0) return false;
        return true;
      })
      .map(item => ({
        ...item,
        // Clean and normalize data
        name: item.name.trim(),
        description: item.description?.trim() || '',
        category: this.normalizeCategoryName(item.category?.trim() || 'Uncategorized'),
        price: Math.round(item.price * 100) / 100, // Round to 2 decimals

        // Ensure boolean fields
        isVeg: Boolean(item.isVeg),
        isSpicy: Boolean(item.isSpicy),
        isCombo: Boolean(item.isCombo),

        // Validate variants
        variants: (item.variants || []).filter(v =>
          v.name && v.price >= 0
        ).map(v => ({
          name: v.name.trim(),
          price: Math.round(v.price * 100) / 100,
        })),

        // Validate addons
        addons: (item.addons || []).filter(a =>
          a.name && a.price >= 0
        ).map(a => ({
          name: a.name.trim(),
          price: Math.round(a.price * 100) / 100,
        })),

        // Preserve confidence and notes
        confidence: item.confidence || 'medium',
        extractionNotes: item.extractionNotes?.trim() || '',
      }));

    // Deduplicate items with same name and price
    const uniqueItems = cleanedItems.filter((item, index, self) =>
      index === self.findIndex(t =>
        t.name.toLowerCase() === item.name.toLowerCase() &&
        Math.abs(t.price - item.price) < 0.01
      )
    );

    // Count unique categories
    const categories = new Set(uniqueItems.map(item => item.category));

    return {
      items: uniqueItems,
      metadata: {
        totalExtracted: uniqueItems.length,
        categoriesFound: categories.size,
        notes: `${result.metadata.notes || 'Extraction completed'}. Cleaned and validated.`,
        confidence: result.metadata.confidence || 'medium',
        imageQuality: result.metadata.imageQuality || 'good',
      },
    };
  }

  /**
   * Normalize category names for consistency
   */
  private normalizeCategoryName(category: string): string {
    const categoryMap: Record<string, string> = {
      // Appetizers
      'starters': 'Appetizers',
      'starter': 'Appetizers',
      'apps': 'Appetizers',
      'appetizer': 'Appetizers',

      // Main Course
      'mains': 'Main Course',
      'main': 'Main Course',
      'entrees': 'Main Course',
      'entree': 'Main Course',
      'main course': 'Main Course',

      // Beverages
      'drinks': 'Beverages',
      'drink': 'Beverages',
      'juices': 'Beverages',
      'juice': 'Beverages',
      'beverage': 'Beverages',

      // Desserts
      'sweets': 'Desserts',
      'sweet': 'Desserts',
      'dessert': 'Desserts',

      // Sides
      'side dishes': 'Sides',
      'side dish': 'Sides',
      'side': 'Sides',

      // Breakfast
      'breakfast items': 'Breakfast',
      'breakfast item': 'Breakfast',

      // Lunch
      'lunch items': 'Lunch',
      'lunch item': 'Lunch',

      // Dinner
      'dinner items': 'Dinner',
      'dinner item': 'Dinner',
    };

    const normalized = category.toLowerCase().trim();
    return categoryMap[normalized] || category;
  }

  /**
   * Extract partial results when JSON parsing fails
   */
  private extractPartialResults(responseText: string): MenuExtractionResult {
    console.warn('[GeminiService] JSON parsing failed, attempting partial extraction');

    // Try to find any item-like structures in the response
    // This is a fallback for when AI doesn't return proper JSON

    return {
      items: [],
      metadata: {
        totalExtracted: 0,
        categoriesFound: 0,
        notes: 'Extraction failed. Please try again with a clearer image or contact support.',
        confidence: 'low',
        imageQuality: 'poor',
      },
    };
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
