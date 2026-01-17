import { Outlet } from './src/models/Outlet.js';
import { Offer } from './src/models/Offer.js';
import { Follow } from './src/models/Follow.js';
import { notifyFollowersOfNewOffer } from './src/services/notificationService.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testOfferNotification() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
    console.log('✅ Connected to MongoDB');
    
    // Find a random outlet
    console.log('\n📍 Finding a random outlet...');
    const outlet = await Outlet.findOne();
    
    if (!outlet) {
      console.log('❌ No outlets found in database');
      await mongoose.disconnect();
      return;
    }
    
    console.log(`✅ Found outlet: ${outlet.name} (ID: ${outlet._id})`);
    
    // Check followers for this outlet
    const followersCount = await Follow.countDocuments({ outlet: outlet._id });
    console.log(`👥 Outlet has ${followersCount} followers`);
    
    if (followersCount === 0) {
      console.log('⚠️  No followers for this outlet. The notification function will run but won\'t send to anyone.');
    }
    
    // Create a test offer
    console.log('\n📝 Creating test offer...');
    const testOffer = await Offer.create({
      brand_id: outlet.brand_id,
      created_by_user_id: new mongoose.Types.ObjectId(),
      created_by_role: 'admin',
      outlet_ids: [outlet._id],
      location: outlet.location,
      title: `Test Offer - ${new Date().toLocaleTimeString()}`,
      subtitle: 'Test notification for offer',
      description: 'Testing notifyFollowersOfNewOffer function',
      offer_type: 'discount',
      discount_percentage: 20,
      is_active: true,
      show_on_menu: true,
      approval_status: 'approved'
    });
    
    console.log(`✅ Offer created: ${testOffer._id}`);
    
    // Trigger the notification
    console.log('\n🔔 Triggering notifyFollowersOfNewOffer...');
    await notifyFollowersOfNewOffer(testOffer._id.toString(), outlet._id.toString());
    
    console.log('✅ Function executed! Check server logs for details:');
    console.log('   - "[NotifyFollowers] Starting notification process..."');
    console.log('   - "FCM: Attempting to send push..."');
    console.log('   - "FCM: Push summary..."');
    
    await mongoose.disconnect();
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testOfferNotification();
