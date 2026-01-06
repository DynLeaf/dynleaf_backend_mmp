import mongoose, { Schema, Document } from 'mongoose';

export interface IPromotionEvent extends Document {
  promotion_id: mongoose.Types.ObjectId;
  outlet_id: mongoose.Types.ObjectId;
  event_type: 'impression' | 'click' | 'menu_view';
  
  session_id: string;
  device_type: 'mobile' | 'desktop' | 'tablet';
  user_agent: string;
  
  city?: string;
  country?: string;
  ip_address?: string;
  
  timestamp: Date;
}

const promotionEventSchema = new Schema<IPromotionEvent>({
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
  event_type: { 
    type: String, 
    enum: ['impression', 'click', 'menu_view'], 
    required: true 
  },
  
  session_id: { type: String, required: true },
  device_type: { 
    type: String, 
    enum: ['mobile', 'desktop', 'tablet'], 
    required: true 
  },
  user_agent: { type: String },
  
  city: { type: String },
  country: { type: String },
  ip_address: { type: String },
  
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: false
});

// Compound indexes for efficient queries
promotionEventSchema.index({ promotion_id: 1, timestamp: -1 });
promotionEventSchema.index({ promotion_id: 1, event_type: 1, timestamp: -1 });
promotionEventSchema.index({ promotion_id: 1, session_id: 1, event_type: 1, timestamp: -1 });
promotionEventSchema.index({ timestamp: 1 }); // For cleanup/archival

export const PromotionEvent = mongoose.model<IPromotionEvent>('PromotionEvent', promotionEventSchema);
