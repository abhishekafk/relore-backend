const supabase = require('../config/supabase');
const { groq, llamaModel } = require('./groq');

const SIMILARITY_THRESHOLD = 0.75;
const MIN_CLUSTER_SIZE = 3;
const MIN_REELS_FOR_CLUSTERING = 10;

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function groupBySimilarity(reels) {
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < reels.length; i++) {
    if (assigned.has(reels[i].id)) continue;

    const cluster = [reels[i]];
    assigned.add(reels[i].id);

    for (let j = i + 1; j < reels.length; j++) {
      if (assigned.has(reels[j].id)) continue;

      const similarity = cosineSimilarity(reels[i].embedding, reels[j].embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        cluster.push(reels[j]);
        assigned.add(reels[j].id);
      }
    }

    if (cluster.length >= MIN_CLUSTER_SIZE) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

async function generateClusterLabel(cluster) {
  const titles = cluster.map(r => r.title).join(', ');
  const categories = [...new Set(cluster.map(r => r.category).filter(Boolean))].join(', ');

  const prompt = `Generate a short 2-4 word label for this cluster of Instagram reels. 
Return ONLY the label, nothing else.

Reels: ${titles}
Categories: ${categories}`;

  try {
    const result = await groq.chat.completions.create({
      model: llamaModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 20,
    });

    const label = result.choices[0]?.message?.content?.trim() || 'Untitled Cluster';
    return label.slice(0, 50);
  } catch (err) {
    console.error('[CLUSTERING] Label generation failed:', err.message);
    return 'Untitled Cluster';
  }
}

async function regenerateClusters(userId) {
  const { data: reels, error } = await supabase
    .from('reels')
    .select('id, title, category, subcategory, embedding')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .not('embedding', 'is', null);

  if (error || !reels || reels.length < MIN_REELS_FOR_CLUSTERING) {
    return {
      success: false,
      message: `not enough reels to cluster yet (need ${MIN_REELS_FOR_CLUSTERING}, have ${reels?.length || 0})`,
    };
  }

  const reelsWithEmbeddings = reels.map(r => ({
    ...r,
    embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
  })).filter(r => r.embedding && r.embedding.length === 768);

  if (reelsWithEmbeddings.length < MIN_REELS_FOR_CLUSTERING) {
    return {
      success: false,
      message: `not enough reels with embeddings to cluster (need ${MIN_REELS_FOR_CLUSTERING}, have ${reelsWithEmbeddings.length})`,
    };
  }

  await supabase.from('user_clusters').delete().eq('user_id', userId);

  const clusters = groupBySimilarity(reelsWithEmbeddings);

  for (const cluster of clusters) {
    const label = await generateClusterLabel(cluster);
    const reelIds = cluster.map(r => r.id);

    await supabase.from('user_clusters').insert({
      user_id: userId,
      label,
      reel_ids: reelIds,
    });
  }

  return {
    success: true,
    clusters_created: clusters.length,
  };
}

module.exports = { regenerateClusters, MIN_REELS_FOR_CLUSTERING };
