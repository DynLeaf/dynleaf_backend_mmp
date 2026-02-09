import mongoose, { Schema, Document } from 'mongoose';

export interface IOutletQRConfig extends Document {
    outlet_id: mongoose.Types.ObjectId;
    table_count: number;
    last_generated_at: Date;
    created_at: Date;
    updated_at: Date;
}

const OutletQRConfigSchema = new Schema<IOutletQRConfig>(
    {
        outlet_id: {
            type: Schema.Types.ObjectId,
            ref: 'Outlet',
            required: true,
            unique: true,
            index: true
        },
        table_count: {
            type: Number,
            required: true,
            min: 1,
            max: 1000,
            default: 1
        },
        last_generated_at: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);

// Indexes for efficient queries
OutletQRConfigSchema.index({ outlet_id: 1 });
OutletQRConfigSchema.index({ last_generated_at: -1 });

const OutletQRConfig = mongoose.model<IOutletQRConfig>(
    'OutletQRConfig',
    OutletQRConfigSchema,
    'outlet_qr_configs'
);

export default OutletQRConfig;
