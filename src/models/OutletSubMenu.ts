import mongoose, { Document, Schema } from 'mongoose';

export interface IOutletSubMenu extends Document {
    outlet_id: mongoose.Types.ObjectId;
    name: string;
    slug: string;               // URL-safe version of name e.g. "cake-counter"
    description?: string;
    icon?: string;              // emoji or icon name e.g. "🎂"
    display_order: number;      // position in switcher bar
    is_active: boolean;
    category_ids: mongoose.Types.ObjectId[];  // which categories belong to this sub-menu
    created_at?: Date;
    updated_at?: Date;
}

const outletSubMenuSchema = new Schema<IOutletSubMenu>(
    {
        outlet_id: {
            type: Schema.Types.ObjectId,
            ref: 'Outlet',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 300
        },
        icon: {
            type: String,
            trim: true,
            maxlength: 10
        },
        display_order: {
            type: Number,
            default: 0
        },
        is_active: {
            type: Boolean,
            default: true
        },
        category_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Category'
            }
        ]
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
    }
);

// Compound unique index: one slug per outlet
outletSubMenuSchema.index({ outlet_id: 1, slug: 1 }, { unique: true });
// For ordered listing
outletSubMenuSchema.index({ outlet_id: 1, display_order: 1 });

export const OutletSubMenu = mongoose.model<IOutletSubMenu>('OutletSubMenu', outletSubMenuSchema);
