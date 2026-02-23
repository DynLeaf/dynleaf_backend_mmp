
import mongoose, { Schema } from 'mongoose';

const MONGODB_URI = 'mongodb+srv://doadmin:q36471r9m08zEo5O@db-mongodb-blr1-66718-c52e5055.mongo.ondigitalocean.com/dynleaf_restore?tls=true&authSource=admin&replicaSet=db-mongodb-blr1-66718';

const MallQRConfigSchema = new Schema(
    {
        mall_key: { type: String, required: true },
        image: { type: String }
    },
    { collection: 'mall_qr_configs' }
);

const MallQRConfig = mongoose.model('MallQRConfig', MallQRConfigSchema);

async function check() {
    try {
        await mongoose.connect(MONGODB_URI);
        const configs = await MallQRConfig.find({}).lean();
        console.log('Configs:', JSON.stringify(configs, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

check();
