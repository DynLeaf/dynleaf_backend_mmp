import mongoose, { Schema, Document } from 'mongoose';

export interface IOutletAnalyticsEvent extends Document {
  outlet_id: mongoose.Types.ObjectId;
  event_type: 'outlet_visit' | 'profile_view' | 'menu_view';

  session_id: string;
  device_type: 'mobile' | 'desktop' | 'tablet';
  user_agent: string;

  entry_page?: 'menu' | 'profile';
  source?: string;
  prev_path?: string;
  promotion_id?: mongoose.Types.ObjectId;

  city?: string;
  country?: string;
  ip_address?: string;

  timestamp: Date;
}

const outletAnalyticsEventSchema = new Schema<IOutletAnalyticsEvent>(
  {
    outlet_id: {
      type: Schema.Types.ObjectId,
      ref: 'Outlet',
      required: true,
      index: true,
    },
    event_type: {
      type: String,
      enum: ['outlet_visit', 'profile_view', 'menu_view'],
      required: true,
    },

    session_id: { type: String, required: true },
    device_type: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet'],
      required: true,
    },
    user_agent: { type: String },

    entry_page: { type: String, enum: ['menu', 'profile'] },
    source: { type: String },
    prev_path: { type: String },
    promotion_id: { type: Schema.Types.ObjectId, ref: 'FeaturedPromotion' },

    city: { type: String },
    country: { type: String },
    ip_address: { type: String },

    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

outletAnalyticsEventSchema.index({ outlet_id: 1, timestamp: -1 });
outletAnalyticsEventSchema.index({ outlet_id: 1, event_type: 1, timestamp: -1 });
outletAnalyticsEventSchema.index({ outlet_id: 1, session_id: 1, timestamp: -1 });
outletAnalyticsEventSchema.index({ outlet_id: 1, session_id: 1, event_type: 1, timestamp: -1 });
outletAnalyticsEventSchema.index({ timestamp: 1 });

export const OutletAnalyticsEvent = mongoose.model<IOutletAnalyticsEvent>(
  'OutletAnalyticsEvent',
  outletAnalyticsEventSchema
);
