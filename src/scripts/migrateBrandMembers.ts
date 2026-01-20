import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { BrandMember } from '../models/BrandMember.js';

dotenv.config();

/**
 * Migration script to create BrandMember records for existing brands
 * 
 * This script:
 * 1. Creates BrandMember for each brand owner (admin_user_id)
 * 2. Creates BrandMember for each unique outlet creator in the brand
 */

const migrateBrandMembers = async () => {
    try {
        console.log('🚀 Starting BrandMember migration...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log('✅ Connected to MongoDB\n');

        // Get all brands
        const brands = await Brand.find();
        console.log(`📊 Found ${brands.length} brands to process\n`);

        let totalMembersCreated = 0;
        let brandsProcessed = 0;

        for (const brand of brands) {
            console.log(`\n📦 Processing brand: ${brand.name} (${brand._id})`);

            // Check if brand already has members
            const existingMembers = await BrandMember.countDocuments({ brand_id: brand._id });
            if (existingMembers > 0) {
                console.log(`   ⏭️  Skipping - already has ${existingMembers} members`);
                continue;
            }

            let membersCreated = 0;

            // 1. Create BrandMember for brand owner (admin_user_id)
            const ownerId = brand.owner_user_id || brand.admin_user_id;
            if (ownerId) {
                try {
                    await BrandMember.create({
                        brand_id: brand._id,
                        user_id: ownerId,
                        role: 'brand_owner',
                        permissions: {
                            can_sync_menu: true,
                            can_manage_outlets: true,
                            can_manage_members: true
                        }
                    });
                    membersCreated++;
                    console.log(`   ✅ Created brand_owner for user ${ownerId}`);
                } catch (error: any) {
                    if (error.code === 11000) {
                        console.log(`   ⚠️  Brand owner already exists`);
                    } else {
                        console.error(`   ❌ Error creating brand owner:`, error.message);
                    }
                }
            }

            // 2. Get all outlets for this brand
            const outlets = await Outlet.find({ brand_id: brand._id });
            console.log(`   📍 Found ${outlets.length} outlets`);

            // 3. Get unique outlet creators (excluding brand owner)
            const uniqueCreators = [...new Set(
                outlets
                    .map(o => o.created_by_user_id.toString())
                    .filter(id => id !== ownerId?.toString())
            )];

            console.log(`   👥 Found ${uniqueCreators.length} unique outlet creators`);

            // 4. Create BrandMember for each outlet creator
            for (const creatorId of uniqueCreators) {
                try {
                    await BrandMember.create({
                        brand_id: brand._id,
                        user_id: creatorId,
                        role: 'outlet_manager',
                        permissions: {
                            can_sync_menu: true,
                            can_manage_outlets: false,
                            can_manage_members: false
                        }
                    });
                    membersCreated++;
                    console.log(`   ✅ Created outlet_manager for user ${creatorId}`);
                } catch (error: any) {
                    if (error.code === 11000) {
                        console.log(`   ⚠️  Outlet manager already exists for user ${creatorId}`);
                    } else {
                        console.error(`   ❌ Error creating outlet manager:`, error.message);
                    }
                }
            }

            totalMembersCreated += membersCreated;
            brandsProcessed++;
            console.log(`   ✨ Created ${membersCreated} members for ${brand.name}`);
        }

        console.log(`\n\n🎉 Migration complete!`);
        console.log(`📊 Summary:`);
        console.log(`   - Brands processed: ${brandsProcessed}/${brands.length}`);
        console.log(`   - Total members created: ${totalMembersCreated}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    }
};

// Run migration
migrateBrandMembers();
