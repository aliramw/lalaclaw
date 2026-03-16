const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { spawnSync: defaultSpawnSync } = require('node:child_process');
const XLSX = require('xlsx');

const textPreviewLimit = 1024 * 1024;
const spreadsheetPreviewLimitRows = 200;
const spreadsheetPreviewLimitColumns = 50;
const spreadsheetPreviewCellTextLimit = 400;
const presentationPreviewCacheMaxAgeMs = 24 * 60 * 60 * 1000;
const presentationPreviewCacheRoot = path.join(os.tmpdir(), 'lalaclaw-presentation-preview');
const imagePreviewCacheRoot = path.join(os.tmpdir(), 'lalaclaw-image-preview');

const extTypeMap = {
  '.txt': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.text': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.log': { kind: 'text', mimeType: 'text/plain; charset=utf-8' },
  '.md': { kind: 'markdown', mimeType: 'text/markdown; charset=utf-8' },
  '.markdown': { kind: 'markdown', mimeType: 'text/markdown; charset=utf-8' },
  '.json': { kind: 'json', mimeType: 'application/json; charset=utf-8' },
  '.csv': { kind: 'spreadsheet', mimeType: 'text/csv; charset=utf-8' },
  '.xls': { kind: 'spreadsheet', mimeType: 'application/vnd.ms-excel' },
  '.xlsx': { kind: 'spreadsheet', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  '.xlsm': { kind: 'spreadsheet', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
  '.doc': { kind: 'document', mimeType: 'application/msword' },
  '.docx': { kind: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.ppt': { kind: 'presentation', mimeType: 'application/vnd.ms-powerpoint' },
  '.pptx': { kind: 'presentation', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.heic': { kind: 'image', mimeType: 'image/heic' },
  '.heif': { kind: 'image', mimeType: 'image/heif' },
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

function normalizeSpreadsheetCell(value) {
  if (value == null) {
    return '';
  }
  const normalized = String(value);
  return normalized.length > spreadsheetPreviewCellTextLimit
    ? `${normalized.slice(0, spreadsheetPreviewCellTextLimit)}…`
    : normalized;
}

function buildSpreadsheetPreview(filePath, fileBuffer) {
  const ext = path.extname(filePath).toLowerCase();
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    dense: true,
    cellDates: false,
    cellNF: false,
    raw: false,
  });
  const sheetName = ext === '.csv' ? path.basename(filePath) : (workbook.SheetNames[0] || '');
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const resolvedWorksheet = worksheet || (workbook.SheetNames[0] ? workbook.Sheets[workbook.SheetNames[0]] : null);
  const allRows = resolvedWorksheet
    ? XLSX.utils.sheet_to_json(resolvedWorksheet, {
        header: 1,
        raw: false,
        blankrows: true,
        defval: '',
      })
    : [];
  const columnCount = allRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const previewRows = allRows
    .slice(0, spreadsheetPreviewLimitRows)
    .map((row) => {
      const values = Array.isArray(row) ? row : [];
      const normalizedValues = values.slice(0, spreadsheetPreviewLimitColumns).map((value) => normalizeSpreadsheetCell(value));
      while (normalizedValues.length < Math.min(columnCount, spreadsheetPreviewLimitColumns)) {
        normalizedValues.push('');
      }
      return normalizedValues;
    });

  return {
    kind: 'spreadsheet',
    mimeType: extTypeMap[path.extname(filePath).toLowerCase()]?.mimeType || 'application/octet-stream',
    spreadsheet: {
      sheetName,
      rows: previewRows,
      totalRows: allRows.length,
      totalColumns: columnCount,
      previewRowLimit: spreadsheetPreviewLimitRows,
      previewColumnLimit: spreadsheetPreviewLimitColumns,
      truncatedRows: allRows.length > spreadsheetPreviewLimitRows,
      truncatedColumns: columnCount > spreadsheetPreviewLimitColumns,
    },
  };
}

function cleanupPreviewCache(cacheRoot, maxAgeMs, now = Date.now()) {
  try {
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
    const cutoff = now - maxAgeMs;
    for (const entry of entries) {
      const entryPath = path.join(cacheRoot, entry.name);
      try {
        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch {}
}

function resolveOfficePreviewExecutable({
  spawnSync = defaultSpawnSync,
  existsSync = fs.existsSync,
} = {}) {
  const absoluteCandidates = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  const commandCandidates = ['soffice', 'libreoffice'];

  for (const candidate of absoluteCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const candidate of commandCandidates) {
    try {
      const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
      if (result.status === 0) {
        return candidate;
      }
    } catch {}
  }

  return '';
}

function resolveOfficePreviewInstallCommand({
  platform = process.platform,
  spawnSync = defaultSpawnSync,
} = {}) {
  if (platform !== 'darwin') {
    return '';
  }

  try {
    const brewResult = spawnSync('brew', ['--version'], { encoding: 'utf8' });
    if (brewResult.status === 0) {
      return 'brew install --cask libreoffice';
    }
  } catch {}

  return '';
}

function buildOfficePreviewPdf(filePath, {
  spawnSync = defaultSpawnSync,
  cacheRoot = presentationPreviewCacheRoot,
  platform = process.platform,
} = {}) {
  const executable = resolveOfficePreviewExecutable({ spawnSync });
  if (!executable) {
    const error = new Error('Office preview requires LibreOffice.');
    error.code = 'office_preview_requires_libreoffice';
    error.installCommand = resolveOfficePreviewInstallCommand({ platform, spawnSync });
    throw error;
  }

  const stat = fs.statSync(filePath);
  const cacheKey = crypto
    .createHash('sha1')
    .update(JSON.stringify({
      filePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    }))
    .digest('hex');
  const outputDir = path.join(cacheRoot, cacheKey);
  const outputPath = path.join(outputDir, `${path.basename(filePath, path.extname(filePath))}.pdf`);

  fs.mkdirSync(cacheRoot, { recursive: true });
  cleanupPreviewCache(cacheRoot, presentationPreviewCacheMaxAgeMs);
  fs.mkdirSync(outputDir, { recursive: true });

  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const result = spawnSync(executable, ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, filePath], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    const error = new Error('Office preview failed.');
    error.code = 'office_preview_failed';
    throw error;
  }

  return outputPath;
}

function resolveHeicPreviewExecutable({
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  if (platform !== 'darwin') {
    return '';
  }

  return existsSync('/usr/bin/sips') ? '/usr/bin/sips' : '';
}

function buildHeicPreviewImage(filePath, {
  spawnSync = defaultSpawnSync,
  cacheRoot = imagePreviewCacheRoot,
  platform = process.platform,
} = {}) {
  const executable = resolveHeicPreviewExecutable({ platform });
  if (!executable) {
    const error = new Error('HEIC preview is unavailable on this system.');
    error.code = 'heic_preview_unavailable';
    throw error;
  }

  const stat = fs.statSync(filePath);
  const cacheKey = crypto
    .createHash('sha1')
    .update(JSON.stringify({
      filePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    }))
    .digest('hex');
  const outputDir = path.join(cacheRoot, cacheKey);
  const outputPath = path.join(outputDir, `${path.basename(filePath, path.extname(filePath))}.png`);

  fs.mkdirSync(cacheRoot, { recursive: true });
  cleanupPreviewCache(cacheRoot, presentationPreviewCacheMaxAgeMs);
  fs.mkdirSync(outputDir, { recursive: true });

  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const result = spawnSync(executable, ['-s', 'format', 'png', filePath, '--out', outputPath], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    const error = new Error('HEIC preview failed.');
    error.code = 'heic_preview_failed';
    throw error;
  }

  return outputPath;
}

function createFilePreviewHandlers({
  sendFile,
  sendJson,
  platform = process.platform,
  convertOfficeDocumentToPdf = buildOfficePreviewPdf,
  convertHeicImageToPreview = buildHeicPreviewImage,
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
        const ext = path.extname(validated.path).toLowerCase();
        const previewPath = ext === '.heic' || ext === '.heif'
          ? convertHeicImageToPreview(validated.path)
          : validated.path;
        sendJson(res, 200, {
          ...basePayload,
          contentUrl: buildMediaUrl(previewPath),
        });
        return;
      }

      if (detected.kind === 'spreadsheet') {
        const spreadsheetPreview = buildSpreadsheetPreview(validated.path, fileBuffer);
        sendJson(res, 200, {
          ...basePayload,
          ...spreadsheetPreview,
        });
        return;
      }

      if (detected.kind === 'docx') {
        sendJson(res, 200, {
          ...basePayload,
          contentUrl: buildMediaUrl(validated.path),
        });
        return;
      }

      if (detected.kind === 'presentation' || detected.kind === 'document') {
        const convertedPdfPath = convertOfficeDocumentToPdf(validated.path);
        sendJson(res, 200, {
          ...basePayload,
          kind: 'pdf',
          sourceKind: detected.kind,
          mimeType: 'application/pdf',
          contentUrl: buildMediaUrl(convertedPdfPath),
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
      sendJson(res, 500, {
        ok: false,
        error: error.message || 'File preview failed',
        errorCode: error.code || '',
        installCommand: error.installCommand || '',
      });
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
  buildOfficePreviewPdf,
  buildHeicPreviewImage,
  createFilePreviewHandlers,
  resolveHeicPreviewExecutable,
  resolveOfficePreviewInstallCommand,
  resolveOfficePreviewExecutable,
};
