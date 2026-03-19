import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Customer } from '../models/Customer.js';
import { followupRepository } from '../repositories/followup.repository.js';

dotenv.config();

async function run() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    // Find all converted customers
    const convertedCustomers = await Customer.find({ status: 'converted' }).lean();
    console.log(`Found ${convertedCustomers.length} converted customers`);

    let updatedCount = 0;
    for (const customer of convertedCustomers) {
      const customerId = (customer._id as any).toString();
      await followupRepository.markPendingAsDone(customerId, 'Auto-cleaned up: Customer already converted');
      updatedCount++;
    }

    console.log(`Successfully completed pending followups for ${updatedCount} converted customers.`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB');
  }
}

run();
