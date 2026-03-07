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

        // Get first outlet
        const outlet = await Outlet.findOne();
        if (!outlet) {
            process.exit(1);
        }


        // Clear existing addons
        await AddOn.deleteMany({ outlet_id: outlet._id });

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


        // Get ALL food items (not just for this outlet, in case data is spread across outlets)
        const foodItems = await FoodItem.find();

        if (foodItems.length === 0) {
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
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding addons:', error);
        process.exit(1);
    }
};

seedAddons();
