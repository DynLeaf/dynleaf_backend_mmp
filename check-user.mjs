import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function checkUser() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();
    
    const user = await db.collection('users').findOne({ _id: new ObjectId('69538eb2ac16a96c55a4d322') });
    console.log('\n📱 User:', user.phone);
    console.log('🎭 Roles:', JSON.stringify(user.roles, null, 2));
    
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId('6953b4fdce76ee3429d41cf0') });
    console.log('\n🏢 Outlet:', outlet.name);
    console.log('🏷️  Brand ID:', outlet.brand_id.toString());
    
    await client.close();
}

checkUser();
