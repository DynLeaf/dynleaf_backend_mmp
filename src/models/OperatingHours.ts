import mongoose from 'mongoose';

const operatingHoursSchema = new mongoose.Schema({
    outlet_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
    day_of_week: { type: Number, min: 0, max: 6 },
    open_time: { type: String },
    close_time: { type: String },
    is_closed: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at' } });

export const OperatingHours = mongoose.model('OperatingHours', operatingHoursSchema);
