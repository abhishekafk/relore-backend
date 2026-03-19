require('dotenv').config();
const supabase = require('./src/config/supabase');

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function testSearch() {
  console.log('\n=== POST /api/v1/search ===');
  
  const { embeddingModel } = require('./src/utils/gemini');
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text: 'chicken recipe' }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768,
  });
  const queryEmbedding = result.embedding.values;

  const { data, error } = await supabase.rpc('search_reels', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_user_id: TEST_USER_ID,
    match_limit: 5,
    match_threshold: 0.3,
    filter_category: null,
  });

  console.log('Search results:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
  return data;
}

async function testCategories() {
  console.log('\n=== GET /api/v1/categories ===');
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, reel_count, cover_thumbnail_url')
    .eq('user_id', TEST_USER_ID)
    .order('reel_count', { ascending: false });

  console.log('Categories:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
  return data;
}

async function testCategoryReels() {
  console.log('\n=== GET /api/v1/categories/:name/reels ===');
  const { data, error } = await supabase
    .from('reels')
    .select('id, title, thumbnail_url, category, subcategory, tags, skill_name, created_at')
    .eq('user_id', TEST_USER_ID)
    .eq('category', 'recipes')
    .eq('status', 'ready')
    .order('created_at', { ascending: false });

  console.log('Category reels:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
  return data;
}

async function testClusters() {
  console.log('\n=== GET /api/v1/clusters ===');
  const { data, error } = await supabase
    .from('user_clusters')
    .select('id, label, reel_ids, generated_at')
    .eq('user_id', TEST_USER_ID)
    .order('generated_at', { ascending: false });

  console.log('Clusters:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
  return data;
}

async function testClustersRegenerate() {
  console.log('\n=== POST /api/v1/clusters/regenerate ===');
  const { regenerateClusters } = require('./src/utils/clustering');
  
  const result = await regenerateClusters(TEST_USER_ID);
  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  console.log('Testing Phase 3 Endpoints (direct Supabase calls)...\n');

  await testSearch();
  await testCategories();
  await testCategoryReels();
  await testClusters();
  await testClustersRegenerate();

  console.log('\n=== All tests complete ===\n');
}

main();
