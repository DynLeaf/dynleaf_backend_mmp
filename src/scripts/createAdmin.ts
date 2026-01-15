import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin.js';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function createAdmin() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Get admin details
        console.log('\n📝 Create New Admin User\n');

        const email = await question('Email: ');
        const fullName = await question('Full Name: ');
        const password = await question('Password: ');
        const roleInput = await question('Role (super_admin/admin/moderator) [default: admin]: ');

        const role = roleInput.trim() || 'admin';

        if (!['super_admin', 'admin', 'moderator'].includes(role)) {
            console.error('❌ Invalid role. Must be super_admin, admin, or moderator');
            process.exit(1);
        }

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: email.toLowerCase().trim() });
        if (existingAdmin) {
            console.error('❌ Admin with this email already exists');
            process.exit(1);
        }

        // Create admin
        const admin = await Admin.create({
            email: email.toLowerCase().trim(),
            full_name: fullName.trim(),
            password_hash: password, // Will be hashed by pre-save hook
            role,
            is_active: true,
            permissions: role === 'super_admin' ? ['*'] : []
        });

        console.log('\n✅ Admin created successfully!');
        console.log('\nAdmin Details:');
        console.log('─────────────────────────────────');
        console.log(`ID: ${admin._id}`);
        console.log(`Email: ${admin.email}`);
        console.log(`Name: ${admin.full_name}`);
        console.log(`Role: ${admin.role}`);
        console.log(`Active: ${admin.is_active}`);
        console.log('─────────────────────────────────\n');

    } catch (error: any) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    } finally {
        rl.close();
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
createAdmin();
