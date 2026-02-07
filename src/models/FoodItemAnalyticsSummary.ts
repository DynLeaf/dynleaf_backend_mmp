import mongoose, { Document, Schema } from 'mongoose';

export interface IFoodItemAnalyticsSummary extends Document {
  outlet_id: mongoose.Types.ObjectId;
  food_item_id: mongoose.Types.ObjectId;
  category_id?: mongoose.Types.ObjectId;

  date: Date;

  metrics: {
    impressions: number;
    views: number;
    add_to_cart: number;
    orders: number;
    unique_sessions: number;
    view_to_cart_rate: number;
    cart_to_order_rate: number;
  };

  device_breakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };

  source_breakdown: Record<string, number>;

  // Vote count snapshot from FoodItem model
  vote_count?: number;

  hourly_breakdown: Array<{
    hour: number;
    impressions: number;
    views: number;
    add_to_cart: number;
    orders: number;
  }>;
}

const foodItemAnalyticsSummarySchema = new Schema<IFoodItemAnalyticsSummary>(
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

    date: { type: Date, required: true, index: true },

    metrics: {
      impressions: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      add_to_cart: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      unique_sessions: { type: Number, default: 0 },
      view_to_cart_rate: { type: Number, default: 0 },
      cart_to_order_rate: { type: Number, default: 0 },
    },

    device_breakdown: {
      mobile: { type: Number, default: 0 },
      desktop: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
    },

    source_breakdown: { type: Schema.Types.Mixed, default: {} },

    vote_count: { type: Number, default: 0 },

    hourly_breakdown: [
      {
        hour: { type: Number, min: 0, max: 23 },
        impressions: { type: Number, default: 0 },
        views: { type: Number, default: 0 },
        add_to_cart: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
      },
    ],
  },
  {
    timestamps: true,
  }
);

foodItemAnalyticsSummarySchema.index(
  { outlet_id: 1, food_item_id: 1, date: 1 },
  { unique: true }
);
foodItemAnalyticsSummarySchema.index({ outlet_id: 1, date: -1 });
foodItemAnalyticsSummarySchema.index({ food_item_id: 1, date: -1 });
foodItemAnalyticsSummarySchema.index({ category_id: 1, date: -1 });
foodItemAnalyticsSummarySchema.index({ date: -1 });

export const FoodItemAnalyticsSummary = mongoose.model<IFoodItemAnalyticsSummary>(
  'FoodItemAnalyticsSummary',
  foodItemAnalyticsSummarySchema
);
