import mongoose from 'mongoose';
import { Brand } from '../models/Brand.js';
import dotenv from 'dotenv';

dotenv.config();

const updateExistingBrands = async () => {
    try {
        // Connect to MongoDB (use same connection as backend)
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf_mmp';
        await mongoose.connect(mongoUri); 

      

        // Update all existing brands to be public and approved
        const result = await Brand.updateMany(
            {},  // Update ALL brands, no filter
            { 
                $set: { 
                    is_public: true,
                    is_active: true,
                    verification_status: 'approved'
                } 
            }
        );

       
        // Verify the update
        const brands = await Brand.find({});
        brands.forEach(brand => {
            console.log(`   - ${brand.name}: is_public=${brand.is_public}, is_active=${brand.is_active}, status=${brand.verification_status}`);
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) { 
        process.exit(1);
    }
};

updateExistingBrands();
