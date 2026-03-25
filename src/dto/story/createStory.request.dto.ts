export interface CreateStoryRequestDto {
    outletId: string;
    category: 'Promotion' | 'NewDish' | 'Event' | 'Announcement' | 'Seasonal';
    slides: Array<{
        mediaUrl: string;
        mediaType: 'image' | 'video';
        caption?: string;
        ctaLink?: string;
        ctaText?: string;
        duration?: number;
        textColor?: string;
        textSize?: 'small' | 'medium' | 'large';
        textStyle?: 'normal' | 'bold' | 'italic';
        captionBgColor?: string;
        captionOpacity?: number;
        imageScale?: number;
        imagePosition?: { x: number; y: number };
        imagePositionPct?: { x: number; y: number };
        captionPosition?: { x: number; y: number };
        captionPositionPct?: { x: number; y: number };
    }>;
    visibilityStart?: Date;
    visibilityEnd?: Date;
    pinned?: boolean;
}
