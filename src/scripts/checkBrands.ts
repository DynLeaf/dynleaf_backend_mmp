import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkBrands() {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) throw new Error('No db');
    
    const brands = await db.collection('brands').find({}, { 
        name: 1, 
        verification_status: 1, 
        is_active: 1 
    }).toArray();
    
    console.log('\n📊 All Brands:\n');
    brands.forEach(b => {
        console.log(`${b.name}:`);
        console.log(`  verification_status: "${b.verification_status}"`);
        console.log(`  is_active: ${b.is_active}`);
        console.log('');
    });
    
    const approvedActive = brands.filter(b => 
        b.verification_status === 'approved' && b.is_active === true
    );
    
    console.log(`✅ Approved & Active: ${approvedActive.length} / ${brands.length}`);
    
    await mongoose.disconnect();
}

checkBrands().catch(console.error);
