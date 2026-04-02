const fs = require('fs');
const path = require('path');
const { groq, whisperModel } = require('../utils/groq');

/**
 * Step 2 — Transcribe reel audio via Groq Whisper.
 *
 * Reads audio from disk (m4a, webm, mp3, etc.) and sends directly to
 * Groq's Whisper-large-v3 endpoint for transcription.
 *
 * @param {string} audioPath - Local path to the audio file
 * @returns {string} transcript — empty string if no speech detected
 */
async function transcribeAudio(audioPath) {
  if (!audioPath || !fs.existsSync(audioPath)) {
    console.warn('[STEP2] Audio file not found:', audioPath);
    return '';
  }

  const stats = fs.statSync(audioPath);
  if (stats.size === 0) {
    console.warn('[STEP2] Audio file is empty');
    return '';
  }

  const ext = path.extname(audioPath).toLowerCase();
  const sizeMB = stats.size / (1024 * 1024);
  const mimeType = getMimeType(ext);
  const fileName = path.basename(audioPath);
  
  console.log(`[STEP2] Audio file path: ${audioPath}`);
  console.log(`[STEP2] Audio file size: ${stats.size} bytes (${sizeMB.toFixed(2)} MB)`);
  console.log(`[STEP2] Audio file extension: ${ext}`);
  console.log(`[STEP2] Audio mime type: ${mimeType}`);
  console.log(`[STEP2] Audio file name: ${fileName}`);
  console.log(`[STEP2] Sending to Groq Whisper...`);

  try {
    const result = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: whisperModel,
      response_format: 'text',
      language: 'en',
    });

    console.log('[STEP2] Raw Groq response:', JSON.stringify(result, null, 2));

    // Groq Whisper returns transcript as a string directly, not as result.text
    let text = '';
    if (typeof result === 'string') {
      text = result.trim();
    } else if (result && typeof result.text === 'string') {
      text = result.text.trim();
    }

    console.log(`[STEP2] Extracted text: ${text.length} chars`);

    const noSpeechPatterns = [
      /^(no speech|no spoken|music only|instrumental|no dialogue|empty|none|silent)/i,
      /^there (is|are) no spoken/i,
    ];

    if (noSpeechPatterns.some(p => p.test(text))) {
      console.log('[STEP2] No speech detected in audio');
      return '';
    }

    console.log(`[STEP2] Transcribed ${text.length} characters`);
    return text;

  } catch (err) {
    console.error('[STEP2] Groq transcription failed:', err.message);

    try {
      console.log('[STEP2] Retrying transcription...');
      const retryResult = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: whisperModel,
        response_format: 'text',
      });

      // Same fix for retry
      let retryText = '';
      if (typeof retryResult === 'string') {
        retryText = retryResult.trim();
      } else if (retryResult && typeof retryResult.text === 'string') {
        retryText = retryResult.text.trim();
      }

      return retryText;
    } catch (retryErr) {
      console.error('[STEP2] Retry also failed — saving reel with empty transcript:', retryErr.message);
      return '';
    }
  }
}

function getMimeType(ext) {
  const mimeTypes = {
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.webm': 'audio/webm',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
  };
  return mimeTypes[ext] || 'audio/mp4';
}

module.exports = { transcribeAudio };
