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
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');

    // Find a random outlet
    const outlet = await Outlet.findOne();

    if (!outlet) {
      await mongoose.disconnect();
      return;
    }


    // Check followers for this outlet
    const followersCount = await Follow.countDocuments({ outlet: outlet._id });






    // Trigger the notification
    await notifyFollowersOfNewOffer(testOffer._id.toString(), outlet._id.toString());


    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testOfferNotification();
