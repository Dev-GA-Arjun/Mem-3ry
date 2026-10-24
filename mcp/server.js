import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GoogleGenAI } from '@google/genai';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsPath = path.join(repoRoot, 'data', 'items.json');
const validCategories = ['cafe', 'food', 'workout', 'movie', 'travel', 'product', 'tip', 'other'];

const apiKey = process.env.GEMINI_API_KEY;
const gemmaModel = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required. Set it in .env before running the MCP server.');
}

const ai = new GoogleGenAI({ apiKey });

function ensureItemsFile() {
  fs.mkdirSync(path.dirname(itemsPath), { recursive: true });
  if (!fs.existsSync(itemsPath)) {
    fs.writeFileSync(itemsPath, '[]\n', 'utf8');
  }
}

function readItems() {
  ensureItemsFile();
  const raw = fs.readFileSync(itemsPath, 'utf8');
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeBase64Image(value, mimeTypeHint) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error('No image data was provided.');
  }

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
    if (!match) {
      throw new Error('Unsupported image data URL format. Use a data:image/...;base64,... payload.');
    }
    return {
      mimeType: match[1],
      data: match[2].replace(/\s+/g, ''),
    };
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
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeString(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry, ''))
    .filter(Boolean)
    .slice(0, 12)
    .map((entry) => entry.replace(/^#+\s*/, '').trim());
}

function normalizeKeyPoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry, ''))
    .filter(Boolean)
    .slice(0, 6);
}

function validateExtractedItem(item, fallbackCaption) {
  if (!item || typeof item !== 'object') {
    throw new Error('Gemma returned an invalid object.');
  }

  const title = normalizeString(item.title, 'Untitled item') || 'Untitled item';
  const categoryValue = normalizeString(item.category, 'other').toLowerCase();
  const category = validCategories.includes(categoryValue) ? categoryValue : 'other';
  const place = normalizeString(item.place, null);
  const area = normalizeString(item.area, null);

  const normalizedItem = {
    id: crypto.randomUUID(),
    title,
    category,
    place,
    area,
    key_points: normalizeKeyPoints(item.key_points).length ? normalizeKeyPoints(item.key_points) : ['Saved reel details'],
    tags: normalizeTags(item.tags).length ? normalizeTags(item.tags) : ['saved'],
    source_note: normalizeString(fallbackCaption, null),
    created_at: new Date().toISOString(),
  };

  return normalizedItem;
}

async function extractItemFromGemini({ image, caption, mimeType }) {
  const prompt = [
    'Extract the saved reel into valid JSON only.',
    'Use this shape:',
    '{',
    '  "title": "string",',
    '  "category": "cafe | food | workout | movie | travel | product | tip | other",',
    '  "place": "string or null",',
    '  "area": "string or null",',
    '  "key_points": ["string"],',
    '  "tags": ["string"]',
    '}',
    'If a field is unknown, use null or an empty array.',
    'Return plain JSON without markdown fences.',
  ].join('\n');

  const parts = [{ text: prompt }];

  if (image) {
    const resolved = normalizeBase64Image(image, mimeType);
    parts.push({ inlineData: { mimeType: resolved.mimeType, data: resolved.data } });
  }

  if (caption) {
    parts.push({ text: `Caption/source note:\n${caption}` });
  }

  const response = await ai.models.generateContent({
    model: gemmaModel,
    contents: [{ role: 'user', parts }],
  });

  const text = response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
  const parsed = safeJsonParse(text);

  if (!parsed) {
    throw new Error('Gemma did not return valid JSON for the item extraction.');
  }

  return validateExtractedItem(parsed, caption || null);
}

const mcpServer = new McpServer({
  name: 'mem-3ry-mcp',
  version: '1.0.0',
});

mcpServer.registerTool(
  'add_item',
  {
    description: 'Add a saved reel item from a screenshot or caption',
    inputSchema: {
      image: z.string().optional().describe('Base64 image data or data URL'),
      caption: z.string().optional().describe('Optional caption or source note'),
      mimeType: z.string().optional().describe('Optional MIME type for raw base64 images'),
    },
  },
  async ({ image, caption, mimeType }) => {
    if (!image && !caption) {
      throw new Error('Provide either an image or a caption.');
    }

    const extracted = await extractItemFromGemini({ image, caption, mimeType });
    const currentItems = readItems();
    currentItems.push(extracted);
    fs.writeFileSync(itemsPath, `${JSON.stringify(currentItems, null, 2)}\n`, 'utf8');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(extracted, null, 2),
      }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Mem<3ry MCP server ready');
}

main().catch((error) => {
  console.error('MCP server failed:', error.message || error);
  process.exit(1);
});
