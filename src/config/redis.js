const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.warn('[REDIS] REDIS_URL not set — falling back to redis://localhost:6379');
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by Bull
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => console.log('[REDIS] Connected'));
redis.on('error', (err) => console.error('[REDIS] Error:', err.message));

module.exports = redis;
