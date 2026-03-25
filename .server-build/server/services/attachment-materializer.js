"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.materializeInlineAttachments = materializeInlineAttachments;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const mimeExtensionMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
};
function sanitizeFileName(candidate = '') {
    const normalized = node_path_1.default.basename(String(candidate || '').trim())
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, '-')
        .trim();
    if (!normalized || normalized === '.' || normalized === '..') {
        return '';
    }
    return normalized;
}
function parseDataUrl(dataUrl = '') {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
    if (!match?.[2]) {
        return null;
    }
    return {
        mimeType: String(match[1] || 'application/octet-stream').trim() || 'application/octet-stream',
        buffer: Buffer.from(match[2], 'base64'),
    };
}
function buildAttachmentFileName(attachment, mimeType = '') {
    const requestedName = sanitizeFileName(String(attachment?.name || ''));
    if (requestedName) {
        return requestedName;
    }
    const extension = mimeExtensionMap[String(mimeType || '').trim().toLowerCase()] || '';
    const idPart = String(attachment?.id || '').trim();
    return `${idPart || 'attachment'}${extension}`;
}
function buildLocalDayStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function materializeInlineAttachments(attachments = [], { rootDir = '' } = {}) {
    if (!Array.isArray(attachments) || !attachments.length) {
        return [];
    }
    const normalizedRoot = String(rootDir || '').trim();
    if (!normalizedRoot) {
        return attachments;
    }
    const dayStamp = buildLocalDayStamp(new Date());
    const uploadDir = node_path_1.default.join(normalizedRoot, 'media', 'web-uploads', dayStamp);
    let ensuredUploadDir = false;
    return attachments.map((attachment) => {
        const currentPath = String(attachment?.fullPath || attachment?.path || '').trim();
        if (currentPath) {
            return attachment;
        }
        const parsedDataUrl = parseDataUrl(String(attachment?.dataUrl || ''));
        if (!parsedDataUrl) {
            return attachment;
        }
        if (!ensuredUploadDir) {
            node_fs_1.default.mkdirSync(uploadDir, { recursive: true });
            ensuredUploadDir = true;
        }
        const fileName = buildAttachmentFileName(attachment, attachment?.mimeType || parsedDataUrl.mimeType);
        const uniquePrefix = `${Date.now()}-${node_crypto_1.default.randomBytes(4).toString('hex')}`;
        const destinationPath = node_path_1.default.join(uploadDir, `${uniquePrefix}-${fileName}`);
        node_fs_1.default.writeFileSync(destinationPath, parsedDataUrl.buffer);
        return {
            ...attachment,
            mimeType: String(attachment?.mimeType || parsedDataUrl.mimeType || '').trim() || parsedDataUrl.mimeType,
            path: destinationPath,
            fullPath: destinationPath,
        };
    });
}
