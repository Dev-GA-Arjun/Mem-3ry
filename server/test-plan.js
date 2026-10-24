import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from './index.js';

async function withServer(planner, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-3ry-plan-'));
  const itemsFilePath = path.join(directory, 'items.json');
  fs.writeFileSync(itemsFilePath, '[]\n', 'utf8');
  const server = createApp({
    itemsFilePath,
    uploadDirectory: path.join(directory, 'uploads'),
    repositoryRoot: directory,
    planner,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('returns a structured weekend timeline and forwards trimmed filters', async () => {
  const timeline = [{
    time: '10:00 AM',
    item: { id: 'cafe-1', title: 'Saved cafe', category: 'cafe' },
  }];
  let received;
  await withServer(async (filters) => {
    received = filters;
    return { timeline };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibe: '  relaxed  ', area: '  Velachery ' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { timeline });
    assert.deepEqual(received, { vibe: 'relaxed', area: 'Velachery' });
  });
});

test('returns a clear empty plan from the planner', async () => {
  await withServer(async () => ({
    timeline: [],
    message: 'No saved items are available to plan.',
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/plan`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      timeline: [],
      message: 'No saved items are available to plan.',
    });
  });
});

test('rejects non-text planner filters', async () => {
  let called = false;
  await withServer(async () => {
    called = true;
    return { timeline: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: ['Velachery'] }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /must be text/);
    assert.equal(called, false);
  });
});

test('returns planner failures as a clear service error', async () => {
  await withServer(async () => {
    throw new Error('The plan could not be created.');
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/plan`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'The plan could not be created.' });
  });
});
