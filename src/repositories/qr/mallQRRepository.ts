import { MallQRConfig, IMallQRConfig } from '../../models/MallQRConfig.js';

export class MallQRRepository {
    async findByMallKey(mallKey: string): Promise<IMallQRConfig | null> {
        return await MallQRConfig.findOne({ mall_key: mallKey }).lean();
    }

    async findByMallKeys(mallKeys: string[]): Promise<IMallQRConfig[]> {
        return await MallQRConfig.find({ mall_key: { $in: mallKeys } }).lean();
    }

    async upsertConfig(mallKey: string, data: Partial<IMallQRConfig>): Promise<IMallQRConfig> {
        return await MallQRConfig.findOneAndUpdate(
            { mall_key: mallKey },
            { 
                ...data,
                mall_key: mallKey,
                last_generated_at: new Date() 
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ) as IMallQRConfig;
    }
}

export const mallQRRepository = new MallQRRepository();
