import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type LooseRecord = Record<string, any>;

const mimeExtensionMap: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

function sanitizeFileName(candidate = ''): string {
  const normalized = path.basename(String(candidate || '').trim())
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, '-')
    .trim();

  if (!normalized || normalized === '.' || normalized === '..') {
    return '';
  }

  return normalized;
}

function parseDataUrl(dataUrl = ''): { buffer: Buffer; mimeType: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
  if (!match?.[2]) {
    return null;
  }

  return {
    mimeType: String(match[1] || 'application/octet-stream').trim() || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildAttachmentFileName(attachment: LooseRecord, mimeType = ''): string {
  const requestedName = sanitizeFileName(String(attachment?.name || ''));
  if (requestedName) {
    return requestedName;
  }

  const extension = mimeExtensionMap[String(mimeType || '').trim().toLowerCase()] || '';
  const idPart = String(attachment?.id || '').trim();
  return `${idPart || 'attachment'}${extension}`;
}

function buildLocalDayStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function materializeInlineAttachments(
  attachments: LooseRecord[] = [],
  { rootDir = '' }: { rootDir?: string } = {},
): LooseRecord[] {
  if (!Array.isArray(attachments) || !attachments.length) {
    return [];
  }

  const normalizedRoot = String(rootDir || '').trim();
  if (!normalizedRoot) {
    return attachments;
  }

  const dayStamp = buildLocalDayStamp(new Date());
  const uploadDir = path.join(normalizedRoot, 'media', 'web-uploads', dayStamp);
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
      fs.mkdirSync(uploadDir, { recursive: true });
      ensuredUploadDir = true;
    }

    const fileName = buildAttachmentFileName(attachment, attachment?.mimeType || parsedDataUrl.mimeType);
    const uniquePrefix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const destinationPath = path.join(uploadDir, `${uniquePrefix}-${fileName}`);

    fs.writeFileSync(destinationPath, parsedDataUrl.buffer);

    return {
      ...attachment,
      mimeType: String(attachment?.mimeType || parsedDataUrl.mimeType || '').trim() || parsedDataUrl.mimeType,
      path: destinationPath,
      fullPath: destinationPath,
    };
  });
}
