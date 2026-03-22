import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

type JsonObject = {
  [key: string]: JsonValue;
};

type JsonResponsePayload = JsonObject | JsonValue[];

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export function sendJson(
  res: Pick<ServerResponse, 'writeHead' | 'end'>,
  statusCode: number,
  payload: JsonResponsePayload,
) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendFile(res: Pick<ServerResponse, 'writeHead' | 'end'>, filePath: string) {
  fs.readFile(filePath, (error: NodeJS.ErrnoException | null, data: Buffer) => {
    if (error) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

export function parseRequestBody(req: Pick<IncomingMessage, 'on' | 'destroy'>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk: Buffer | string) => {
      raw += chunk;
      if (raw.length > 25_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}
