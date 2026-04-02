/**
 * Step 4 — Generate embedding vector via Gemini embedding-001.
 *
 * Uses the @google/generative-ai SDK's embedContent method.
 * Produces a 768-dimension float vector stored in the pgvector column.
 *
 * @param {object} analysis - Result from step3_analyze
 * @param {string} transcript - Full transcript text
 * @returns {number[]|null} 768-dimension float array, or null on failure
 */
const { embeddingModel } = require('../utils/gemini');

async function generateEmbedding(analysis, transcript) {
  // Build embedding input from all key semantic fields
  const parts = [
    analysis.title || '',
    ...(analysis.summary || []),
    ...(analysis.tags || []),
    analysis.subcategory || '',
    analysis.category || '',
    (analysis.locations || []).join(' '),
    (transcript || '').slice(0, 1000),
  ];

  const embeddingText = parts
    .filter(Boolean)
    .join(' ')
    .trim()
    .slice(0, 8000); // token limit

  if (!embeddingText) {
    console.warn('[STEP4] No text to embed — returning null');
    return null;
  }

  try {
    const result = await embeddingModel.embedContent({
      content: { parts: [{ text: embeddingText }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    });
    const vector = result.embedding.values;

    if (!Array.isArray(vector) || vector.length !== 768) {
      console.error(`[STEP4] Unexpected embedding dimensions: ${vector?.length}`);
      return null;
    }

    console.log(`[STEP4] Embedding generated — ${vector.length} dimensions`);
    return vector;

  } catch (err) {
    console.error('[STEP4] Embedding request failed:', err.message);
    return null; // Non-fatal — reel created without search capability
  }
}

module.exports = { generateEmbedding };
