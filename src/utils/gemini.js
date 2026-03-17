require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set in environment variables.');
}

// v1beta — used for generative models
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// v1 (stable) — required for embedding models
const genaiV1 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
  apiVersion: 'v1',
});

/**
 * gemini-2.0-flash-lite — main model for analysis (Step 3).
 * Free-tier available. System instruction enforces JSON-only output.
 */
const geminiFlash = genai.getGenerativeModel({
  model: 'gemini-2.0-flash-lite',
  systemInstruction:
    'You are a knowledge extraction assistant. Always respond with ONLY valid JSON, no markdown fences, no explanation.',
});

/**
 * gemini-2.0-flash-lite without system instruction — for transcription (Step 2).
 * Free-tier available. System instruction for JSON would interfere with transcript output.
 */
const geminiFlashTranscribe = genai.getGenerativeModel({
  model: 'gemini-2.0-flash-lite',
});

/**
 * gemini-embedding-001 via v1 stable API (Step 4).
 * Free-tier available. Produces 768-dimension vectors for pgvector semantic search.
 */
const embeddingModel = genaiV1.getGenerativeModel({
  model: 'gemini-embedding-001',
});

module.exports = { geminiFlash, geminiFlashTranscribe, embeddingModel };
