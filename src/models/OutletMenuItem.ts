import mongoose, { Document, Schema } from 'mongoose';

/**
 * OutletMenuItem - Junction table linking outlets to food items
 * Purpose: Manages outlet-specific menu customization
 * - Availability per outlet
 * - Pricing overrides
 * - Menu ordering
 * - Stock management
 * - Geospatial queries for nearby food search
 */

export interface IOutletMenuItem extends Document {
    outlet_id: mongoose.Types.ObjectId;
    food_item_id: mongoose.Types.ObjectId;
    brand_id: mongoose.Types.ObjectId; // Denormalized for fast queries
    
    // Availability
    is_available: boolean;
    stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
    daily_limit?: number; // Max orders per day (null = unlimited)
    daily_sold: number; // Counter reset daily
    
    // Pricing (outlet-specific)
    price_override?: number; // Override brand's base_price
    discount_override?: number; // Override brand's discount
    
    // Menu organization
    display_order: number; // Order in THIS outlet's menu
    is_featured_at_outlet: boolean; // Featured at THIS outlet
    section_id?: string; // Menu section ("starters", "mains")
    
    // Location (denormalized from outlet for geospatial queries)
    location?: {
        type: string;
        coordinates: [number, number]; // [lng, lat]
    };
    
    // Outlet-specific overrides
    preparation_time_override?: number; // Different kitchen speed
    custom_note?: string; // "Chef's special today!"
    
    // Engagement (outlet-specific)
    votes_at_outlet: number;
    rating_at_outlet: number;
    orders_at_outlet: number;
    views_at_outlet: number;
    
    // Time-based availability
    available_days?: number[]; // [0,1,2,3,4,5,6] = Sun-Sat
    available_time_start?: string; // "11:00"
    available_time_end?: string; // "15:00"
    
    last_stock_update?: Date;
    created_at: Date;
    updated_at: Date;
}

const outletMenuItemSchema = new Schema<IOutletMenuItem>({
    outlet_id: {
        type: Schema.Types.ObjectId,
        ref: 'Outlet',
        required: true,
        index: true
    },
    food_item_id: {
        type: Schema.Types.ObjectId,
        ref: 'FoodItem',
        required: true,
        index: true
    },
    brand_id: {
        type: Schema.Types.ObjectId,
        ref: 'Brand',
        required: true,
        index: true
    },
    
    // Availability
    is_available: {
        type: Boolean,
        default: true,
        index: true
    },
    stock_status: {
        type: String,
        enum: ['in_stock', 'low_stock', 'out_of_stock'],
        default: 'in_stock'
    },
    daily_limit: {
        type: Number,
        default: null
    },
    daily_sold: {
        type: Number,
        default: 0
    },
    
    // Pricing
    price_override: {
        type: Number,
        default: null
    },
    discount_override: {
        type: Number,
        default: null,
        min: 0,
        max: 100
    },
    
    // Menu organization
    display_order: {
        type: Number,
        default: 0,
        index: true
    },
    is_featured_at_outlet: {
        type: Boolean,
        default: false,
        index: true
    },
    section_id: {
        type: String,
        default: null
    },
    
    // Location (for geospatial queries)
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [lng, lat]
            index: '2dsphere'
        }
    },
    
    // Overrides
    preparation_time_override: {
        type: Number,
        default: null
    },
    custom_note: {
        type: String,
        default: null
    },
    
    // Engagement
    votes_at_outlet: {
        type: Number,
        default: 0
    },
    rating_at_outlet: {
        type: Number,
        default: 0
    },
    orders_at_outlet: {
        type: Number,
        default: 0,
        index: true // For trending dishes
    },
    views_at_outlet: {
        type: Number,
        default: 0
    },
    
    // Time-based availability
    available_days: {
        type: [Number],
        default: null
    },
    available_time_start: {
        type: String,
        default: null
    },
    available_time_end: {
        type: String,
        default: null
    },
    
    last_stock_update: {
        type: Date,
        default: null
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Compound indexes for performance
outletMenuItemSchema.index({ outlet_id: 1, brand_id: 1 });
outletMenuItemSchema.index({ outlet_id: 1, is_available: 1, display_order: 1 }); // Menu queries
outletMenuItemSchema.index({ food_item_id: 1, outlet_id: 1 }, { unique: true }); // Prevent duplicates
outletMenuItemSchema.index({ location: '2dsphere', is_available: 1 }); // Nearby food search
outletMenuItemSchema.index({ brand_id: 1, is_available: 1 });
outletMenuItemSchema.index({ outlet_id: 1, is_featured_at_outlet: 1 });
outletMenuItemSchema.index({ outlet_id: 1, section_id: 1, display_order: 1 }); // Section queries
outletMenuItemSchema.index({ orders_at_outlet: -1 }); // Trending dishes

// Geospatial index (CRITICAL for nearby food search)
outletMenuItemSchema.index({ location: '2dsphere' });

export const OutletMenuItem = mongoose.model<IOutletMenuItem>('OutletMenuItem', outletMenuItemSchema);
