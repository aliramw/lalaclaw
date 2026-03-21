export async function copyTextToClipboard(content) {
  const clipboard =
    (typeof window !== "undefined" && window.navigator?.clipboard)
    || (typeof navigator !== "undefined" && navigator.clipboard)
    || null;
  await clipboard?.writeText?.(String(content || ""));
}

const clipboardUriListMimeType = "text/uri-list";
const clipboardFileExtensionByMimeType = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

function getClipboardFileExtension(mimeType = "") {
  return clipboardFileExtensionByMimeType[String(mimeType || "").trim().toLowerCase()] || "";
}

function buildGeneratedClipboardFileName(mimeType = "", index = 0) {
  return `pasted-file-${Number(index) + 1}${getClipboardFileExtension(mimeType)}`;
}

function normalizeFileUrlPath(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "file:") {
      return "";
    }

    let pathname = decodeURIComponent(url.pathname || "");
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }

    return `${url.host ? `//${url.host}` : ""}${pathname}`;
  } catch {
    return "";
  }
}

function parseFileUriList(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => normalizeFileUrlPath(line))
    .filter(Boolean);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function isClipboardBinaryMimeType(mimeType = "") {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  if (!normalizedMimeType) {
    return false;
  }

  return normalizedMimeType === clipboardUriListMimeType || !normalizedMimeType.startsWith("text/");
}

function getClipboardApi() {
  return (
    (typeof window !== "undefined" && window.navigator?.clipboard)
    || (typeof navigator !== "undefined" && navigator.clipboard)
    || null
  );
}

export function createClipboardUploadEntriesFromFiles(files = []) {
  return Array.from(files || [])
    .filter(Boolean)
    .map((file) => ({ kind: "upload", file }));
}

export async function clipboardHasPasteableFiles() {
  const clipboard = getClipboardApi();
  if (typeof clipboard?.read !== "function") {
    return false;
  }

  try {
    const items = await clipboard.read();
    return items.some((item) => Array.isArray(item?.types) && item.types.some((type) => isClipboardBinaryMimeType(type)));
  } catch {
    return false;
  }
}

export async function readClipboardFileEntries() {
  const clipboard = getClipboardApi();
  if (typeof clipboard?.read !== "function") {
    return [];
  }

  const items = await clipboard.read();
  const entries = [];
  let uploadIndex = 0;

  for (const item of items) {
    for (const type of item?.types || []) {
      const normalizedType = String(type || "").trim().toLowerCase();
      if (!normalizedType) {
        continue;
      }

      const blob = await item.getType(type);
      if (!(blob instanceof Blob)) {
        continue;
      }

      if (normalizedType === clipboardUriListMimeType) {
        const filePaths = parseFileUriList(await blob.text());
        filePaths.forEach((sourcePath) => {
          entries.push({ kind: "sourcePath", sourcePath });
        });
        continue;
      }

      if (!isClipboardBinaryMimeType(normalizedType)) {
        continue;
      }

      const file =
        blob instanceof File && String(blob.name || "").trim()
          ? blob
          : new File([blob], buildGeneratedClipboardFileName(blob.type || normalizedType, uploadIndex), {
              type: blob.type || normalizedType || "application/octet-stream",
            });

      entries.push({ kind: "upload", file });
      uploadIndex += 1;
    }
  }

  return entries;
}

export async function buildClipboardPasteRequestEntries(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];

  const requestEntries = await Promise.all(
    normalizedEntries.map(async (entry) => {
      if (entry?.kind === "sourcePath") {
        const sourcePath = String(entry.sourcePath || "").trim();
        return sourcePath ? { kind: "sourcePath", sourcePath } : null;
      }

      if (entry?.kind !== "upload" || !(entry.file instanceof Blob)) {
        return null;
      }

      const file = entry.file;
      const mimeType = file.type || "application/octet-stream";
      const base64 = arrayBufferToBase64(await file.arrayBuffer());

      return {
        kind: "upload",
        name: typeof file.name === "string" ? file.name : "",
        mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    }),
  );

  return requestEntries.filter(Boolean);
}
