import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
    brand_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    created_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_by_role: { type: String },
    outlet_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Outlet' }],
    franchise_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' }],
    title: { type: String, required: true },
    subtitle: String,
    description: String,
    offer_type: String,
    banner_image_url: String,
    background_image_url: String,
    badge_text: String,
    code: String,
    terms: String,
    
    // Discount details
    discount_percentage: Number,
    discount_amount: Number,
    max_discount_amount: Number,
    
    // Conditions
    min_order_amount: Number,
    applicable_category_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    applicable_food_item_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' }],
    
    // Time-based rules
    days_of_week: [Number],
    time_from: String,
    time_to: String,
    
    visibility_scope: String,
    visibility_priority: Number,
    display_order: { type: Number, default: 0 },
    valid_from: Date,
    valid_till: Date,
    show_on_menu: { type: Boolean, default: true },
    approval_required: Boolean,
    approval_status: { type: String, default: 'pending' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: Date,
    review_note: String,
    is_active: { type: Boolean, default: true },
    view_count: { type: Number, default: 0 },
    click_count: { type: Number, default: 0 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Offer = mongoose.model('Offer', offerSchema);
