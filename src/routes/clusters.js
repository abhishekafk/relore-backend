const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { regenerateClusters, MIN_REELS_FOR_CLUSTERING } = require('../utils/clustering');

router.get('/', async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('user_clusters')
      .select('id, label, reel_ids, summary, generated_at')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false });

    if (error) {
      console.error('[CLUSTERS] Error:', error);
      return res.status(500).json({ error: 'failed to fetch clusters' });
    }

    res.json({ clusters: data || [] });
  } catch (err) {
    console.error('[CLUSTERS] Error:', err.message);
    res.status(500).json({ error: 'failed to fetch clusters' });
  }
});

router.get('/:id', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('user_clusters')
      .select('id, label, reel_ids, summary, generated_at')
      .eq('user_id', userId)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'cluster not found' });
    }

    res.json({ cluster: data });
  } catch (err) {
    console.error('[CLUSTERS] Error:', err.message);
    res.status(500).json({ error: 'failed to fetch cluster' });
  }
});

router.post('/regenerate', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await regenerateClusters(userId);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json({
      message: `clusters regenerated`,
      clusters_created: result.clusters_created,
    });
  } catch (err) {
    console.error('[CLUSTERS] Regenerate error:', err.message);
    res.status(500).json({ error: 'cluster regeneration failed' });
  }
});

module.exports = router;
