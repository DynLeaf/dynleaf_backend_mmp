import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodItem } from '../models/FoodItem.js';
import { AddOn } from '../models/AddOn.js';
import { Outlet } from '../models/Outlet.js';
import connectDB from '../config/db.js';

dotenv.config();

const seedAddons = async () => {
    try {
        await connectDB();
        console.log('Connected to database for seeding addons...');

        // Get first outlet
        const outlet = await Outlet.findOne();
        if (!outlet) {
            console.log('No outlet found. Please run seed.ts first.');
            process.exit(1);
        }

        console.log(`Using outlet: ${outlet.name}`);

        // Clear existing addons
        await AddOn.deleteMany({ outlet_id: outlet._id });
        console.log('Cleared existing addons.');

        // Create sample addons
        const addons = await AddOn.insertMany([
            {
                outlet_id: outlet._id,
                name: 'Extra Cheese',
                price: 50,
                category: 'Toppings',
                is_active: true
            },
            {
                outlet_id: outlet._id,
                name: 'Mushrooms',
                price: 40,
                category: 'Toppings',
                is_active: true
            },
            {
                outlet_id: outlet._id,
                name: 'Olives',
                price: 35,
                category: 'Toppings',
                is_active: true
            },
            {
                outlet_id: outlet._id,
                name: 'Pepperoni',
                price: 60,
                category: 'Toppings',
                is_active: true
            },
            {
                outlet_id: outlet._id,
                name: 'Garlic Bread',
                price: 80,
                category: 'Sides',
                is_active: true
            },
            {
                outlet_id: outlet._id,
                name: 'Coke (500ml)',
                price: 40,
                category: 'Beverages',
                is_active: true
            }
        ]);

        console.log(`Created ${addons.length} addons.`);

        // Get ALL food items (not just for this outlet, in case data is spread across outlets)
        const foodItems = await FoodItem.find();
        console.log(`Found ${foodItems.length} total food items in database.`);

        if (foodItems.length === 0) {
            console.log('No food items found. Please run seed.ts first to create food items.');
            process.exit(1);
        }

        // Add addon_ids to each food item
        const addonIds = addons.map(a => a._id);
        
        for (const item of foodItems) {
            // Add 2-4 random addons to each item
            const numAddons = Math.floor(Math.random() * 3) + 2; // 2 to 4 addons
            const selectedAddons = [...addonIds]
                .sort(() => Math.random() - 0.5)
                .slice(0, numAddons);
            
            await FoodItem.findByIdAndUpdate(item._id, {
                addon_ids: selectedAddons
            });
            console.log(`Updated ${item.name} with ${selectedAddons.length} addons`);
        }

        console.log(`Updated ${foodItems.length} food items with addons.`);
        console.log('Addon seeding complete!');
        
        process.exit(0);
    } catch (error) {
        console.error('Error seeding addons:', error);
        process.exit(1);
    }
};

seedAddons();
