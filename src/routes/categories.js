const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, reel_count, cover_thumbnail_url')
      .eq('user_id', userId)
      .order('reel_count', { ascending: false });

    if (error) {
      console.error('[CATEGORIES] Error:', error);
      return res.status(500).json({ error: 'failed to fetch categories' });
    }

    res.json({ categories: data || [] });
  } catch (err) {
    console.error('[CATEGORIES] Error:', err.message);
    res.status(500).json({ error: 'failed to fetch categories' });
  }
});

router.get('/:name/reels', async (req, res) => {
  const { name } = req.params;
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('reels')
      .select('id, title, thumbnail_url, category, subcategory, tags, skill_name, created_at')
      .eq('user_id', userId)
      .eq('category', name.toLowerCase())
      .eq('status', 'ready')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CATEGORIES] Error:', error);
      return res.status(500).json({ error: 'failed to fetch category reels' });
    }

    res.json({ reels: data || [] });
  } catch (err) {
    console.error('[CATEGORIES] Error:', err.message);
    res.status(500).json({ error: 'failed to fetch category reels' });
  }
});

router.get('/:name/clusters', async (req, res) => {
  const { name } = req.params;
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('reels')
      .select('id, title, summary, thumbnail_url, skill_name, created_at')
      .eq('user_id', userId)
      .eq('category', name)
      .eq('status', 'ready')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'failed to fetch clusters' });
    }

    res.json({ reels: data || [], clusters: [] });
  } catch (err) {
    console.error('[CATEGORIES] Error:', err.message);
    res.status(500).json({ error: 'failed to fetch clusters' });
  }
});

module.exports = router;
