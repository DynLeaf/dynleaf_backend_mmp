import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function createAdminGmail() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: 'admin@gmail.com' });

        if (existingAdmin) {

            // Update password
            existingAdmin.password_hash = 'pass@123'; // Will be hashed by pre-save hook
            await existingAdmin.save();

        } else {
            // Create new admin
            const admin = await Admin.create({
                email: 'admin@gmail.com',
                full_name: 'Admin',
                password_hash: 'pass@123', // Will be hashed by pre-save hook
                role: 'super_admin',
                is_active: true,
                permissions: ['*']
            });

        }


    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

createAdminGmail();
