import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';

dotenv.config();

async function listAdmins() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Get all admins
        const admins = await Admin.find({}).select('-password_hash').lean();

        console.log('\n📋 Admin Users in Database:');
        console.log('═══════════════════════════════════════════════════════════');

        if (admins.length === 0) {
            console.log('No admin users found.');
        } else {
            admins.forEach((admin, index) => {
                console.log(`\n${index + 1}. Admin Details:`);
                console.log('   ─────────────────────────────────');
                console.log('   ID:', admin._id);
                console.log('   Email:', admin.email);
                console.log('   Name:', admin.full_name);
                console.log('   Role:', admin.role);
                console.log('   Active:', admin.is_active);
                console.log('   Permissions:', admin.permissions);
                console.log('   Created:', admin.created_at);
                console.log('   Last Login:', admin.last_login_at || 'Never');
            });
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`\nTotal Admins: ${admins.length}\n`);

    } catch (error: any) {
        console.error('❌ Error listing admins:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
listAdmins();
