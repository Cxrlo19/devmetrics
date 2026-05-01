import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
    if (!redis) {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';
        redis = new Redis(url, {
            retryStrategy: (times) => {
                if (times > 3) {
                    console.error('Redis connection failed after 3 retries');
                    return null;
                }
                return Math.min(times * 200, 1000);
            }
        });

        redis.on('connect', () => console.log('Redis connected'));
        redis.on('error', (err) => console.error('Redis error:', err));
    }
    return redis;
}

// Leaderboard helpers — these wrap Redis sorted set commands
export async function incrementScore(teamId: string, userId: string, points: number) {
    return getRedis().zincrby(`leaderboard:${teamId}`, points, userId);
}

export async function getLeaderboard(teamId: string, limit = 10) {
    // ZREVRANGE returns highest scores first
    const results = await getRedis().zrevrange(
        `leaderboard:${teamId}`,
        0,
        limit - 1,
        'WITHSCORES'
    );

    // Redis returns [userId, score, userId, score...] — reshape it
    const leaderboard = [];
    for (let i = 0; i < results.length; i += 2) {
        leaderboard.push({
            userId: results[i],
            score: parseInt(results[i + 1])
        });
    }
    return leaderboard;
}

export async function setUserOnline(teamId: string, userId: string) {
    // Store online users as a Redis set with 5 min expiry
    await getRedis().sadd(`online:${teamId}`, userId);
    await getRedis().expire(`online:${teamId}`, 300);
}

export async function setUserOffline(teamId: string, userId: string) {
    await getRedis().srem(`online:${teamId}`, userId);
}

export async function getOnlineUsers(teamId: string): Promise<string[]> {
    return getRedis().smembers(`online:${teamId}`);
}