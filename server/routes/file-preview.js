const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const textPreviewLimit = 1024 * 1024;

const extTypeMap = {
  '.txt': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.text': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.log': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.md': { kind: 'markdown', mimeType: 'text/markdown; charset=utf-8' },
  '.markdown': { kind: 'markdown', mimeType: 'text/markdown; charset=utf-8' },
  '.json': { kind: 'json', mimeType: 'application/json; charset=utf-8' },
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.webp': { kind: 'image', mimeType: 'image/webp' },
  '.svg': { kind: 'image', mimeType: 'image/svg+xml' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
  '.mov': { kind: 'video', mimeType: 'video/quicktime' },
  '.mp3': { kind: 'audio', mimeType: 'audio/mpeg' },
  '.wav': { kind: 'audio', mimeType: 'audio/wav' },
  '.ogg': { kind: 'audio', mimeType: 'audio/ogg' },
  '.m4a': { kind: 'audio', mimeType: 'audio/mp4' },
};

function getFileManagerLabel(platform = process.platform) {
  if (platform === 'darwin') {
    return 'Finder';
  }
  if (platform === 'win32') {
    return 'Explorer';
  }
  return 'Folder';
}

function looksLikePlainText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function detectPreviewType(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (extTypeMap[ext]) {
    return extTypeMap[ext];
  }

  if (looksLikePlainText(buffer)) {
    return { kind: 'text', mimeType: 'text/plain; charset=utf-8' };
  }

  return { kind: 'unsupported', mimeType: 'application/octet-stream' };
}

function createFilePreviewHandlers({
  sendFile,
  sendJson,
  platform = process.platform,
}) {
  function resolveTargetPath(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return decodeURIComponent(url.searchParams.get('path') || '');
  }

  function validateTargetPath(targetPath) {
    const resolved = String(targetPath || '').trim();
    if (!resolved || !path.isAbsolute(resolved)) {
      return { error: 'Invalid file path' };
    }

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        return { error: 'Preview target must be a file' };
      }
      return { path: resolved, stat };
    } catch {
      return { error: 'File not found' };
    }
  }

  function buildMediaUrl(filePath) {
    return `/api/file-preview/content?path=${encodeURIComponent(filePath)}`;
  }

  async function handleFilePreview(req, res) {
    try {
      const targetPath = resolveTargetPath(req);
      const validated = validateTargetPath(targetPath);
      if (validated.error) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }

      const fileBuffer = fs.readFileSync(validated.path);
      const detected = detectPreviewType(validated.path, fileBuffer);
      const basePayload = {
        ok: true,
        path: validated.path,
        name: path.basename(validated.path),
        size: validated.stat.size,
        kind: detected.kind,
        mimeType: detected.mimeType,
        fileManagerLabel: getFileManagerLabel(platform),
      };

      if (detected.kind === 'image' || detected.kind === 'video' || detected.kind === 'audio' || detected.kind === 'pdf') {
        sendJson(res, 200, {
          ...basePayload,
          contentUrl: buildMediaUrl(validated.path),
        });
        return;
      }

      if (detected.kind === 'text' || detected.kind === 'markdown' || detected.kind === 'json') {
        const truncated = fileBuffer.length > textPreviewLimit;
        const content = fileBuffer.subarray(0, textPreviewLimit).toString('utf8');
        sendJson(res, 200, {
          ...basePayload,
          truncated,
          content,
        });
        return;
      }

      sendJson(res, 200, {
        ...basePayload,
        contentUrl: buildMediaUrl(validated.path),
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'File preview failed' });
    }
  }

  async function handleFilePreviewContent(req, res) {
    const targetPath = resolveTargetPath(req);
    const validated = validateTargetPath(targetPath);
    if (validated.error) {
      sendJson(res, 400, { ok: false, error: validated.error });
      return;
    }

    sendFile(res, validated.path);
  }

  return {
    handleFilePreview,
    handleFilePreviewContent,
  };
}

module.exports = {
  createFilePreviewHandlers,
};
