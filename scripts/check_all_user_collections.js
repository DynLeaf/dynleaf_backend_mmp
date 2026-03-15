import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function check() {
  const conn = await mongoose.connect(MONGO_URI);
  console.log('Connected to Database:', conn.connection.name);
  
  const collections = ['staffusers', 'admins', 'users'];
  
  for (const collName of collections) {
    const coll = conn.connection.db.collection(collName);
    const count = await coll.countDocuments();
    console.log(`Collection [${collName}] count: ${count}`);
    if (count > 0) {
      const items = await coll.find({}).limit(5).toArray();
      items.forEach(i => console.log(`  - [${collName}] ${i.name || i.username || i.full_name || i._id} (${i.email || i.phone})`));
    }
  }
  
  await mongoose.disconnect();
}

check().catch(console.error);
