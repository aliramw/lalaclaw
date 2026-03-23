"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileManagerHandlers = createFileManagerHandlers;
exports.createFileManagerHandler = createFileManagerHandler;
exports.getFileManagerLabel = getFileManagerLabel;
const fs = require('node:fs');
const path = require('node:path');
const clipboardMimeExtensionMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
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
function createClientError(message) {
    const error = new Error(message);
    error.isClientError = true;
    return error;
}
function validateAbsolutePath(candidate, invalidMessage) {
    const targetPath = String(candidate || '').trim();
    if (!targetPath || !path.isAbsolute(targetPath)) {
        return { error: invalidMessage };
    }
    return { path: targetPath };
}
function sanitizeRenameTargetName(candidate = '') {
    const normalized = String(candidate || '').trim();
    if (!normalized) {
        return '';
    }
    if (normalized === '.' || normalized === '..') {
        return '';
    }
    if (normalized.includes('/') || normalized.includes('\\')) {
        return '';
    }
    if ([...normalized].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    })) {
        return '';
    }
    return normalized;
}
function sanitizeClipboardFileName(candidate = '') {
    const normalized = path.basename(String(candidate || '').trim())
        .split('')
        .map((character) => {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127 || /[<>:"/\\|?*]/.test(character)) {
            return '-';
        }
        return character;
    })
        .join('');
    if (!normalized || normalized === '.' || normalized === '..') {
        return '';
    }
    return normalized;
}
function getClipboardFileExtension(mimeType = '') {
    const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
    if (normalizedMimeType in clipboardMimeExtensionMap) {
        return clipboardMimeExtensionMap[normalizedMimeType];
    }
    return '';
}
function buildGeneratedClipboardFileName(mimeType = '', index = 0) {
    const extension = getClipboardFileExtension(mimeType);
    return `pasted-file-${Number(index) + 1}${extension}`;
}
function resolveUniqueDestinationPath(directoryPath, fileName) {
    const safeName = sanitizeClipboardFileName(fileName);
    const fallbackName = safeName || buildGeneratedClipboardFileName('', 0);
    const ext = path.extname(fallbackName);
    const baseName = ext ? fallbackName.slice(0, -ext.length) : fallbackName;
    let counter = 0;
    while (true) {
        const candidateName = counter > 0 ? `${baseName}-${counter}${ext}` : fallbackName;
        const candidatePath = path.join(directoryPath, candidateName);
        if (!fs.existsSync(candidatePath)) {
            return candidatePath;
        }
        counter += 1;
    }
}
function parseClipboardDataUrl(dataUrl = '') {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
    if (!match?.[2]) {
        throw createClientError('Invalid clipboard file payload');
    }
    return {
        mimeType: String(match[1] || 'application/octet-stream').trim() || 'application/octet-stream',
        buffer: Buffer.from(match[2], 'base64'),
    };
}
function buildSavedFilePayload(filePath) {
    const stat = fs.statSync(filePath);
    return {
        path: filePath,
        name: path.basename(filePath),
        kind: '文件',
        size: stat.size,
    };
}
function hasValidationError(value) {
    return typeof value.error === 'string';
}
function createFileManagerHandlers({ execFileAsync, parseRequestBody, sendJson, platform = process.platform, }) {
    function validateTargetPath(candidate) {
        const validated = validateAbsolutePath(candidate, 'Invalid file path');
        if (hasValidationError(validated)) {
            return validated;
        }
        try {
            const stat = fs.statSync(validated.path);
            return { path: validated.path, stat };
        }
        catch {
            return { error: 'File not found' };
        }
    }
    function validateTargetDirectory(candidate) {
        const validated = validateAbsolutePath(candidate, 'Invalid directory path');
        if (hasValidationError(validated)) {
            return validated;
        }
        try {
            const stat = fs.statSync(validated.path);
            if (!stat.isDirectory()) {
                return { error: 'Paste target must be a directory' };
            }
            return { path: validated.path, stat };
        }
        catch {
            return { error: 'Directory not found' };
        }
    }
    async function revealInFileManager(targetPath) {
        const stat = fs.statSync(targetPath);
        const isDirectory = stat.isDirectory();
        if (platform === 'darwin') {
            await execFileAsync('open', isDirectory ? [targetPath] : ['-R', targetPath]);
            return;
        }
        if (platform === 'win32') {
            await execFileAsync('explorer.exe', isDirectory ? [targetPath] : ['/select,', targetPath]);
            return;
        }
        const openTarget = isDirectory ? targetPath : path.dirname(targetPath);
        await execFileAsync('xdg-open', [openTarget]);
    }
    function saveClipboardUploadEntry(directoryPath, entry, index) {
        const { buffer, mimeType } = parseClipboardDataUrl(entry?.dataUrl);
        const requestedName = sanitizeClipboardFileName(entry?.name);
        const destinationPath = resolveUniqueDestinationPath(directoryPath, requestedName || buildGeneratedClipboardFileName(entry?.mimeType || mimeType, index));
        fs.writeFileSync(destinationPath, buffer);
        return buildSavedFilePayload(destinationPath);
    }
    function copyClipboardSourceEntry(directoryPath, entry, index) {
        const validatedSource = validateTargetPath(entry?.sourcePath);
        if (hasValidationError(validatedSource)) {
            throw createClientError(validatedSource.error);
        }
        if (!validatedSource.stat.isFile()) {
            throw createClientError('Clipboard source must be a file');
        }
        const requestedName = sanitizeClipboardFileName(entry?.name);
        const destinationPath = resolveUniqueDestinationPath(directoryPath, requestedName || path.basename(validatedSource.path) || buildGeneratedClipboardFileName('', index));
        fs.copyFileSync(validatedSource.path, destinationPath);
        return buildSavedFilePayload(destinationPath);
    }
    async function handleFileManagerRename(req, res) {
        try {
            const body = await parseRequestBody(req);
            const validated = validateTargetPath(body?.path);
            if (hasValidationError(validated)) {
                sendJson(res, 400, { ok: false, error: validated.error });
                return;
            }
            const nextName = sanitizeRenameTargetName(body?.nextName);
            if (!nextName) {
                sendJson(res, 400, { ok: false, error: 'Invalid target name' });
                return;
            }
            const currentPath = validated.path;
            const currentDirectory = path.dirname(currentPath);
            const nextPath = path.join(currentDirectory, nextName);
            if (nextPath === currentPath) {
                sendJson(res, 200, {
                    ok: true,
                    path: currentPath,
                    nextPath,
                    name: nextName,
                    kind: validated.stat.isDirectory() ? '目录' : '文件',
                    unchanged: true,
                });
                return;
            }
            if (fs.existsSync(nextPath)) {
                sendJson(res, 409, { ok: false, error: 'Target already exists' });
                return;
            }
            fs.renameSync(currentPath, nextPath);
            sendJson(res, 200, {
                ok: true,
                path: currentPath,
                nextPath,
                name: nextName,
                kind: validated.stat.isDirectory() ? '目录' : '文件',
            });
        }
        catch (error) {
            const clientError = error;
            sendJson(res, clientError?.isClientError ? 400 : 500, {
                ok: false,
                error: clientError.message || 'Rename failed',
            });
        }
    }
    async function handleFileManagerReveal(req, res) {
        try {
            const body = await parseRequestBody(req);
            const validated = validateTargetPath(body?.path);
            if (hasValidationError(validated)) {
                sendJson(res, 400, { ok: false, error: validated.error });
                return;
            }
            await revealInFileManager(validated.path);
            sendJson(res, 200, {
                ok: true,
                label: getFileManagerLabel(platform),
                path: validated.path,
            });
        }
        catch (error) {
            const revealError = error;
            sendJson(res, 500, { ok: false, error: revealError.message || 'Reveal in file manager failed' });
        }
    }
    async function handleFileManagerPaste(req, res) {
        try {
            const body = await parseRequestBody(req);
            const validatedDirectory = validateTargetDirectory(body?.directoryPath || body?.path);
            if (hasValidationError(validatedDirectory)) {
                sendJson(res, 400, { ok: false, error: validatedDirectory.error });
                return;
            }
            const entries = Array.isArray(body?.entries) ? body.entries : [];
            if (!entries.length) {
                sendJson(res, 400, { ok: false, error: 'No clipboard files to save' });
                return;
            }
            const items = entries.map((entry, index) => {
                if (entry?.kind === 'sourcePath') {
                    return copyClipboardSourceEntry(validatedDirectory.path, entry, index);
                }
                return saveClipboardUploadEntry(validatedDirectory.path, entry, index);
            });
            sendJson(res, 200, {
                ok: true,
                directoryPath: validatedDirectory.path,
                items,
            });
        }
        catch (error) {
            const clientError = error;
            sendJson(res, clientError?.isClientError ? 400 : 500, {
                ok: false,
                error: clientError.message || 'Paste into directory failed',
            });
        }
    }
    return {
        handleFileManagerPaste,
        handleFileManagerRename,
        handleFileManagerReveal,
    };
}
function createFileManagerHandler(options) {
    return createFileManagerHandlers(options).handleFileManagerReveal;
}
