import mongoose, { Schema, Document } from 'mongoose';

export interface IOfferEvent extends Document {
    offer_id: mongoose.Types.ObjectId;
    outlet_id?: mongoose.Types.ObjectId;
    event_type: 'impression' | 'click' | 'view' | 'code_copy';

    session_id: string;
    device_type: 'mobile' | 'desktop' | 'tablet';
    user_agent: string;

    city?: string;
    country?: string;
    ip_address?: string;

    source?: string;
    source_context?: string;

    timestamp: Date;
}

const offerEventSchema = new Schema<IOfferEvent>({
    offer_id: {
        type: Schema.Types.ObjectId,
        ref: 'Offer',
        required: true,
        index: true
    },
    outlet_id: {
        type: Schema.Types.ObjectId,
        ref: 'Outlet',
        required: false,
        index: true
    },
    event_type: {
        type: String,
        enum: ['impression', 'click', 'view', 'code_copy'],
        required: true
    },

    session_id: { type: String, required: true },
    device_type: {
        type: String,
        enum: ['mobile', 'desktop', 'tablet'],
        required: true
    },
    user_agent: { type: String },

    city: { type: String },
    country: { type: String },
    ip_address: { type: String },

    source: { type: String },
    source_context: { type: String },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: false
});

// Compound indexes for efficient queries
offerEventSchema.index({ offer_id: 1, timestamp: -1 });
offerEventSchema.index({ offer_id: 1, event_type: 1, timestamp: -1 });
offerEventSchema.index({ offer_id: 1, session_id: 1, event_type: 1, timestamp: -1 });
offerEventSchema.index({ outlet_id: 1, timestamp: -1 });
offerEventSchema.index({ timestamp: 1 }); // For cleanup/archival

export const OfferEvent = mongoose.model<IOfferEvent>('OfferEvent', offerEventSchema);
