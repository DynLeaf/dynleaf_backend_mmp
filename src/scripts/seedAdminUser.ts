import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function seedAdminUser() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const adminId = new mongoose.Types.ObjectId('000000000000000000000001');

        // Check if admin already exists
        const existingAdmin = await Admin.findById(adminId);

        if (existingAdmin) {
            console.log('ℹ️  Admin user already exists');
            console.log('Email:', existingAdmin.email);
            console.log('Role:', existingAdmin.role);
            process.exit(0);
        }

        // Create admin user with specific ID
        const admin = new Admin({
            _id: adminId,
            email: 'admin@dynleaf.com',
            full_name: 'Admin',
            password_hash: 'admin123', // Will be hashed by pre-save hook
            role: 'super_admin',
            is_active: true,
            permissions: ['*']
        });

        await admin.save();

        console.log('\n✅ Admin user created successfully!');
        console.log('\n📧 Login Credentials:');
        console.log('─────────────────────────────────');
        console.log('ID: 000000000000000000000001');
        console.log('Email: admin@dynleaf.com');
        console.log('Password: admin123');
        console.log('Role: super_admin');
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
seedAdminUser();
