import mongoose, { Schema, Document } from 'mongoose';

export interface IMallQRConfig extends Document {
    mall_key: string;
    mall_name: string;
    city?: string;
    state?: string;
    qr_url: string;
    last_generated_at: Date;
    created_at: Date;
    updated_at: Date;
}

const MallQRConfigSchema = new Schema<IMallQRConfig>(
    {
        mall_key: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        mall_name: {
            type: String,
            required: true
        },
        city: {
            type: String
        },
        state: {
            type: String
        },
        qr_url: {
            type: String,
            required: true
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

MallQRConfigSchema.index({ mall_key: 1 });
MallQRConfigSchema.index({ last_generated_at: -1 });

const MallQRConfig = mongoose.model<IMallQRConfig>(
    'MallQRConfig',
    MallQRConfigSchema,
    'mall_qr_configs'
);

export default MallQRConfig;
