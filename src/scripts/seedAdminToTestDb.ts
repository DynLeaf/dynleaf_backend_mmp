import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function seedAdminToTestDb() {
    try {
        // Get the MONGO_URI and replace database name with 'test'
        let mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';

        // Replace the database name with 'test'
        if (mongoUri.includes('?')) {
            // Format: mongodb+srv://user:pass@host/dbname?options
            mongoUri = mongoUri.replace(/\/[^/?]+\?/, '/test?');
        } else {
            // Format: mongodb+srv://user:pass@host/dbname
            mongoUri = mongoUri.replace(/\/[^/]+$/, '/test');
        }

        console.log('Connecting to test database...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB (test database)');

        const adminId = new mongoose.Types.ObjectId('000000000000000000000001');

        // Check if admin already exists
        let existingAdmin = await Admin.findById(adminId);

        if (!existingAdmin) {
            existingAdmin = await Admin.findOne({ email: 'admin@dynleaf.com' });
        }

        if (existingAdmin) {
            console.log('\n✅ Admin already exists in test database!');
            console.log('\n👤 Admin Details:');
            console.log('─────────────────────────────────');
            console.log('ID:', existingAdmin._id);
            console.log('Email:', existingAdmin.email);
            console.log('Name:', existingAdmin.full_name);
            console.log('Role:', existingAdmin.role);
            console.log('─────────────────────────────────\n');
            process.exit(0);
        }

        // Create admin user
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

        console.log('\n✅ Admin user created successfully in test database!');
        console.log('\n📧 Login Credentials:');
        console.log('─────────────────────────────────');
        console.log('ID: 000000000000000000000001');
        console.log('Email: admin@dynleaf.com');
        console.log('Password: admin123');
        console.log('Role: super_admin');
        console.log('Database: test');
        console.log('─────────────────────────────────');
        console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

    } catch (error: any) {
        console.error('❌ Error seeding admin to test db:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
seedAdminToTestDb();
