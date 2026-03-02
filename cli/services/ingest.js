/**
 * Ingest service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/services/ingest.py.
 *
 * Uses a local language model (via Ollama) to extract structured data from
 * raw text: meeting transcripts, emails, documents, notes.
 *
 * When no language model is available, returns a fallback response so
 * Claude handles the extraction directly (current behavior).
 */

import { generate } from '../core/language-model.js';

// ----- Extraction Prompts -----

const SYSTEM_BASE = `/no_think
You are a structured data extraction assistant. You receive raw text and
extract entities, facts, commitments, and action items into JSON.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no explanation.
- Use the exact schema provided.
- If a field has no matches, use an empty array [].
- For importance scores: 1.0 = critical, 0.7 = notable, 0.4 = minor.
- For entity types: person, organization, project, concept, location.
- For memory types: fact, preference, observation, commitment, learning.
`;

const PROMPTS = {
  meeting: SYSTEM_BASE + `
You are extracting structured data from a MEETING TRANSCRIPT.

Return JSON with this exact schema:
{
  "participants": [{"name": "string", "role": "string or null"}],
  "key_decisions": [{"decision": "string", "made_by": "string or null"}],
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "commitments": [{"content": "string", "who": "string", "importance": number}],
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "topics": ["string"],
  "sentiment_summary": "string"
}
`,

  email: SYSTEM_BASE + `
You are extracting structured data from an EMAIL.

Return JSON with this exact schema:
{
  "from": "string or null",
  "to": ["string"],
  "cc": ["string"],
  "date": "string or null",
  "subject": "string or null",
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "commitments": [{"content": "string", "who": "string", "importance": number}],
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "tone": "string",
  "summary": "string"
}
`,

  document: SYSTEM_BASE + `
You are extracting structured data from a DOCUMENT or article.

Return JSON with this exact schema:
{
  "title": "string or null",
  "author": "string or null",
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "key_points": ["string"],
  "topics": ["string"],
  "summary": "string"
}
`,

  general: SYSTEM_BASE + `
You are extracting structured data from RAW TEXT.

Return JSON with this exact schema:
{
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "commitments": [{"content": "string", "who": "string or null", "importance": number}],
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "topics": ["string"],
  "summary": "string"
}
`,
};

// ----- JSON Parsing -----

function parseJsonResponse(text) {
  text = text.trim();

  // Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // Strip markdown code fences
  if (text.startsWith('```')) {
    const lines = text.split('\n').filter(l => !l.trim().startsWith('```'));
    text = lines.join('\n').trim();
    try { return JSON.parse(text); } catch { /* continue */ }
  }

  // Extract first { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
  }

  return null;
}

// ----- Ingest Function -----

/**
 * Extract structured data from raw text using a local language model.
 * @param {string} text - Raw text to process
 * @param {object} [options]
 * @param {string} [options.sourceType='general'] - One of: meeting, email, document, general
 * @param {string} [options.context] - Optional extra context for extraction
 * @returns {Promise<object>} Extraction result with status, data, raw_text
 */
export async function ingest(text, { sourceType = 'general', context } = {}) {
  const systemPrompt = PROMPTS[sourceType] || PROMPTS.general;

  let prompt = text;
  if (context) {
    prompt = `Context: ${context}\n\n---\n\n${text}`;
  }

  // Generate structured extraction
  const rawOutput = await generate(prompt, {
    system: systemPrompt,
    temperature: 0.1,
    formatJson: true,
  });

  if (rawOutput === null) {
    return {
      status: 'llm_unavailable',
      source_type: sourceType,
      data: null,
      raw_text: text,
    };
  }

  // Parse JSON response
  const parsed = parseJsonResponse(rawOutput);
  if (parsed === null) {
    return {
      status: 'parse_error',
      source_type: sourceType,
      data: null,
      raw_text: text,
      raw_output: rawOutput,
    };
  }

  return {
    status: 'extracted',
    source_type: sourceType,
    data: parsed,
    raw_text: text,
  };
}
