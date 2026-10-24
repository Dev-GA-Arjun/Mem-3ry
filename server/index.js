import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { closeAgent, runAgent, toolEvents } from './agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const itemsPath = path.resolve(__dirname, '..', 'data', 'items.json');
const eventClients = new Set();
const app = express();

app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', async (request, response) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!message) {
    response.status(400).json({ error: 'Please enter a message.' });
    return;
  }

  try {
    response.json({ answer: await runAgent(message) });
  } catch (error) {
    response.status(503).json({ error: error.message || 'Unable to answer right now. Please try again.' });
  }
});

app.get('/api/items', (request, response) => {
  try {
    const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    if (!Array.isArray(items)) throw new Error('Saved items file must contain an array.');
    response.json(items);
  } catch {
    response.status(500).json({ error: 'Saved items could not be loaded.' });
  }
});

app.get('/api/events', (request, response) => {
  response.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  response.flushHeaders();
  response.write(': connected\n\n');

  const onToolEvent = (event) => {
    response.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  eventClients.add(response);
  toolEvents.on('tool', onToolEvent);
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25000);

  request.on('close', () => {
    clearInterval(heartbeat);
    toolEvents.off('tool', onToolEvent);
    eventClients.delete(response);
  });
});

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`Mem<3ry API listening on port ${port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close();
      closeAgent().finally(() => process.exit(0));
    });
  }
}

export { app };
