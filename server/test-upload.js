import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from './index.js';

const itemResponse = JSON.stringify({
  title: 'Test cafe',
  category: 'cafe',
  confidence: 'high',
  place: 'Test Cafe',
  area: 'Chennai',
  key_points: ['Coffee'],
  tags: ['coffee'],
  source_note: null,
});
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const webpBytes = Buffer.from('RIFF0000WEBP');

function createAiClient({ text = itemResponse, error } = {}) {
  return {
    models: {
      async generateContent() {
        if (error) throw error;
        return { text };
      },
    },
  };
}

async function withUploadServer({ aiClient = createAiClient(), existingItems = [] } = {}, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-3ry-upload-'));
  const itemsFilePath = path.join(directory, 'items.json');
  const uploadDirectory = path.join(directory, 'data', 'uploads');
  fs.writeFileSync(itemsFilePath, `${JSON.stringify(existingItems)}\n`, 'utf8');
  const app = createApp({ aiClient, itemsFilePath, uploadDirectory, repositoryRoot: directory });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await callback({
      baseUrl: `http://127.0.0.1:${address.port}`,
      directory,
      itemsFilePath,
      uploadDirectory,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function createUploadForm(bytes = pngBytes, mimeType = 'image/png') {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: mimeType }), 'user-controlled-name.png');
  return form;
}

async function postUpload(baseUrl, bytes, mimeType) {
  return fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    body: createUploadForm(bytes, mimeType),
  });
}

test('accepts one valid image and returns a normalized saved item', async () => {
  const original = { id: 'keep-me', title: 'Existing saved item' };
  await withUploadServer({ existingItems: [original] }, async ({ baseUrl, itemsFilePath }) => {
    const response = await postUpload(baseUrl, pngBytes, 'image/png');
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(item.title, 'Test cafe');
    assert.equal(item.category, 'cafe');
    const savedItems = JSON.parse(fs.readFileSync(itemsFilePath, 'utf8'));
    assert.deepEqual(savedItems[0], original);
    assert.equal(savedItems.length, 2);
  });
});

for (const [mimeType, bytes, extension] of [
  ['image/jpeg', jpegBytes, '.jpg'],
  ['image/webp', webpBytes, '.webp'],
]) {
  test(`accepts ${mimeType} images`, async () => {
    await withUploadServer({}, async ({ baseUrl, uploadDirectory }) => {
      const response = await postUpload(baseUrl, bytes, mimeType);
      const item = await response.json();
      assert.equal(response.status, 201);
      assert.ok(fs.existsSync(path.join(path.dirname(path.dirname(uploadDirectory)), item.image_path)));
      assert.ok(item.image_path.endsWith(extension));
    });
  });
}

test('rejects unsupported MIME types with a clear 400 response', async () => {
  await withUploadServer({}, async ({ baseUrl }) => {
    const response = await postUpload(baseUrl, Buffer.from('not an image'), 'text/plain');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /JPEG, PNG, or WebP/);
  });
});

test('rejects an image whose bytes do not match its declared MIME type', async () => {
  await withUploadServer({}, async ({ baseUrl }) => {
    const response = await postUpload(baseUrl, Buffer.from('not a png'), 'image/png');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /does not match/);
  });
});

test('rejects images larger than 8 MB with a clear 400 response', async () => {
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  await withUploadServer({}, async ({ baseUrl, uploadDirectory }) => {
    const response = await postUpload(baseUrl, oversized, 'image/png');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /8 MB or smaller/);
    assert.deepEqual(fs.readdirSync(uploadDirectory), []);
  });
});

test('cleans up the uploaded image when Gemma extraction fails', async () => {
  await withUploadServer({ aiClient: createAiClient({ text: 'not valid JSON' }) }, async ({ baseUrl, itemsFilePath, uploadDirectory }) => {
    const response = await postUpload(baseUrl, pngBytes, 'image/png');
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /did not return valid JSON/);
    assert.deepEqual(JSON.parse(fs.readFileSync(itemsFilePath, 'utf8')), []);
    assert.deepEqual(fs.readdirSync(uploadDirectory), []);
  });
});

test('persists a repository-relative image_path with a generated filename', async () => {
  await withUploadServer({}, async ({ baseUrl, itemsFilePath, uploadDirectory }) => {
    const response = await postUpload(baseUrl, pngBytes, 'image/png');
    const item = await response.json();
    assert.equal(response.status, 201);
    assert.match(item.image_path, /^data\/uploads\/[0-9a-f-]+\.png$/i);
    assert.notEqual(path.basename(item.image_path), 'user-controlled-name.png');
    assert.ok(fs.existsSync(path.join(path.dirname(path.dirname(uploadDirectory)), item.image_path)));
    assert.equal(JSON.parse(fs.readFileSync(itemsFilePath, 'utf8'))[0].image_path, item.image_path);
  });
});
