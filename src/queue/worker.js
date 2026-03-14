require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const supabase = require('../config/supabase');
const { processReelQueue } = require('./jobQueue');

/**
 * Bull worker — processes 'process-reel' jobs.
 *
 * Phase 1: Stub worker — acknowledges job and logs.
 * Phase 2: Full AI pipeline will replace the stub body.
 *
 * Concurrency: 3 simultaneous jobs (as per PRD Section 17.4)
 */
processReelQueue.process(3, async (job) => {
  const { reel_id, instagram_url, user_id } = job.data;
  console.log(`[WORKER] Processing job ${job.id} | reel ${reel_id} | url: ${instagram_url}`);

  try {
    // Phase 1 stub — Phase 2 will implement the full pipeline here
    // Full pipeline: yt-dlp → Gemini transcription → Gemini analysis → embedding → thumbnail → DB write
    console.log(`[WORKER] Phase 1 stub: job acknowledged for reel ${reel_id}`);
    
    // For now just log that we received the job — pipeline wired in Phase 2
    return { reel_id, status: 'acknowledged_phase1_stub' };
  } catch (err) {
    console.error(`[WORKER] Job ${job.id} failed:`, err.message);

    // On final failure (after all retries exhausted), mark reel as failed
    if (job.attemptsMade >= job.opts.attempts - 1) {
      await supabase
        .from('reels')
        .update({ status: 'failed' })
        .eq('id', reel_id);
      console.error(`[WORKER] Reel ${reel_id} marked as failed after ${job.opts.attempts} attempts`);
    }

    throw err; // Re-throw so Bull handles retry
  }
});

processReelQueue.on('completed', (job, result) => {
  console.log(`[WORKER] Job ${job.id} completed:`, JSON.stringify(result));
});

processReelQueue.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
});

processReelQueue.on('stalled', (job) => {
  console.warn(`[WORKER] Job ${job.id} stalled — will be retried`);
});

console.log('[WORKER] re:lore Bull worker started — listening for process-reel jobs');
