import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Ensure indexes for all models automatically
        const ensureIndexes = () => {
            console.log('[mongo] Ensuring all model indexes...');
            Object.values(mongoose.models).forEach(model => {
                model.createIndexes().catch(err => {
                    if (!err.message.includes('already exists')) {
                        console.error(`Index creation failed for ${model.modelName}:`, err.message);
                    }
                });
            });
        };

        ensureIndexes();
        conn.connection.on('connected', ensureIndexes);

    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
