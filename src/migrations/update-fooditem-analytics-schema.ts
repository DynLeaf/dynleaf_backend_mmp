/**
 * Migration Script: Update FoodItemAnalyticsEvent Schema
 * Adds 'homepage_trending' to the source enum
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';

async function updateSchema() {
    try {
        await mongoose.connect(MONGODB_URI);

        const db = mongoose.connection.db;

        if (!db) {
            throw new Error('Database connection not established');
        }

        // Drop the existing validation on the collection

        await db.command({
            collMod: 'fooditemanalyticsevents',
            validator: {
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['outlet_id', 'food_item_id', 'event_type', 'session_id', 'device_type', 'source'],
                    properties: {
                        outlet_id: { bsonType: 'objectId' },
                        food_item_id: { bsonType: 'objectId' },
                        category_id: { bsonType: 'objectId' },
                        event_type: {
                            enum: ['item_impression', 'item_view', 'add_to_cart', 'order_created', 'favorite', 'share']
                        },
                        session_id: { bsonType: 'string' },
                        device_type: {
                            enum: ['mobile', 'desktop', 'tablet']
                        },
                        user_agent: { bsonType: 'string' },
                        source: {
                            enum: [
                                'menu',
                                'explore',
                                'home',
                                'search',
                                'shared',
                                'promo',
                                'notification',
                                'trending',
                                'homepage_trending',
                                'other'
                            ]
                        },
                        source_context: { bsonType: 'object' },
                        user_id: { bsonType: 'objectId' },
                        ip_address: { bsonType: 'string' },
                        timestamp: { bsonType: 'date' }
                    }
                }
            },
            validationLevel: 'moderate'
        });


        // Verify the update
        const collections = await db.listCollections({ name: 'fooditemanalyticsevents' }).toArray();

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

updateSchema()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
