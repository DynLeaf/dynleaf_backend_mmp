import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

async function seedAdminToUsers() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const adminId = new mongoose.Types.ObjectId('000000000000000000000001');

        // Check if admin already exists by ID or username
        let existingAdmin = await User.findById(adminId);

        if (!existingAdmin) {
            existingAdmin = await User.findOne({ username: 'admin' });
        }

        if (existingAdmin) {
            console.log('ℹ️  Admin user found, updating to ensure correct configuration...');

            // Update existing admin
            existingAdmin.username = 'admin';
            existingAdmin.phone = '+0000000000';
            existingAdmin.roles = [
                {
                    scope: 'platform',
                    role: 'admin',
                    assignedAt: new Date()
                }
            ];
            existingAdmin.is_active = true;
            existingAdmin.is_verified = true;
            existingAdmin.currentStep = 'DONE';

            await existingAdmin.save();

            console.log('\n✅ Admin user updated successfully!');
            console.log('\n👤 Admin Details:');
            console.log('─────────────────────────────────');
            console.log('ID:', existingAdmin._id);
            console.log('Username: admin');
            console.log('Phone: +0000000000');
            console.log('Role: platform admin');
            console.log('Active: true');
            console.log('Verified: true');
            console.log('─────────────────────────────────\n');

            await mongoose.disconnect();
            console.log('✅ Disconnected from MongoDB');
            process.exit(0);
        }

        // Create admin user in User collection
        const admin = new User({
            _id: adminId,
            username: 'admin',
            phone: '+0000000000',
            roles: [
                {
                    scope: 'platform',
                    role: 'admin',
                    assignedAt: new Date()
                }
            ],
            is_active: true,
            is_verified: true,
            currentStep: 'DONE'
        });

        await admin.save();

        console.log('\n✅ Admin user created successfully in users collection!');
        console.log('\n👤 Admin Details:');
        console.log('─────────────────────────────────');
        console.log('ID: 000000000000000000000001');
        console.log('Username: admin');
        console.log('Phone: +0000000000');
        console.log('Role: platform admin');
        console.log('Active: true');
        console.log('Verified: true');
        console.log('─────────────────────────────────\n');

    } catch (error: any) {
        console.error('❌ Error seeding admin to users:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
seedAdminToUsers();
