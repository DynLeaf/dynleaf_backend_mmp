import mongoose, { Document, Schema } from 'mongoose';

export interface IFeaturedPromotion extends Document {
    outlet_id?: mongoose.Types.ObjectId;
    promotion_type: 'featured_today' | 'sponsored' | 'premium';
    
    display_data: {
        banner_image_url: string;
        banner_text?: string;
        link_url: string;
    };
    
    scheduling: {
        start_date: Date;
        end_date: Date;
        display_priority: number;
    };
    
    targeting: {
        locations?: string[];
        show_on_homepage: boolean;
    };
    
    analytics: {
        impressions: number;
        clicks: number;
        conversion_rate: number;
    };
    
    payment?: {
        amount_paid: number;
        payment_status: 'pending' | 'paid' | 'refunded';
        payment_date?: Date;
    };
    
    is_active: boolean;
    created_by: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const FeaturedPromotionSchema = new Schema<IFeaturedPromotion>(
    {
        outlet_id: {
            type: Schema.Types.ObjectId,
            ref: 'Outlet',
            required: false,
            index: true
        },
        promotion_type: {
            type: String,
            enum: ['featured_today', 'sponsored', 'premium'],
            default: 'featured_today',
            required: true
        },
        display_data: {
            banner_image_url: {
                type: String,
                required: true,
                trim: true
            },
            banner_text: {
                type: String,
                trim: true,
                maxlength: 200
            },
            link_url: {
                type: String,
                required: true,
                trim: true
            }
        },
        scheduling: {
            start_date: {
                type: Date,
                required: true,
                index: true
            },
            end_date: {
                type: Date,
                required: true,
                index: true
            },
            display_priority: {
                type: Number,
                default: 50,
                min: 1,
                max: 100
            }
        },
        targeting: {
            locations: [{
                type: String,
                trim: true
            }],
            show_on_homepage: {
                type: Boolean,
                default: true
            }
        },
        analytics: {
            impressions: {
                type: Number,
                default: 0,
                min: 0
            },
            clicks: {
                type: Number,
                default: 0,
                min: 0
            },
            conversion_rate: {
                type: Number,
                default: 0,
                min: 0
            }
        },
        payment: {
            amount_paid: {
                type: Number,
                default: 0,
                min: 0
            },
            payment_status: {
                type: String,
                enum: ['pending', 'paid', 'refunded'],
                default: 'pending'
            },
            payment_date: {
                type: Date
            }
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true
        },
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
    }
);

// Indexes for query performance
FeaturedPromotionSchema.index({ is_active: 1, 'scheduling.start_date': 1, 'scheduling.end_date': 1 });
FeaturedPromotionSchema.index({ 'scheduling.display_priority': -1 });
FeaturedPromotionSchema.index({ outlet_id: 1, is_active: 1 });

// Virtual to calculate CTR
FeaturedPromotionSchema.virtual('ctr').get(function() {
    return this.analytics.impressions > 0 
        ? (this.analytics.clicks / this.analytics.impressions * 100).toFixed(2)
        : 0;
});

// Method to check if promotion is currently active
FeaturedPromotionSchema.methods.isCurrentlyActive = function(): boolean {
    const now = new Date();
    return this.is_active && 
           this.scheduling.start_date <= now && 
           this.scheduling.end_date >= now;
};

export const FeaturedPromotion = mongoose.model<IFeaturedPromotion>('FeaturedPromotion', FeaturedPromotionSchema);
