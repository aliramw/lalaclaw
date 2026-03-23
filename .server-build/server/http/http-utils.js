"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJson = sendJson;
exports.sendFile = sendFile;
exports.parseRequestBody = parseRequestBody;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const CONTENT_TYPES = {
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
function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
    });
    res.end(body);
}
function parseRangeHeader(rangeHeader, fileSize) {
    const normalized = String(rangeHeader || '').trim();
    const match = /^bytes=(\d*)-(\d*)$/i.exec(normalized);
    if (!match) {
        return null;
    }
    const startText = match[1] || '';
    const endText = match[2] || '';
    if (!startText && !endText) {
        return null;
    }
    if (!startText) {
        const suffixLength = Number.parseInt(endText, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
            return null;
        }
        const start = Math.max(0, fileSize - suffixLength);
        return { start, end: Math.max(start, fileSize - 1) };
    }
    const start = Number.parseInt(startText, 10);
    if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
        return null;
    }
    const parsedEnd = endText ? Number.parseInt(endText, 10) : fileSize - 1;
    if (!Number.isFinite(parsedEnd)) {
        return null;
    }
    const end = Math.min(parsedEnd, fileSize - 1);
    if (end < start) {
        return null;
    }
    return { start, end };
}
function sendFile(res, filePath, req) {
    node_fs_1.default.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }
        const ext = node_path_1.default.extname(filePath).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
        const rangeHeader = String(req?.headers?.range || '').trim();
        const range = rangeHeader ? parseRangeHeader(rangeHeader, data.length) : null;
        if (rangeHeader && !range) {
            res.writeHead(416, {
                'Content-Type': contentType,
                'Content-Range': `bytes */${data.length}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
            });
            res.end();
            return;
        }
        if (range) {
            const body = data.subarray(range.start, range.end + 1);
            res.writeHead(206, {
                'Content-Type': contentType,
                'Content-Length': body.length,
                'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
            });
            res.end(body);
            return;
        }
        res.writeHead(200, {
            'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
            'Content-Length': data.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
        });
        res.end(data);
    });
}
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
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
            }
            catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
