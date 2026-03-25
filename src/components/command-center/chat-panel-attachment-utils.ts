type AttachmentLike = {
  kind?: string;
  mimeType?: string;
};

function isImageAttachment(attachment) {
  return attachment?.kind === "image" || /^image\//i.test(attachment?.mimeType || "");
}

export function messageHasVisualMedia(message: { attachments?: AttachmentLike[]; content?: string } = {}) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.some(isImageAttachment)) {
    return true;
  }

  const content = String(message?.content || "");
  if (!content) {
    return false;
  }

  if (/!\[[^\]]*]\([^)]+\)/.test(content)) {
    return true;
  }

  return /(^|\n)\s*https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S+)?\s*($|\n)/i.test(content);
}
