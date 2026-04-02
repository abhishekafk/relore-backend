const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

/**
 * Step 5 — Download thumbnail and upload to Supabase Storage.
 *
 * Uses dynamic import for node-fetch v3 (ESM-only package).
 * Downloads from Instagram CDN → uploads to Supabase Storage 'thumbnails' bucket.
 * Also cleans up the local audio temp file.
 *
 * @param {string|null} thumbnailUrl - Instagram CDN thumbnail URL
 * @param {string} userId
 * @param {string} reelId
 * @param {string|null} audioPath - Local audio path to clean up
 * @returns {string|null} Permanent Supabase Storage URL (or original CDN URL on failure)
 */
async function storeThumbnail(thumbnailUrl, userId, reelId, audioPath) {
  // Always clean up audio file regardless of thumbnail success
  cleanupAudio(audioPath);

  if (!thumbnailUrl) {
    console.warn('[STEP5] No thumbnail URL — skipping upload');
    return null;
  }

  try {
    // node-fetch v3 is ESM-only — must use dynamic import
    const { default: fetch } = await import('node-fetch');

    const response = await fetch(thumbnailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; relore/1.0)' },
    });

    if (!response.ok) {
      console.warn(`[STEP5] Thumbnail download failed: HTTP ${response.status}`);
      return thumbnailUrl; // Fall back to CDN URL
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storagePath = `${userId}/${reelId}.jpg`;

    const { error } = await supabase.storage
      .from('thumbnails')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '2592000', // 30 days
      });

    if (error) {
      console.error('[STEP5] Supabase Storage upload failed:', error.message);
      return thumbnailUrl; // Fall back to CDN URL
    }

    const { data: publicData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(storagePath);

    console.log('[STEP5] Thumbnail stored:', publicData.publicUrl);
    return publicData.publicUrl;

  } catch (err) {
    console.error('[STEP5] Thumbnail processing error:', err.message);
    return thumbnailUrl; // Non-fatal — fall back to CDN URL
  }
}

function cleanupAudio(audioPath) {
  if (!audioPath) return;
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log('[STEP5] Cleaned up temp audio:', audioPath);
    }
  } catch (err) {
    console.warn('[STEP5] Could not delete temp audio:', err.message);
  }
}

module.exports = { storeThumbnail };
