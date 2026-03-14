import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function check() {
  const conn = await mongoose.connect(MONGO_URI);
  console.log('Connected to Database:', conn.connection.name);
  const collections = await conn.connection.db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  if (collections.some(c => c.name === 'staffusers')) {
    const users = await conn.connection.db.collection('staffusers').find({}).toArray();
    console.log('Staff Users in this DB:', users.length);
    users.forEach(u => console.log(`- ${u.name} (${u.email})`));
  }
  
  await mongoose.disconnect();
}

check().catch(console.error);
