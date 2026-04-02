const { groq, llamaModel } = require('../utils/groq');

/**
 * Step 3 — Analyze reel content via Groq LLaMA.
 *
 * Single API call that returns a fully structured JSON object containing:
 * title, summary (3 bullets), category, subcategory, tags, locations,
 * language, and the dynamic skill block (name, schema, data).
 *
 * The skill block is LLaMA-generated — not hardcoded templates.
 *
 * @param {string} transcript
 * @param {string} caption
 * @returns {object} Parsed analysis object
 */
async function analyzeReel(transcript, caption) {
  const hasContent = (transcript && transcript.length > 5) || (caption && caption.length > 5);

  if (!hasContent) {
    console.warn('[STEP3] No transcript or caption — using minimal defaults');
    return buildFallback(caption || '');
  }

  const prompt = buildPrompt(transcript, caption);

  try {
    const result = await groq.chat.completions.create({
      model: llamaModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = result.choices[0]?.message?.content?.trim() || '';
    const parsed = parseJsonResponse(raw);
    validateAndNormalize(parsed);
    console.log(`[STEP3] Analysis complete — category: ${parsed.category}, skill: ${parsed.skill?.name || 'none'}`);
    return parsed;
  } catch (err) {
    console.error('[STEP3] Groq analysis failed:', err.message);
    try {
      console.log('[STEP3] Retrying analysis...');
      const retry = await groq.chat.completions.create({
        model: llamaModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const raw = retry.choices[0]?.message?.content?.trim() || '';
      const parsed = parseJsonResponse(raw);
      validateAndNormalize(parsed);
      return parsed;
    } catch (retryErr) {
      console.error('[STEP3] Retry failed — using fallback defaults:', retryErr.message);
      return buildFallback(caption);
    }
  }
}

function buildPrompt(transcript, caption) {
  const transcriptSection = transcript
    ? `Transcript:\n${transcript.slice(0, 8000)}`
    : 'Transcript: [no speech detected]';

  const captionSection = caption
    ? `Caption:\n${caption.slice(0, 500)}`
    : 'Caption: [none]';

  return `Analyze this Instagram reel and return a JSON object with EXACTLY this structure. No markdown fences. No explanation. ONLY the JSON object.

{
  "title": "concise descriptive title for this reel (max 60 chars)",
  "summary": ["key insight 1", "key insight 2", "key insight 3"],
  "category": "short lowercase topic label (e.g. gym, recipes, cafes, editing, fashion, career, travel, finance, skincare). Generate freely based on content.",
  "subcategory": "more specific label within category (e.g. cable back workouts, high protein meals, south delhi cafes)",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "locations": ["any specific location names mentioned — city, area, restaurant, landmark. Empty array if none."],
  "language": "ISO 639-1 code of spoken language (e.g. en, hi, es). Use 'en' if unclear.",
  "skill": {
    "name": "short human-readable label for structured content type (e.g. workout, recipe, cafe review, skincare routine, guitar lesson, outfit breakdown, study technique). Use null if no extractable structured content.",
    "schema": ["field_name_1", "field_name_2"],
    "data": {}
  }
}

For skill.schema: generate ONLY the field names that best describe this specific reel's structured content. For skill.data: extract the actual values from the reel matching those fields. Arrays of strings or objects as appropriate.

${transcriptSection}

${captionSection}`;
}

/**
 * Strips markdown code fences and parses JSON.
 * Handles cases where Gemini wraps output in \`\`\`json ... \`\`\`
 */
function parseJsonResponse(raw) {
  // Strip markdown fences if present
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Find the outermost JSON object in the response
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Ensure all required fields exist with correct types.
 * Mutates in place.
 */
function validateAndNormalize(obj) {
  if (!obj.title || typeof obj.title !== 'string') obj.title = 'untitled reel';
  if (!Array.isArray(obj.summary) || obj.summary.length === 0) obj.summary = ['content saved from instagram'];
  // Ensure exactly 3 summary bullets
  while (obj.summary.length < 3) obj.summary.push('');
  obj.summary = obj.summary.slice(0, 3);

  if (!obj.category || typeof obj.category !== 'string') obj.category = 'general';
  obj.category = obj.category.toLowerCase().trim();

  if (!obj.subcategory || typeof obj.subcategory !== 'string') obj.subcategory = '';
  if (!Array.isArray(obj.tags)) obj.tags = [];
  if (!Array.isArray(obj.locations)) obj.locations = [];
  if (!obj.language) obj.language = 'en';

  // Normalize skill block
  if (!obj.skill || typeof obj.skill !== 'object') {
    obj.skill = { name: null, schema: [], data: {} };
  }
  if (!obj.skill.name || obj.skill.name === 'null') obj.skill.name = null;
  if (!Array.isArray(obj.skill.schema)) obj.skill.schema = [];
  if (!obj.skill.data || typeof obj.skill.data !== 'object') obj.skill.data = {};
}

function buildFallback(caption) {
  return {
    title: caption ? caption.slice(0, 60) : 'saved reel',
    summary: ['content saved from instagram', '', ''],
    category: 'general',
    subcategory: '',
    tags: [],
    locations: [],
    language: 'en',
    skill: { name: null, schema: [], data: {} },
  };
}

module.exports = { analyzeReel };
