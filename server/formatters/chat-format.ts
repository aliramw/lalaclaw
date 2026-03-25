type AttachmentLike = {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  path?: unknown;
  fullPath?: unknown;
  dataUrl?: unknown;
  textContent?: unknown;
  truncated?: unknown;
};

type MessageContentPart = {
  type?: unknown;
  text?: unknown;
};

type MessageLike = {
  role?: unknown;
  content?: unknown;
  attachments?: AttachmentLike[] | unknown;
};

type NormalizedAttachment = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  fullPath: string;
  dataUrl: string;
  textContent: string;
  truncated: boolean;
};

type OpenClawResponsesContentItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string };

type OpenClawChatContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function getAttachmentModelPath(attachment: NormalizedAttachment): string {
  return attachment.fullPath || attachment.path || '';
}

function clipText(text: unknown, maxLength = 140): string {
  if (!text) {
    return '';
  }

  const normalized =
    typeof text === 'string'
      ? text
      : (() => {
          try {
            return JSON.stringify(text, null, 2);
          } catch {
            return String(text);
          }
        })();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function normalizeChatMessage(message: MessageLike | null | undefined): string {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item: MessageContentPart | string) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return typeof item.text === 'string' ? item.text : '';
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

export function getMessageAttachments(message: MessageLike | null | undefined): NormalizedAttachment[] {
  if (!Array.isArray(message?.attachments)) {
    return [];
  }

  return message.attachments
    .map((attachment) => ({
      id: attachment?.id ? String(attachment.id) : '',
      kind: attachment?.kind ? String(attachment.kind) : '',
      name: String(attachment?.name || '').trim(),
      mimeType: String(attachment?.mimeType || '').trim(),
      size: Number(attachment?.size) || 0,
      path: String(attachment?.path || '').trim(),
      fullPath: String(attachment?.fullPath || '').trim(),
      dataUrl: typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : '',
      textContent: typeof attachment?.textContent === 'string' ? attachment.textContent : '',
      truncated: Boolean(attachment?.truncated),
    }))
    .filter((attachment) => attachment.name);
}

export function describeAttachmentForModel(attachment: NormalizedAttachment): string {
  const attachmentPath = getAttachmentModelPath(attachment);

  if (attachment.textContent) {
    const headerParts = [`附件 ${attachment.name}`];
    if (attachmentPath) {
      headerParts.push(`路径: ${attachmentPath}`);
    }
    return `${headerParts.join('\n')}\n内容:\n${attachment.textContent}${attachment.truncated ? '\n[内容已截断]' : ''}`;
  }

  const attachmentDetails = [attachment.mimeType, attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '']
    .filter(Boolean)
    .join(', ');
  const baseDescription = `附件 ${attachment.name}${attachmentDetails ? ` (${attachmentDetails})` : ''} 已附加。`;
  return attachmentPath ? `${baseDescription}\n路径: ${attachmentPath}` : baseDescription;
}

export function buildOpenClawMessageContent(
  message: MessageLike | null | undefined,
  apiStyle: 'chat' | 'responses' = 'chat',
): string | OpenClawResponsesContentItem[] | OpenClawChatContentItem[] {
  const text = normalizeChatMessage(message).trim();
  const attachments = getMessageAttachments(message);
  const textPrompt = text || (attachments.length ? `用户附加了 ${attachments.length} 个附件，请结合附件内容处理请求。` : '');

  if (apiStyle === 'responses') {
    const content: OpenClawResponsesContentItem[] = [];

    if (textPrompt) {
      content.push({ type: 'input_text', text: textPrompt });
    }

    attachments.forEach((attachment) => {
      if (attachment.kind === 'image' && attachment.dataUrl) {
        const attachmentDescription = describeAttachmentForModel(attachment);
        if (attachmentDescription) {
          content.push({ type: 'input_text', text: attachmentDescription });
        }
        content.push({ type: 'input_image', image_url: attachment.dataUrl });
        return;
      }

      content.push({ type: 'input_text', text: describeAttachmentForModel(attachment) });
    });

    return content.length ? content : [{ type: 'input_text', text: '继续。' }];
  }

  if (!attachments.length) {
    return textPrompt;
  }

  const content: OpenClawChatContentItem[] = [];
  if (textPrompt) {
    content.push({ type: 'text', text: textPrompt });
  }

  attachments.forEach((attachment) => {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      const attachmentDescription = describeAttachmentForModel(attachment);
      if (attachmentDescription) {
        content.push({ type: 'text', text: attachmentDescription });
      }
      content.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
      return;
    }

    content.push({ type: 'text', text: describeAttachmentForModel(attachment) });
  });

  return content;
}

export function summarizeMessages(messages: MessageLike[], { clip = clipText }: { clip?: (text: unknown, maxLength?: number) => string } = {}): string {
  const recent = messages.filter((item) => item.role !== 'system').slice(-6);
  if (!recent.length) {
    return '暂无对话。';
  }

  return recent
    .map((item) => {
      const attachments = getMessageAttachments(item);
      const attachmentSummary = attachments.length ? ` [${attachments.map((attachment) => attachment.name).join(', ')}]` : '';
      return `${String(item.role || '')}: ${clip(normalizeChatMessage(item).replace(/\s+/g, ' ').trim() || '附件消息', 72)}${attachmentSummary}`;
    })
    .join(' | ');
}
