import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Define schemas inline to avoid imports that trigger server startup
const userSchema = new mongoose.Schema({
    phone: String,
    roles: [{
        scope: String,
        role: String,
        brandId: mongoose.Schema.Types.ObjectId,
        outletId: mongoose.Schema.Types.ObjectId,
        permissions: [String],
        assignedAt: Date,
        assignedBy: mongoose.Schema.Types.ObjectId
    }]
}, { strict: false });

const brandSchema = new mongoose.Schema({
    name: String,
    admin_user_id: mongoose.Schema.Types.ObjectId
}, { strict: false });

const outletSchema = new mongoose.Schema({
    name: String,
    brand_id: mongoose.Schema.Types.ObjectId,
    created_by_user_id: mongoose.Schema.Types.ObjectId
}, { strict: false });

const User = mongoose.model('User', userSchema);
const Brand = mongoose.model('Brand', brandSchema);
const Outlet = mongoose.model('Outlet', outletSchema);

/**
 * Fix missing brand and outlet roles for existing users
 * This script assigns proper brand-level and outlet-level roles to users
 * who created brands/outlets but don't have the corresponding roles
 */
async function fixUserRoles() {
    try {
        console.log('🔧 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI!);
        console.log('✅ Connected to MongoDB\n');

        // Get all brands
        const brands = await Brand.find({});
        console.log(`📊 Found ${brands.length} brands\n`);

        let brandRolesAdded = 0;
        let outletRolesAdded = 0;

        // Process each brand
        for (const brand of brands) {
            const userId = brand.admin_user_id;
            const user = await User.findById(userId);

            if (!user) {
                console.log(`⚠️  User not found for brand: ${brand.name} (${brand._id})`);
                continue;
            }

            // Check if user has brand-level role
            const hasBrandRole = user.roles.some(r => 
                r.scope === 'brand' && 
                r.role === 'restaurant_owner' && 
                r.brandId?.toString() === brand._id.toString()
            );

            if (!hasBrandRole) {
                user.roles.push({
                    scope: 'brand',
                    role: 'restaurant_owner',
                    brandId: brand._id as mongoose.Types.ObjectId,
                    permissions: [],
                    assignedAt: new Date(),
                    assignedBy: userId as mongoose.Types.ObjectId
                } as any);
                await user.save();
                brandRolesAdded++;
                console.log(`✅ Added brand role for user ${user.phone} → brand: ${brand.name}`);
            }

            // Get all outlets for this brand
            const outlets = await Outlet.find({ brand_id: brand._id });
            
            for (const outlet of outlets) {
                const outletUserId = outlet.created_by_user_id;
                const outletUser = await User.findById(outletUserId);

                if (!outletUser) {
                    console.log(`⚠️  User not found for outlet: ${outlet.name} (${outlet._id})`);
                    continue;
                }

                // Check if user has outlet-level role
                const hasOutletRole = outletUser.roles.some(r => 
                    r.scope === 'outlet' && 
                    r.role === 'restaurant_owner' && 
                    r.outletId?.toString() === outlet._id.toString()
                );

                if (!hasOutletRole) {
                    outletUser.roles.push({
                        scope: 'outlet',
                        role: 'restaurant_owner',
                        outletId: outlet._id as mongoose.Types.ObjectId,
                        brandId: brand._id as mongoose.Types.ObjectId,
                        permissions: [],
                        assignedAt: new Date(),
                        assignedBy: outletUserId as mongoose.Types.ObjectId
                    } as any);
                    await outletUser.save();
                    outletRolesAdded++;
                    console.log(`✅ Added outlet role for user ${outletUser.phone} → outlet: ${outlet.name}`);
                }
            }
        }

        console.log('\n📊 Summary:');
        console.log(`   Brand roles added: ${brandRolesAdded}`);
        console.log(`   Outlet roles added: ${outletRolesAdded}`);
        console.log('✅ Done!');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

fixUserRoles();
