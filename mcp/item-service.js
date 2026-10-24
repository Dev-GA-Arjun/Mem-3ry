import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultItemsPath = path.join(repoRoot, 'data', 'items.json');
const validCategories = ['cafe', 'food', 'recipe', 'workout', 'movie', 'travel', 'product', 'tip', 'other'];
const validConfidences = ['high', 'medium', 'low'];

let ai;

function getAi() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required. Set it in .env before running the MCP server.');
  }
  ai ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

function normalizeBase64Image(value, mimeTypeHint) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('No image data was provided.');

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
    if (!match) {
      throw new Error('Unsupported image data URL format. Use a data:image/...;base64,... payload.');
    }
    return { mimeType: match[1], data: match[2].replace(/\s+/g, '') };
  }

  return {
    mimeType: mimeTypeHint || 'image/png',
    data: trimmed.replace(/\s+/g, ''),
  };
}

function stripCodeFences(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function safeJsonParse(rawText) {
  const cleaned = stripCodeFences(rawText);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeString(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeTags(value, creatorHandles) {
  if (!Array.isArray(value)) return [];
  const accountHandles = new Set((creatorHandles || '')
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((handle) => handle.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean));

  return value
    .map((entry) => normalizeString(entry, ''))
    .filter(Boolean)
    .slice(0, 12)
    .map((entry) => entry.replace(/^#+\s*/, '').trim())
    .filter((entry) => !entry.startsWith('@') && !accountHandles.has(entry.toLowerCase()));
}

function normalizeKeyPoints(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeString(entry, '')).filter(Boolean);
}

function validateExtractedItem(item, fallbackCaption) {
  if (!item || typeof item !== 'object') {
    throw new Error('Gemma returned an invalid object.');
  }

  const title = normalizeString(item.title, 'Untitled item') || 'Untitled item';
  const categoryValue = normalizeString(item.category, 'other').toLowerCase();
  const confidenceValue = normalizeString(item.confidence, 'low').toLowerCase();
  const creatorHandles = normalizeString(item.source_note, null);
  const sourceNotes = [...new Set([normalizeString(fallbackCaption, null), creatorHandles].filter(Boolean))];

  return {
    id: crypto.randomUUID(),
    title,
    category: validCategories.includes(categoryValue) ? categoryValue : 'other',
    confidence: validConfidences.includes(confidenceValue) ? confidenceValue : 'low',
    place: normalizeString(item.place, null),
    area: normalizeString(item.area, null),
    key_points: normalizeKeyPoints(item.key_points).length ? normalizeKeyPoints(item.key_points) : ['Saved reel details'],
    tags: normalizeTags(item.tags, creatorHandles).length ? normalizeTags(item.tags, creatorHandles) : ['saved'],
    source_note: sourceNotes.join(' | ') || null,
    created_at: new Date().toISOString(),
  };
}

export async function extractItemFromGemini({ image, caption, mimeType, aiClient }) {
  const prompt = [
    'Extract the saved reel into valid JSON only.',
    'Use this shape:',
    '{',
    '  "title": "string",',
    '  "category": "cafe | food | recipe | workout | movie | travel | product | tip | other",',
    '  "confidence": "high | medium | low",',
    '  "place": "string or null",',
    '  "area": "string or null",',
    '  "key_points": ["string"],',
    '  "tags": ["string"],',
    '  "source_note": "comma-separated creator handle(s), prefixed with @, or null"',
    '}',
    'Use recipe for cooking instructions or recipes.',
    'Extract all legible on-screen text into key_points, including every ingredient and each step. Do not omit text because the list is long.',
    'Tags must be topics only. Never put account handles in tags. Put visible creator handles in source_note, prefixed with @ even if the screenshot omits @. Separate multiple handles with commas.',
    'Use low confidence whenever any detail is guessed, medium when details are partly unclear, and high only when details are directly visible and clear.',
    'If a field is unknown, use null or an empty array.',
    'Return plain JSON without markdown fences.',
  ].join('\n');

  const parts = [{ text: prompt }];
  if (image) {
    const resolved = normalizeBase64Image(image, mimeType);
    parts.push({ inlineData: { mimeType: resolved.mimeType, data: resolved.data } });
  }
  if (caption) parts.push({ text: `Caption/source note:\n${caption}` });

  const response = await (aiClient || getAi()).models.generateContent({
    model: process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it',
    contents: [{ role: 'user', parts }],
  });
  const text = response?.text
    || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n')
    || '';
  const parsed = safeJsonParse(text);
  if (!parsed) throw new Error('Gemma did not return valid JSON for the item extraction.');
  return validateExtractedItem(parsed, caption || null);
}

function readItems(itemsPath) {
  if (!fs.existsSync(itemsPath)) return [];
  const raw = fs.readFileSync(itemsPath, 'utf8');
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Saved items file must contain a JSON array.');
  return parsed;
}

export function persistItem(item, itemsPath = defaultItemsPath) {
  fs.mkdirSync(path.dirname(itemsPath), { recursive: true });
  const items = readItems(itemsPath);
  items.push(item);
  const temporaryPath = `${itemsPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, itemsPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
  return item;
}
