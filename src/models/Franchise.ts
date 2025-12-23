import mongoose from 'mongoose';

const franchiseSchema = new mongoose.Schema({
    brand_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    franchise_type: { type: String, enum: ['single_unit', 'multi_unit', 'master'] },
    status: { type: String, enum: ['pending', 'active', 'suspended', 'terminated'], default: 'pending' },
    territory: {
        name: String,
        type: String,
        boundary: mongoose.Schema.Types.Mixed
    },
    max_outlets: { type: Number },
    contract: {
        start_date: Date,
        end_date: Date
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Franchise = mongoose.model('Franchise', franchiseSchema);
