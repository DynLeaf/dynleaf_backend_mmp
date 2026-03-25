/**
 * Gemini Completion Service
 * Handles all Google Gemini AI model interactions.
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import crypto from 'crypto';
import {
    DishInsight, MenuExtractionResult, MenuItem, MenuVariant, MenuAddon,
    RateLimiter, CacheManager, CircuitBreaker, RetryHelper,
    MAX_IMAGE_SIZE_MB, MAX_IMAGE_SIZE_BYTES, MAX_PDF_SIZE_MB, MAX_PDF_SIZE_BYTES,
    REQUEST_TIMEOUT_MS, MENU_EXTRACTION_TIMEOUT_MS
} from './geminiTypes.js';

class GeminiService {
    private client: GoogleGenerativeAI | null = null;
    private isInitialized = false;
    private rateLimiter: RateLimiter;
    private cache: CacheManager;
    private retryHelper: RetryHelper;
    private circuitBreaker: CircuitBreaker;

    constructor() {
        this.rateLimiter = new RateLimiter({ requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000 });
        this.cache = new CacheManager(1000);
        this.retryHelper = new RetryHelper({ maxRetries: 3, initialDelayMs: 4000, maxDelayMs: 30000, backoffMultiplier: 2 });
        this.circuitBreaker = new CircuitBreaker();
        this.initialize();
    }

    private initialize(): void {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { console.warn('[GeminiService] GEMINI_API_KEY not found'); this.isInitialized = false; return; }
        try { this.client = new GoogleGenerativeAI(apiKey); this.isInitialized = true; console.log('[GeminiService] Initialized'); }
        catch (error) { console.error('[GeminiService] Initialization failed:', error); this.isInitialized = false; }
    }

    private getModel(modelType: 'FAST' | 'QUALITY' = 'FAST', useFallback = false): GenerativeModel {
        if (!this.client) throw new Error('Gemini client not initialized');
        const modelName = modelType === 'FAST' ? (useFallback ? 'gemini-1.5-flash' : 'gemini-2.5-flash-lite') : (useFallback ? 'gemini-1.5-flash' : 'gemini-2.5-flash');
        if (useFallback) console.warn(`[GeminiService] Using fallback model: ${modelName}`);
        return this.client.getGenerativeModel({ model: modelName });
    }

    private async executeWithModelFallback<T>(modelType: 'FAST' | 'QUALITY', fn: (model: GenerativeModel, modelName: string) => Promise<T>, requestId: string): Promise<T> {
        await this.circuitBreaker.checkAndWait();
        const primaryModelName = modelType === 'FAST' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
        try {
            const result = await fn(this.getModel(modelType, false), primaryModelName);
            this.circuitBreaker.recordSuccess(); return result;
        } catch (primaryError: unknown) {
            if (this.retryHelper.isServiceUnavailable(primaryError)) {
                this.circuitBreaker.recordFailure();
                console.warn(`[GeminiService][${requestId}] Primary 503, falling back.`);
                await this.circuitBreaker.checkAndWait();
                const result = await fn(this.getModel(modelType, true), 'gemini-1.5-flash');
                this.circuitBreaker.recordSuccess(); return result;
            }
            throw primaryError;
        }
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
        return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs))]);
    }

    private validateImage(imageBase64: string): void {
        if (!imageBase64?.trim()) throw new Error('Image data is required');
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const estimatedSize = (base64Data.length * 3) / 4;
        if (estimatedSize > MAX_IMAGE_SIZE_BYTES) throw new Error(`Image too large (~${(estimatedSize / 1048576).toFixed(1)}MB). Max: ${MAX_IMAGE_SIZE_MB}MB`);
        const validFormats = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!validFormats.some(f => imageBase64.includes(f)) && !imageBase64.startsWith('/9j/') && !imageBase64.startsWith('iVBOR')) throw new Error('Invalid image format');
    }

    private generateImageHash(imageBase64: string): string {
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        return crypto.createHash('sha256').update(base64Data).digest('hex').substring(0, 16);
    }

    private getFallbackDishInsight(): DishInsight {
        return { pairing: 'A refreshing beverage complements most dishes', funFact: 'Every dish has a unique story behind it', tasteProfile: ['Flavorful', 'Satisfying', 'Delicious'] };
    }

    async getDishInsights(dishName: string, description?: string): Promise<DishInsight> {
        const requestId = `dish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        try {
            const limitCheck = await this.rateLimiter.checkLimit();
            if (!limitCheck.allowed) throw new Error(`Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds`);
            const cacheKey = `dish:${dishName}:${description || 'no-desc'}`;
            const cached = this.cache.get<DishInsight>(cacheKey);
            if (cached) return cached;
            if (!this.isInitialized || !this.client) return this.getFallbackDishInsight();
            const result = await this.retryHelper.executeWithRetry(async () => {
                return this.withTimeout(this.generateDishInsightsInternal(dishName, description), REQUEST_TIMEOUT_MS, 'getDishInsights');
            }, 'getDishInsights', requestId);
            this.cache.set(cacheKey, result, 86400);
            this.rateLimiter.incrementCount();
            return result;
        } catch { return this.getFallbackDishInsight(); }
    }

    private async generateDishInsightsInternal(dishName: string, description?: string): Promise<DishInsight> {
        const model = this.getModel('FAST');
        const prompt = `Analyze this dish and provide:\n1. A recommended pairing\n2. An interesting culinary fun fact\n3. A taste profile (3-5 adjectives)\n\nDish: ${dishName}${description ? `\nDescription: ${description}` : ''}\n\nRespond in JSON format:\n{\n  "pairing": "...",\n  "funFact": "...",\n  "tasteProfile": ["adj1", "adj2", "adj3"]\n}`;
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Failed to parse AI response');
        return JSON.parse(jsonMatch[0]);
    }

    async extractMenuFromImage(imageBase64: string): Promise<MenuExtractionResult> {
        const requestId = `menu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        try {
            this.validateImage(imageBase64);
            const limitCheck = await this.rateLimiter.checkLimit();
            if (!limitCheck.allowed) throw new Error(`Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds`);
            const imageHash = this.generateImageHash(imageBase64);
            const cacheKey = `menu:${imageHash}`;
            const cached = this.cache.get<MenuExtractionResult>(cacheKey);
            if (cached) return cached;
            if (!this.isInitialized || !this.client) throw new Error('Gemini service not initialized');
            const result = await this.retryHelper.executeWithRetry(async () => {
                return this.withTimeout(this.extractMenuItemsFromImageInternal(imageBase64, requestId), MENU_EXTRACTION_TIMEOUT_MS, 'extractMenuFromImage');
            }, 'extractMenuFromImage', requestId);
            this.cache.set(cacheKey, result, 3600);
            this.rateLimiter.incrementCount();
            return result;
        } catch (error) { console.error(`[GeminiService][${requestId}] Error extracting menu:`, error); throw error; }
    }

    async extractMenuFromMultipleImages(imageBase64Array: string[]): Promise<MenuExtractionResult> {
        const requestId = `menu-batch-${Date.now()}`;
        if (!imageBase64Array?.length) throw new Error('At least one image is required');
        if (imageBase64Array.length > 10) throw new Error('Maximum 10 images allowed per batch');
        const allResults: MenuItem[] = []; const allCategories = new Set<string>();
        let overallConfidence: 'high' | 'medium' | 'low' = 'high'; let overallImageQuality: 'excellent' | 'good' | 'poor' = 'excellent';
        const notes: string[] = [];
        for (let i = 0; i < imageBase64Array.length; i++) {
            try {
                const result = await this.extractMenuFromImage(imageBase64Array[i]);
                allResults.push(...result.items); result.items.forEach(item => allCategories.add(item.category));
                if (result.metadata.confidence === 'low' || overallConfidence === 'low') overallConfidence = 'low';
                else if (result.metadata.confidence === 'medium' || overallConfidence === 'medium') overallConfidence = 'medium';
                if (result.metadata.imageQuality === 'poor' || overallImageQuality === 'poor') overallImageQuality = 'poor';
                else if (result.metadata.imageQuality === 'good' || overallImageQuality === 'good') overallImageQuality = 'good';
                if (result.metadata.notes) notes.push(`Page ${i + 1}: ${result.metadata.notes}`);
                if (i < imageBase64Array.length - 1) await new Promise(r => setTimeout(r, 2000));
            } catch (error) { notes.push(`Page ${i + 1}: failed - ${error instanceof Error ? error.message : 'Unknown'}`); overallConfidence = 'low'; }
        }
        const uniqueItems = allResults.filter((item, idx, self) => idx === self.findIndex(t => t.name.toLowerCase() === item.name.toLowerCase() && Math.abs(t.price - item.price) < 0.01));
        return { items: uniqueItems, metadata: { totalExtracted: uniqueItems.length, categoriesFound: allCategories.size, notes: `Extracted from ${imageBase64Array.length} images. ${notes.join(' ')}`, confidence: overallConfidence, imageQuality: overallImageQuality } };
    }

    private async extractMenuItemsFromImageInternal(imageBase64: string, requestId?: string): Promise<MenuExtractionResult> {
        const tag = requestId ? `[${requestId}]` : '';
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        let mimeType = 'image/jpeg';
        if (imageBase64.includes('data:')) { const m = imageBase64.match(/data:([^;]+);/); if (m) mimeType = m[1]; }
        if (mimeType === 'application/pdf') { const sz = (base64Data.length * 3) / 4; if (sz > MAX_PDF_SIZE_BYTES) throw new Error(`PDF too large (~${(sz / 1048576).toFixed(1)}MB, Max: ${MAX_PDF_SIZE_MB}MB)`); }
        const isPdf = mimeType === 'application/pdf';
        const modelType: 'FAST' | 'QUALITY' = isPdf ? 'QUALITY' : 'FAST';
        const imagePart = { inlineData: { data: base64Data, mimeType } };
        const prompt = `You are an expert restaurant menu digitization assistant.\n\nExtract ALL visible menu items from this menu image.\n\nReturn ONLY JSON in this exact format:\n{\n  "items": [{ "name": "", "description": "", "price": 0, "category": "", "itemType": "food", "isVeg": true, "isSpicy": false, "variants": [], "addons": [], "isCombo": false, "comboItems": [], "confidence": "high", "extractionNotes": "" }],\n  "metadata": { "totalExtracted": 0, "categoriesFound": 0, "notes": "", "confidence": "high", "imageQuality": "excellent" }\n}\n\nReturn ONLY JSON.`;
        const startTime = Date.now();
        const result = await this.executeWithModelFallback(modelType, async (model, modelName) => {
            console.log(`[GeminiService]${tag} Calling: ${modelName}`);
            const res = await model.generateContent([prompt, imagePart]);
            console.log(`[GeminiService]${tag} Model=${modelName} time=${Date.now() - startTime}ms`);
            return res;
        }, requestId || 'unknown');
        const response = result.response.text();
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return this.extractPartialResults();
        try { return this.validateAndCleanExtractedMenu(JSON.parse(jsonMatch[0])); }
        catch { return this.extractPartialResults(); }
    }

    private validateAndCleanExtractedMenu(result: MenuExtractionResult): MenuExtractionResult {
        const cleanedItems = result.items.filter(item => item.name?.trim() && item.price >= 0).map(item => ({
            ...item, name: item.name.trim(), description: item.description?.trim() || '',
            category: this.normalizeCategoryName(item.category?.trim() || 'Uncategorized'),
            price: Math.round(item.price * 100) / 100,
            isVeg: Boolean(item.isVeg), isSpicy: Boolean(item.isSpicy), isCombo: Boolean(item.isCombo),
            itemType: item.itemType === 'beverage' ? 'beverage' : 'food' as 'food' | 'beverage',
            variants: this.cleanVariants(item.variants), addons: this.cleanAddons(item.addons),
            confidence: item.confidence || 'medium', extractionNotes: item.extractionNotes?.trim() || ''
        }));
        const uniqueItems = cleanedItems.filter((item, idx, self) => idx === self.findIndex(t => t.name.toLowerCase() === item.name.toLowerCase() && Math.abs(t.price - item.price) < 0.01));
        const categories = new Set(uniqueItems.map(i => i.category));
        return { items: uniqueItems, metadata: { totalExtracted: uniqueItems.length, categoriesFound: categories.size, notes: `${result.metadata.notes || 'Extraction completed'}. Cleaned and validated.`, confidence: result.metadata.confidence || 'medium', imageQuality: result.metadata.imageQuality || 'good' } };
    }

    private cleanVariants(variants?: MenuVariant[]): MenuVariant[] {
        if (!variants?.length) return [];
        const seen = new Set<string>();
        return variants.filter(v => v.name?.trim() && typeof v.price === 'number' && v.price >= 0 && !seen.has(v.name.toLowerCase().trim()) && seen.add(v.name.toLowerCase().trim())).map(v => ({ name: v.name.trim(), price: Math.round(v.price * 100) / 100 }));
    }

    private cleanAddons(addons?: MenuAddon[]): MenuAddon[] {
        if (!addons?.length) return [];
        const seen = new Set<string>();
        return addons.filter(a => a.name?.trim() && typeof a.price === 'number' && a.price >= 0 && !seen.has(a.name.toLowerCase().trim()) && seen.add(a.name.toLowerCase().trim())).map(a => ({ name: a.name.trim(), price: Math.round(a.price * 100) / 100 }));
    }

    private normalizeCategoryName(category: string): string {
        const map: Record<string, string> = { 'starters': 'Appetizers', 'starter': 'Appetizers', 'apps': 'Appetizers', 'appetizer': 'Appetizers', 'mains': 'Main Course', 'main': 'Main Course', 'entrees': 'Main Course', 'entree': 'Main Course', 'main course': 'Main Course', 'drinks': 'Beverages', 'drink': 'Beverages', 'juices': 'Beverages', 'beverage': 'Beverages', 'sweets': 'Desserts', 'sweet': 'Desserts', 'dessert': 'Desserts', 'side dishes': 'Sides', 'side dish': 'Sides', 'side': 'Sides' };
        return map[category.toLowerCase().trim()] || category;
    }

    private extractPartialResults(): MenuExtractionResult {
        return { items: [], metadata: { totalExtracted: 0, categoriesFound: 0, notes: 'Extraction failed. Please try again with a clearer image.', confidence: 'low', imageQuality: 'poor' } };
    }

    async getServiceHealth() {
        return { isInitialized: this.isInitialized, hasApiKey: !!process.env.GEMINI_API_KEY, rateLimits: this.rateLimiter.getStats(), cache: this.cache.getStats(), circuitBreaker: this.circuitBreaker.getStats(), models: { fast: { primary: 'gemini-2.5-flash-lite', fallback: 'gemini-1.5-flash' }, quality: { primary: 'gemini-2.5-flash', fallback: 'gemini-1.5-flash' } }, timeouts: { requestTimeoutMs: REQUEST_TIMEOUT_MS, menuExtractionTimeoutMs: MENU_EXTRACTION_TIMEOUT_MS }, imageValidation: { maxSizeMB: MAX_IMAGE_SIZE_MB, maxPdfSizeMB: MAX_PDF_SIZE_MB, supportedFormats: ['JPEG', 'PNG', 'WebP', 'PDF'] } };
    }

    clearCache(): void { this.cache.clear(); }
    destroy(): void { this.cache.destroy(); }
}

export const geminiService = new GeminiService();
