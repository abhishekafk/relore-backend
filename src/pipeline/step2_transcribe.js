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
  console.log(`[STEP2] Sending ${sizeMB.toFixed(2)}MB ${ext} to Groq Whisper`);

  try {
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    const result = await groq.audio.transcriptions.create({
      file: {
        data: base64Audio,
        mimetype: getMimeType(ext),
      },
      model: whisperModel,
      response_format: 'text',
      language: 'en',
    });

    const text = (result.text || '').trim();

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
      const audioBuffer = fs.readFileSync(audioPath);
      const base64Audio = audioBuffer.toString('base64');

      const retryResult = await groq.audio.transcriptions.create({
        file: {
          data: base64Audio,
          mimetype: getMimeType(ext),
        },
        model: whisperModel,
        response_format: 'text',
      });

      return (retryResult.text || '').trim();
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
