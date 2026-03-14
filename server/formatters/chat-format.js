function clipText(text, maxLength = 140) {
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

function normalizeChatMessage(message) {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return item.text || '';
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function getMessageAttachments(message) {
  if (!Array.isArray(message?.attachments)) {
    return [];
  }

  return message.attachments
    .map((attachment) => ({
      id: attachment?.id || '',
      kind: attachment?.kind || '',
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

function describeAttachmentForModel(attachment) {
  if (attachment.textContent) {
    return `附件 ${attachment.name}:\n${attachment.textContent}${attachment.truncated ? '\n[内容已截断]' : ''}`;
  }

  const attachmentDetails = [attachment.mimeType, attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '']
    .filter(Boolean)
    .join(', ');
  return `附件 ${attachment.name}${attachmentDetails ? ` (${attachmentDetails})` : ''} 已附加。`;
}

function buildOpenClawMessageContent(message, apiStyle = 'chat') {
  const text = normalizeChatMessage(message).trim();
  const attachments = getMessageAttachments(message);
  const textPrompt = text || (attachments.length ? `用户附加了 ${attachments.length} 个附件，请结合附件内容处理请求。` : '');

  if (apiStyle === 'responses') {
    const content = [];

    if (textPrompt) {
      content.push({ type: 'input_text', text: textPrompt });
    }

    attachments.forEach((attachment) => {
      if (attachment.kind === 'image' && attachment.dataUrl) {
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

  const content = [];
  if (textPrompt) {
    content.push({ type: 'text', text: textPrompt });
  }

  attachments.forEach((attachment) => {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      content.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
      return;
    }

    content.push({ type: 'text', text: describeAttachmentForModel(attachment) });
  });

  return content;
}

function summarizeMessages(messages, { clip = clipText } = {}) {
  const recent = messages.filter((item) => item.role !== 'system').slice(-6);
  if (!recent.length) {
    return '暂无对话。';
  }

  return recent
    .map((item) => {
      const attachments = getMessageAttachments(item);
      const attachmentSummary = attachments.length ? ` [${attachments.map((attachment) => attachment.name).join(', ')}]` : '';
      return `${item.role}: ${clip(normalizeChatMessage(item).replace(/\s+/g, ' ').trim() || '附件消息', 72)}${attachmentSummary}`;
    })
    .join(' | ');
}

module.exports = {
  buildOpenClawMessageContent,
  describeAttachmentForModel,
  getMessageAttachments,
  normalizeChatMessage,
  summarizeMessages,
};
