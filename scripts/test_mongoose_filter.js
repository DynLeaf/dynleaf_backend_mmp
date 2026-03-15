import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';

const staffUserSchema = new mongoose.Schema({
    name: String,
    role: String,
    status: String
});

const StaffUser = mongoose.model('StaffUserTest', staffUserSchema, 'staffusers');

async function test() {
  await mongoose.connect(MONGO_URI);
  
  console.log('--- No Filter ---');
  const all = await StaffUser.find({}).lean();
  console.log('Count:', all.length);

  console.log('--- Filter with undefined values ---');
  const filter: any = { role: undefined, status: undefined };
  const filtered = await StaffUser.find(filter).lean();
  console.log('Count with undefined filter:', filtered.length);
  
  console.log('--- Clean Filter ---');
  const cleanFilter: any = {};
  if (filter.role) cleanFilter.role = filter.role;
  if (filter.status) cleanFilter.status = filter.status;
  const cleaned = await StaffUser.find(cleanFilter).lean();
  console.log('Count with clean filter:', cleaned.length);

  await mongoose.disconnect();
}

test().catch(console.error);
