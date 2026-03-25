import { StoryResponseDto } from './story.response.dto.js';

export interface StoryFeedItemDto {
    outlet: {
        _id: string;
        name: string;
        slug: string;
        media: any;
        location: any;
        address: any;
        status: string;
        approval_status: string;
        brand_id: any;
    };
    stories: StoryResponseDto[];
    latestUpdate: Date;
    hasUnseen: boolean;
}
