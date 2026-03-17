const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Step 1 — Download reel audio via yt-dlp.
 *
 * Instagram serves audio as a DASH m4a stream alongside video.
 * We select `bestaudio` format (the m4a DASH stream) which avoids the
 * HTTP 416 range errors that occur when downloading the combined mp4.
 * The m4a is then converted to mp3 by yt-dlp's built-in ffmpeg/avconv post-processor,
 * but since Render may not have ffmpeg, we keep it as m4a and send it to Gemini
 * with the correct mimeType — Gemini handles m4a natively.
 *
 * @param {string} instagramUrl
 * @returns {{ audioPath: string, thumbnailUrl: string, caption: string }}
 */
async function downloadReel(instagramUrl) {
  const tmpDir = os.tmpdir();

  // Get metadata first (non-fatal)
  const meta = await getReelMetadata(instagramUrl);

  // Download audio
  const audioPath = await downloadAudio(instagramUrl, tmpDir);

  return { audioPath, thumbnailUrl: meta.thumbnailUrl, caption: meta.caption };
}

function getReelMetadata(instagramUrl) {
  return new Promise((resolve) => {
    const args = ['--dump-json', '--no-playlist', '--no-warnings', instagramUrl];

    execFile('yt-dlp', args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err || !stdout.trim()) {
        console.warn('[STEP1] Metadata skipped:', (stderr || err?.message || '').slice(0, 200));
        resolve({ thumbnailUrl: null, caption: '' });
        return;
      }
      try {
        const data = JSON.parse(stdout.trim().split('\n')[0]);
        resolve({
          thumbnailUrl: data.thumbnail || null,
          caption: (data.description || data.title || '').slice(0, 500),
        });
      } catch {
        resolve({ thumbnailUrl: null, caption: '' });
      }
    });
  });
}

/**
 * Download best audio stream.
 *
 * Uses `-f bestaudio` to select the DASH m4a audio-only stream.
 * This sidesteps HTTP 416 because the audio DASH stream uses full-file
 * HTTP GET rather than range requests.
 *
 * Output is m4a (or webm if that's what Instagram serves).
 * Gemini transcription step accepts both audio/mp4 and audio/webm.
 */
function downloadAudio(instagramUrl, tmpDir) {
  return new Promise((resolve, reject) => {
    const outTemplate = path.join(tmpDir, '%(id)s_audio.%(ext)s');

    const args = [
      '-f', 'bestaudio',           // Select audio-only DASH stream (m4a)
      '--no-playlist',
      '--no-part',                 // Write directly — no .part intermediary
      '--retries', '5',
      '--no-warnings',
      '-o', outTemplate,
      instagramUrl,
    ];

    execFile('yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        const errMsg = (stderr || err.message || '').slice(0, 600);
        console.error('[STEP1] yt-dlp audio download failed:', errMsg);

        if (/private|login required|not available/i.test(errMsg)) {
          reject(new Error('private reel — cannot download'));
        } else if (/404|does not exist|removed|expired/i.test(errMsg)) {
          reject(new Error('reel not found or deleted'));
        } else {
          reject(new Error(`yt-dlp failed: ${errMsg.slice(0, 150)}`));
        }
        return;
      }

      // Parse "Destination:" line from combined stdout+stderr
      const combined = stdout + stderr;
      const destMatch = combined.match(/Destination:\s*(.+\.(m4a|webm|mp3|aac|ogg))/i);
      if (destMatch) {
        const audioPath = destMatch[1].trim();
        if (fs.existsSync(audioPath)) {
          const sizeKB = (fs.statSync(audioPath).size / 1024).toFixed(0);
          console.log(`[STEP1] Audio ready: ${audioPath} (${sizeKB} KB)`);
          resolve(audioPath);
          return;
        }
      }

      // Fallback: find most recent audio file in tmpDir
      try {
        const audioExts = ['.m4a', '.webm', '.mp3', '.aac', '.ogg'];
        const recent = fs.readdirSync(tmpDir)
          .filter(f => audioExts.some(ext => f.endsWith(ext)))
          .map(f => ({ f, mtime: fs.statSync(path.join(tmpDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);

        if (recent.length > 0) {
          const audioPath = path.join(tmpDir, recent[0].f);
          console.log('[STEP1] Audio found via scan:', audioPath);
          resolve(audioPath);
          return;
        }
      } catch (_) {}

      reject(new Error('yt-dlp completed but no audio file found'));
    });
  });
}

module.exports = { downloadReel };
