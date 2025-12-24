import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from '../models/User.js';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { Menu } from '../models/Menu.js';
import connectDB from '../config/db.js';

dotenv.config();

const seed = async () => {
    try {
        await connectDB();
        console.log('Connected to database for seeding...');

        // Clear existing data
        await User.deleteMany({});
        await Brand.deleteMany({});
        await Outlet.deleteMany({});
        await Category.deleteMany({});
        await FoodItem.deleteMany({});
        await Menu.deleteMany({});
        console.log('Cleared existing data.');

        // Create Admin User
        const passwordHash = await bcrypt.hash('password123', 10);
        const adminUser = await User.create({
            username: 'admin',
            email: 'admin@dynleaf.com',
            phone: '1234567890',
            password_hash: passwordHash,
            roles: [{ scope: 'platform', role: 'admin' }],
            is_verified: true,
            is_active: true,
            currentStep: 'DONE'
        });
        console.log('Created admin user.');

        // Create Brand
        const brand = await Brand.create({
            name: 'Pizza Hub',
            slug: 'pizza-hub',
            description: 'The best pizza in town',
            cuisines: ['Italian', 'Fast Food'],
            admin_user_id: adminUser._id,
            is_active: true,
            is_public: true,
            verification_status: 'verified'
        });
        console.log('Created brand.');

        // Create Outlet
        const outlet = await Outlet.create({
            brand_id: brand._id,
            created_by_user_id: adminUser._id,
            name: 'Pizza Hub Downtown',
            slug: 'pizza-hub-downtown',
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            address: {
                full: '123 Main St, Downtown',
                city: 'New York',
                state: 'NY',
                country: 'USA',
                pincode: '10001'
            },
            location: {
                type: 'Point',
                coordinates: [-74.0060, 40.7128]
            }
        });
        console.log('Created outlet.');

        // Update admin user with brand and outlet roles
        adminUser.roles.push({
            scope: 'brand',
            role: 'restaurant_owner',
            brandId: brand._id as mongoose.Types.ObjectId,
            assignedAt: new Date()
        });
        adminUser.roles.push({
            scope: 'outlet',
            role: 'manager',
            outletId: outlet._id as mongoose.Types.ObjectId,
            assignedAt: new Date()
        });
        await adminUser.save();
        console.log('Updated user roles.');

        // Create Categories
        const vegCategory = await Category.create({
            brand_id: brand._id,
            name: 'Veg Pizzas',
            slug: 'veg-pizzas',
            description: 'Fresh vegetarian pizzas'
        });

        const nonVegCategory = await Category.create({
            brand_id: brand._id,
            name: 'Non-Veg Pizzas',
            slug: 'non-veg-pizzas',
            description: 'Delicious meat pizzas'
        });
        console.log('Created categories.');

        // Create Food Items
        const margherita = await FoodItem.create({
            brand_id: brand._id,
            name: 'Margherita Pizza',
            description: 'Classic cheese and tomato',
            is_veg: true,
            base_price: 299,
            image_url: 'https://example.com/margherita.jpg'
        });

        const pepperoni = await FoodItem.create({
            brand_id: brand._id,
            name: 'Pepperoni Pizza',
            description: 'Spicy pepperoni with extra cheese',
            is_veg: false,
            base_price: 499,
            image_url: 'https://example.com/pepperoni.jpg'
        });
        console.log('Created food items.');

        // Create Menu
        await Menu.create({
            brand_id: brand._id,
            name: 'Main Menu',
            slug: 'main-menu',
            is_default: true,
            categories: [
                {
                    categoryId: vegCategory._id,
                    name: vegCategory.name,
                    slug: vegCategory.slug,
                    order: 1,
                    items: [{ foodItemId: margherita._id }]
                },
                {
                    categoryId: nonVegCategory._id,
                    name: nonVegCategory.name,
                    slug: nonVegCategory.slug,
                    order: 2,
                    items: [{ foodItemId: pepperoni._id }]
                }
            ]
        });
        console.log('Created menu.');

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (error: any) {
        console.error('Error seeding database:');
        console.error(error);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
};

seed();
