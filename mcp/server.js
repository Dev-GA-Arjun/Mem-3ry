import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { extractItemFromGemini, persistItem } from './item-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsPath = path.join(repoRoot, 'data', 'items.json');
const searchFields = [
  ['title', 6],
  ['tags', 5],
  ['place', 5],
  ['area', 5],
  ['key_points', 3],
  ['source_note', 1],
];
const planGroups = [
  { categories: ['cafe', 'food'] },
  { categories: ['workout'] },
  { categories: ['place', 'travel'] },
  { categories: ['movie'] },
];
const planTimeSlots = ['10:00 AM', '12:30 PM', '4:00 PM', '7:00 PM'];

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

function queryTokens(value) {
  return [...new Set(String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
}

function scoreItem(item, tokens) {
  return tokens.reduce((score, token) => {
    const matchingWeight = searchFields.reduce((bestWeight, [field, weight]) => {
      const value = Array.isArray(item[field]) ? item[field].join(' ') : item[field];
      return queryTokens(value).includes(token)
        ? Math.max(bestWeight, weight)
        : bestWeight;
    }, 0);
    return score + matchingWeight;
  }, 0);
}

function matchesArea(item, area) {
  return !area || String(item.area || '').toLocaleLowerCase().includes(area.toLocaleLowerCase());
}

function newestFirst(left, right) {
  return String(right.created_at || '').localeCompare(String(left.created_at || ''));
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
    persistItem(extracted, itemsPath);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(extracted, null, 2),
      }],
    };
  },
);

mcpServer.registerTool(
  'search_items',
  {
    description: 'Search saved reels by keyword, category, or area',
    inputSchema: {
      query: z.string().trim().min(1).describe('Keywords to search across saved item details'),
      category: z.string().optional().describe('Optional category filter'),
      area: z.string().optional().describe('Optional area filter'),
    },
  },
  async ({ query, category, area }) => {
    const tokens = queryTokens(query);
    const normalizedCategory = category?.trim().toLocaleLowerCase();
    const normalizedArea = area?.trim();
    const results = readItems()
      .filter((item) => !normalizedCategory || String(item.category || '').toLocaleLowerCase() === normalizedCategory)
      .filter((item) => matchesArea(item, normalizedArea))
      .map((item) => ({ ...item, score: scoreItem(item, tokens) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || newestFirst(left, right))
      .slice(0, 5);

    const response = results.length
      ? { results }
      : {
          results: [],
          message: `No saved items matched "${query}"${normalizedCategory ? ` in category "${category}"` : ''}${normalizedArea ? ` in area "${area}"` : ''}.`,
        };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
      }],
    };
  },
);

mcpServer.registerTool(
  'plan_day',
  {
    description: 'Build an ordered day plan from saved food, activity, place, and movie items',
    inputSchema: {
      vibe: z.string().optional().describe('Optional mood or theme for the plan'),
      area: z.string().optional().describe('Optional area filter'),
    },
  },
  async ({ vibe, area }) => {
    const tokens = queryTokens(vibe);
    const normalizedArea = area?.trim();
    const items = readItems()
      .filter((item) => matchesArea(item, normalizedArea))
      .map((item) => ({ item, score: scoreItem(item, tokens) }));
    const groups = planGroups.map((group) => ({
      ...group,
      items: items
        .filter(({ item }) => group.categories.includes(String(item.category || '').toLocaleLowerCase()))
        .sort((left, right) => right.score - left.score || newestFirst(left.item, right.item)),
      nextIndex: 0,
    }));
    const selected = [];

    for (const group of groups) {
      if (group.items.length) {
        selected.push({ group, item: group.items[group.nextIndex++].item });
      }
    }

    while (selected.length < 4) {
      let addedItem = false;
      for (const group of groups) {
        if (selected.length >= 4) break;
        if (group.nextIndex < group.items.length) {
          selected.push({ group, item: group.items[group.nextIndex++].item });
          addedItem = true;
        }
      }
      if (!addedItem) break;
    }

    const timeline = selected.map(({ item }, index) => ({
      time: planTimeSlots[index],
      item,
    }));
    const response = timeline.length
      ? { timeline }
      : {
          timeline: [],
          message: normalizedArea
            ? `No saved cafe, food, workout, movie, or travel items were found in "${area}".`
            : 'No saved cafe, food, workout, movie, or travel items are available to plan.',
        };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
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
