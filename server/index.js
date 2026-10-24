import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import express from 'express';
import multer from 'multer';

import { closeAgent, runAgent, toolEvents } from './agent.js';
import { extractItemFromGemini, persistItem } from '../mcp/item-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');
const itemsPath = path.join(dataDir, 'items.json');
const uploadsDir = path.join(dataDir, 'uploads');
const eventClients = new Set();

const acceptedImages = new Map([
  ['image/jpeg', { extension: '.jpg', signature: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/png', { extension: '.png', signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
  ['image/webp', { extension: '.webp', signature: (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' }],
]);

function uploadError(message) {
  const error = new Error(message);
  error.code = 'INVALID_UPLOAD';
  return error;
}

function createUploadMiddleware(directory) {
  const storage = multer.diskStorage({
    destination(request, file, callback) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        callback(null, directory);
      } catch (error) {
        callback(error);
      }
    },
    filename(request, file, callback) {
      const imageType = acceptedImages.get(file.mimetype);
      callback(null, `${crypto.randomUUID()}${imageType?.extension || '.upload'}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter(request, file, callback) {
      if (!acceptedImages.has(file.mimetype)) {
        callback(uploadError('Upload a JPEG, PNG, or WebP image.'));
        return;
      }
      callback(null, true);
    },
  }).single('image');
}

function signatureMatches(filePath, mimeType) {
  const bytes = Buffer.alloc(12);
  const file = fs.openSync(filePath, 'r');
  try {
    const count = fs.readSync(file, bytes, 0, bytes.length, 0);
    return acceptedImages.get(mimeType)?.signature(bytes.subarray(0, count)) === true;
  } finally {
    fs.closeSync(file);
  }
}

function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function createApp({
  aiClient,
  extractItem = extractItemFromGemini,
  repositoryRoot = repoRoot,
  itemsFilePath = itemsPath,
  uploadDirectory = uploadsDir,
} = {}) {
  const app = express();
  const upload = createUploadMiddleware(uploadDirectory);
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
      const items = JSON.parse(fs.readFileSync(itemsFilePath, 'utf8'));
      if (!Array.isArray(items)) throw new Error('Saved items file must contain an array.');
      response.json(items);
    } catch {
      response.status(500).json({ error: 'Saved items could not be loaded.' });
    }
  });

  app.post('/api/upload', (request, response, next) => {
    upload(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }
      next();
    });
  }, async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: 'Upload one image using the image field.' });
      return;
    }

    let keepFile = false;
    try {
      const imageType = acceptedImages.get(request.file.mimetype);
      if (!imageType || !signatureMatches(request.file.path, request.file.mimetype)) {
        response.status(400).json({ error: 'The image content does not match its JPEG, PNG, or WebP type.' });
        return;
      }

      const item = await extractItem({
        image: fs.readFileSync(request.file.path).toString('base64'),
        mimeType: request.file.mimetype,
        aiClient,
      });
      item.image_path = path.relative(repositoryRoot, request.file.path).split(path.sep).join('/');
      persistItem(item, itemsFilePath);
      keepFile = true;
      response.status(201).json(item);
    } catch (error) {
      response.status(500).json({ error: error.message || 'The image could not be processed.' });
    } finally {
      if (!keepFile) {
        try {
          removeUploadedFile(request.file.path);
        } catch (error) {
          console.error('Unable to remove a failed upload:', error.message || error);
        }
      }
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

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 8 MB or smaller.'
        : 'Upload exactly one image using the image field.';
      response.status(400).json({ error: message });
      return;
    }
    if (error.code === 'INVALID_UPLOAD') {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error('API request failed:', error.message || error);
    response.status(500).json({ error: 'The image could not be processed.' });
  });

  return app;
}

const app = createApp();

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
