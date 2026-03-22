require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { processReelQueue } = require('./jobQueue');
const { runPipeline, markReelFailed } = require('../pipeline/pipeline');
const { sendPushNotification } = require('../utils/notifications');

console.log('[WORKER] Initializing...');
console.log('[WORKER] Redis URL:', process.env.REDIS_URL || 'using default');

/**
 * Bull worker — real AI processing pipeline.
 *
 * Concurrency: 3 simultaneous jobs (per PRD Section 17.4).
 * Each job runs the full 6-step pipeline:
 *   yt-dlp → Gemini transcribe → Gemini analyze → embed → thumbnail → DB write
 */
console.log('[WORKER] Registering process handler...');
try {
  processReelQueue.process(3, async (job) => {
    const { reel_id, instagram_url, user_id } = job.data;

    console.log(`[WORKER] Job ${job.id} started — reel ${reel_id}`);
    console.log(`[WORKER] Attempt ${job.attemptsMade + 1}/${job.opts.attempts}`);

    try {
      const reel = await runPipeline(reel_id, instagram_url, user_id);

      const title = reel?.title || 'your reel';
      await sendPushNotification(
        null,
        're:lore',
        `${title} — added to your lore`,
        { reel_id, screen: 'card' }
      );

      return { reel_id, status: 'ready', title };

    } catch (err) {
      console.error(`[WORKER] Job ${job.id} error:`, err.message);

      const isLastAttempt = job.attemptsMade >= (job.opts.attempts - 1);
      if (isLastAttempt) {
        await markReelFailed(reel_id, user_id);

        await sendPushNotification(
          null,
          're:lore',
          'could not process a reel. tap to retry.',
          { reel_id, screen: 'add' }
        );

        console.error(`[WORKER] Reel ${reel_id} permanently failed after ${job.opts.attempts} attempts`);
      }

      throw err;
    }
  });
  console.log('[WORKER] Process handler registered successfully');
} catch (err) {
  console.error('[WORKER] FAILED to register process handler:', err);
}

processReelQueue.on('ready', () => {
  console.log('[WORKER] Queue is ready and listening for jobs');
});

processReelQueue.on('completed', (job, result) => {
  console.log(`[WORKER] ✓ Job ${job.id} completed:`, JSON.stringify(result));
});

processReelQueue.on('failed', (job, err) => {
  const attempt = job.attemptsMade;
  const total = job.opts.attempts;
  console.error(`[WORKER] ✗ Job ${job.id} failed (attempt ${attempt}/${total}):`, err.message);
});

processReelQueue.on('stalled', (job) => {
  console.warn(`[WORKER] ⚠ Job ${job.id} stalled — will be retried`);
});

processReelQueue.on('error', (err) => {
  console.error('[WORKER] Queue error:', err.message);
});

processReelQueue.on('waiting', (jobId) => {
  console.log(`[WORKER] Job ${jobId} is waiting in the queue`);
});

processReelQueue.on('active', (job) => {
  console.log(`[WORKER] Job ${job.id} is now active (being processed)`);
});

console.log('[WORKER] re:lore AI pipeline worker fully initialized (concurrency: 3)');
