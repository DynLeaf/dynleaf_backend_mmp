import mongoose, { Document, Schema } from 'mongoose';

export interface IStorySlide {
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
    ctaLink?: string; // Optional deep link or external link
    ctaText?: string; // "View Menu", "Visit Profile", etc.
    orderIndex: number;
    duration?: number; // Duration in seconds for images, or video length

    // Text formatting
    textColor?: string;
    textSize?: 'small' | 'medium' | 'large';
    textStyle?: 'normal' | 'bold' | 'italic';
    captionBgColor?: string;
    captionOpacity?: number;

    // Image adjustment (Instagram-style pan/zoom)
    imageScale?: number;
    imagePosition?: { x: number; y: number };
    imagePositionPct?: { x: number; y: number };

    // Caption positioning (draggable)
    captionPosition?: { x: number; y: number };
    captionPositionPct?: { x: number; y: number };
}

export interface IStory extends Document {
    outletId: mongoose.Types.ObjectId;
    slides: IStorySlide[];
    category: 'Promotion' | 'NewDish' | 'Event' | 'Announcement' | 'Seasonal';
    status: 'draft' | 'scheduled' | 'live' | 'expired' | 'archived';
    pinned: boolean;
    visibilityStart: Date;
    visibilityEnd: Date;
    createdBy: mongoose.Types.ObjectId;
    flags: {
        isModerated: boolean; // True if admin has reviewed
        isRejected: boolean;
        rejectionReason?: string;
    };
    created_at: Date;
    updated_at: Date;
}

const storySlideSchema = new Schema<IStorySlide>({
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    caption: { type: String, maxlength: 200 },
    ctaLink: { type: String },
    ctaText: { type: String },
    orderIndex: { type: Number, required: true },
    duration: { type: Number, default: 5 }, // Default 5s for images

    // Text formatting
    textColor: { type: String },
    textSize: { type: String, enum: ['small', 'medium', 'large'] },
    textStyle: { type: String, enum: ['normal', 'bold', 'italic'] },
    captionBgColor: { type: String },
    captionOpacity: { type: Number },

    // Image adjustment
    imageScale: { type: Number },
    imagePosition: {
        x: { type: Number },
        y: { type: Number }
    },
    imagePositionPct: {
        x: { type: Number },
        y: { type: Number }
    },

    // Caption positioning
    captionPosition: {
        x: { type: Number },
        y: { type: Number }
    },
    captionPositionPct: {
        x: { type: Number },
        y: { type: Number }
    }
});

const storySchema = new Schema<IStory>({
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    slides: [storySlideSchema],
    category: { 
        type: String, 
        enum: ['Promotion', 'NewDish', 'Event', 'Announcement', 'Seasonal'], 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['draft', 'scheduled', 'live', 'expired', 'archived'], 
        default: 'draft' 
    },
    pinned: { type: Boolean, default: false },
    visibilityStart: { type: Date },
    visibilityEnd: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flags: {
        isModerated: { type: Boolean, default: false },
        isRejected: { type: Boolean, default: false },
        rejectionReason: String
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes for efficient querying
storySchema.index({ outletId: 1, status: 1 });
storySchema.index({ status: 1, visibilityEnd: 1 }); // For finding expired stories
storySchema.index({ 'flags.isModerated': 1 }); // For admin queue
storySchema.index({ visibilityStart: 1, status: 1 }); // For scheduled publishing

export const Story = mongoose.model<IStory>('Story', storySchema);
