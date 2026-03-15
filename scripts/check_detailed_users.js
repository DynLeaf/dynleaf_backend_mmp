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
    console.log(`\nCollection [${collName}] count: ${count}`);
    if (count > 0) {
      const items = await coll.find({}).toArray();
      items.forEach(i => {
          console.log(`  - name: ${i.name || i.username || i.full_name}, email: ${i.email}, role: ${i.role}, id: ${i._id}`);
      });
    }
  }
  
  await mongoose.disconnect();
}

check().catch(console.error);
