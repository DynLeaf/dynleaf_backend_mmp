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
        console.log('✅ Connected to MongoDB (test database)\n');

        // Get all admins
        const admins = await Admin.find({}).select('-password_hash').lean();

        console.log('📋 Admin Users in TEST Database:');
        console.log('═══════════════════════════════════════════════════════════');

        if (admins.length === 0) {
            console.log('❌ No admin users found in test database!');
        } else {
            admins.forEach((admin, index) => {
                console.log(`\n${index + 1}. Admin Details:`);
                console.log('   ─────────────────────────────────');
                console.log('   ID:', admin._id);
                console.log('   Email:', admin.email);
                console.log('   Name:', admin.full_name);
                console.log('   Role:', admin.role);
                console.log('   Active:', admin.is_active);
            });
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`\nTotal Admins in TEST db: ${admins.length}\n`);

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

listAdminsInTestDb();
