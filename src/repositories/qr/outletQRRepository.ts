import OutletQRConfig, { IOutletQRConfig } from '../../models/OutletQRConfig.js';
import mongoose from 'mongoose';

export class OutletQRRepository {
    async findByOutletId(outletId: string): Promise<IOutletQRConfig | null> {
        return await OutletQRConfig.findOne({ outlet_id: new mongoose.Types.ObjectId(outletId) }).lean();
    }

    async findByOutletIds(outletIds: string[]): Promise<IOutletQRConfig[]> {
        return await OutletQRConfig.find({ 
            outlet_id: { $in: outletIds.map(id => new mongoose.Types.ObjectId(id)) } 
        }).lean();
    }

    async upsertConfig(outletId: string, table_count: number): Promise<IOutletQRConfig> {
        return await OutletQRConfig.findOneAndUpdate(
            { outlet_id: new mongoose.Types.ObjectId(outletId) },
            { 
                outlet_id: new mongoose.Types.ObjectId(outletId), 
                table_count, 
                last_generated_at: new Date() 
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ) as IOutletQRConfig;
    }
}

export const outletQRRepository = new OutletQRRepository();
