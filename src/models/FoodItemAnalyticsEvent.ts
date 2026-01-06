import mongoose, { Document, Schema } from 'mongoose';

export type FoodItemAnalyticsEventType =
  | 'item_impression'
  | 'item_view'
  | 'add_to_cart'
  | 'order_created'
  | 'favorite'
  | 'share';

export type FoodItemAnalyticsSource =
  | 'menu'
  | 'explore'
  | 'home'
  | 'search'
  | 'shared'
  | 'promo'
  | 'notification'
  | 'other';

export interface IFoodItemAnalyticsEvent extends Document {
  outlet_id: mongoose.Types.ObjectId;
  food_item_id: mongoose.Types.ObjectId;
  category_id?: mongoose.Types.ObjectId;

  event_type: FoodItemAnalyticsEventType;

  session_id: string;
  device_type: 'mobile' | 'desktop' | 'tablet';
  user_agent?: string;

  source: FoodItemAnalyticsSource;
  source_context?: Record<string, any>;

  user_id?: mongoose.Types.ObjectId;
  ip_address?: string;

  timestamp: Date;
}

const foodItemAnalyticsEventSchema = new Schema<IFoodItemAnalyticsEvent>(
  {
    outlet_id: {
      type: Schema.Types.ObjectId,
      ref: 'Outlet',
      required: true,
      index: true,
    },
    food_item_id: {
      type: Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true,
      index: true,
    },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', index: true },

    event_type: {
      type: String,
      enum: ['item_impression', 'item_view', 'add_to_cart', 'order_created', 'favorite', 'share'],
      required: true,
      index: true,
    },

    session_id: { type: String, required: true },
    device_type: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet'],
      required: true,
    },
    user_agent: { type: String },

    source: {
      type: String,
      enum: ['menu', 'explore', 'home', 'search', 'shared', 'promo', 'notification', 'other'],
      required: true,
      index: true,
    },
    source_context: { type: Schema.Types.Mixed },

    user_id: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    ip_address: { type: String },

    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

foodItemAnalyticsEventSchema.index({ outlet_id: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ outlet_id: 1, event_type: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ outlet_id: 1, food_item_id: 1, event_type: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ food_item_id: 1, event_type: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ category_id: 1, event_type: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ session_id: 1, timestamp: -1 });
foodItemAnalyticsEventSchema.index({ timestamp: 1 });

export const FoodItemAnalyticsEvent = mongoose.model<IFoodItemAnalyticsEvent>(
  'FoodItemAnalyticsEvent',
  foodItemAnalyticsEventSchema
);
