import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const mcpServerPath = path.join(repoRoot, 'mcp', 'server.js');
const modelId = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';
const maxRounds = 5;
const retryDelayMs = 500;
const maxSummaryLength = 200;
const systemPrompt = [
  'You are Mem<3ry. Answer from saved items only and do not invent details.',
  'Users may write in English or Tanglish. Before calling search_items, translate their intent into simple, relevant keywords and pass those keywords as the query.',
  'For plan_day, include one short line explaining why each planned item was included.',
  'Use the tools when needed, then give a clear and concise answer.',
].join(' ');

export const toolEvents = new EventEmitter();

let ai;
let mcpConnection;

function getAi() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Please set GEMINI_API_KEY and try again.');
  }
  ai ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
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
      Object.entries(schema.properties).map(([name, value]) => [name, toGeminiSchema(value)]),
    );
  }
  if (schema.items) converted.items = toGeminiSchema(schema.items);
  return converted;
}

async function getMcpClient() {
  if (!mcpConnection) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpServerPath],
      cwd: repoRoot,
      env: process.env,
    });
    const client = new Client({ name: 'mem-3ry-agent', version: '1.0.0' }, { capabilities: {} });
    const connection = { client, ready: null };
    connection.ready = client.connect(transport).catch((error) => {
      mcpConnection = null;
      throw error;
    });
    mcpConnection = connection;
  }
  await mcpConnection.ready;
  return mcpConnection.client;
}

function errorKind(error) {
  const status = Number(error?.status || error?.statusCode || error?.code);
  const message = String(error?.message || '').toLowerCase();
  if (status === 429 || message.includes('rate limit') || message.includes('resource exhausted')) {
    return 'rate-limit';
  }
  if (
    status === 408
    || status === 504
    || error?.name === 'AbortError'
    || error?.code === 'ETIMEDOUT'
    || message.includes('timed out')
    || message.includes('timeout')
  ) {
    return 'timeout';
  }
  return 'other';
}

function friendlyGeminiError(error) {
  const kind = errorKind(error);
  if (kind === 'rate-limit') {
    return new Error('Gemini is busy right now. Please wait a moment and try again.');
  }
  if (kind === 'timeout') {
    return new Error('Gemini took too long to respond. Please try again.');
  }
  return new Error('Gemini could not complete that request. Please try again.');
}

async function generateWithRetry(request) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await getAi().models.generateContent(request);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw friendlyGeminiError(lastError);
}

function getFunctionCalls(response) {
  if (Array.isArray(response?.functionCalls) && response.functionCalls.length) {
    return response.functionCalls;
  }
  return (response?.candidates?.[0]?.content?.parts || [])
    .filter((part) => part.functionCall)
    .map((part) => part.functionCall);
}

function getResponseText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return response?.text
    || parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n')
    || '';
}

function fullToolResult(result) {
  const text = (result?.content || [])
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
  if (!text) return { message: result?.isError ? 'Tool failed without a result.' : 'Tool returned no text.' };
  try {
    return JSON.parse(text);
  } catch {
    return { result: text };
  }
}

function summarizeToolResult(result) {
  const parsed = fullToolResult(result);
  let summary;
  if (Array.isArray(parsed.results)) {
    summary = parsed.results.length
      ? `Found ${parsed.results.length} matching item${parsed.results.length === 1 ? '' : 's'}.`
      : parsed.message || 'No matching saved items.';
  } else if (Array.isArray(parsed.timeline)) {
    summary = parsed.timeline.length
      ? `Planned ${parsed.timeline.length} saved item${parsed.timeline.length === 1 ? '' : 's'}.`
      : parsed.message || 'No saved items available for a plan.';
  } else if (parsed.id) {
    summary = `Saved ${parsed.title || 'an item'}.`;
  } else {
    summary = parsed.message || parsed.result || 'Tool completed.';
  }
  summary = String(summary).replace(/\s+/g, ' ').trim();
  return summary.length > maxSummaryLength ? `${summary.slice(0, maxSummaryLength - 3)}...` : summary;
}

function publishToolEvent(event) {
  toolEvents.emit('tool', event);
}

async function executeTool(client, call) {
  const event = {
    id: randomUUID(),
    tool: call.name,
    status: 'pending',
    durationMs: 0,
    summary: 'Tool call in progress.',
  };
  const startedAt = Date.now();
  publishToolEvent(event);

  try {
    const result = await client.callTool({
      name: call.name,
      arguments: call.args || {},
    });
    event.status = result.isError ? 'failed' : 'done';
    event.durationMs = Date.now() - startedAt;
    event.summary = summarizeToolResult(result);
    publishToolEvent(event);
    return {
      result: fullToolResult(result),
      isError: result.isError === true,
      functionResponse: {
        name: call.name,
        response: fullToolResult(result),
      },
    };
  } catch {
    event.status = 'failed';
    event.durationMs = Date.now() - startedAt;
    event.summary = 'Tool call failed. Please try again.';
    publishToolEvent(event);
    return {
      result: { error: event.summary },
      isError: true,
      functionResponse: {
        name: call.name,
        response: { error: event.summary },
      },
    };
  }
}

export async function runPlanner({ vibe, area } = {}) {
  const client = await getMcpClient();
  const args = {};
  if (vibe) args.vibe = vibe;
  if (area) args.area = area;

  const execution = await executeTool(client, { name: 'plan_day', args });
  if (execution.isError) {
    throw new Error(execution.result.error || 'The weekend plan could not be created. Please try again.');
  }
  if (!Array.isArray(execution.result.timeline)) {
    throw new Error('The planner returned an invalid timeline. Please try again.');
  }
  return execution.result;
}

export async function runAgent(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('Please enter a message.');
  }
  const client = await getMcpClient();
  const { tools } = await client.listTools();
  const functionDeclarations = tools.map((tool) => ({
    name: tool.name,
    description: tool.description || `Run the ${tool.name} tool.`,
    parameters: toGeminiSchema(tool.inputSchema),
  }));
  const contents = [{ role: 'user', parts: [{ text: message.trim() }] }];

  for (let round = 0; round < maxRounds; round += 1) {
    const response = await generateWithRetry({
      model: modelId,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations }],
      },
    });
    const calls = getFunctionCalls(response);
    if (!calls.length) {
      const answer = getResponseText(response).trim();
      if (!answer) throw new Error('Gemini returned an empty answer. Please try again.');
      return answer;
    }

    if (response?.candidates?.[0]?.content) {
      contents.push(response.candidates[0].content);
    }
    const functionResponses = [];
    for (const call of calls) {
      const execution = await executeTool(client, call);
      functionResponses.push(execution.functionResponse);
    }
    contents.push({ role: 'user', parts: functionResponses });
  }

  throw new Error('I could not finish that request after several tool calls. Please try a simpler question.');
}

export async function closeAgent() {
  if (!mcpConnection) return;
  const connection = mcpConnection;
  mcpConnection = null;
  await connection.client.close();
}
