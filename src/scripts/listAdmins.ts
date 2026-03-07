import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function listAdmins() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);

        // Get all admins
        const admins = await Admin.find({}).select('-password_hash').lean();



    } catch (error: any) {
        console.error('❌ Error listing admins:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Run the script
listAdmins();
