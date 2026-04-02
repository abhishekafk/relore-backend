const { downloadReel } = require('./step1_download');
const { transcribeAudio } = require('./step2_transcribe');
const { analyzeReel } = require('./step3_analyze');
const { generateEmbedding } = require('./step4_embed');
const { storeThumbnail } = require('./step5_thumbnail');
const { writeToDatabase } = require('./step6_dbwrite');
const supabase = require('../config/supabase');

/**
 * runPipeline — The core AI processing orchestrator.
 *
 * Runs all 6 steps in sequence. Each step's output feeds the next.
 * Audio cleanup always happens (in step 5 or in the catch block).
 *
 * @param {string} reelId
 * @param {string} instagramUrl
 * @param {string} userId
 * @returns {object} The completed reel record
 */
async function runPipeline(reelId, instagramUrl, userId) {
  console.log(`[PIPELINE] Starting pipeline for reel ${reelId}`);
  const startTime = Date.now();

  let audioPath = null;

  try {
    // ── Step 1: Download audio + get thumbnail URL and caption ──────────────
    console.log('[PIPELINE] Step 1 — downloading reel audio');
    const { audioPath: ap, thumbnailUrl: rawThumbnailUrl, caption } = await downloadReel(instagramUrl);
    audioPath = ap;
    console.log(`[PIPELINE] Step 1 done — audio: ${audioPath}, thumbnail: ${rawThumbnailUrl ? 'yes' : 'none'}`);

    // ── Step 2: Transcribe audio via Gemini ─────────────────────────────────
    console.log('[PIPELINE] Step 2 — transcribing audio');
    const transcript = await transcribeAudio(audioPath);
    console.log(`[PIPELINE] Step 2 done — ${transcript.length} chars transcribed`);

    // ── Step 3: Analyze content via Gemini ──────────────────────────────────
    console.log('[PIPELINE] Step 3 — analyzing content');
    const analysis = await analyzeReel(transcript, caption);
    console.log(`[PIPELINE] Step 3 done — title: "${analysis.title}"`);

    // ── Step 4: Generate embedding ──────────────────────────────────────────
    console.log('[PIPELINE] Step 4 — generating embedding');
    const embedding = await generateEmbedding(analysis, transcript);
    console.log(`[PIPELINE] Step 4 done — embedding: ${embedding ? '768 dims' : 'skipped'}`);

    // ── Step 5: Store thumbnail (also cleans up audio file) ─────────────────
    console.log('[PIPELINE] Step 5 — storing thumbnail');
    const storedThumbnailUrl = await storeThumbnail(rawThumbnailUrl, userId, reelId, audioPath);
    audioPath = null; // step5 cleaned it up
    console.log(`[PIPELINE] Step 5 done — thumbnail: ${storedThumbnailUrl ? 'stored' : 'none'}`);

    // ── Step 6: Write to database ────────────────────────────────────────────
    console.log('[PIPELINE] Step 6 — writing to database');
    const reel = await writeToDatabase(reelId, userId, {
      transcript,
      thumbnailUrl: storedThumbnailUrl,
      analysis,
      embedding,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PIPELINE] ✓ Complete in ${elapsed}s — reel ${reelId} is ready`);

    return reel;

  } catch (err) {
    // Always clean up audio temp file on failure
    if (audioPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (_) { }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[PIPELINE] ✗ Failed in ${elapsed}s — ${err.message}`);

    throw err;
  }
}

/**
 * Mark a reel as failed in the database.
 * Called by the worker on final failure (after all retries exhausted).
 */
async function markReelFailed(reelId, userId) {
  try {
    await supabase
      .from('reels')
      .update({ status: 'failed' })
      .eq('id', reelId)
      .eq('user_id', userId);
    console.log(`[PIPELINE] Reel ${reelId} marked as failed`);
  } catch (err) {
    console.error('[PIPELINE] Could not mark reel as failed:', err.message);
  }
}

module.exports = { runPipeline, markReelFailed };
