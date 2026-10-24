import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const samplesDir = path.join(repoRoot, 'samples');

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function detectMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

async function main() {
  const files = fs
    .readdirSync(samplesDir)
    .filter((fileName) => imageExtensions.has(path.extname(fileName).toLowerCase()))
    .sort();

  if (!files.length) {
    console.log('No sample images found in samples/. Add screenshots and rerun this test.');
    return;
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--env-file=.env', path.join(__dirname, 'server.js')],
  });

  const client = new Client({ name: 'mem-3ry-test', version: '1.0.0' }, { capabilities: {} });

  await client.connect(transport);

  for (const fileName of files) {
    const fullPath = path.join(samplesDir, fileName);
    const raw = fs.readFileSync(fullPath);
    const mimeType = detectMimeType(fileName);
    const base64 = raw.toString('base64');

    console.log(`\n=== ${fileName} ===`);
    const result = await client.callTool({
      name: 'add_item',
      arguments: {
        image: `data:${mimeType};base64,${base64}`,
      },
    });

    const text = result?.content?.[0]?.text || JSON.stringify(result, null, 2);
    console.log(text);
  }

  await client.close();
}

main().catch((error) => {
  console.error('Test failed:', error.message || error);
  process.exit(1);
});
