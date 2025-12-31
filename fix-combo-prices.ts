import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixComboPrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('🔌 Connected to MongoDB\n');

    const db = mongoose.connection.db!;
    const combosCollection = db.collection('combos');

    const combos = await combosCollection.find({}).toArray();
    console.log('📦 Found', combos.length, 'combo(s)\n');

    for (const combo of combos) {
      let needsUpdate = false;
      const updates: any = {};

      // Calculate combo_price if missing
      if (!combo.combo_price && combo.original_price && combo.discount_percentage) {
        const discount = combo.discount_percentage / 100;
        const combo_price = Math.round(combo.original_price * (1 - discount));
        updates.combo_price = combo_price;
        needsUpdate = true;
      }

      // Ensure food_type is set
      if (!combo.food_type) {
        updates.food_type = 'mixed';
        needsUpdate = true;
      }

      if (needsUpdate) {
        await combosCollection.updateOne(
          { _id: combo._id },
          { $set: updates }
        );
        console.log('✅ Updated combo:', combo.name);
        if (updates.combo_price) {
          console.log('   Combo Price: ₹' + updates.combo_price);
          console.log('   Original Price: ₹' + combo.original_price);
          console.log('   Discount: ' + combo.discount_percentage + '%');
        }
        console.log('');
      }
    }

    console.log('✅ All combos updated!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixComboPrices();
