import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';
import bcrypt from 'bcryptjs';

dotenv.config();

async function testAdminPassword() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Test admin@dynleaf.com
        const admin1 = await Admin.findOne({ email: 'admin@dynleaf.com' });
        if (admin1) {
            console.log('Testing admin@dynleaf.com:');
            console.log('Password hash:', admin1.password_hash.substring(0, 20) + '...');

            const isValid1 = await admin1.comparePassword('admin123');
            console.log('Password "admin123" valid:', isValid1);

            // Also test direct bcrypt
            const directCheck1 = await bcrypt.compare('admin123', admin1.password_hash);
            console.log('Direct bcrypt check:', directCheck1);
            console.log('');
        }

        // Test admin@gmail.com
        const admin2 = await Admin.findOne({ email: 'admin@gmail.com' });
        if (admin2) {
            console.log('Testing admin@gmail.com:');
            console.log('Password hash:', admin2.password_hash.substring(0, 20) + '...');

            const isValid2 = await admin2.comparePassword('pass@123');
            console.log('Password "pass@123" valid:', isValid2);

            // Also test direct bcrypt
            const directCheck2 = await bcrypt.compare('pass@123', admin2.password_hash);
            console.log('Direct bcrypt check:', directCheck2);
            console.log('');
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

testAdminPassword();
