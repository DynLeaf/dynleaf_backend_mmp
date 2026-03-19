import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

// Minimal Order Schema for Migration
const orderSchema = new mongoose.Schema({
  communicationLogs: [{
    senderRole: String,
    content: String,
    timestamp: Date
  }],
  rejectionReason: String,
  salesAdditionalNotes: String,
  rejectionLog: [{
    rejectedAt: Date,
    reason: String
  }],
  resubmissionLog: [{
    resubmittedAt: Date,
    note: String,
    changes: Array
  }]
}, { strict: false });

const Order = mongoose.model('StaffOrder', orderSchema);

async function migrate() {
  console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected.');

  const orders = await Order.find({ 
    "communicationLogs.0": { $exists: true } 
  });

  console.log(`Found ${orders.length} orders with communication logs.`);
  let updatedCount = 0;

  for (const order of orders) {
    let needsUpdate = false;
    const newRejectionLog = [];
    const newResubmissionLog = [];

    // Prioritize re-extracting from communication logs chronologically
    for (const log of order.communicationLogs) {
      if (log.senderRole === 'crafter' && log.content.startsWith('Order Rejected: ')) {
        const reason = log.content.replace('Order Rejected: ', '').trim();
        newRejectionLog.push({
          rejectedAt: log.timestamp || new Date(),
          reason
        });
        needsUpdate = true;
      }
      else if (log.senderRole === 'salesman') {
        newResubmissionLog.push({
          resubmittedAt: log.timestamp || new Date(),
          note: log.content,
          changes: [] // No field comparisons were saved historically
        });
        needsUpdate = true;
      }
    }

    // Fallbacks if communicationLogs missed something but legacy fields exist
    // If we have a rejectionReason and no rejections exist in the array
    if (order.rejectionReason && newRejectionLog.length === 0) {
      newRejectionLog.push({
        rejectedAt: order._id.getTimestamp ? order._id.getTimestamp() : new Date(),
        reason: order.rejectionReason
      });
      needsUpdate = true;
    }

    // ONLY OVERWRITE IF WE FOUND NEW HISTORY
    if (needsUpdate) {
      // Set them if they are absolutely empty to avoid destroying actual new data 
      // (in case a user manually updated them in the last 10 minutes)
      const currentRegLen = order.rejectionLog?.length || 0;
      const currentResLen = order.resubmissionLog?.length || 0;

      if (currentRegLen === 0 && newRejectionLog.length > 0) {
        order.set('rejectionLog', newRejectionLog);
      }
      if (currentResLen === 0 && newResubmissionLog.length > 0) {
        order.set('resubmissionLog', newResubmissionLog);
      }
      
      await order.save();
      updatedCount++;
    }
  }

  console.log(`Migration Complete. Updates applied to ${updatedCount} orders.`);
  await mongoose.disconnect();
}

migrate().catch(console.error);
