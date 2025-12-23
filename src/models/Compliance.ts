import mongoose from 'mongoose';

const complianceSchema = new mongoose.Schema({
    outlet_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', unique: true, required: true },
    fssai_number: { type: String },
    gst_number: { type: String },
    gst_percentage: { type: Number },
    is_verified: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Compliance = mongoose.model('Compliance', complianceSchema);
