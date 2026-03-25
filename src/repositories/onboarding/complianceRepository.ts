import { Compliance } from '../../models/Compliance.js';
import mongoose from 'mongoose';

interface ComplianceData {
    outlet_id: mongoose.Types.ObjectId | string;
    fssai_number?: string;
    gst_number?: string;
    gst_percentage?: number;
    is_verified: boolean;
}

export const createCompliance = (data: ComplianceData) =>
    Compliance.create(data);
