import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI && process.env.NODE_ENV === 'production') {
            throw new Error('MONGODB_URI is required in production');
        }
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Ensure indexes for all models automatically
        const ensureIndexes = async () => {
            // Wait a bit for models to be loaded from imports
            await new Promise(resolve => setTimeout(resolve, 1000));

            const models = Object.values(mongoose.models);
            if (models.length === 0) {
                return;
            }

            for (const model of models) {
                try {
                    await model.createIndexes();
                } catch (err: any) {
                    if (!err?.message?.includes('already exists')) {
                        console.error(`[mongo] ❌ Index creation failed for ${model.modelName}:`, err?.message || err);
                    }
                }
            }
        };

        // Run index creation after a delay to allow models to load
        setTimeout(() => {
            ensureIndexes().catch(err => {
                console.error('[mongo] ❌ Async index creation failed:', err?.message || err);
            });
        }, 2000);

    } catch (error: any) {
        console.error(`Error connecting to MongoDB:`, error);
        process.exit(1);
    }
};

export default connectDB;
