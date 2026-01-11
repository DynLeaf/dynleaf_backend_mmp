const pdf = require('pdf-parse');

export interface PDFExtractionResult {
    text: string;
    pages: number;
    isTextBased: boolean;
    metadata?: {
        title?: string;
        author?: string;
        creator?: string;
    };
}

export class PDFService {
    /**
     * Extract text from PDF buffer
     */
    async extractText(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
        try {
            const data = await pdf(pdfBuffer);

            // Check if PDF has meaningful text content
            // (more than 100 characters suggests it's text-based)
            const hasText = data.text.trim().length > 100;

            return {
                text: data.text,
                pages: data.numpages,
                isTextBased: hasText,
                metadata: {
                    title: data.info?.Title,
                    author: data.info?.Author,
                    creator: data.info?.Creator
                }
            };
        } catch (error) {
            console.error('[PDFService] Text extraction failed:', error);
            return {
                text: '',
                pages: 0,
                isTextBased: false
            };
        }
    }

    /**
     * Extract text from each page separately
     * Useful for multi-page menu processing
     */
    async extractTextByPage(pdfBuffer: Buffer): Promise<string[]> {
        try {
            const data = await pdf(pdfBuffer);

            // Split text by page breaks
            const pageTexts: string[] = [];
            let currentPage = '';

            // Form feed character (\f or \x0C) typically indicates page breaks
            const pages = data.text.split('\f');

            pages.forEach((pageText: string, index: number) => {
                const trimmed = pageText.trim();
                if (trimmed.length > 0) {
                    pageTexts.push(trimmed);
                }
            });

            // If no page breaks found, treat entire text as single page
            if (pageTexts.length === 0 && data.text.trim().length > 0) {
                pageTexts.push(data.text.trim());
            }

            return pageTexts;
        } catch (error) {
            console.error('[PDFService] Page extraction failed:', error);
            return [];
        }
    }

    /**
     * Check if PDF is text-based or image-based
     */
    async isPDFTextBased(pdfBuffer: Buffer): Promise<boolean> {
        try {
            const result = await this.extractText(pdfBuffer);
            return result.isTextBased;
        } catch (error) {
            console.error('[PDFService] PDF type check failed:', error);
            return false;
        }
    }

    /**
     * Get PDF metadata
     */
    async getPDFMetadata(pdfBuffer: Buffer): Promise<{
        pages: number;
        title?: string;
        author?: string;
        isTextBased: boolean;
    }> {
        try {
            const result = await this.extractText(pdfBuffer);
            return {
                pages: result.pages,
                title: result.metadata?.title,
                author: result.metadata?.author,
                isTextBased: result.isTextBased
            };
        } catch (error) {
            console.error('[PDFService] Metadata extraction failed:', error);
            return {
                pages: 0,
                isTextBased: false
            };
        }
    }
}

export const pdfService = new PDFService();
