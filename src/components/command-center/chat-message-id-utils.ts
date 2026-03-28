// Message ID and fingerprint utilities

type MessageLike = {
  id?: string;
  role?: string;
  timestamp?: number | string;
  content?: string;
  attachments?: Array<{ id?: string; storageKey?: string; name?: string; path?: string; previewUrl?: string }>;
};

export function normalizeConversationMessageFingerprintPart(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function hashConversationMessageFingerprint(value = "") {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function buildConversationMessageFingerprint(message: MessageLike = {}) {
  const role = String(message?.role || "message").trim() || "message";
  const timestamp = Number(message?.timestamp || 0);
  const content = normalizeConversationMessageFingerprintPart(message?.content || "");
  const attachmentFingerprint = Array.isArray(message?.attachments)
    ? message.attachments
      .map((attachment) => (
        String(attachment?.id || attachment?.storageKey || attachment?.name || attachment?.path || attachment?.previewUrl || "").trim()
      ))
      .filter(Boolean)
      .join("|")
    : "";
  return [role, timestamp || "na", content || "empty", attachmentFingerprint || "no-attachments"].join("::");
}
