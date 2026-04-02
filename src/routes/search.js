const express = require('express');
const router = express.Router();
const { embeddingModel } = require('../utils/gemini');
const supabase = require('../config/supabase');

router.post('/', async (req, res) => {
  const { query, limit = 10, category } = req.body;
  const userId = req.user.id;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    const embeddingText = query.slice(0, 8000);

    const result = await embeddingModel.embedContent({
      content: { parts: [{ text: embeddingText }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    });

    const queryEmbedding = result.embedding.values;

    if (!queryEmbedding || queryEmbedding.length !== 768) {
      return res.status(500).json({ error: 'failed to generate query embedding' });
    }

    const { data: results, error } = await supabase.rpc('search_reels', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_user_id: userId,
      match_limit: limit,
      match_threshold: 0.3,
      filter_category: category || null,
    });

    if (error) {
      console.error('[SEARCH] Supabase search error:', error);
      return res.status(500).json({ error: 'search failed' });
    }

    res.json({ results: results || [] });
  } catch (err) {
    console.error('[SEARCH] Error:', err.message);
    res.status(500).json({ error: 'search failed' });
  }
});

module.exports = router;
