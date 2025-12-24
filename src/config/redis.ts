import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export const connectRedis = async (): Promise<Redis | null> => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        console.log(redisUrl, 'its redis url')
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times: number) {
                if (times > 3) {
                    return null;
                }
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            lazyConnect: true,
            enableOfflineQueue: false
        });

        redisClient.on('error', (err: Error) => {
            console.error('❌ Redis connection error:', err.message);
        });

        await redisClient.connect();

        redisClient.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        return redisClient;
    } catch (error: any) {
        console.warn('⚠️  Redis not available, falling back to MongoDB for OTP storage');
        console.warn('Error:', error.message);
        
        if (redisClient) {
            redisClient.disconnect();
            redisClient = null;
        }
        
        return null;
    }
};

export const getRedisClient = (): Redis | null => {
    return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
    if (redisClient) {
        await redisClient.quit();
        console.log('Redis disconnected');
    }
};
