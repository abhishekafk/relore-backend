/**
 * test-pipeline.js — re:lore Phase 2 end-to-end test (ASCII only, no ANSI)
 * Usage: node test-pipeline.js
 */
require('dotenv').config();
const supabase = require('./src/config/supabase');
const { runPipeline } = require('./src/pipeline/pipeline');

const REEL_URL     = 'https://www.instagram.com/reel/DSIQ0EtE45j/';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

const ts = () => `[${new Date().toISOString()}]`;
const elapsed = s => `${((Date.now() - s) / 1000).toFixed(2)}s`;
const sep = () => '='.repeat(52);

async function main() {
  const globalStart = Date.now();

  console.log('\n' + sep());
  console.log('  re:lore Pipeline End-to-End Test');
  console.log(sep() + '\n');
  console.log(`${ts()} Reel URL : ${REEL_URL}`);
  console.log(`${ts()} Test User: ${TEST_USER_ID}\n`);

  // Step 0 — Upsert test user
  console.log('-- Step 0: Upsert test user --');
  const t0 = Date.now();
  const { error: userErr } = await supabase.from('users').upsert({
    id: TEST_USER_ID,
    email: 'test@relore.local',
    display_name: 'Test User',
    total_reels_saved: 0,
  }, { onConflict: 'id', ignoreDuplicates: false });

  if (userErr) {
    console.warn(`${ts()} WARNING user upsert: ${userErr.message}`);
  } else {
    console.log(`${ts()} [OK] Test user ready (${elapsed(t0)})`);
  }

  // Step 0b — Check for duplicate URL
  const { data: existing } = await supabase
    .from('reels').select('id, status')
    .eq('user_id', TEST_USER_ID).eq('instagram_url', REEL_URL)
    .maybeSingle();

  let reelId;

  if (existing) {
    console.log(`${ts()} Found existing reel: ${existing.id} (status: ${existing.status})`);
    console.log(`${ts()} Resetting to processing for re-test...`);
    await supabase.from('reels').update({ status: 'processing' }).eq('id', existing.id);
    reelId = existing.id;
  } else {
    console.log('\n-- Step 0c: Create reel record --');
    const t0c = Date.now();
    const { data: newReel, error: insertErr } = await supabase
      .from('reels')
      .insert({ user_id: TEST_USER_ID, instagram_url: REEL_URL, status: 'processing' })
      .select('id').single();

    if (insertErr) {
      console.error(`${ts()} FAIL: insert reel: ${insertErr.message}`);
      process.exit(1);
    }
    reelId = newReel.id;
    console.log(`${ts()} [OK] Reel created: ${reelId} (${elapsed(t0c)})`);
  }

  // Run pipeline
  console.log('\n-- Running Full 6-Step Pipeline --');
  console.log(`${ts()} Starting pipeline for reel ${reelId}...\n`);
  const pipelineStart = Date.now();

  try {
    const reel = await runPipeline(reelId, REEL_URL, TEST_USER_ID);

    console.log('\n' + sep());
    console.log(`  PIPELINE SUCCEEDED in ${elapsed(pipelineStart)}`);
    console.log(sep() + '\n');

    console.log('-- Result Summary --');
    console.log(`  Status     : ${reel.status}`);
    console.log(`  Title      : ${reel.title}`);
    console.log(`  Category   : ${reel.category}`);
    console.log(`  Subcategory: ${reel.subcategory}`);
    console.log(`  Language   : ${reel.language}`);
    console.log(`  Tags       : ${JSON.stringify(reel.tags)}`);
    console.log(`  Locations  : ${JSON.stringify(reel.locations)}`);
    console.log(`  Skill Name : ${reel.skill_name || '(none)'}`);
    console.log(`  Skill Schema: ${JSON.stringify(reel.skill_schema)}`);
    console.log(`  Thumbnail  : ${reel.thumbnail_url ? reel.thumbnail_url.slice(0, 80) + '...' : '(none)'}`);
    console.log(`  Transcript : ${reel.transcript ? reel.transcript.slice(0, 160) + '...' : '(none)'}`);
    console.log(`  Embedding  : ${reel.embedding ? 'vector present' : '(null)'}`);
    console.log('\n  Summary bullets:');
    (reel.summary || []).forEach((b, i) => console.log(`    ${i + 1}. ${b}`));

    console.log('\n-- Skill Data --');
    console.log(JSON.stringify(reel.skill_data, null, 2));

    console.log('\n-- Full Reel Object (embedding truncated) --');
    const display = { ...reel, embedding: reel.embedding ? '[768 floats]' : null };
    console.log(JSON.stringify(display, null, 2));

    console.log(`\nTotal time: ${elapsed(globalStart)}\n`);
    process.exit(0);

  } catch (err) {
    console.log('\n' + sep());
    console.log(`  PIPELINE FAILED in ${elapsed(pipelineStart)}`);
    console.log(sep());
    console.error(`\nError: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
