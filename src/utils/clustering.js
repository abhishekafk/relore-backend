const supabase = require('../config/supabase');
const { groq, llamaModel } = require('./groq');

const SIMILARITY_THRESHOLD = 0.6;
const SEMANTIC_MERGE_THRESHOLD = 0.5;
const MIN_CLUSTER_SIZE = 2;
const MIN_REELS_FOR_CLUSTERING = 6;

const GENERIC_LABELS = [
  'misc', 'general', 'other', 'various', 'mixed', 'random', 
  'untitled', 'other stuff', 'miscellaneous', 'other things',
  'stuff', 'things', 'content', 'videos', 'posts'
];

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

function normalizeSkillName(skill) {
  if (!skill) return null;
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericLabel(label) {
  if (!label) return true;
  const normalized = normalizeSkillName(label);
  if (!normalized) return true;
  
  for (const generic of GENERIC_LABELS) {
    if (normalized.includes(generic) || generic.includes(normalized)) {
      return true;
    }
  }
  
  if (normalized.length < 3) return true;
  
  return false;
}

function groupBySkillName(reels) {
  const groups = {};
  
  for (const reel of reels) {
    const normalized = normalizeSkillName(reel.skill_name);
    if (normalized) {
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      groups[normalized].push(reel);
    }
  }
  
  return groups;
}

function mergeClusters(clusters, threshold = SEMANTIC_MERGE_THRESHOLD) {
  const merged = [];
  const assigned = new Set();

  for (let i = 0; i < clusters.length; i++) {
    if (assigned.has(i)) continue;

    let currentCluster = [...clusters[i]];
    assigned.add(i);

    for (let j = i + 1; j < clusters.length; j++) {
      if (assigned.has(j)) continue;

      const centroidI = _getCentroid(currentCluster);
      const centroidJ = _getCentroid(clusters[j]);
      const similarity = cosineSimilarity(centroidI, centroidJ);

      if (similarity >= threshold) {
        currentCluster = currentCluster.concat(clusters[j]);
        assigned.add(j);
      }
    }

    if (currentCluster.length >= MIN_CLUSTER_SIZE) {
      merged.push(currentCluster);
    }
  }

  return merged;
}

function _getCentroid(cluster) {
  if (!cluster.length) return null;
  
  const dim = cluster[0].embedding?.length || 0;
  if (dim === 0) return null;

  const centroid = new Array(dim).fill(0);
  
  for (const reel of cluster) {
    const embedding = reel.embedding;
    if (embedding && embedding.length === dim) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }
  }
  
  for (let i = 0; i < dim; i++) {
    centroid[i] /= cluster.length;
  }
  
  return centroid;
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
  const titles = cluster.map(r => r.title).filter(Boolean).join(', ');
  const categories = [...new Set(cluster.map(r => r.category).filter(Boolean))].join(', ');
  const skillNames = [...new Set(cluster.map(r => r.skill_name).filter(Boolean))].join(', ');

  const prompt = `Generate a short 2-3 word label for these related Instagram reels.
Return ONLY 2-3 words. NOTHING else.

Rules:
- NO generic labels like "misc", "general", "other", "stuff", "things"
- Be SPECIFIC to the content topic
- Use common terminology

Good examples: "back exercises", "healthy recipes", "guitar tutorials", "productivity tips"
Bad examples: "misc", "general", "other", "various", "content"

Content topics: ${skillNames || titles}
${categories ? 'Categories: ' + categories : ''}`;

  try {
    const result = await groq.chat.completions.create({
      model: llamaModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 15,
    });

    let label = result.choices[0]?.message?.content?.trim() || '';
    
    const words = label.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 3) {
      label = words.slice(0, 3).join(' ');
    }
    
    if (isGenericLabel(label) || words.length === 0) {
      const firstSkill = normalizeSkillName(cluster[0]?.skill_name);
      const firstCategory = normalizeSkillName(cluster[0]?.category);
      label = firstSkill || firstCategory || 'Topic';
    }
    
    return label.slice(0, 50);
  } catch (err) {
    console.error('[CLUSTERING] Label generation failed:', err.message);
    const firstSkill = normalizeSkillName(cluster[0]?.skill_name);
    return firstSkill || 'Topic';
  }
}

async function regenerateClusters(userId) {
  const { data: reels, error } = await supabase
    .from('reels')
    .select('id, title, category, subcategory, skill_name, embedding, summary')
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

  let clusters = groupBySimilarity(reelsWithEmbeddings);
  
  clusters = mergeClusters(clusters, SEMANTIC_MERGE_THRESHOLD);

  const finalClusters = [];
  for (const cluster of clusters) {
    const label = await generateClusterLabel(cluster);
    
    if (isGenericLabel(label)) continue;
    
    finalClusters.push({
      cluster,
      label,
    });
  }

  for (const { cluster, label } of finalClusters) {
    const reelIds = cluster.map(r => r.id);
    const summary = await generateClusterSummary(cluster);

    await supabase.from('user_clusters').insert({
      user_id: userId,
      label,
      reel_ids: reelIds,
      summary,
    });
  }

  return {
    success: true,
    clusters_created: finalClusters.length,
  };
}

async function generateClusterSummary(cluster) {
  const summaries = cluster
    .map(r => r.summary)
    .filter(Boolean)
    .map(s => typeof s === 'string' ? JSON.parse(s) : s)
    .flat()
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter(s => s.length > 0);

  if (summaries.length === 0) {
    return null;
  }

  const uniquePoints = [...new Set(summaries.map(s => s.toLowerCase().trim()))];
  const combinedText = uniquePoints.slice(0, 10).join('\n');

  const prompt = `You are a concise note-taker. Analyze these key points from Instagram reels.
  
Output: Exactly 4-6 bullet points, each max 15 words.
Rules:
- Deduplicate similar points
- Remove filler/noise words
- Use simple, clear language
- Focus on actionable insights
- NO quotes around points
- NO numbering or bullets in output
- Just plain text lines

Return ONLY a JSON array of strings. Nothing else.

Key points:
${combinedText}`;

  try {
    const result = await groq.chat.completions.create({
      model: llamaModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300,
    });

    let content = result.choices[0]?.message?.content?.trim() || '';
    
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .map(s => String(s).trim())
            .filter(s => s.length > 0 && s.length <= 200)
            .slice(0, 6);
          return cleaned.length > 0 ? cleaned : null;
        }
      } catch (e) {
        // Fall through
      }
    }
    
    return uniquePoints.slice(0, 5);
  } catch (err) {
    console.error('[CLUSTERING] Summary generation failed:', err.message);
    return uniquePoints.slice(0, 5);
  }
}

module.exports = { regenerateClusters, MIN_REELS_FOR_CLUSTERING, generateClusterSummary };
