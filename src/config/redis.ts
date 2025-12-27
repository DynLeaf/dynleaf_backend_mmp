import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export const connectRedis = async (): Promise<Redis | null> => {
    try {
        // Disconnect existing client if any
        if (redisClient) {
            try {
                await redisClient.quit();
            } catch (e) {
                // Ignore quit errors
            }
            redisClient = null;
        }

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        console.log(redisUrl, 'its redis url')
        
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times: number) {
                if (times > 10) {
                    console.error('❌ Redis max retries exceeded');
                    return null;
                }
                const delay = Math.min(times * 100, 3000);
                console.log(`🔄 Redis reconnecting... attempt ${times}`);
                return delay;
            },
            lazyConnect: true,
            enableOfflineQueue: true,
            reconnectOnError(err) {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false;
            }
        });

        redisClient.on('error', (err: Error) => {
            console.error('❌ Redis connection error:', err.message);
        });

        redisClient.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis ready to accept commands');
        });

        // Connect with timeout
        await Promise.race([
            redisClient.connect(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
            )
        ]);

        return redisClient;
    } catch (error: any) {
        console.warn('⚠️  Redis not available, falling back to MongoDB for OTP storage');
        console.warn('Error:', error.message);
        
        if (redisClient) {
            try {
                await redisClient.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
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
