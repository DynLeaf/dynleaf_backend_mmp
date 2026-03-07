import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function listAdminsInTestDb() {
    try {
        // Get the MONGO_URI and replace database name with 'test'
        let mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';

        // Replace the database name with 'test'
        if (mongoUri.includes('?')) {
            mongoUri = mongoUri.replace(/\/[^/?]+\?/, '/test?');
        } else {
            mongoUri = mongoUri.replace(/\/[^/]+$/, '/test');
        }

        await mongoose.connect(mongoUri);

        // Get all admins
        const admins = await Admin.find({}).select('-password_hash').lean();



    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

listAdminsInTestDb();
