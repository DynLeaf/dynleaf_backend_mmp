/**
 * Gemini AI Controller
 * Handles all AI-powered features with proper authentication and rate limiting
 */

import { Request, Response } from 'express';
import { geminiService } from '../services/geminiService.js';

// ============================================================================
// Request Validation
// ============================================================================

const validateDishInsightRequest = (body: any): { valid: boolean; error?: string } => {
  if (!body.dishName || typeof body.dishName !== 'string') {
    return { valid: false, error: 'dishName is required and must be a string' };
  }
  if (!body.description || typeof body.description !== 'string') {
    return { valid: false, error: 'description is required and must be a string' };
  }
  if (body.dishName.length > 200) {
    return { valid: false, error: 'dishName must be less than 200 characters' };
  }
  if (body.description.length > 1000) {
    return { valid: false, error: 'description must be less than 1000 characters' };
  }
  return { valid: true };
};

const validateMenuExtractionRequest = (body: any): { valid: boolean; error?: string } => {
  if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
    return { valid: false, error: 'imageBase64 is required and must be a string' };
  }
  
  // Check if it's a valid base64 or data URL
  const isDataUrl = body.imageBase64.startsWith('data:');
  const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64.split(',').pop() || '');
  
  if (!isDataUrl && !isBase64) {
    return { valid: false, error: 'imageBase64 must be a valid base64 string or data URL' };
  }

  // Basic size check (max 10MB base64)
  if (body.imageBase64.length > 14_000_000) {
    return { valid: false, error: 'Image size too large. Maximum 10MB supported.' };
  }

  return { valid: true };
};

// ============================================================================
// Controller Methods
// ============================================================================

/**
 * GET /api/gemini/health
 * Check Gemini service health and availability
 */
export const getServiceHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await geminiService.getServiceHealth();
    
    res.status(200).json({
      success: true,
      data: {
        status: health.isInitialized && health.hasApiKey ? 'healthy' : 'unavailable',
        ...health,
      },
    });
  } catch (error) {
    console.error('[GeminiController] Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check service health',
    });
  }
};

/**
 * POST /api/gemini/dish-insights
 * Get AI-generated insights for a dish
 * 
 * Request body:
 * {
 *   "dishName": string,
 *   "description": string
 * }
 */
export const getDishInsights = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = validateDishInsightRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    const { dishName, description } = req.body;

    // Log request (for monitoring)
    console.log(`[GeminiController] Dish insight request for: ${dishName}`);

    // Call service
    const insights = await geminiService.getDishInsights(dishName, description);

    res.status(200).json({
      success: true,
      data: insights,
    });

  } catch (error) {
    console.error('[GeminiController] getDishInsights error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for rate limit errors
    if (errorMessage.includes('Rate limit')) {
      res.status(429).json({
        success: false,
        error: errorMessage,
        retryAfter: parseInt(errorMessage.match(/\d+/)?.[0] || '60'),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate dish insights',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
};

/**
 * POST /api/gemini/extract-menu
 * Extract menu items from an image using AI
 * 
 * Request body:
 * {
 *   "imageBase64": string (base64 or data URL),
 *   "useCache": boolean (optional, default: true)
 * }
 */
export const extractMenuFromImage = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = validateMenuExtractionRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    const { imageBase64, useCache = true } = req.body;

    // Log request (for monitoring)
    console.log('[GeminiController] Menu extraction request received');

    // Call service (note: caching is handled internally by the service)
    const result = await geminiService.extractMenuFromImage(imageBase64);

    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[GeminiController] extractMenuFromImage error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for rate limit errors
    if (errorMessage.includes('Rate limit')) {
      res.status(429).json({
        success: false,
        error: errorMessage,
        retryAfter: parseInt(errorMessage.match(/\d+/)?.[0] || '60'),
      });
      return;
    }

    // Check for service unavailable
    if (errorMessage.includes('not available')) {
      res.status(503).json({
        success: false,
        error: 'AI service temporarily unavailable',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to extract menu from image',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
};

/**
 * POST /api/gemini/clear-cache
 * Clear the Gemini service cache (admin only)
 */
export const clearCache = async (req: Request, res: Response): Promise<void> => {
  try {
    geminiService.clearCache();
    
    res.status(200).json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('[GeminiController] clearCache error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
    });
  }
};
