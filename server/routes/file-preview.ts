import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { spawnSync as defaultSpawnSync } from 'node:child_process';
import XLSX from 'xlsx';

const textPreviewLimit = 1024 * 1024;
const spreadsheetPreviewLimitRows = 200;
const spreadsheetPreviewLimitColumns = 50;
const spreadsheetPreviewCellTextLimit = 400;
const presentationPreviewCacheMaxAgeMs = 24 * 60 * 60 * 1000;
const presentationPreviewCacheRoot = path.join(os.tmpdir(), 'lalaclaw-presentation-preview');
const imagePreviewCacheRoot = path.join(os.tmpdir(), 'lalaclaw-image-preview');

type PreviewKind =
  | 'text'
  | 'markdown'
  | 'json'
  | 'spreadsheet'
  | 'document'
  | 'docx'
  | 'presentation'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'unsupported';

type PreviewType = {
  kind: PreviewKind;
  mimeType: string;
};

type ValidatedTargetPath =
  | { error: string }
  | {
      path: string;
      stat: fs.Stats;
      kind?: 'text' | 'markdown' | 'json';
    };

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;
type FileSender = (res: unknown, filePath: string, req?: RequestLike) => void;
type RequestLike = { url?: string; headers?: { host?: string; range?: string } };
type SpawnSyncLike = typeof defaultSpawnSync;

const extTypeMap: Record<string, PreviewType> = {
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

type SpreadsheetPreview = {
  kind: 'spreadsheet';
  mimeType: string;
  spreadsheet: {
    sheetName: string;
    rows: string[][];
    totalRows: number;
    totalColumns: number;
    previewRowLimit: number;
    previewColumnLimit: number;
    truncatedRows: boolean;
    truncatedColumns: boolean;
  };
};

export function getFileManagerLabel(platform = process.platform): string {
  if (platform === 'darwin') {
    return 'Finder';
  }
  if (platform === 'win32') {
    return 'Explorer';
  }
  return 'Folder';
}

function looksLikePlainText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function detectPreviewType(filePath: string, buffer: Buffer): PreviewType {
  const ext = path.extname(filePath).toLowerCase();
  if (extTypeMap[ext]) {
    return extTypeMap[ext];
  }

  if (looksLikePlainText(buffer)) {
    return { kind: 'text', mimeType: 'text/plain; charset=utf-8' };
  }

  return { kind: 'unsupported', mimeType: 'application/octet-stream' };
}

function normalizeSpreadsheetCell(value: unknown): string {
  if (value == null) {
    return '';
  }
  const normalized = String(value);
  return normalized.length > spreadsheetPreviewCellTextLimit
    ? `${normalized.slice(0, spreadsheetPreviewCellTextLimit)}...`
    : normalized;
}

function buildSpreadsheetPreview(filePath: string, fileBuffer: Buffer): SpreadsheetPreview {
  const ext = path.extname(filePath).toLowerCase();
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    dense: true,
    cellDates: false,
    cellNF: false,
    raw: false,
  });
  const sheetName = ext === '.csv' ? path.basename(filePath) : workbook.SheetNames[0] || '';
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const resolvedWorksheet = worksheet || (workbook.SheetNames[0] ? workbook.Sheets[workbook.SheetNames[0]] : null);
  const allRows = resolvedWorksheet
    ? (XLSX.utils.sheet_to_json(resolvedWorksheet, {
        header: 1,
        raw: false,
        blankrows: true,
        defval: '',
      }) as unknown[][])
    : [];
  const columnCount = allRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const previewRows = allRows.slice(0, spreadsheetPreviewLimitRows).map((row) => {
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

function cleanupPreviewCache(cacheRoot: string, maxAgeMs: number, now = Date.now()) {
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

export function resolveOfficePreviewExecutable({
  spawnSync = defaultSpawnSync,
  existsSync = fs.existsSync,
}: {
  spawnSync?: SpawnSyncLike;
  existsSync?: typeof fs.existsSync;
} = {}): string {
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

export function resolveOfficePreviewInstallCommand({
  platform = process.platform,
  spawnSync = defaultSpawnSync,
}: {
  platform?: NodeJS.Platform;
  spawnSync?: SpawnSyncLike;
} = {}): string {
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

export function buildOfficePreviewPdf(
  filePath: string,
  {
    spawnSync = defaultSpawnSync,
    cacheRoot = presentationPreviewCacheRoot,
    platform = process.platform,
  }: {
    spawnSync?: SpawnSyncLike;
    cacheRoot?: string;
    platform?: NodeJS.Platform;
  } = {},
): string {
  const executable = resolveOfficePreviewExecutable({ spawnSync });
  if (!executable) {
    const error = new Error('Office preview requires LibreOffice.') as Error & { code?: string; installCommand?: string };
    error.code = 'office_preview_requires_libreoffice';
    error.installCommand = resolveOfficePreviewInstallCommand({ platform, spawnSync });
    throw error;
  }

  const stat = fs.statSync(filePath);
  const cacheKey = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        filePath,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      }),
    )
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
    const error = new Error('Office preview failed.') as Error & { code?: string };
    error.code = 'office_preview_failed';
    throw error;
  }

  return outputPath;
}

export function resolveHeicPreviewExecutable({
  platform = process.platform,
  existsSync = fs.existsSync,
}: {
  platform?: NodeJS.Platform;
  existsSync?: typeof fs.existsSync;
} = {}): string {
  if (platform !== 'darwin') {
    return '';
  }

  return existsSync('/usr/bin/sips') ? '/usr/bin/sips' : '';
}

export function buildHeicPreviewImage(
  filePath: string,
  {
    spawnSync = defaultSpawnSync,
    cacheRoot = imagePreviewCacheRoot,
    platform = process.platform,
  }: {
    spawnSync?: SpawnSyncLike;
    cacheRoot?: string;
    platform?: NodeJS.Platform;
  } = {},
): string {
  const executable = resolveHeicPreviewExecutable({ platform });
  if (!executable) {
    const error = new Error('HEIC preview is unavailable on this system.') as Error & { code?: string };
    error.code = 'heic_preview_unavailable';
    throw error;
  }

  const stat = fs.statSync(filePath);
  const cacheKey = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        filePath,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      }),
    )
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
    const error = new Error('HEIC preview failed.') as Error & { code?: string };
    error.code = 'heic_preview_failed';
    throw error;
  }

  return outputPath;
}

export function createFilePreviewHandlers({
  sendFile,
  sendJson,
  parseRequestBody = async () => ({}),
  platform = process.platform,
  convertOfficeDocumentToPdf = buildOfficePreviewPdf,
  convertHeicImageToPreview = buildHeicPreviewImage,
}: {
  sendFile: FileSender;
  sendJson: JsonSender;
  parseRequestBody?: (req: unknown) => Promise<Record<string, unknown>>;
  platform?: NodeJS.Platform;
  convertOfficeDocumentToPdf?: (filePath: string) => string;
  convertHeicImageToPreview?: (filePath: string) => string;
}) {
  function resolveTargetPath(req: RequestLike): string {
    const url = new URL(req.url || '/', `http://${req.headers?.host || '127.0.0.1'}`);
    return decodeURIComponent(url.searchParams.get('path') || '');
  }

  function validateTargetPath(targetPath: string): ValidatedTargetPath {
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

  function buildMediaUrl(filePath: string): string {
    return `/api/file-preview/content?path=${encodeURIComponent(filePath)}`;
  }

  function validateEditableTargetPath(targetPath: string): ValidatedTargetPath {
    const validated = validateTargetPath(targetPath);
    if ('error' in validated) {
      return validated;
    }

    const fileBuffer = fs.readFileSync(validated.path);
    const detected = detectPreviewType(validated.path, fileBuffer);
    if (detected.kind === 'text' || detected.kind === 'markdown' || detected.kind === 'json') {
      return {
        ...validated,
        kind: detected.kind,
      };
    }

    return { error: 'Preview target is not an editable text file' };
  }

  async function handleFilePreview(req: RequestLike, res: unknown) {
    try {
      const targetPath = resolveTargetPath(req);
      const validated = validateTargetPath(targetPath);
      if ('error' in validated) {
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
        const previewPath = ext === '.heic' || ext === '.heif' ? convertHeicImageToPreview(validated.path) : validated.path;
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
      const typedError = error as Error & { code?: string; installCommand?: string };
      sendJson(res, 500, {
        ok: false,
        error: typedError.message || 'File preview failed',
        errorCode: typedError.code || '',
        installCommand: typedError.installCommand || '',
      });
    }
  }

  async function handleFilePreviewContent(req: RequestLike, res: unknown) {
    const targetPath = resolveTargetPath(req);
    const validated = validateTargetPath(targetPath);
    if ('error' in validated) {
      sendJson(res, 400, { ok: false, error: validated.error });
      return;
    }

    sendFile(res, validated.path, req);
  }

  async function handleFilePreviewSave(req: unknown, res: unknown) {
    try {
      const body = await parseRequestBody(req);
      const validated = validateEditableTargetPath(String(body?.path || ''));
      if ('error' in validated) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }

      if (typeof body?.content !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Invalid file content' });
        return;
      }

      fs.writeFileSync(validated.path, body.content, 'utf8');
      const stat = fs.statSync(validated.path);
      sendJson(res, 200, {
        ok: true,
        path: validated.path,
        kind: validated.kind,
        size: stat.size,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'File save failed',
      });
    }
  }

  return {
    handleFilePreview,
    handleFilePreviewContent,
    handleFilePreviewSave,
  };
}
