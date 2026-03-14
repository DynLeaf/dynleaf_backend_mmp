import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';

async function check() {
  await mongoose.connect(MONGO_URI);
  const users = await mongoose.connection.db.collection('staffusers').find({}).toArray();
  console.log('Total Staff Users:', users.length);
  users.forEach(u => {
    console.log(`- ${u.name} (${u.email}) - ${u.role}`);
  });
  await mongoose.disconnect();
}

check().catch(console.error);
