import mongoose from 'mongoose';
import dns from 'node:dns';

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/dynleaf';

const getPrimaryMongoUri = () => process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_MONGO_URI;

const isSrvDnsRefusal = (error: any) => {
    const message = error?.message || '';
    return error?.code === 'ECONNREFUSED' && (error?.syscall === 'querySrv' || message.includes('querySrv ECONNREFUSED'));
};

const getConfiguredDnsServers = () => {
    const configured = process.env.MONGO_DNS_SERVERS
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    if (configured && configured.length > 0) {
        return configured;
    }

    return ['8.8.8.8', '1.1.1.1'];
};

const connectWithUri = async (uri: string) => {
    return mongoose.connect(uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
        connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
    });
};

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI && !process.env.MONGO_URI && process.env.NODE_ENV === 'production') {
            throw new Error('MONGODB_URI (or MONGO_URI) is required in production');
        }

        const primaryUri = getPrimaryMongoUri();
        let conn;

        try {
            conn = await connectWithUri(primaryUri);
        } catch (primaryError: any) {
            const canRetrySrv = primaryUri.startsWith('mongodb+srv://') && isSrvDnsRefusal(primaryError);
            if (!canRetrySrv) {
                throw primaryError;
            }

            console.warn('[mongo] SRV DNS lookup failed. Retrying with custom DNS servers...');
            const dnsServers = getConfiguredDnsServers();
            dns.setServers(dnsServers);

            try {
                conn = await connectWithUri(primaryUri);
            } catch (retryError: any) {
                const directUri = process.env.MONGODB_URI_DIRECT;
                if (!directUri) {
                    throw retryError;
                }

                console.warn('[mongo] SRV retry failed. Trying direct MongoDB URI fallback (MONGODB_URI_DIRECT)...');
                conn = await connectWithUri(directUri);
            }
        }

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
