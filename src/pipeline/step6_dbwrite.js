const supabase = require('../config/supabase');

/**
 * Step 6 — Write all extracted data to the database.
 *
 * Updates the reel record with all pipeline outputs, sets status to 'ready',
 * upserts the categories table, and increments user stats.
 *
 * @param {string} reelId
 * @param {string} userId
 * @param {object} payload - Combined output from steps 2–5
 * @returns {object} Updated reel record
 */
async function writeToDatabase(reelId, userId, payload) {
  const {
    transcript,
    thumbnailUrl,
    analysis,
    embedding,
  } = payload;

  const { title, summary, category, subcategory, tags, locations, language, skill } = analysis;

  // Update the reel record with all extracted data
  const updatePayload = {
    title: title || null,
    thumbnail_url: thumbnailUrl || null,
    transcript: transcript || null,
    summary: summary || [],
    category: category || null,
    subcategory: subcategory || null,
    tags: tags || [],
    locations: locations || [],
    skill_name: skill?.name || null,
    skill_schema: skill?.schema?.length > 0 ? skill.schema : null,
    skill_data: skill?.data && Object.keys(skill.data).length > 0 ? skill.data : null,
    language: language || 'en',
    status: 'ready',
  };

  // Only include embedding if we got one
  if (embedding && Array.isArray(embedding) && embedding.length === 768) {
    updatePayload.embedding = JSON.stringify(embedding);
  }

  const { data: updatedReel, error: reelError } = await supabase
    .from('reels')
    .update(updatePayload)
    .eq('id', reelId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (reelError) {
    console.error('[STEP6] Failed to update reel record:', reelError);
    throw new Error(`Database write failed: ${reelError.message}`);
  }

  console.log(`[STEP6] Reel ${reelId} updated — status: ready, category: ${category}`);

  // Upsert category record — increment count, update cover thumbnail
  if (category) {
    await upsertCategory(userId, category, thumbnailUrl);
  }

  // Increment user's total_reels_saved counter
  await incrementUserStats(userId);

  return updatedReel;
}

/**
 * Upsert the categories table for this user+category.
 * If category exists: increment reel_count and update cover.
 * If new: insert with count = 1.
 */
async function upsertCategory(userId, categoryName, thumbnailUrl) {
  try {
    const { data: existing } = await supabase
      .from('categories')
      .select('id, reel_count')
      .eq('user_id', userId)
      .eq('name', categoryName)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('categories')
        .update({
          reel_count: (existing.reel_count || 0) + 1,
          cover_thumbnail_url: thumbnailUrl || undefined,
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: categoryName,
          reel_count: 1,
          cover_thumbnail_url: thumbnailUrl || null,
        });
    }

    console.log(`[STEP6] Category '${categoryName}' updated`);
  } catch (err) {
    // Non-fatal — reel is still saved
    console.error('[STEP6] Failed to upsert category:', err.message);
  }
}

/**
 * Increment the user's total_reels_saved counter.
 * Uses a Supabase RPC call for atomic increment.
 */
async function incrementUserStats(userId) {
  try {
    // Fetch current count and increment
    const { data: user } = await supabase
      .from('users')
      .select('total_reels_saved')
      .eq('id', userId)
      .maybeSingle();

    if (user) {
      await supabase
        .from('users')
        .update({
          total_reels_saved: (user.total_reels_saved || 0) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }
  } catch (err) {
    console.error('[STEP6] Failed to update user stats:', err.message);
  }
}

module.exports = { writeToDatabase };
