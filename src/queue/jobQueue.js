const Bull = require('bull');

if (!process.env.REDIS_URL) {
  console.warn('[QUEUE] REDIS_URL not set — using redis://localhost:6379');
}

const processReelQueue = new Bull('process-reel', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // 1 min → 5 min → 15 min
    },
    timeout: 120000, // 120 seconds max per job
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 50,      // keep last 50 failed jobs
  },
});

processReelQueue.on('error', (err) => {
  console.error('[QUEUE] Bull queue error:', err.message);
});

module.exports = { processReelQueue };
