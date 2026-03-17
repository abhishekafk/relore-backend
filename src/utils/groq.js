require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const Groq = require('groq-sdk');

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set in environment variables.');
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const whisperModel = 'whisper-large-v3';

const llamaModel = 'llama-3.3-70b-versatile';

module.exports = { groq, whisperModel, llamaModel };
