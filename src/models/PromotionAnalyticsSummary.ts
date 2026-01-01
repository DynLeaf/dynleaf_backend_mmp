import mongoose, { Schema, Document } from 'mongoose';

export interface IPromotionAnalyticsSummary extends Document {
  promotion_id: mongoose.Types.ObjectId;
  outlet_id: mongoose.Types.ObjectId;
  date: Date;
  
  metrics: {
    impressions: number;
    clicks: number;
    menu_views: number;
    unique_sessions: number;
    ctr: number; // Click-through rate
    conversion_rate: number; // Menu views / clicks
  };
  
  device_breakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  
  location_breakdown: Map<string, number>;
  
  hourly_breakdown: Array<{
    hour: number;
    impressions: number;
    clicks: number;
  }>;
}

const promotionAnalyticsSummarySchema = new Schema<IPromotionAnalyticsSummary>({
  promotion_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'FeaturedPromotion', 
    required: true, 
    index: true 
  },
  outlet_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'Outlet', 
    required: true, 
    index: true 
  },
  date: { type: Date, required: true, index: true },
  
  metrics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    menu_views: { type: Number, default: 0 },
    unique_sessions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    conversion_rate: { type: Number, default: 0 }
  },
  
  device_breakdown: {
    mobile: { type: Number, default: 0 },
    desktop: { type: Number, default: 0 },
    tablet: { type: Number, default: 0 }
  },
  
  location_breakdown: { 
    type: Map, 
    of: Number, 
    default: new Map() 
  },
  
  hourly_breakdown: [{
    hour: { type: Number, min: 0, max: 23 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 }
  }]
}, {
  timestamps: true
});

// Compound index for unique constraint and queries
promotionAnalyticsSummarySchema.index({ promotion_id: 1, date: 1 }, { unique: true });
promotionAnalyticsSummarySchema.index({ date: -1 });

export const PromotionAnalyticsSummary = mongoose.model<IPromotionAnalyticsSummary>(
  'PromotionAnalyticsSummary',
  promotionAnalyticsSummarySchema
);
