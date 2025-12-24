import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf_mmp');
        console.log('✅ Connected to MongoDB');

        const adminPhone = process.env.ADMIN_PHONE || '+919999999999';

        const existingAdmin = await User.findOne({ phone: adminPhone });
        
        if (existingAdmin) {
            console.log('ℹ️  Admin user already exists');
            console.log('Phone:', adminPhone);
            console.log('Roles:', existingAdmin.roles);
            process.exit(0);
        }

        const admin = await User.create({
            phone: adminPhone,
            roles: [{
                scope: 'platform',
                role: 'admin',
                assignedAt: new Date()
            }],
            is_verified: true,
            is_active: true,
            currentStep: 'DONE'
        });

        console.log('✅ Admin user created successfully!');
        console.log('Phone:', adminPhone);
        console.log('User ID:', admin._id);
        console.log('\n📱 Use OTP: 123456 (development mode)');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();
