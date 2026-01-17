import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Ensure indexes for all models automatically
        const ensureIndexes = async () => {
            // Wait a bit for models to be loaded from imports
            await new Promise(resolve => setTimeout(resolve, 1000));

            const models = Object.values(mongoose.models);
            if (models.length === 0) {
                console.warn('[mongo] No models loaded yet, indexes will be created when models are imported');
                return;
            }

            console.log(`[mongo] Ensuring indexes for ${models.length} models...`);

            for (const model of models) {
                try {
                    await model.createIndexes();
                    console.log(`[mongo] ✅ Indexes created for ${model.modelName}`);
                } catch (err: any) {
                    if (err.message?.includes('already exists')) {
                        console.log(`[mongo] ℹ️  Indexes already exist for ${model.modelName}`);
                    } else {
                        console.error(`[mongo] ❌ Index creation failed for ${model.modelName}:`, err.message);
                    }
                }
            }

            console.log('[mongo] Index creation complete');
        };

        // Run index creation after a delay to allow models to load
        setTimeout(ensureIndexes, 2000);

    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
