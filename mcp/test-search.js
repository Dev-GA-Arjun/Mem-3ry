import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsPath = path.join(repoRoot, 'data', 'items.json');

function parseToolResult(result) {
  assert.ok(!result.isError, result.content?.[0]?.text || 'MCP tool returned an error');
  const text = result.content?.find((entry) => entry.type === 'text')?.text;
  assert.ok(text, 'MCP tool returned no text content');
  return JSON.parse(text);
}

async function main() {
  const initialItems = fs.existsSync(itemsPath) ? fs.readFileSync(itemsPath) : null;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--env-file=.env', path.join(__dirname, 'server.js')],
  });
  const client = new Client({ name: 'mem-3ry-search-test', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);

    for (const query of ['velachery la cafe', 'gym reels', 'qzxvplmok']) {
      const response = parseToolResult(await client.callTool({
        name: 'search_items',
        arguments: { query },
      }));
      assert.ok(Array.isArray(response.results), `Search results missing for "${query}"`);
      assert.ok(response.results.length <= 5, 'Search returned more than five items');
      assert.ok(response.results.every((item) => typeof item.score === 'number' && item.score > 0));
      if (!response.results.length) {
        assert.match(response.message, /no saved items matched/i);
      }
      console.log(`\n=== Search: ${query} ===\n${JSON.stringify(response, null, 2)}`);
    }

    const plan = parseToolResult(await client.callTool({
      name: 'plan_day',
      arguments: { vibe: 'relaxed weekend', area: 'Chennai' },
    }));
    assert.ok(Array.isArray(plan.timeline), 'Planner timeline missing');
    assert.ok(plan.timeline.length <= 4, 'Planner returned more than four items');
    assert.ok(plan.timeline.every((entry) => entry.time && entry.item?.id));
    if (!plan.timeline.length) {
      assert.match(plan.message, /no saved/i);
    }
    console.log(`\n=== Day plan ===\n${JSON.stringify(plan, null, 2)}`);
  } finally {
    await client.close();
    const finalItems = fs.existsSync(itemsPath) ? fs.readFileSync(itemsPath) : null;
    assert.deepEqual(finalItems, initialItems, 'The test changed data/items.json');
  }
}

main().catch((error) => {
  console.error('Search test failed:', error.message || error);
  process.exit(1);
});
