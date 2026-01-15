import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function seedDefaultAdmin() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Check if any admin exists
        const existingAdmin = await Admin.findOne({ email: 'admin@gmail.com' });

        if (existingAdmin) {
            console.log('ℹ️  Default admin already exists');
            console.log('Email: admin@gmail.com');
            console.log('You can create additional admins using: npm run create:admin');
            process.exit(0);
        }

        // Create default admin
        const admin = await Admin.create({
            email: 'admin@gmail.com',
            full_name: 'System Admin',
            password_hash: 'pass@123', // Will be hashed by pre-save hook
            role: 'super_admin',
            is_active: true,
            permissions: ['*']
        });

        console.log('\n✅ Default admin created successfully!');
        console.log('\n📧 Login Credentials:');
        console.log('─────────────────────────────────');
        console.log('Email: admin@gmail.com');
        console.log('Password: pass@123');
        console.log('─────────────────────────────────');
        console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

    } catch (error: any) {
        console.error('❌ Error seeding admin:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
seedDefaultAdmin();
