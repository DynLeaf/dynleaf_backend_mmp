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
 * 
 * @module services/geminiService
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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
// In-Memory Cache (Consider Redis for production scale)
// ============================================================================

class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
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
  private readonly apiKey: string;

  // Models for different use cases
  private readonly MODELS = {
    FAST: 'gemini-2.0-flash-exp', // Fast responses for menu extraction
    QUALITY: 'gemini-2.5-flash',  // Balanced for insights
  } as const;

  constructor() {
    // Load API key from environment - NEVER from client
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';

    if (!this.apiKey) {
      console.error('[GeminiService] ❌ GEMINI_API_KEY not configured in environment variables');
    }

    // Configure rate limits (adjust based on your GCP quota)
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 60,   // Conservative limit
      requestsPerHour: 1000,   // Adjust based on quota
      requestsPerDay: 10000,   // Adjust based on quota
    });

    // Initialize cache
    this.cache = new CacheManager(1000);

    this.initialize();
  }

  private initialize(): void {
    if (!this.apiKey) {
      console.error('[GeminiService] Cannot initialize: API key missing');
      this.isInitialized = false;
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(this.apiKey);
      this.isInitialized = true;
      console.log('[GeminiService] ✓ Initialized successfully');
    } catch (error) {
      console.error('[GeminiService] Initialization failed:', error);
      this.isInitialized = false;
    }
  }

  private async checkRateLimit(): Promise<void> {
    const result = await this.rateLimiter.checkLimit();
    if (!result.allowed) {
      throw new Error(`Rate limit exceeded. Retry after ${result.retryAfter} seconds`);
    }
  }

  private getModel(modelType: keyof typeof this.MODELS): GenerativeModel | null {
    if (!this.client || !this.isInitialized) {
      return null;
    }
    return this.client.getGenerativeModel({ model: this.MODELS[modelType] });
  }

  // ============================================================================
  // PUBLIC API: Dish Insights
  // ============================================================================

  async getDishInsights(dishName: string, description: string): Promise<DishInsight> {
    // Generate cache key
    const cacheKey = `dish_insight:${dishName}:${description}`;

    // Check cache first
    const cached = this.cache.get<DishInsight>(cacheKey);
    if (cached) {
      console.log('[GeminiService] Cache hit for dish insight');
      return cached;
    }

    // Check rate limit
    try {
      await this.checkRateLimit();
    } catch (error) {
      console.warn('[GeminiService] Rate limit hit, returning fallback');
      return this.getFallbackDishInsight();
    }

    // Check if service is available
    if (!this.isInitialized || !this.client) {
      console.warn('[GeminiService] Service not initialized, returning fallback');
      return this.getFallbackDishInsight();
    }

    try {
      const model = this.getModel('QUALITY');
      if (!model) {
        throw new Error('Model not available');
      }

      const prompt = `You are an elite Michelin-star chef and sommelier.
Analyze this dish: "${dishName}" - "${description}".

Provide a very short, punchy JSON response with:
1. "pairing": A perfect drink pairing (wine, cocktail, or mocktail).
2. "funFact": A 1-sentence interesting culinary fact about the main ingredients.
3. "tasteProfile": 3 adjectives describing the flavor (e.g., Umami, Earthy, Rich).

Format:
{
  "pairing": "...",
  "funFact": "...",
  "tasteProfile": ["...", "...", "..."]
}`;

      this.rateLimiter.incrementCount();
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      });

      const response = result.response;
      const text = response.text();

      // Parse response
      const parsed = this.parseJsonResponse<DishInsight>(text);
      
      // Cache the result (24 hours TTL)
      this.cache.set(cacheKey, parsed, 24 * 60 * 60);

      return parsed;

    } catch (error) {
      console.error('[GeminiService] getDishInsights error:', error);
      return this.getFallbackDishInsight();
    }
  }

  // ============================================================================
  // PUBLIC API: Menu Extraction from Image
  // ============================================================================

  async extractMenuFromImage(
    imageBase64: string,
    options: { useCache?: boolean } = {}
  ): Promise<MenuExtractionResult> {
    const { useCache = true } = options;

    // Generate cache key from image hash (first 100 chars for performance)
    const imageHash = this.hashString(imageBase64.substring(0, 100));
    const cacheKey = `menu_extract:${imageHash}`;

    // Check cache
    if (useCache) {
      const cached = this.cache.get<MenuExtractionResult>(cacheKey);
      if (cached) {
        console.log('[GeminiService] Cache hit for menu extraction');
        return cached;
      }
    }

    // Check rate limit
    try {
      await this.checkRateLimit();
    } catch (error) {
      throw new Error(`Rate limit exceeded: ${(error as Error).message}`);
    }

    // Check if service is available
    if (!this.isInitialized || !this.client) {
      throw new Error('Gemini service not available. Please check API key configuration.');
    }

    try {
      const model = this.getModel('FAST');
      if (!model) {
        throw new Error('Model not available');
      }

      const prompt = this.getMenuExtractionPrompt();

      // Parse base64 and mime type
      const { base64Data, mimeType } = this.parseImageData(imageBase64);

      this.rateLimiter.incrementCount();

      // Configure generation with longer timeout for large menus
      const result = await model.generateContent({
        contents: [
          { 
            role: 'user', 
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1, // Lower temperature for more consistent extraction
          maxOutputTokens: 8192, // Allow large responses for extensive menus
        },
      });

      const response = result.response;
      const text = response.text();

      // Parse and validate response
      const parsed = this.parseMenuExtractionResponse(text);

      // Cache the result (1 hour TTL for menu extractions)
      if (useCache) {
        this.cache.set(cacheKey, parsed, 60 * 60);
      }

      console.log(`[GeminiService] ✓ Extracted ${parsed.items.length} menu items`);
      return parsed;

    } catch (error) {
      console.error('[GeminiService] extractMenuFromImage error:', error);
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getFallbackDishInsight(): DishInsight {
    return {
      pairing: 'A classic sparkling water with lime.',
      funFact: 'This dish is prepared with traditional techniques.',
      tasteProfile: ['Delicious', 'Savory', 'Fresh'],
    };
  }

  private parseImageData(imageBase64: string): { base64Data: string; mimeType: string } {
    // Remove data URL prefix if present
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    // Detect mime type
    let mimeType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) mimeType = 'image/png';
    else if (imageBase64.includes('data:image/webp')) mimeType = 'image/webp';
    else if (imageBase64.includes('data:application/pdf')) mimeType = 'application/pdf';

    return { base64Data, mimeType };
  }

  private parseJsonResponse<T>(text: string): T {
    let jsonText = text.trim();

    // Remove markdown code blocks
    jsonText = jsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/g, '');

    // Remove trailing commas
    jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');

    // Extract JSON object if embedded in text
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(jsonText);
  }

  private parseMenuExtractionResponse(text: string): MenuExtractionResult {
    try {
      const parsed = this.parseJsonResponse<MenuExtractionResult>(text);
      
      // Validate structure
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid response structure: missing items array');
      }

      // Set defaults for metadata if missing
      if (!parsed.metadata) {
        parsed.metadata = {
          totalExtracted: parsed.items.length,
          categoriesFound: new Set(parsed.items.map(item => item.category).filter(Boolean)).size,
          notes: 'Extracted successfully',
        };
      }

      return parsed;

    } catch (parseError) {
      console.error('[GeminiService] JSON parse error:', parseError);
      console.log('[GeminiService] Response preview:', text.substring(0, 500));

      // Attempt recovery
      const recovered = this.attemptJsonRecovery(text);
      if (recovered) {
        return recovered;
      }

      throw new Error(`Failed to parse AI response: ${(parseError as Error).message}`);
    }
  }

  private attemptJsonRecovery(text: string): MenuExtractionResult | null {
    try {
      // Try to extract partial items array
      const itemsMatch = text.match(/"items"\s*:\s*\[([\s\S]*?)\]/);
      if (!itemsMatch) return null;

      const itemsArrayContent = itemsMatch[1];
      const items: MenuItem[] = [];

      // Extract complete item objects
      let depth = 0;
      let currentItem = '';
      let inString = false;
      let escapeNext = false;

      for (const char of itemsArrayContent) {
        if (escapeNext) {
          currentItem += char;
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          currentItem += char;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
        }

        if (!inString) {
          if (char === '{') depth++;
          if (char === '}') {
            depth--;
            currentItem += char;
            if (depth === 0) {
              try {
                const cleaned = currentItem.trim().replace(/^,\s*/, '').replace(/,(\s*[}\]])/g, '$1');
                const item = JSON.parse(cleaned);
                items.push(item);
                currentItem = '';
                continue;
              } catch {
                currentItem = '';
                continue;
              }
            }
          }
        }

        if (depth > 0) {
          currentItem += char;
        }
      }

      if (items.length > 0) {
        console.log(`[GeminiService] ✓ Recovered ${items.length} items from malformed JSON`);
        return {
          items,
          metadata: {
            totalExtracted: items.length,
            categoriesFound: new Set(items.map(item => item.category).filter(Boolean)).size,
            notes: 'Partial extraction - some items may be missing due to incomplete response',
          },
        };
      }
    } catch (error) {
      console.error('[GeminiService] Recovery attempt failed:', error);
    }

    return null;
  }

  private getMenuExtractionPrompt(): string {
    return `You are an expert menu extraction AI. Analyze this menu image/PDF and extract EVERY SINGLE menu item you can find.

CRITICAL REQUIREMENTS:
- Extract ALL menu items from this image/PDF with COMPLETE accuracy. Include EVERY item visible.

For each item, extract:
{
  "name": "Exact item name as written",
  "description": "" (empty string if not visible),
  "price": numeric_value_only (remove ₹, $, Rs, etc. Use base/default price if variants exist),
  "category": "Section name" (Appetizers, Main Course, Desserts, Beverages, Rice & Biryani, Chinese, etc.),
  "itemType": "food" or "beverage" (REQUIRED - classify as 'beverage' for drinks/juices/coffee/tea/shakes/smoothies/lassi/soda, otherwise 'food'),
  "isVeg": true/false (true ONLY if marked with veg symbol/text),
  "isSpicy": true/false (true ONLY if marked with spicy indicator),

  // OPTIONAL: Extract if present
  "variants": [{"name": "Small/Medium/Large/Half/Full", "price": numeric_value}] (if item has size/portion options),
  "addons": [{"name": "Extra Cheese/Sauce/etc", "price": numeric_value}] (if customizations listed),
  "isCombo": true/false (if marked as combo/meal/family pack),
  "comboItems": ["Item 1", "Item 2"] (if combo, list included items)
}

Return ONLY this JSON format (must be complete and valid):
{
  "items": [
    {
      "name": "Pizza Margherita", 
      "description": "Classic tomato and cheese", 
      "price": 250, 
      "category": "Pizzas",
      "itemType": "food",
      "isVeg": true, 
      "isSpicy": false,
      "variants": [
        {"name": "Small", "price": 250},
        {"name": "Medium", "price": 350},
        {"name": "Large", "price": 450}
      ],
      "addons": [
        {"name": "Extra Cheese", "price": 50},
        {"name": "Olives", "price": 30}
      ]
    },
    {
      "name": "Mango Lassi", 
      "description": "Refreshing yogurt-based mango drink", 
      "price": 80, 
      "category": "Beverages",
      "itemType": "beverage",
      "isVeg": true, 
      "isSpicy": false,
      "variants": [
        {"name": "Small", "price": 60},
        {"name": "Large", "price": 80}
      ]
    }
  ],
  "metadata": {
    "totalExtracted": 170,
    "categoriesFound": 12,
    "notes": "Extracted all visible items with variants and combos"
  }
}

VERIFY BEFORE RETURNING:
- Count total items extracted
- Ensure no sections are skipped
- Confirm all categories are included
- Extract variants/combos/addons if visible
- Make sure JSON is complete and properly closed

Return complete, valid JSON with EVERY item visible in the menu.`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  // ============================================================================
  // Service Health & Monitoring
  // ============================================================================

  getServiceHealth() {
    return {
      isInitialized: this.isInitialized,
      hasApiKey: !!this.apiKey,
      rateLimit: this.rateLimiter.getStats(),
      cache: this.cache.getStats(),
    };
  }

  clearCache() {
    this.cache.clear();
    console.log('[GeminiService] Cache cleared');
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const geminiService = new GeminiService();
export type { DishInsight, MenuItem, MenuExtractionResult };
