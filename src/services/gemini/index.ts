/**
 * Gemini Service - Barrel re-export for backwards compatibility.
 * Any file importing from '../geminiService.js' can be redirected here.
 * New code should import directly from the sub-modules.
 */

export { geminiService } from './geminiCompletionService.js';
export type { DishInsight, MenuExtractionResult, MenuItem, MenuVariant, MenuAddon } from './geminiTypes.js';
