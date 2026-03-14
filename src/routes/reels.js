const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { processReelQueue } = require('../queue/jobQueue');

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

const INSTAGRAM_REEL_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[\w-]+\/?(\?.*)?$/i;

function isValidInstagramUrl(url) {
  return INSTAGRAM_REEL_REGEX.test(url);
}

// -----------------------------------------------------------------
// POST /api/v1/reels/import
// Body: { url: string }
// Returns: { reel_id, status: 'processing' }
// -----------------------------------------------------------------
router.post('/import', async (req, res) => {
  const { url } = req.body;
  const userId = req.user.id;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const trimmedUrl = url.trim();

  if (!isValidInstagramUrl(trimmedUrl)) {
    return res.status(400).json({
      error: 'not a valid instagram reel url. format: https://www.instagram.com/reel/XXXXX/',
    });
  }

  try {
    // Deduplicate: if this URL was already imported by this user, skip
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

    // Create reel record with status 'processing'
    const { data: reel, error: insertError } = await supabase
      .from('reels')
      .insert({
        user_id: userId,
        instagram_url: trimmedUrl,
        status: 'processing',
      })
      .select('id, status, created_at')
      .single();

    if (insertError) {
      console.error('[IMPORT] Supabase insert error:', insertError);
      return res.status(500).json({ error: 'failed to create reel record' });
    }

    // Enqueue Bull job
    const job = await processReelQueue.add('process-reel', {
      reel_id: reel.id,
      instagram_url: trimmedUrl,
      user_id: userId,
    });

    console.log(`[IMPORT] Reel ${reel.id} enqueued as job ${job.id}`);

    // Upsert user record (ensure user exists in our users table)
    await supabase.from('users').upsert(
      {
        id: userId,
        email: req.user.email,
        display_name: req.user.user_metadata?.full_name || null,
        avatar_url: req.user.user_metadata?.avatar_url || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: false }
    );

    return res.status(201).json({
      reel_id: reel.id,
      status: 'processing',
      job_id: job.id,
    });
  } catch (err) {
    console.error('[IMPORT] Unexpected error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// -----------------------------------------------------------------
// GET /api/v1/reels/status/:id
// Returns: { id, status }
// NOTE: must be defined before GET /:id to avoid route conflict
// -----------------------------------------------------------------
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
    console.error('[STATUS] Supabase error:', error);
    return res.status(500).json({ error: 'failed to fetch reel status' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json({ id: data.id, status: data.status });
});

// -----------------------------------------------------------------
// GET /api/v1/reels/:id
// Returns full reel record
// -----------------------------------------------------------------
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
    console.error('[REELS] Supabase error:', error);
    return res.status(500).json({ error: 'failed to fetch reel' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json(data);
});

// -----------------------------------------------------------------
// DELETE /api/v1/reels/:id
// Soft-deletes reel (sets status to 'deleted')
// -----------------------------------------------------------------
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
    console.error('[DELETE] Supabase error:', error);
    return res.status(500).json({ error: 'failed to delete reel' });
  }

  if (!data) {
    return res.status(404).json({ error: 'reel not found' });
  }

  res.json({ id: data.id, deleted: true });
});

module.exports = router;
