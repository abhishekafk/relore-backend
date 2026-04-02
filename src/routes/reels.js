const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');

const INSTAGRAM_REEL_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[\w-]+\/?(\?.*)?$/i;

function isValidInstagramUrl(url) {
  return INSTAGRAM_REEL_REGEX.test(url);
}

router.post('/import', async (req, res) => {
  console.log('[IMPORT] ========= IMPORT ROUTE HIT =========');
  console.log('[IMPORT] URL received:', req.body.url);
  console.log('[IMPORT] User:', req.user?.id);

  const { url } = req.body;
  const userId = req.user?.id;
  const reelId = uuidv4();

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const trimmedUrl = url.trim();

  if (!isValidInstagramUrl(trimmedUrl)) {
    return res.status(400).json({
      error: 'not a valid instagram reel url',
    });
  }

  try {
    const { data: existing } = await supabase
      .from('reels')
      .select('id, status')
      .eq('user_id', userId)
      .eq('instagram_url', trimmedUrl)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        reel_id: existing.id,
        status: existing.status,
        duplicate: true,
        message: 'already in your lore',
      });
    }

    await supabase.from('reels').insert({
      id: reelId,
      user_id: userId,
      instagram_url: trimmedUrl,
      status: 'processing',
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ reel_id: reelId, status: 'processing' });

    setImmediate(async () => {
      try {
        console.log(`[PROCESS] Starting pipeline for reel ${reelId}`);

        const { downloadReel } = require('../pipeline/step1_download');
        const { transcribeAudio } = require('../pipeline/step2_transcribe');
        const { analyzeReel } = require('../pipeline/step3_analyze');
        const { generateEmbedding } = require('../pipeline/step4_embed');
        const { storeThumbnail } = require('../pipeline/step5_thumbnail');
        const { writeToDatabase } = require('../pipeline/step6_dbwrite');

        console.log('[PROCESS] Step 1: Downloading...');
        const downloadResult = await downloadReel(trimmedUrl);

        console.log('[PROCESS] Step 2: Transcribing...');
        const transcript = await transcribeAudio(downloadResult.audioPath);

        console.log('[PROCESS] Step 3: Analyzing...');
        const analysis = await analyzeReel(transcript, downloadResult.caption);

        console.log('[PROCESS] Step 4: Embedding...');
        const embedding = await generateEmbedding(analysis, transcript);

        console.log('[PROCESS] Step 5: Thumbnail...');
        const thumbnailUrl = await storeThumbnail(
          downloadResult.thumbnailUrl,
          userId,
          reelId,
          downloadResult.audioPath
        );

        console.log('[PROCESS] Step 6: Saving...');
        await writeToDatabase(reelId, userId, {
          transcript,
          thumbnailUrl,
          analysis,
          embedding,
        });

        console.log(`[PROCESS] Reel ${reelId} completed successfully`);

      } catch (err) {
        console.error(`[PROCESS] Pipeline failed for reel ${reelId}:`, err.message);
        await supabase
          .from('reels')
          .update({ status: 'failed', error: err.message })
          .eq('id', reelId);
      }
    });

  } catch (err) {
    console.error('[IMPORT] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('reels')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'failed to fetch reel status' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json({ id: data.id, status: data.status });
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('reels')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'failed to fetch reel' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('reels')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'failed to delete reel' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json({ id: data.id, deleted: true });
});

module.exports = router;
