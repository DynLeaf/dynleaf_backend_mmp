import mongoose, { Document, Schema } from 'mongoose';

export interface IOperatingHours extends Document {
    outlet_id: mongoose.Types.ObjectId;
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed: boolean;
    created_at: Date;
}

const operatingHoursSchema = new Schema<IOperatingHours>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    day_of_week: { 
        type: Number, 
        required: true,
        min: 0, 
        max: 6,
        validate: {
            validator: function(v: number) {
                return Number.isInteger(v) && v >= 0 && v <= 6;
            },
            message: 'day_of_week must be an integer between 0 (Sunday) and 6 (Saturday)'
        }
    },
    open_time: { 
        type: String,
        validate: {
            validator: function(v: string) {
                if (!v) return true;
                return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: 'open_time must be in HH:MM format'
        }
    },
    close_time: { 
        type: String,
        validate: {
            validator: function(v: string) {
                if (!v) return true;
                return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: 'close_time must be in HH:MM format'
        }
    },
    is_closed: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

operatingHoursSchema.index({ outlet_id: 1, day_of_week: 1 });

export const OperatingHours = mongoose.model<IOperatingHours>('OperatingHours', operatingHoursSchema);
