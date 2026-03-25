export interface StoryResponseDto {
    id: string;
    outletId: string;
    category: string;
    status: string;
    pinned: boolean;
    slides: Array<{
        mediaUrl: string;
        mediaType: string;
        caption?: string;
        ctaLink?: string;
        ctaText?: string;
        orderIndex: number;
        duration: number;
        isSeen?: boolean;
    }>;
    visibilityStart: Date;
    visibilityEnd: Date;
    created_at: Date;
    isSeen?: boolean;
}
