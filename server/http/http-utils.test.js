import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseRequestBody, sendFile, sendJson } from './http-utils.ts';

function createResponseRecorder() {
  return {
    end: vi.fn(),
    writeHead: vi.fn(),
  };
}

class MockRequest extends EventEmitter {
  constructor() {
    super();
    this.destroy = vi.fn();
  }
}

describe('server/http/http-utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes JSON responses with no-store headers', () => {
    const res = createResponseRecorder();

    sendJson(res, 201, { ok: true, message: 'saved' });

    expect(res.writeHead).toHaveBeenCalledWith(201, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(JSON.stringify({ ok: true, message: 'saved' })),
      'Cache-Control': 'no-store',
    });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ ok: true, message: 'saved' }));
  });

  it('parses JSON request bodies', async () => {
    const req = new MockRequest();
    const promise = parseRequestBody(req);

    req.emit('data', '{"ok":true,"count":2}');
    req.emit('end');

    await expect(promise).resolves.toEqual({ ok: true, count: 2 });
  });

  it('rejects invalid JSON bodies', async () => {
    const req = new MockRequest();
    const promise = parseRequestBody(req);

    req.emit('data', '{oops');
    req.emit('end');

    await expect(promise).rejects.toThrow('Invalid JSON body');
  });

  it('returns 404 JSON for missing files', async () => {
    const res = createResponseRecorder();

    sendFile(res, path.join(os.tmpdir(), `missing-${Date.now()}.txt`));

    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(JSON.stringify({ error: 'Not found' })),
        'Cache-Control': 'no-store',
      });
    });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Not found' }));
  });

  it('serves known file types with the matching content type', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lalaclaw-http-utils-'));
    const filePath = path.join(tempDir, 'note.md');
    const content = '# hello\n';
    const res = createResponseRecorder();

    await fs.writeFile(filePath, content, 'utf8');
    sendFile(res, filePath);

    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
    });
    expect(res.end).toHaveBeenCalledWith(Buffer.from(content));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves byte ranges for media metadata requests', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lalaclaw-http-utils-range-'));
    const filePath = path.join(tempDir, 'sample.wav');
    const content = Buffer.from('0123456789abcdef', 'utf8');
    const res = createResponseRecorder();

    await fs.writeFile(filePath, content);
    sendFile(res, filePath, { headers: { range: 'bytes=0-3' } });

    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(206, {
        'Content-Type': 'audio/wav',
        'Content-Length': 4,
        'Content-Range': 'bytes 0-3/16',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
    });
    expect(res.end).toHaveBeenCalledWith(Buffer.from('0123'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
