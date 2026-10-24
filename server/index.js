import 'dotenv/config';

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const mcpServerPath = path.join(repoRoot, 'mcp', 'server.js');
const itemsPath = path.join(repoRoot, 'data', 'items.json');
const modelId = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';
const maxAgentTurns = 6;
const maxSummaryLength = 200;
const eventClients = new Set();

let ai;
let mcpConnection;

function getAi() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required. Set it in .env before using the API.');
  }
  ai ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

function sendToolEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of eventClients) {
    client.write(payload);
  }
}

function eventArgs(args) {
  return Object.fromEntries(
    Object.entries(args || {}).map(([name, value]) => [
      name,
      name === 'image' || name === 'image_base64'
        ? '[image data omitted]'
        : value,
    ]),
  );
}

function shortSummary(value) {
  const summary = String(value || '').replace(/\s+/g, ' ').trim();
  return summary.length > maxSummaryLength
    ? `${summary.slice(0, maxSummaryLength - 3)}...`
    : summary;
}

function summarizeToolResult(result) {
  const text = (result?.content || [])
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text)
    .join(' ');
  return shortSummary(text || (result?.isError ? 'Tool returned an error.' : 'Tool completed.'));
}

function resultForModel(result) {
  const text = (result?.content || [])
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
  if (!text) return { isError: Boolean(result?.isError), result: 'Tool returned no text content.' };
  try {
    return { isError: Boolean(result?.isError), result: JSON.parse(text) };
  } catch {
    return { isError: Boolean(result?.isError), result: text };
  }
}

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'OBJECT', properties: {} };

  const converted = {};
  if (schema.type) converted.type = String(schema.type).toUpperCase();
  if (schema.description) converted.description = schema.description;
  if (schema.enum) converted.enum = schema.enum;
  if (schema.required) converted.required = schema.required;
  if (schema.properties) {
    converted.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [name, toGeminiSchema(property)]),
    );
  }
  if (schema.items) converted.items = toGeminiSchema(schema.items);
  return converted;
}

async function getMcpConnection() {
  if (!mcpConnection) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpServerPath],
      cwd: repoRoot,
      env: process.env,
    });
    const client = new Client({ name: 'mem-3ry-agent', version: '1.0.0' }, { capabilities: {} });
    const connection = { client, transport, ready: null };
    connection.ready = client.connect(transport).catch((error) => {
      mcpConnection = null;
      throw error;
    });
    mcpConnection = connection;
  }
  await mcpConnection.ready;
  return mcpConnection.client;
}

function parseItems() {
  if (!fs.existsSync(itemsPath)) return [];
  const content = fs.readFileSync(itemsPath, 'utf8');
  const items = JSON.parse(content);
  if (!Array.isArray(items)) {
    throw new Error('data/items.json must contain a JSON array.');
  }
  return items;
}

function getResponseText(response) {
  const candidateParts = response?.candidates?.[0]?.content?.parts || [];
  return response?.text
    || candidateParts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n')
    || '';
}

function getFunctionCalls(response) {
  if (Array.isArray(response?.functionCalls) && response.functionCalls.length) {
    return response.functionCalls;
  }
  return (response?.candidates?.[0]?.content?.parts || [])
    .filter((part) => part.functionCall)
    .map((part) => part.functionCall);
}

async function callMcpTool(client, tool, args) {
  const event = { tool, args: eventArgs(args), status: 'started', summary: 'Calling tool.' };
  sendToolEvent(event);
  try {
    const result = await client.callTool({ name: tool, arguments: args || {} });
    event.status = result.isError ? 'error' : 'completed';
    event.summary = summarizeToolResult(result);
    sendToolEvent(event);
    return result;
  } catch (error) {
    event.status = 'error';
    event.summary = shortSummary(error.message || error);
    sendToolEvent(event);
    throw error;
  }
}

async function runAgent(message) {
  const client = await getMcpConnection();
  const { tools } = await client.listTools();
  const declarations = tools.map((tool) => ({
    name: tool.name,
    description: tool.description || `Run the ${tool.name} tool.`,
    parameters: toGeminiSchema(tool.inputSchema),
  }));
  const contents = [{ role: 'user', parts: [{ text: message }] }];

  for (let turn = 0; turn < maxAgentTurns; turn += 1) {
    const response = await getAi().models.generateContent({
      model: modelId,
      contents,
      config: {
        systemInstruction: 'You are Mem<3ry, a helpful assistant for searching saved reels and planning activities. Use the provided tools when relevant. Answer clearly and do not invent saved items.',
        tools: [{ functionDeclarations: declarations }],
      },
    });
    const calls = getFunctionCalls(response);
    if (!calls.length) {
      const answer = getResponseText(response).trim();
      if (!answer) throw new Error('Gemma returned an empty response.');
      return answer;
    }

    const modelContent = response?.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    const functionResponses = [];
    for (const call of calls) {
      let toolResponse;
      try {
        toolResponse = await callMcpTool(client, call.name, call.args);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: resultForModel(toolResponse),
          },
        });
      } catch (error) {
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { error: shortSummary(error.message || error) },
          },
        });
      }
    }
    contents.push({ role: 'user', parts: functionResponses });
  }

  throw new Error('Gemma exceeded the maximum number of tool-call turns.');
}

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/items', (request, response, next) => {
  try {
    response.json(parseItems());
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (request, response, next) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!message) {
    response.status(400).json({ error: 'Provide a message.' });
    return;
  }

  try {
    response.json({ answer: await runAgent(message) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/items', async (request, response, next) => {
  const submittedImages = Array.isArray(request.body?.images) ? request.body.images : [];
  const singleImage = request.body?.image_base64 || request.body?.image;
  const images = submittedImages.length
    ? submittedImages
    : singleImage
      ? [{ image_base64: singleImage, mimeType: request.body?.mimeType }]
      : [];
  const caption = typeof request.body?.caption === 'string' ? request.body.caption.trim() : '';

  if (!images.length && !caption) {
    response.status(400).json({ error: 'Provide at least one image or a caption.' });
    return;
  }

  const normalizedImages = images.map((image) => ({
    image: typeof image === 'string' ? image : image?.image_base64 || image?.image,
    mimeType: typeof image === 'string' ? undefined : image?.mimeType,
  }));
  if (normalizedImages.some(({ image }) => typeof image !== 'string' || !image.trim())) {
    response.status(400).json({ error: 'Each image must include base64 data.' });
    return;
  }

  try {
    const client = await getMcpConnection();
    const created = [];
    if (normalizedImages.length) {
      for (const image of normalizedImages) {
        const result = await callMcpTool(client, 'add_item', {
          image: image.image,
          caption,
          mimeType: image.mimeType,
        });
        const text = result.content?.find((entry) => entry.type === 'text')?.text;
        if (result.isError) throw new Error(text || 'Unable to add the image.');
        if (text) created.push(JSON.parse(text));
      }
    } else {
      const result = await callMcpTool(client, 'add_item', { caption });
      const text = result.content?.find((entry) => entry.type === 'text')?.text;
      if (result.isError) throw new Error(text || 'Unable to add the caption.');
      if (text) created.push(JSON.parse(text));
    }
    response.status(201).json({ items: created });
  } catch (error) {
    next(error);
  }
});

app.get('/api/events', (request, response) => {
  response.status(200);
  response.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  response.write(': connected\n\n');
  eventClients.add(response);
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25000);

  request.on('close', () => {
    clearInterval(heartbeat);
    eventClients.delete(response);
  });
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  console.error('API request failed:', error.message || error);
  response.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
});

async function shutdown(server) {
  server.close();
  if (mcpConnection) {
    await mcpConnection.client.close();
    mcpConnection = null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`Mem<3ry API listening on port ${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      shutdown(server).finally(() => process.exit(0));
    });
  }
}

export { app };
