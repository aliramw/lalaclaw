import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildCanonicalImSessionUser } = require('../../shared/im-session-key.cjs');
const { stripMarkdownForDisplay } = require('../../shared/strip-markdown-for-display.cjs');

type LooseRecord = Record<string, any>;
type TranscriptContentItem = LooseRecord & {
  arguments?: string;
  partialJson?: string;
  text?: string;
  type?: string;
};
type TranscriptPreviewEntry = {
  kind: 'dir' | 'file';
  name: string;
  path: string;
  size: string;
  updatedAt: number;
};
type TranscriptDetectedFile = {
  actions: string[];
  fullPath: string;
  kind: string;
  observedAt: number;
  path: string;
  primaryAction: string;
  updatedAt: number;
  updatedLabel: string;
};
type TranscriptConversationMessage = {
  attachments?: TranscriptConversationMessageAttachment[];
  content: string;
  role: 'assistant' | 'system' | 'user';
  timestamp: number;
  tokenBadge?: string;
};
type TranscriptConversationMessageAttachment = {
  fullPath: string;
  kind: string;
  mimeType?: string;
  name: string;
  path: string;
};
type TranscriptNormalizedUserMessage = {
  attachments: TranscriptConversationMessageAttachment[];
  content: string;
  systemMessages?: TranscriptUserPreludeMessage[];
};
type TranscriptUserPreludeMessage = {
  content: string;
  role: 'system';
};
type TranscriptGeneratedAttachmentDescriptor = {
  kind: string;
  mimeType?: string;
  name: string;
  path: string;
};
type TranscriptArtifact = {
  detail: string;
  messageRole: string;
  messageTimestamp: number;
  timestamp: number;
  title: string;
  type: string;
};
type TranscriptSnapshotItem = {
  detail: string;
  id: string;
  sessionId: string;
  timestamp: number;
  title: string;
};
type SessionIdentity = LooseRecord & {
  accountid?: string;
  channel?: string;
  chattype?: string;
  groupid?: string;
  groupname?: string;
  peerid?: string;
  peername?: string;
  sendername?: string;
  sessionKey?: string;
};
type SessionSearchMetadata = {
  displaySessionUser: string;
  friendlySessionLabel: string;
  normalizedMetadataHaystack: string;
  parsedSessionIdentity: SessionIdentity | null;
  resolvedChannel: string;
};
type SessionSearchIndexEntry = {
  agentId: string;
  displaySessionUser: string;
  friendlySessionLabel: string;
  normalizedMetadataHaystack: string;
  resolvedChannel: string;
  sessionKey: string;
  sessionRecord: LooseRecord;
  sessionUser: string;
  updatedAt: number;
};
type SessionSearchPreview = {
  matched: boolean;
  preview: string;
};
type TranscriptToolHistoryItem = {
  detail: string;
  id?: string;
  name: string;
  status: string;
  timestamp: number;
  toolCallId?: string;
};
type TranscriptRunTool = {
  detail: string;
  id: string;
  input: string;
  name: string;
  output: string;
  status: string;
  timestamp: number;
};
type TranscriptRun = {
  files: Map<string, TranscriptDetectedFile>;
  id: string;
  outcome: string;
  prompt: string;
  snapshots: TranscriptSnapshotItem[];
  status: string;
  timestamp: number;
  title: string;
  tools: TranscriptRunTool[];
};
type TranscriptTimelineRun = {
  files: TranscriptDetectedFile[];
  id: string;
  outcome: string;
  prompt: string;
  relationships?: LooseRecord[];
  snapshots: TranscriptSnapshotItem[];
  status: string;
  timestamp: number;
  title: string;
  tools: TranscriptRunTool[];
  toolsSummary: string;
};
type JsonLinesCacheEntry = {
  entries: LooseRecord[];
  mtime: number;
};

export function createTranscriptProjector({
  PROJECT_ROOT,
  LOCAL_OPENCLAW_DIR,
  config,
  fileExists,
  readJsonIfExists,
  readTextIfExists,
  normalizeThinkMode,
  parseCompactNumber,
  parseTokenDisplay,
  formatTokenBadge,
  clip,
  formatTimestamp,
}: LooseRecord) {
  const TRANSIENT_USER_REPLAY_WINDOW_MS = 10 * 60 * 1000;
  const MIRRORED_IM_REPLAY_WINDOW_MS = 30 * 1000;
  const SESSION_SEARCH_MAX_RESULTS = 12;
  const SESSION_SEARCH_MAX_CANDIDATES = 80;
  const SESSION_SEARCH_TRANSCRIPT_WINDOW = 160;
  const SESSION_SEARCH_PREVIEW_CHARS = 180;
  const UNTRUSTED_METADATA_SENTINELS = [
    /^Conversation info \(untrusted metadata\):/i,
    /^Sender \(untrusted metadata\):/i,
    /^Thread starter \(untrusted, for context\):/i,
    /^Replied message \(untrusted, for context\):/i,
    /^Forwarded message context \(untrusted metadata\):/i,
    /^Chat history since last reply \(untrusted, for context\):/i,
  ];
  const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;
  const INTERNAL_MEMORY_FLUSH_SENTINELS = [
    /^Pre-compaction memory flush\./i,
    /Store durable memories only in memory\/\d{4}-\d{2}-\d{2}\.md/i,
    /If nothing to store,\s*reply with NO_REPLY\./i,
  ];
  const INTERNAL_SESSION_STARTUP_SENTINELS = [
    /^A new session was started via \/new or \/reset\./i,
    /Run your Session Startup sequence - read the required files before responding to the user\./i,
    /Do not mention internal steps, files, tools, or reasoning\./i,
  ];
  const ABORTED_RUN_NOTE_LINE = /^Note:\s*The previous agent run was aborted by the user\b/i;
  const QUEUED_BUSY_TITLE_LINE = /^\[Queued messages while agent was busy\]\s*$/i;
  const QUEUED_BUSY_ITEM_LINE = /^Queued #\d+\s*$/i;

  function getSessionsIndexPath(agentId: string): string {
    return path.join(LOCAL_OPENCLAW_DIR, 'agents', agentId, 'sessions', 'sessions.json');
  }

  function getSessionsDirPath(agentId: string): string {
    return path.join(LOCAL_OPENCLAW_DIR, 'agents', agentId, 'sessions');
  }

  function getTranscriptPath(agentId: string, sessionId: string): string {
    return path.join(getSessionsDirPath(agentId), `${sessionId}.jsonl`);
  }

  function loadSessionsIndex(agentId: string): LooseRecord {
    return readJsonIfExists(getSessionsIndexPath(agentId)) || {};
  }

  function resolveSessionRecord(agentId: string, sessionKey: string): LooseRecord | null {
    const sessionsIndex = loadSessionsIndex(agentId);
    return sessionsIndex[sessionKey] || null;
  }

  const jsonLinesCache = new Map<string, JsonLinesCacheEntry>();
  const JSON_LINES_CACHE_MAX = 32;

  function readJsonLines(filePath: string): LooseRecord[] {
    let mtime = 0;
    try {
      mtime = fs.statSync(filePath).mtimeMs;
    } catch {
      jsonLinesCache.delete(filePath);
      return [];
    }

    const cached = jsonLinesCache.get(filePath);
    if (cached && cached.mtime === mtime) {
      return cached.entries;
    }

    const raw = readTextIfExists(filePath);
    if (!raw) {
      jsonLinesCache.delete(filePath);
      return [];
    }

    const entries = raw
      .split('\n')
      .filter(Boolean)
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (jsonLinesCache.size >= JSON_LINES_CACHE_MAX) {
      const oldest = jsonLinesCache.keys().next().value as string | undefined;
      if (oldest) {
        jsonLinesCache.delete(oldest);
      }
    }
    jsonLinesCache.set(filePath, { mtime, entries });

    return entries;
  }

  function extractTextSegments(content: TranscriptContentItem[] | unknown): string[] {
    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .map((item: TranscriptContentItem) => {
        if (item?.type === 'text') {
          return item.text || '';
        }
        if (item?.type === 'toolCall') {
          return item.arguments || item.partialJson || '';
        }
        return '';
      })
      .filter(Boolean);
  }

  function extractPlainTextSegments(content: TranscriptContentItem[] | unknown): string[] {
    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .filter((item: TranscriptContentItem) => item?.type === 'text')
      .map((item: TranscriptContentItem) => item.text || '')
      .filter(Boolean);
  }

  function cleanAssistantReply(text: unknown): string {
    const cleaned = String(text || '')
      .replace(/\*\*<small>.*?<\/small>\*\*/g, '')
      .replace(/\[\[reply_to_current\]\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (/^NO_REPLY$/i.test(cleaned)) {
      return '';
    }

    return cleaned;
  }

  function buildInboundMediaAttachment(mediaPath = '', mimeType = '') {
    const normalizedPath = String(mediaPath || '').trim();
    const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
    if (!normalizedPath) {
      return null;
    }

    const isImage =
      /^image\//.test(normalizedMimeType)
      || /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(normalizedPath);
    return {
      kind: isImage ? 'image' : 'file',
      name: path.basename(normalizedPath) || (isImage ? 'image' : 'attachment'),
      ...(normalizedMimeType ? { mimeType: normalizedMimeType } : {}),
      path: normalizedPath,
      fullPath: normalizedPath,
    };
  }

  function normalizeTranscriptAttachmentRecord(attachment: LooseRecord = {}): TranscriptConversationMessageAttachment | null {
    const normalizedPath = String(attachment?.fullPath || attachment?.path || '').trim();
    const normalizedName = String(attachment?.name || '').trim()
      || (normalizedPath ? path.basename(normalizedPath) : '');
    const normalizedMimeType = String(attachment?.mimeType || '').trim().toLowerCase();
    const normalizedKind = String(attachment?.kind || '').trim().toLowerCase()
      || (/^image\//.test(normalizedMimeType) ? 'image' : 'file');

    if (!normalizedName && !normalizedPath) {
      return null;
    }

    return {
      kind: normalizedKind || 'file',
      name: normalizedName || (normalizedKind === 'image' ? 'image' : 'attachment'),
      ...(normalizedMimeType ? { mimeType: normalizedMimeType } : {}),
      path: normalizedPath,
      fullPath: normalizedPath,
    };
  }

  function inferMimeTypeFromContentItem(item: TranscriptContentItem = {}): string {
    const explicitMimeType = String(item?.mimeType || item?.mime || '').trim().toLowerCase();
    if (explicitMimeType) {
      return explicitMimeType;
    }

    const imageUrlValue =
      typeof item?.image_url === 'string'
        ? item.image_url
        : typeof item?.image_url?.url === 'string'
          ? item.image_url.url
          : '';
    const dataUrlMatch = String(imageUrlValue || '').match(/^data:([^;,]+)[;,]/i);
    return dataUrlMatch?.[1] ? String(dataUrlMatch[1]).trim().toLowerCase() : '';
  }

  function extractGeneratedAttachmentDetails(text: unknown): {
    cleanedText: string;
    descriptors: TranscriptGeneratedAttachmentDescriptor[];
  } {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const cleanedLines: string[] = [];
    const descriptors: TranscriptGeneratedAttachmentDescriptor[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const currentLine = String(lines[index] || '');
      const trimmedLine = currentLine.trim();

      if (/^用户附加了\s+\d+\s+个附件，请结合附件内容处理请求。$/i.test(trimmedLine)) {
        continue;
      }

      const attachmentMatch = trimmedLine.match(/^附件\s+(.+?)(?:\s+\(([^)\n]+)\))?\s+已附加。$/);
      if (!attachmentMatch?.[1]) {
        cleanedLines.push(currentLine);
        continue;
      }

      let attachmentPath = '';
      const nextTrimmedLine = String(lines[index + 1] || '').trim();
      const pathMatch = nextTrimmedLine.match(/^路径:\s*(.+)$/i);
      if (pathMatch?.[1]) {
        attachmentPath = String(pathMatch[1] || '').trim();
        index += 1;
      }

      const attachmentDetails = String(attachmentMatch[2] || '')
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);
      const mimeType = attachmentDetails.find((segment) => /^[a-z]+\/[a-z0-9.+-]+$/i.test(segment)) || '';

      descriptors.push({
        kind:
          /^image\//.test(mimeType)
          || /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(attachmentPath || attachmentMatch[1])
            ? 'image'
            : 'file',
        mimeType: mimeType || undefined,
        name: String(attachmentMatch[1] || '').trim(),
        path: attachmentPath,
      });
    }

    return {
      cleanedText: cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      descriptors,
    };
  }

  function mergeTranscriptConversationAttachments(
    attachments: TranscriptConversationMessageAttachment[] = [],
  ): TranscriptConversationMessageAttachment[] {
    const merged = new Map<string, TranscriptConversationMessageAttachment>();

    attachments.forEach((attachment) => {
      const normalized = normalizeTranscriptAttachmentRecord(attachment);
      if (!normalized) {
        return;
      }

      const key =
        `${normalized.kind}|${normalized.fullPath || normalized.path || ''}|${normalized.name || ''}|${normalized.mimeType || ''}`;
      if (!merged.has(key)) {
        merged.set(key, normalized);
        return;
      }

      const current = merged.get(key) as TranscriptConversationMessageAttachment;
      merged.set(key, {
        ...current,
        ...normalized,
        mimeType: current.mimeType || normalized.mimeType,
        path: current.path || normalized.path,
        fullPath: current.fullPath || normalized.fullPath,
      });
    });

    return [...merged.values()];
  }

  function projectTranscriptUserMessage(payload: LooseRecord = {}): TranscriptNormalizedUserMessage {
    const contentItems = Array.isArray(payload?.content) ? payload.content : [];
    const rawText = extractPlainTextSegments(contentItems).join('\n\n');
    const generatedAttachmentDetails = extractGeneratedAttachmentDetails(rawText);
    const transcriptPayloadAttachments = Array.isArray(payload?.attachments)
      ? payload.attachments
        .map((attachment: LooseRecord) => normalizeTranscriptAttachmentRecord(attachment))
        .filter(Boolean) as TranscriptConversationMessageAttachment[]
      : [];
    let projectedAttachmentIndex = 0;
    const projectedContentAttachments = contentItems
      .map((item: TranscriptContentItem) => {
        const normalizedType = String(item?.type || '').trim().toLowerCase();
        if (!['image', 'image_url', 'input_image'].includes(normalizedType)) {
          return null;
        }

        const descriptor =
          generatedAttachmentDetails.descriptors[projectedAttachmentIndex]
          || generatedAttachmentDetails.descriptors[0]
          || null;
        projectedAttachmentIndex += 1;
        const descriptorPath = String(descriptor?.path || '').trim();
        const inferredMimeType = inferMimeTypeFromContentItem(item) || String(descriptor?.mimeType || '').trim().toLowerCase();
        const inferredKind = String(descriptor?.kind || 'image').trim().toLowerCase() || 'image';
        const inferredName = String(descriptor?.name || '').trim()
          || (descriptorPath ? path.basename(descriptorPath) : '')
          || 'image';

        return normalizeTranscriptAttachmentRecord({
          kind: inferredKind,
          mimeType: inferredMimeType,
          name: inferredName,
          path: descriptorPath,
          fullPath: descriptorPath,
        });
      })
      .filter(Boolean) as TranscriptConversationMessageAttachment[];

    const hasStructuredAttachments = transcriptPayloadAttachments.length > 0 || projectedContentAttachments.length > 0;
    const normalizedUserMessage = normalizeUserMessage(
      hasStructuredAttachments ? generatedAttachmentDetails.cleanedText : rawText,
    );

    return {
      content: normalizedUserMessage.content,
      attachments: mergeTranscriptConversationAttachments([
        ...normalizedUserMessage.attachments,
        ...transcriptPayloadAttachments,
        ...projectedContentAttachments,
      ]),
      systemMessages: normalizedUserMessage.systemMessages || [],
    };
  }

  function stripLeadingGeneratedExecBlock(text = '') {
    let remaining = String(text || '').trimStart();
    const leadingExecBlockPattern =
      /^System:\s*\[[^\]]+\]\s*Exec (?:completed|failed)\s*\([^)]+\)\s*::[\s\S]*?(?=\n\s*\n|$)/i;

    while (leadingExecBlockPattern.test(remaining)) {
      const match = remaining.match(leadingExecBlockPattern);
      if (!match?.[0]) {
        break;
      }
      remaining = remaining.slice(match[0].length).trimStart();
    }

    return remaining;
  }

  function normalizeQueuedBusyUserMessage(text: unknown): TranscriptNormalizedUserMessage {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized || !QUEUED_BUSY_TITLE_LINE.test(normalized.split('\n')[0] || '')) {
      return {
        content: '',
        attachments: [] as TranscriptConversationMessageAttachment[],
        systemMessages: [] as TranscriptUserPreludeMessage[],
      };
    }

    const lines = normalized.split('\n');
    const cleanedItems: string[] = [];
    const attachments: TranscriptConversationMessageAttachment[] = [];
    const systemMessages: TranscriptUserPreludeMessage[] = [];
    let index = 1;

    while (index < lines.length) {
      const trimmed = String(lines[index] || '').trim();

      if (trimmed === '---' && QUEUED_BUSY_ITEM_LINE.test(String(lines[index + 1] || '').trim())) {
        index += 1;
        continue;
      }

      if (!QUEUED_BUSY_ITEM_LINE.test(trimmed)) {
        index += 1;
        continue;
      }

      index += 1;
      const itemLines: string[] = [];
      while (index < lines.length) {
        const currentTrimmed = String(lines[index] || '').trim();
        if (
          QUEUED_BUSY_ITEM_LINE.test(currentTrimmed)
          || (currentTrimmed === '---' && QUEUED_BUSY_ITEM_LINE.test(String(lines[index + 1] || '').trim()))
        ) {
          break;
        }
        itemLines.push(lines[index] || '');
        index += 1;
      }

      const normalizedItem = normalizeSingleUserMessage(itemLines.join('\n'));
      if (normalizedItem.content) {
        cleanedItems.push(normalizedItem.content);
      }
      if (normalizedItem.attachments.length) {
        attachments.push(...normalizedItem.attachments);
      }
      if (normalizedItem.systemMessages?.length) {
        systemMessages.push(...normalizedItem.systemMessages);
      }
    }

    return {
      content: cleanedItems.join('\n\n').trim(),
      attachments,
      systemMessages,
    };
  }

  function normalizeSingleUserMessage(
    text: unknown,
    options: { allowMediaNormalization?: boolean } = {},
  ): TranscriptNormalizedUserMessage {
    const { allowMediaNormalization = true } = options;
    const rawText = String(text || '').replace(/\r\n/g, '\n').trim();

    if (allowMediaNormalization) {
      const mediaMatch = rawText.match(/^\[media attached:\s*(.+?)\s+\(([^)\n]+)\)\]\s*/i);
      if (mediaMatch?.[1]) {
        const attachment = buildInboundMediaAttachment(mediaMatch[1], mediaMatch[2] || '');
        let remainder = rawText.slice(mediaMatch[0].length);
        remainder = remainder.replace(
          /^\s*To send (?:an image|media) back, prefer the message tool[\s\S]*?Keep caption in the text body\.?/i,
          '',
        );
        remainder = stripLeadingGeneratedExecBlock(remainder);
        const cleanedCaption = normalizeSingleUserMessage(remainder, { allowMediaNormalization: false });
        return {
          content: cleanedCaption.content,
          attachments: [
            ...(attachment ? [attachment] : []),
            ...(cleanedCaption.attachments || []),
          ],
          systemMessages: cleanedCaption.systemMessages || [],
        };
      }
    }

    let lines = rawText.split('\n');
    const systemMessages: TranscriptUserPreludeMessage[] = [];
    const stripLeadingBlankLines = () => {
      while (lines.length && !String(lines[0] || '').trim()) {
        lines.shift();
      }
    };
    const stripTrailingBlankLines = () => {
      while (lines.length && !String(lines[lines.length - 1] || '').trim()) {
        lines.pop();
      }
    };
    const isMetadataSentinelLine = (value = '') => {
      const trimmed = String(value || '').trim();
      return UNTRUSTED_METADATA_SENTINELS.some((pattern) => pattern.test(trimmed));
    };
    const stripLeadingSystemWrapperBlock = () => {
      if (!/^System:/i.test(String(lines[0] || '').trim())) {
        return false;
      }

      let index = 0;
      while (index < lines.length) {
        const trimmed = String(lines[index] || '').trim();
        if (!trimmed || /^System:/i.test(trimmed)) {
          index += 1;
          continue;
        }
        break;
      }

      let nextIndex = index;
      while (nextIndex < lines.length && !String(lines[nextIndex] || '').trim()) {
        nextIndex += 1;
      }

      if (!isMetadataSentinelLine(lines[nextIndex])) {
        return false;
      }

      lines.splice(0, nextIndex);
      return true;
    };
    const stripLeadingMetadataBlock = () => {
      const firstLine = String(lines[0] || '').trim();
      if (!isMetadataSentinelLine(firstLine)) {
        return false;
      }

      lines.shift();
      stripLeadingBlankLines();

      if (/^```(?:json)?\s*$/i.test(String(lines[0] || '').trim())) {
        lines.shift();
        while (lines.length && !/^```\s*$/.test(String(lines[0] || '').trim())) {
          lines.shift();
        }
        if (lines.length && /^```\s*$/.test(String(lines[0] || '').trim())) {
          lines.shift();
        }
      }

      stripLeadingBlankLines();
      return true;
    };
    const stripTrailingMetadataBlock = () => {
      stripTrailingBlankLines();
      if (!lines.length || !/^```\s*$/.test(String(lines[lines.length - 1] || '').trim())) {
        return false;
      }

      let fenceStartIndex = lines.length - 2;
      while (fenceStartIndex >= 0) {
        if (/^```(?:json)?\s*$/i.test(String(lines[fenceStartIndex] || '').trim())) {
          break;
        }
        fenceStartIndex -= 1;
      }

      if (fenceStartIndex <= 0) {
        return false;
      }

      let sentinelIndex = fenceStartIndex - 1;
      while (sentinelIndex >= 0 && !String(lines[sentinelIndex] || '').trim()) {
        sentinelIndex -= 1;
      }

      if (sentinelIndex < 0 || !isMetadataSentinelLine(lines[sentinelIndex])) {
        return false;
      }

      lines.splice(sentinelIndex);
      stripTrailingBlankLines();
      return true;
    };

    stripLeadingBlankLines();

    while (
      lines.length &&
      /^System:\s*\[[^\]]+\]\s*Exec (?:completed|failed)\s*\([^)]+\)\s*::/i.test(String(lines[0] || '').trim())
    ) {
      lines.shift();
      stripLeadingBlankLines();
    }

    while (stripLeadingSystemWrapperBlock()) {
      stripLeadingBlankLines();
    }

    while (lines.length && ABORTED_RUN_NOTE_LINE.test(String(lines[0] || '').trim())) {
      systemMessages.push({
        role: 'system',
        content: String(lines[0] || '').trim(),
      });
      lines.shift();
      stripLeadingBlankLines();
    }

    while (stripLeadingMetadataBlock()) {
      // Strip stacked metadata blocks at the head of inbound IM messages.
    }

    while (lines.length && MESSAGE_ID_LINE.test(String(lines[0] || '').trim())) {
      lines.shift();
      stripLeadingBlankLines();
    }

    while (stripTrailingMetadataBlock()) {
      // Strip IM metadata blocks appended after generated helper text.
    }

    let cleaned = lines.join('\n').trim();

    cleaned = cleaned.replace(
      /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+[^\]]*?GMT[+-]\d+\]\s*/i,
      '',
    );
    cleaned = cleaned.replace(/^(?:ou_[a-z0-9_-]+|on_[a-z0-9_-]+|oc_[a-z0-9_-]+)\s*:\s*/i, '');

    if (INTERNAL_MEMORY_FLUSH_SENTINELS.every((pattern) => pattern.test(cleaned))) {
      return {
        content: '',
        attachments: [] as TranscriptConversationMessageAttachment[],
        systemMessages,
      };
    }

    if (INTERNAL_SESSION_STARTUP_SENTINELS.every((pattern) => pattern.test(cleaned))) {
      return {
        content: '',
        attachments: [] as TranscriptConversationMessageAttachment[],
        systemMessages,
      };
    }

    if (
      /^OpenClaw runtime context \(internal\):/i.test(cleaned) &&
      /runtime-generated,\s*not user-authored/i.test(cleaned)
    ) {
      return {
        content: '',
        attachments: [] as TranscriptConversationMessageAttachment[],
        systemMessages,
      };
    }

    return {
      content: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
      attachments: [] as TranscriptConversationMessageAttachment[],
      systemMessages,
    };
  }

  function normalizeUserMessage(text: unknown) {
    const normalizedQueued = normalizeQueuedBusyUserMessage(text);
    if (normalizedQueued.content || normalizedQueued.attachments.length || normalizedQueued.systemMessages?.length) {
      return normalizedQueued;
    }

    return normalizeSingleUserMessage(text);
  }

  function cleanUserMessage(text: unknown): string {
    return normalizeUserMessage(text).content;
  }

  function normalizeConversationFingerprint(text = '') {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLikelyMirroredImReplayRawText(text = '') {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return false;
    }

    return (
      /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+[^\]]*?GMT[+-]\d+\]\s+/i.test(trimmed)
      || /^Conversation info \(untrusted metadata\):/i.test(trimmed)
    );
  }

  function isMirroredImReplayPair(
    assistantEntry: LooseRecord,
    rawUserText = '',
    cleanedUserText = '',
    userTimestamp = 0,
  ): boolean {
    if (assistantEntry?.role !== 'assistant' || !isLikelyMirroredImReplayRawText(rawUserText)) {
      return false;
    }

    const assistantFingerprint = normalizeConversationFingerprint(assistantEntry?.content);
    const assistantFingerprintWithoutPrefix = normalizeConversationFingerprint(
      stripMirroredImOperatorPrefix(assistantEntry?.content),
    );
    const userFingerprint = normalizeConversationFingerprint(cleanedUserText);
    const fingerprintsMatch =
      Boolean(userFingerprint)
      && (
        assistantFingerprint === userFingerprint
        || assistantFingerprintWithoutPrefix === userFingerprint
      );

    if (!fingerprintsMatch) {
      return false;
    }

    const assistantTimestamp = Number(assistantEntry?.timestamp || 0);
    const normalizedUserTimestamp = Number(userTimestamp || 0);
    if (!assistantTimestamp || !normalizedUserTimestamp) {
      return true;
    }

    const delta = normalizedUserTimestamp - assistantTimestamp;
    return delta >= 0 && delta <= MIRRORED_IM_REPLAY_WINDOW_MS;
  }

  function stripMirroredImOperatorPrefix(text = '') {
    return String(text || '').trim().replace(/^[^:：\n]{1,40}[：:]\s*/, '').trim();
  }

  function isTransientAssistantFailure(payload: LooseRecord = {}) {
    if (String(payload?.errorMessage || '').trim()) {
      return true;
    }

    return /(error|failed|failure|denied|rejected|timeout|timed_out|aborted|cancelled|canceled)/i.test(
      String(payload?.stopReason || '').trim(),
    );
  }

  function isTransientPromptErrorEntry(entry: LooseRecord = {}) {
    if (entry?.type !== 'custom' || entry?.customType !== 'openclaw:prompt-error') {
      return false;
    }

    return /(error|failed|failure|denied|rejected|timeout|timed_out|aborted|cancelled|canceled)/i.test(
      String(entry?.data?.error || '').trim(),
    );
  }

  function isDeliveryMirrorAssistantMessage(payload: LooseRecord = {}) {
    return String(payload?.role || '').trim() === 'assistant'
      && String(payload?.model || '').trim() === 'delivery-mirror';
  }

  function parseSessionStatusText(statusText: unknown): LooseRecord | null {
    if (!statusText) {
      return null;
    }

    const normalizedStatusText = String(statusText || '');
    const versionLine = normalizedStatusText.match(/^🦞\s*OpenClaw\s+(.+)$/m);
    const modelLine = normalizedStatusText.match(/🧠 Model:\s*(.+?)(?:\s*·\s*🔑\s*(.+))?$/m);
    const tokensLine = normalizedStatusText.match(/🧮 Tokens:\s*(.+)$/m);
    const contextLine = normalizedStatusText.match(/📚 Context:\s*([^\n]+)$/m);
    const sessionLine = normalizedStatusText.match(/🧵 Session:\s*([^•\n]+)(?:•\s*(.+))?$/m);
    const runtimeLine = normalizedStatusText.match(/⚙️ Runtime:\s*(.+)$/m);
    const queueLine = normalizedStatusText.match(/🪢 Queue:\s*(.+)$/m);
    const timeLine = normalizedStatusText.match(/🕒 Time:\s*(.+)$/m);

    let contextUsed = null;
    let contextMax = null;
    let contextRaw = '';
    if (contextLine?.[1]) {
      contextRaw = contextLine[1];
      const contextMatch = contextLine[1].match(/([0-9.]+[km]?)\/([0-9.]+[km]?)/i);
      if (contextMatch) {
        contextUsed = parseCompactNumber(contextMatch[1]);
        contextMax = parseCompactNumber(contextMatch[2]);
      }
    }

    const parsedTokens = parseTokenDisplay(tokensLine?.[1] || '');
    const runtimeDisplay = runtimeLine?.[1] || '';
    const parsedThinkMode = normalizeThinkMode(runtimeDisplay.match(/(?:^|·)\s*Think:\s*([a-z]+)\s*(?:·|$)/i)?.[1] || '');

    return {
      text: normalizedStatusText,
      versionDisplay: versionLine?.[1]?.trim() || '',
      time: timeLine?.[1] || '',
      modelDisplay: modelLine?.[1] || '',
      authDisplay: modelLine?.[2] || '',
      tokensDisplay: tokensLine?.[1] || '',
      tokensInput: parsedTokens?.input || 0,
      tokensOutput: parsedTokens?.output || 0,
      contextDisplay: contextRaw,
      contextUsed,
      contextMax,
      sessionKey: sessionLine?.[1]?.trim() || '',
      updatedLabel: sessionLine?.[2]?.trim() || '',
      runtimeDisplay,
      thinkMode: parsedThinkMode || '',
      queueDisplay: queueLine?.[1] || '',
    };
  }

  function listDirectoryPreview(rootDir: string, maxEntries = 6): TranscriptPreviewEntry[] {
    try {
      const entries = fs
        .readdirSync(rootDir, { withFileTypes: true })
        .filter((entry: any) => !entry.name.startsWith('.'))
        .map((entry: any) => {
          const fullPath = path.join(rootDir, entry.name);
          const stat = fs.statSync(fullPath);
          return {
            name: entry.name,
            kind: (entry.isDirectory() ? 'dir' : 'file') as 'dir' | 'file',
            path: fullPath,
            updatedAt: stat.mtimeMs,
            size: entry.isDirectory() ? '' : `${Math.max(1, Math.round(stat.size / 1024))} KB`,
          };
        })
        .sort((left: TranscriptPreviewEntry, right: TranscriptPreviewEntry) => {
          if (left.kind !== right.kind) {
            return left.kind === 'dir' ? -1 : 1;
          }
          return right.updatedAt - left.updatedAt;
        })
        .slice(0, maxEntries);

      return entries;
    } catch {
      return [];
    }
  }

  function normalizeCandidatePath(candidate: unknown, roots: string[]): string | null {
    const cleaned = String(candidate || '').replace(/[),.;:]+$/g, '').trim();
    if (!cleaned || /^https?:/i.test(cleaned) || cleaned.includes('://')) {
      return null;
    }

    const expanded = cleaned === '~'
      ? os.homedir()
      : cleaned.startsWith('~/')
        ? path.join(os.homedir(), cleaned.slice(2))
        : cleaned;

    if (path.isAbsolute(expanded) && fileExists(expanded)) {
      return expanded;
    }

    for (const root of roots) {
      const resolved = path.resolve(root, expanded);
      if (fileExists(resolved)) {
        return resolved;
      }
    }

    return null;
  }

  function isIgnoredWorkspacePath(targetPath: unknown): boolean {
    if (!targetPath) {
      return true;
    }

    const segments = String(targetPath)
      .split(path.sep)
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());

    return segments.includes('node_modules');
  }

  function inferExecFileAction(command = '') {
    const normalized = String(command || '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (
      /\b(touch|truncate)\b/.test(normalized) ||
      /(^|[^>])>\s*\S/.test(normalized) ||
      /\btee\b/.test(normalized)
    ) {
      return 'created';
    }

    if (
      /\b(cat|less|more|head|tail|grep|rg|sed\s+-n|awk|wc|stat|ls|find|readlink)\b/.test(normalized)
    ) {
      return 'viewed';
    }

    if (
      /\b(edit|write|cp|mv|sed\s+-i|perl\s+-pi|python|node|ruby)\b/.test(normalized)
    ) {
      return 'modified';
    }

    return null;
  }

  function inferToolFileAction(name = '', args: LooseRecord = {}) {
    const normalizedName = String(name || '').toLowerCase();
    if (normalizedName === 'read' || normalizedName === 'memory_get') {
      return 'viewed';
    }
    if (normalizedName === 'write') {
      return 'created';
    }
    if (normalizedName === 'edit') {
      return 'modified';
    }
    if (normalizedName === 'exec') {
      return inferExecFileAction(args?.command || '');
    }
    return null;
  }

  function actionPriority(action = '') {
    if (action === 'created') return 3;
    if (action === 'modified') return 2;
    if (action === 'viewed') return 1;
    return 0;
  }

  function upsertDetectedFile(
    found: Map<string, TranscriptDetectedFile>,
    resolved: string | null,
    action = 'viewed',
    observedAt = 0,
  ): void {
    if (!resolved || !fileExists(resolved)) {
      return;
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return;
    }

    const existing = found.get(resolved);
    const nextAction =
      actionPriority(action) >= actionPriority(existing?.primaryAction)
        ? action || existing?.primaryAction || 'viewed'
        : existing?.primaryAction || action || 'viewed';

    if (!existing) {
      found.set(resolved, {
        path: resolved.startsWith(PROJECT_ROOT) ? path.relative(PROJECT_ROOT, resolved) : resolved,
        fullPath: resolved,
        kind: stat.isDirectory() ? '目录' : '文件',
        updatedAt: stat.mtimeMs,
        updatedLabel: formatTimestamp(stat.mtimeMs),
        observedAt: Number(observedAt) || 0,
        primaryAction: nextAction,
        actions: action ? [action] : [],
      });
      return;
    }

    found.set(resolved, {
      ...existing,
      updatedAt: stat.mtimeMs,
      updatedLabel: formatTimestamp(stat.mtimeMs),
      observedAt: Math.max(existing.observedAt || 0, Number(observedAt) || 0),
      primaryAction: nextAction,
      actions: Array.from(new Set([...(existing.actions || []), ...(action ? [action] : [])])),
    });
  }

  function extractResolvedPathsFromSource(source: unknown, roots: string[]): string[] {
    const pathPattern = /(?:~\/[^\n"'`]+|\/Users\/[^\n"'`]+|(?:\.{0,2}\/)?(?:[A-Za-z0-9._ \-[\]()]+\/)+[A-Za-z0-9._ \-[\]()]+\.[A-Za-z0-9._-]+)/g;
    const matches = String(source || '').match(pathPattern) || [];
    const resolvedPaths: string[] = [];

    for (const match of matches) {
      const resolved = normalizeCandidatePath(match, roots);
      if (!resolved || isIgnoredWorkspacePath(resolved)) {
        continue;
      }
      resolvedPaths.push(resolved);
    }

    return resolvedPaths;
  }

  function extractResolvedDirectoriesFromSource(source: unknown, roots: string[]): string[] {
    const text = String(source || '');
    if (!text) {
      return [];
    }

    const directoryMatches = new Set<string>();
    const codeSpanPattern = /`([^`\n]+)`/g;
    let codeSpanMatch: RegExpExecArray | null = null;

    while ((codeSpanMatch = codeSpanPattern.exec(text))) {
      directoryMatches.add(String(codeSpanMatch[1] || '').trim());
    }

    const pathPattern = /(?:~\/[^\n"'`]+|\/Users\/[^\n"'`]+|(?:\.{0,2}\/)?(?:[A-Za-z0-9._ \-[\]()]+\/)+[A-Za-z0-9._ \-[\]()]+)/g;
    const pathMatches = text.match(pathPattern) || [];
    for (const match of pathMatches) {
      directoryMatches.add(match);
    }

    return [...directoryMatches]
      .map((candidate) => normalizeCandidatePath(candidate, roots))
      .filter((resolved): resolved is string => Boolean(resolved) && !isIgnoredWorkspacePath(resolved))
      .filter((resolved) => {
        try {
          return fs.statSync(resolved).isDirectory();
        } catch {
          return false;
        }
      });
  }

  function extractMentionedBasenamesFromSource(source: unknown): string[] {
    const text = String(source || '');
    if (!text) {
      return [];
    }

    const basenames = new Set<string>();
    const codeSpanPattern = /`([^`\n]+)`/g;
    let codeSpanMatch: RegExpExecArray | null = null;

    while ((codeSpanMatch = codeSpanPattern.exec(text))) {
      const candidate = String(codeSpanMatch[1] || '').trim().replace(/^['"]+|['"]+$/g, '');
      if (!candidate || candidate.includes('/') || candidate.includes('\\')) {
        continue;
      }
      if (!/^[^/\\\n]+\.[A-Za-z0-9._-]+$/.test(candidate)) {
        continue;
      }
      basenames.add(candidate);
    }

    return [...basenames];
  }

  function collectDirectoryContextFilePaths(source: unknown, roots: string[]): string[] {
    const directories = extractResolvedDirectoriesFromSource(source, roots);
    const basenames = extractMentionedBasenamesFromSource(source);
    if (!directories.length || !basenames.length) {
      return [];
    }

    const resolvedPaths = new Set<string>();
    for (const directory of directories) {
      for (const basename of basenames) {
        const candidatePath = path.join(directory, basename);
        if (!fileExists(candidatePath) || isIgnoredWorkspacePath(candidatePath)) {
          continue;
        }
        resolvedPaths.add(candidatePath);
      }
    }

    return [...resolvedPaths];
  }

  function collectMentionedInjectedPaths(source: unknown, injectedFiles: LooseRecord[] = []): string[] {
    const text = String(source || '');
    if (!text || !injectedFiles.length) {
      return [];
    }

    return injectedFiles
      .filter((file) => {
        const basename = path.basename(file?.path || '').trim();
        if (!basename) {
          return false;
        }

        const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^A-Za-z0-9_./-])\`?${escaped}\`?(?=$|[^A-Za-z0-9_./-])`, 'i').test(text);
      })
      .map((file) => file.path);
  }

  function collectFiles(entries: LooseRecord[] = [], roots: string[] = [], options: LooseRecord = {}) {
    const found = new Map();
    const injectedFiles = Array.isArray(options.injectedFiles) ? options.injectedFiles.filter((file) => file?.path) : [];

    for (const entry of entries) {
      if (entry.type !== 'message') {
        continue;
      }

      const payload = entry.message || {};
      const content = payload.content || [];
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      const observedAt = Number(payload.timestamp || entry.timestamp) || 0;
      for (const item of Array.isArray(content) ? content : []) {
        if (item?.type !== 'toolCall') {
          continue;
        }

        const action = inferToolFileAction(item.name, item.arguments || {});
        const sources = [item.arguments || item.partialJson || {}];

        for (const source of sources) {
          const resolvedPaths = extractResolvedPathsFromSource(
            typeof source === 'string' ? source : JSON.stringify(source),
            roots,
          );

          for (const resolved of resolvedPaths) {
            upsertDetectedFile(found, resolved, action || undefined, observedAt);
          }
        }
      }

      for (const attachment of attachments) {
        const attachmentPath = attachment?.fullPath || attachment?.path;
        const resolved = normalizeCandidatePath(attachmentPath, roots);
        if (resolved && !isIgnoredWorkspacePath(resolved)) {
          upsertDetectedFile(found, resolved, 'viewed', observedAt);
        }
      }

      const plainText = extractPlainTextSegments(content).join('\n');
      const mentionedPaths = [
        ...extractResolvedPathsFromSource(plainText, roots),
        ...collectDirectoryContextFilePaths(plainText, roots),
        ...(payload.role === 'toolResult' ? [] : collectMentionedInjectedPaths(plainText, injectedFiles)),
      ];

      for (const resolved of mentionedPaths) {
        upsertDetectedFile(found, resolved, 'viewed', observedAt);
      }
    }

    return [...found.values()]
      .sort((left, right) => {
        const observedDelta = (right.observedAt || 0) - (left.observedAt || 0);
        if (observedDelta !== 0) {
          return observedDelta;
        }
        return right.updatedAt - left.updatedAt;
      });
  }

  function collectArtifacts(entries: LooseRecord[]): TranscriptArtifact[] {
    return collectConversationMessages(entries)
      .filter((message) => message?.role === 'assistant' && Boolean(String(message.content || '').trim()))
      .map((message) => ({
        title: `回复 ${formatTimestamp(message.timestamp)}`,
        type: 'assistant_output',
        detail: clip(message.content, 180),
        messageRole: 'assistant',
        messageTimestamp: message.timestamp,
        timestamp: message.timestamp,
      }))
      .filter(Boolean)
      .slice(-6)
      .reverse();
  }

  function collectConversationMessages(entries: LooseRecord[]): TranscriptConversationMessage[] {
    const conversation: TranscriptConversationMessage[] = [];
    let lastVisibleUserFingerprint = '';
    let lastVisibleUserTimestamp = 0;
    let sawTransientAssistantFailureAfterLastUser = false;
    let assistantConversationIndicesAfterLastUser: number[] = [];

    const removeAssistantMessagesAfterLastUser = () => {
      if (!assistantConversationIndicesAfterLastUser.length) {
        return;
      }

      const indicesToRemove = new Set(assistantConversationIndicesAfterLastUser);
      const nextConversation = conversation.filter((_: TranscriptConversationMessage, index: number) => !indicesToRemove.has(index));
      conversation.length = 0;
      conversation.push(...nextConversation);
      assistantConversationIndicesAfterLastUser = [];
    };

    entries.forEach((entry: LooseRecord) => {
      if (isTransientPromptErrorEntry(entry)) {
        sawTransientAssistantFailureAfterLastUser = true;
        return;
      }

      if (entry.type !== 'message') {
        return;
      }

      const payload = entry.message || {};
      const timestamp = payload.timestamp || Date.parse(entry.timestamp) || Date.now();

      if (payload.role === 'user') {
        const rawContent = extractPlainTextSegments(payload.content).join('\n\n');
        const normalizedUserMessage = projectTranscriptUserMessage(payload);
        const content = normalizedUserMessage.content;
        const attachments = Array.isArray(normalizedUserMessage.attachments) ? normalizedUserMessage.attachments : [];
        const systemMessages = Array.isArray(normalizedUserMessage.systemMessages)
          ? normalizedUserMessage.systemMessages.filter(
            (message): message is TranscriptUserPreludeMessage =>
              Boolean(message && String(message.content || '').trim()),
          )
          : [];
        if (!content && !attachments.length && !systemMessages.length) {
          return;
        }

        const latestConversationEntry = conversation[conversation.length - 1];
        if (latestConversationEntry && isMirroredImReplayPair(latestConversationEntry, rawContent, content, timestamp)) {
          conversation.pop();
          assistantConversationIndicesAfterLastUser = assistantConversationIndicesAfterLastUser.filter(
            (index) => index !== conversation.length,
          );
          const normalizedMirroredUserContent = stripMirroredImOperatorPrefix(content) || content;
          systemMessages.forEach((message) => {
            conversation.push({
              role: 'system',
              content: String(message.content || '').trim(),
              timestamp,
            });
          });
          conversation.push({
            role: 'user',
            content: normalizedMirroredUserContent,
            timestamp,
            ...(attachments.length ? { attachments } : {}),
          });
          lastVisibleUserFingerprint = normalizeConversationFingerprint(normalizedMirroredUserContent);
          lastVisibleUserTimestamp = timestamp;
          assistantConversationIndicesAfterLastUser = [];
          sawTransientAssistantFailureAfterLastUser = false;
          return;
        }

        const fingerprint = normalizeConversationFingerprint(content);
        const isTransientReplay =
          Boolean(fingerprint)
          && fingerprint === lastVisibleUserFingerprint
          && sawTransientAssistantFailureAfterLastUser
          && timestamp > 0
          && lastVisibleUserTimestamp > 0
          && timestamp - lastVisibleUserTimestamp <= TRANSIENT_USER_REPLAY_WINDOW_MS;

        if (isTransientReplay) {
          removeAssistantMessagesAfterLastUser();
          sawTransientAssistantFailureAfterLastUser = false;
          return;
        }

        if (sawTransientAssistantFailureAfterLastUser) {
          removeAssistantMessagesAfterLastUser();
        }

        systemMessages.forEach((message) => {
          conversation.push({
            role: 'system',
            content: String(message.content || '').trim(),
            timestamp,
          });
        });

        if (content || attachments.length) {
          conversation.push({
            role: 'user',
            content,
            timestamp,
            ...(attachments.length ? { attachments } : {}),
          });
          lastVisibleUserFingerprint = fingerprint;
          lastVisibleUserTimestamp = timestamp;
        }
        assistantConversationIndicesAfterLastUser = [];
        sawTransientAssistantFailureAfterLastUser = false;
        return;
      }

      if (payload.role === 'assistant') {
        if (isDeliveryMirrorAssistantMessage(payload)) {
          return;
        }

        const content = cleanAssistantReply(extractPlainTextSegments(payload.content).join('\n\n'));
        const isTransientAssistantMessage = sawTransientAssistantFailureAfterLastUser || isTransientAssistantFailure(payload);
        if (!content) {
          if (isTransientAssistantMessage) {
            sawTransientAssistantFailureAfterLastUser = true;
          }
          return;
        }

        const tokenBadge = formatTokenBadge(payload.usage);

        conversation.push({
          role: 'assistant',
          content,
          timestamp,
          ...(tokenBadge ? { tokenBadge } : {}),
        });
        assistantConversationIndicesAfterLastUser.push(conversation.length - 1);
        sawTransientAssistantFailureAfterLastUser = isTransientAssistantMessage;
      }
    });

    if (sawTransientAssistantFailureAfterLastUser) {
      removeAssistantMessagesAfterLastUser();
    }

    return conversation.slice(-80);
  }

  function collectSnapshots(entries: LooseRecord[], sessionRecord: LooseRecord | null): TranscriptSnapshotItem[] {
    return collectConversationMessages(entries)
      .filter((message) => message?.role === 'assistant' && Boolean(String(message.content || '').trim()))
      .map((message) => ({
        id: `snapshot-${message.timestamp}`,
        title: `快照 ${formatTimestamp(message.timestamp)}`,
        detail: clip(message.content, 120),
        sessionId: sessionRecord?.sessionId || '',
        timestamp: message.timestamp,
      }))
      .filter(Boolean)
      .slice(-6)
      .reverse();
  }

  function collectToolHistory(entries: LooseRecord[]): TranscriptToolHistoryItem[] {
    const history: TranscriptToolHistoryItem[] = [];
    const unresolvedCalls = new Map<string, TranscriptToolHistoryItem>();

    for (const entry of entries) {
      if (entry.type !== 'message') {
        continue;
      }

      const payload = entry.message || {};
      const content = Array.isArray(payload.content) ? payload.content : [];

      if (payload.role === 'assistant') {
        for (const item of content) {
          if (item?.type !== 'toolCall') {
            continue;
          }

          const toolEvent = {
            id: item.id,
            name: item.name || 'tool.call',
            status: '执行中',
            detail: clip(item.arguments || item.partialJson || '{}', 160),
            timestamp: payload.timestamp || entry.timestamp,
          };
          history.push(toolEvent);
          unresolvedCalls.set(item.id, toolEvent);
        }
      }

      if (payload.role === 'toolResult') {
        const pending = unresolvedCalls.get(payload.toolCallId);
        const text = extractTextSegments(payload.content).join('\n');
        const status = payload.details?.isError ? '失败' : '完成';
        if (pending) {
          pending.status = status;
          pending.detail = clip(text || pending.detail, 160);
        } else {
          history.push({
            id: payload.toolCallId,
            name: payload.toolName || 'tool.result',
            status,
            detail: clip(text, 160),
            timestamp: payload.timestamp || entry.timestamp,
          });
        }
      }
    }

    return history.slice(-12).reverse();
  }

  function normalizeToolArguments(argumentsValue: unknown, partialJson: unknown = ''): LooseRecord {
    if (argumentsValue && typeof argumentsValue === 'object') {
      return argumentsValue;
    }

    const raw = typeof argumentsValue === 'string' && argumentsValue.trim()
      ? argumentsValue
      : String(partialJson || '').trim();

    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function extractAgentIdFromSessionKey(sessionKey = '') {
    const match = /^agent:([^:]+)/i.exec(String(sessionKey || '').trim());
    return match?.[1] || '';
  }

  function parseToolResultDetails(payload: LooseRecord = {}): LooseRecord {
    if (payload?.details && typeof payload.details === 'object') {
      return payload.details;
    }

    const raw = extractTextSegments(payload.content).join('\n').trim();
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function normalizeTaskRelationshipStatus(status = '', { isError = false, fallback = 'dispatching' } = {}) {
    const normalized = String(status || '').trim().toLowerCase();

    if (
      isError ||
      /(error|failed|failure|denied|rejected|timeout|timed_out|aborted|cancelled|canceled)/.test(normalized)
    ) {
      return 'failed';
    }

    if (/(completed|complete|success|succeeded|done|finished)/.test(normalized)) {
      return 'completed';
    }

    if (/(accepted|queued|started|running|in_progress|in-progress|processing)/.test(normalized)) {
      return 'running';
    }

    return fallback;
  }

  function extractTaskRelationshipDetail(payload: LooseRecord = {}) {
    const candidate = [payload?.label, payload?.task, payload?.prompt, payload?.instruction, payload?.title]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    return candidate || '';
  }

  function parseInternalTaskCompletionEvent(payload: LooseRecord = {}) {
    if (payload?.role !== 'user') {
      return null;
    }

    const rawText = extractPlainTextSegments(Array.isArray(payload.content) ? payload.content : []).join('\n').trim();
    if (!/\[Internal task completion event\]/i.test(rawText)) {
      return null;
    }

    const sessionKey =
      rawText.match(/^\s*session_key:\s*(.+)$/im)?.[1]?.trim() ||
      String(payload?.provenance?.sourceSessionKey || '').trim();
    const task = rawText.match(/^\s*task:\s*(.+)$/im)?.[1]?.trim() || '';
    const statusText = rawText.match(/^\s*status:\s*(.+)$/im)?.[1]?.trim() || '';
    const source = rawText.match(/^\s*source:\s*(.+)$/im)?.[1]?.trim() || '';

    if (!sessionKey && !task && !statusText) {
      return null;
    }

    return {
      sessionKey,
      task,
      source,
      status: normalizeTaskRelationshipStatus(statusText, {
        isError: /failed|error|timeout|aborted|cancelled/i.test(statusText),
        fallback: '',
      }),
    };
  }

  function inferChildSessionTaskStatus(entries: LooseRecord[] = []) {
    if (!entries.length) {
      return '';
    }

    let latestAssistantReplyAt = 0;
    let latestFailureAt = 0;
    let hasActivity = false;
    const unresolvedCalls = new Set();

    for (const entry of entries) {
      if (entry?.type !== 'message') {
        continue;
      }

      const payload = entry.message || {};
      const timestamp = Number(payload.timestamp || entry.timestamp) || 0;
      const content = Array.isArray(payload.content) ? payload.content : [];

      if (payload.role === 'user') {
        hasActivity = true;
        continue;
      }

      if (payload.role === 'assistant') {
        hasActivity = true;
        const reply = cleanAssistantReply(extractPlainTextSegments(content).join('\n\n'));
        if (reply) {
          latestAssistantReplyAt = Math.max(latestAssistantReplyAt, timestamp);
        }

        for (const item of content) {
          if (item?.type === 'toolCall' && item.id) {
            unresolvedCalls.add(item.id);
          }
        }
      }

      if (payload.role === 'toolResult') {
        hasActivity = true;
        if (payload.toolCallId) {
          unresolvedCalls.delete(payload.toolCallId);
        }

        const details = parseToolResultDetails(payload);
        const status = normalizeTaskRelationshipStatus(details?.status, {
          isError: Boolean(payload.details?.isError || payload.isError),
          fallback: 'running',
        });
        if (status === 'failed') {
          latestFailureAt = Math.max(latestFailureAt, timestamp);
        }
      }
    }

    if (latestFailureAt && latestFailureAt >= latestAssistantReplyAt) {
      return 'failed';
    }

    if (latestAssistantReplyAt) {
      return 'completed';
    }

    if (unresolvedCalls.size || hasActivity) {
      return 'running';
    }

    return '';
  }

  function inferTaskRelationshipFromToolCall(toolCall: LooseRecord, sourceAgentId = '') {
    if (toolCall?.type !== 'toolCall') {
      return null;
    }

    const normalizedName = String(toolCall.name || '').trim().toLowerCase();
    const args = normalizeToolArguments(toolCall.arguments, toolCall.partialJson);
    const timestamp = Number(toolCall.timestamp) || 0;

    if (normalizedName === 'sessions_spawn') {
      const mode = String(args.mode || '').trim().toLowerCase();
      const runtime = String(args.runtime || '').trim().toLowerCase();
      const targetAgentId = String(args.agentId || '').trim() || extractAgentIdFromSessionKey(args.childSessionKey);
      const explicitLabel = String(args.label || '').trim();
      const detail = extractTaskRelationshipDetail(args);

      if (mode === 'session') {
        return {
          id: `session:${explicitLabel || 'spawn'}`,
          type: 'session_spawn',
          sourceAgentId: sourceAgentId || config.agentId || 'main',
          targetAgentId: '',
          detail,
          toolCallId: toolCall.id || '',
          childSessionKey: String(args.childSessionKey || '').trim(),
          spawnMode: mode,
          runtime,
          timestamp,
        };
      }

      if (runtime === 'subagent' || targetAgentId) {
        return {
          id: `agent:${targetAgentId || explicitLabel || 'subagent'}`,
          type: 'child_agent',
          sourceAgentId: sourceAgentId || config.agentId || 'main',
          targetAgentId: targetAgentId || detail || 'subagent',
          detail,
          toolCallId: toolCall.id || '',
          childSessionKey: String(args.childSessionKey || '').trim(),
          spawnMode: mode,
          runtime,
          timestamp,
        };
      }

      return {
        id: `session:${explicitLabel || 'spawn'}`,
        type: 'session_spawn',
        sourceAgentId: sourceAgentId || config.agentId || 'main',
        targetAgentId: '',
        detail,
        toolCallId: toolCall.id || '',
        childSessionKey: String(args.childSessionKey || '').trim(),
        spawnMode: mode,
        runtime,
        timestamp,
      };
    }

    if (normalizedName === 'subagents') {
      const action = String(args.action || args.command || args.mode || '').trim().toLowerCase();
      if (!/(spawn|run|start|create)/.test(action)) {
        return null;
      }

      const targetAgentId = String(args.agentId || args.id || args.target || '').trim();
      if (!targetAgentId) {
        return null;
      }

      return {
        id: `agent:${targetAgentId}`,
        type: 'child_agent',
        sourceAgentId: sourceAgentId || config.agentId || 'main',
        targetAgentId,
        detail: extractTaskRelationshipDetail(args),
        toolCallId: toolCall.id || '',
        childSessionKey: String(args.childSessionKey || '').trim(),
        spawnMode: action,
        runtime: 'subagent',
        timestamp,
      };
    }

    return null;
  }

  function collectTaskRelationships(entries: LooseRecord[] = [], sourceAgentId = config.agentId) {
    const found = new Map();
    const pendingByToolCallId = new Map();
    const childStatusCache = new Map();
    const relationshipTurnById = new Map();
    let currentTaskTurnId = 0;

    function isInternalTaskEventMessage(payload: LooseRecord = {}) {
      return Boolean(parseInternalTaskCompletionEvent(payload));
    }

    function getRelationshipRetryKey(relationship: LooseRecord = {}) {
      if (!relationship?.type) {
        return '';
      }

      return [
        relationship.type,
        relationship.sourceAgentId || '',
        relationship.targetAgentId || '',
        relationship.detail || '',
        relationship.spawnMode || '',
        relationship.runtime || '',
      ].join('::');
    }

    function findRetryableRelationshipId(nextRelationship: LooseRecord = {}, turnId = 0) {
      const retryKey = getRelationshipRetryKey(nextRelationship);
      if (!retryKey || !turnId) {
        return '';
      }

      const relationships = [...found.values()];
      for (let index = relationships.length - 1; index >= 0; index -= 1) {
        const relationship = relationships[index];
        if (!relationship?.id) {
          continue;
        }

        if (relationshipTurnById.get(relationship.id) !== turnId) {
          continue;
        }

        if (getRelationshipRetryKey(relationship) !== retryKey) {
          continue;
        }

        if (
          relationship.childSessionKey ||
          normalizeTaskRelationshipStatus(relationship.status, { fallback: '' }) === 'completed'
        ) {
          continue;
        }

        return relationship.id;
      }

      return '';
    }

    function updateRelationshipStatusFromEvent(event: LooseRecord = {}) {
      if (!event?.status) {
        return;
      }

      const targetAgentId = extractAgentIdFromSessionKey(event.sessionKey) || '';
      const relationships = [...found.values()];

      for (let index = relationships.length - 1; index >= 0; index -= 1) {
        const relationship = relationships[index];
        if (!relationship || !['child_agent', 'session_spawn'].includes(relationship.type)) {
          continue;
        }

        const matchesSessionKey =
          event.sessionKey &&
          relationship.childSessionKey &&
          String(relationship.childSessionKey).trim() === event.sessionKey;
        const matchesTaskLabel =
          event.task &&
          relationship.detail &&
          String(relationship.detail).trim() === event.task &&
          (!targetAgentId || relationship.targetAgentId === targetAgentId);
        const matchesUnlabeledAgent =
          event.task &&
          relationship.type === 'child_agent' &&
          !relationship.detail &&
          targetAgentId &&
          relationship.targetAgentId === targetAgentId &&
          !relationship.childSessionKey &&
          relationship.status !== 'completed' &&
          relationship.status !== 'failed';

        if (!matchesSessionKey && !matchesTaskLabel && !matchesUnlabeledAgent) {
          continue;
        }

        found.set(relationship.id, {
          ...relationship,
          childSessionKey: event.sessionKey || relationship.childSessionKey,
          detail: relationship.detail || event.task || '',
          status: event.status,
        });
        return;
      }
    }

    function resolveRelationshipStatusFromChildSession(childSessionKey = '', fallbackAgentId = '') {
      if (!childSessionKey) {
        return '';
      }

      const cacheKey = `${fallbackAgentId}:${childSessionKey}`;
      if (childStatusCache.has(cacheKey)) {
        return childStatusCache.get(cacheKey);
      }

      const childAgentId = extractAgentIdFromSessionKey(childSessionKey) || String(fallbackAgentId || '').trim();
      if (!childAgentId) {
        childStatusCache.set(cacheKey, '');
        return '';
      }

      const childSessionRecord = resolveSessionRecord(childAgentId, childSessionKey);
      if (!childSessionRecord?.sessionId) {
        childStatusCache.set(cacheKey, '');
        return '';
      }

      const childEntries = readJsonLines(getTranscriptPath(childAgentId, childSessionRecord.sessionId)).slice(-120);
      const childStatus = inferChildSessionTaskStatus(childEntries);
      childStatusCache.set(cacheKey, childStatus);
      return childStatus;
    }

    for (const entry of entries) {
      if (entry?.type !== 'message') {
        continue;
      }

      const payload = entry.message || {};
      if (payload.role === 'user' && !isInternalTaskEventMessage(payload)) {
        currentTaskTurnId += 1;
      }
      const content = Array.isArray(payload.content) ? payload.content : [];
      const observedAt = Number(payload.timestamp || entry.timestamp) || 0;

      if (payload.role === 'assistant') {
        for (const [itemIndex, item] of content.entries()) {
          const relationship = inferTaskRelationshipFromToolCall(item, sourceAgentId);
          if (!relationship) {
            continue;
          }

          const retryRelationshipId = findRetryableRelationshipId(relationship, currentTaskTurnId);
          const relationshipId = retryRelationshipId || `${relationship.id}:${relationship.timestamp || observedAt}:${itemIndex}`;
          const existing = retryRelationshipId ? found.get(retryRelationshipId) : null;
          found.set(relationshipId, {
            ...(existing || {}),
            ...relationship,
            id: relationshipId,
            timestamp: existing?.timestamp || relationship.timestamp || observedAt,
            status: 'dispatching',
          });
          relationshipTurnById.set(relationshipId, currentTaskTurnId);

          if (relationship.toolCallId) {
            pendingByToolCallId.set(relationship.toolCallId, relationshipId);
          }
        }
      }

      if (payload.role !== 'toolResult' || !payload.toolCallId) {
        const internalCompletion = parseInternalTaskCompletionEvent(payload);
        if (internalCompletion) {
          updateRelationshipStatusFromEvent(internalCompletion);
        }
        continue;
      }

      const relationshipId = pendingByToolCallId.get(payload.toolCallId);
      if (!relationshipId) {
        continue;
      }

      const existing = found.get(relationshipId);
      if (!existing) {
        continue;
      }

      const details = parseToolResultDetails(payload);
      const detail = extractTaskRelationshipDetail(details);
      const rawStatus = normalizeTaskRelationshipStatus(details?.status, {
        isError: Boolean(payload.details?.isError || payload.isError),
        fallback: existing.status || 'dispatching',
      });
      const childSessionKey = String(details?.childSessionKey || existing.childSessionKey || '').trim();
      const childStatus = resolveRelationshipStatusFromChildSession(childSessionKey, existing.targetAgentId);

      let nextStatus = rawStatus;
      if (existing.type === 'session_spawn' && nextStatus === 'running') {
        nextStatus = existing.spawnMode === 'session' ? 'established' : 'running';
      }

      if (childStatus === 'failed') {
        nextStatus = 'failed';
      } else if (existing.type === 'child_agent') {
        if (childStatus === 'completed') {
          nextStatus = 'completed';
        } else if (childStatus === 'running' && nextStatus !== 'failed') {
          nextStatus = 'running';
        }
      }

      found.set(relationshipId, {
        ...existing,
        childSessionKey,
        detail: existing.detail || detail,
        status: nextStatus,
      });
    }

    return [...found.values()].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
  }

  function summarizeToolsForRun(tools: TranscriptRunTool[]): string {
    if (!tools.length) {
      return '本轮未调用工具';
    }

    return tools
      .map((tool: TranscriptRunTool) => `${tool.name}(${tool.status})`)
      .join(' · ');
  }

  function attachRelationshipsToRuns(runs: TranscriptTimelineRun[], relationships: LooseRecord[]): TranscriptTimelineRun[] {
    const normalizedRuns = Array.isArray(runs) ? runs : [];
    const normalizedRelationships = Array.isArray(relationships) ? relationships : [];

    if (!normalizedRuns.length) {
      return normalizedRuns;
    }

    return normalizedRuns.map((run, index) => {
      const start = Number(run.timestamp) || 0;
      const nextRun = normalizedRuns[index + 1];
      const nextStart = Number(nextRun?.timestamp) || 0;
      const runRelationships = normalizedRelationships.filter((relationship: LooseRecord) => {
        const relationshipTimestamp = Number(relationship?.timestamp) || 0;
        if (!relationshipTimestamp) {
          return false;
        }

        if (relationshipTimestamp < start) {
          return false;
        }

        if (nextStart && relationshipTimestamp >= nextStart) {
          return false;
        }

        return true;
      });

      return {
        ...run,
        relationships: runRelationships,
      };
    });
  }

  function collectTaskTimeline(entries: LooseRecord[], roots: string[], options: LooseRecord = {}): TranscriptTimelineRun[] {
    const runs: TranscriptRun[] = [];
    let currentRun: TranscriptRun | null = null;
    const unresolvedCalls = new Map<string, TranscriptRunTool>();
    const relationships = collectTaskRelationships(entries, config.agentId);
    const sessionId = String(options?.sessionId || '').trim();

    function ensureRun(timestamp: number): TranscriptRun {
      if (currentRun) {
        return currentRun;
      }

      currentRun = {
        id: `run-${timestamp || Date.now()}`,
        title: `执行 ${formatTimestamp(timestamp || Date.now())}`,
        prompt: '',
        timestamp: timestamp || Date.now(),
        tools: [],
        files: new Map<string, TranscriptDetectedFile>(),
        snapshots: [],
        outcome: '',
        status: '进行中',
      };
      runs.push(currentRun);
      return currentRun;
    }

    for (const entry of entries) {
      if (entry.type !== 'message') {
        continue;
      }

      const payload = entry.message || {};
      const timestamp = payload.timestamp || entry.timestamp || Date.now();
      const content = Array.isArray(payload.content) ? payload.content : [];

      if (payload.role === 'user') {
        const prompt = cleanUserMessage(extractPlainTextSegments(content).join('\n\n'));
        currentRun = {
          id: entry.id || `run-${timestamp}`,
          title: `执行 ${formatTimestamp(timestamp)}`,
          prompt: clip(prompt, 160),
          timestamp,
          tools: [],
          files: new Map(),
          snapshots: [],
          outcome: '',
          status: '进行中',
        };
        runs.push(currentRun);
        continue;
      }

      const run = ensureRun(timestamp);

      if (payload.role === 'assistant') {
        for (const item of content) {
          if (item?.type !== 'toolCall') {
            continue;
          }

          const toolEvent: TranscriptRunTool = {
            id: item.id,
            name: item.name || 'tool.call',
            status: '执行中',
            input: clip(item.arguments || item.partialJson || '{}', 600),
            output: '',
            detail: clip(item.arguments || item.partialJson || '{}', 120),
            timestamp,
          };
          run.tools.push(toolEvent);
          unresolvedCalls.set(item.id, toolEvent);
        }

        const reply = cleanAssistantReply(extractPlainTextSegments(content).join('\n\n'));
        if (reply) {
          run.outcome = clip(reply, 180);
          run.snapshots.push({
            id: entry.id || `snapshot-${timestamp}`,
            sessionId,
            title: `快照 ${formatTimestamp(timestamp)}`,
            detail: clip(reply, 120),
            timestamp,
          });
          if (run.status !== '失败') {
            run.status = '已完成';
          }
        }
      }

      if (payload.role === 'toolResult') {
        const detail = clip(extractTextSegments(content).join('\n'), 600);
        const pending = unresolvedCalls.get(payload.toolCallId);
        const status = payload.details?.isError ? '失败' : '完成';
        if (pending) {
          pending.status = status;
          pending.output = detail || pending.output;
          pending.detail = clip(detail || pending.detail, 120);
        } else {
          run.tools.push({
            id: payload.toolCallId || `${timestamp}`,
            name: payload.toolName || 'tool.result',
            status,
            input: '',
            output: detail,
            detail: clip(detail, 120),
            timestamp,
          });
        }

        if (status === '失败') {
          run.status = '失败';
        }
      }

      const fileMatches = collectFiles([entry], roots, options);
      for (const item of fileMatches) {
        run.files.set(item.path, item);
      }
    }

    return attachRelationshipsToRuns(
      runs
      .map((run: TranscriptRun): TranscriptTimelineRun => ({
        id: run.id,
        title: run.title,
        timestamp: run.timestamp,
        prompt: run.prompt || '未记录输入',
        status: run.status,
        tools: run.tools,
        toolsSummary: summarizeToolsForRun(run.tools),
        files: [...run.files.values()].slice(0, 6),
        snapshots: run.snapshots.slice(-3).reverse(),
        outcome: run.outcome || '执行仍在进行，等待最终回复。',
      }))
      .filter((run) => run.prompt || run.tools.length || run.outcome)
      .slice(-8)
      .reverse(),
      relationships,
    );
  }

  function collectAgentActivity(agentId: string) {
    const sessions = loadSessionsIndex(agentId);
    const updatedAt = Object.values(sessions).reduce((latest, session) => {
      const next = session?.updatedAt || 0;
      return next > latest ? next : latest;
    }, 0);
    return {
      updatedAt,
      sessionCount: Object.keys(sessions).length,
    };
  }

  function findLatestSessionForAgent(agentId: string) {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const sessions = loadSessionsIndex(normalizedAgentId);
    const prefix = `agent:${normalizedAgentId}:openai-user:`;
    const candidates = Object.entries(sessions)
      .map(([sessionKey, sessionRecord]) => ({
        sessionKey,
        sessionRecord,
        sessionUser: String(sessionKey).slice(prefix.length).trim(),
        updatedAt: Number(sessionRecord?.updatedAt || 0),
      }))
      .filter((entry) => entry.updatedAt && String(entry.sessionKey || '').startsWith(prefix))
      .sort((left, right) => right.updatedAt - left.updatedAt);

    let latestEntry: any = null;

    for (const entry of candidates) {
      if (!latestEntry) {
        latestEntry = entry;
      }

      const transcriptPath = entry.sessionRecord?.sessionId
        ? getTranscriptPath(normalizedAgentId, entry.sessionRecord.sessionId)
        : '';
      const transcriptEntries = transcriptPath ? readJsonLines(transcriptPath) : [];
      const hasConversation = transcriptEntries.some(
        (item) => item?.type === 'message' && (item?.message?.role === 'user' || item?.message?.role === 'assistant'),
      );

      if (hasConversation) {
        return entry;
      }
    }

    return latestEntry;
  }

  function parseNativeChannelSessionKey(agentId: string, sessionKey: string): LooseRecord | null {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const normalizedSessionKey = String(sessionKey || '').trim();
    const prefix = `agent:${normalizedAgentId}:`;
    if (!normalizedSessionKey.startsWith(prefix)) {
      return null;
    }

    const payload = normalizedSessionKey.slice(prefix.length);
    const [channel = '', chatType = '', ...peerParts] = payload.split(':');
    const peerId = peerParts.join(':').trim();

    if (!channel || !chatType || !peerId) {
      return null;
    }

    return {
      channel: String(channel || '').trim(),
      chattype: String(chatType || '').trim(),
      peerid: peerId,
      sessionKey: normalizedSessionKey,
    };
  }

  function extractSearchableSessionUser(agentId: string, sessionKey: string): string {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const openAiUserPrefix = `agent:${normalizedAgentId}:openai-user:`;
    const normalizedSessionKey = String(sessionKey || '').trim();
    if (normalizedSessionKey.startsWith(openAiUserPrefix)) {
      const rawSessionUser = normalizedSessionKey.slice(openAiUserPrefix.length).trim();
      return buildCanonicalImSessionUser(rawSessionUser, { agentId: normalizedAgentId }) || rawSessionUser;
    }

    const nativeSessionIdentity = parseNativeChannelSessionKey(normalizedAgentId, normalizedSessionKey);
    if (['dingtalk-connector', 'feishu', 'wecom', 'openclaw-weixin'].includes(String(nativeSessionIdentity?.channel || '').trim())) {
      return normalizedSessionKey;
    }

    return '';
  }

  function normalizeSessionSearchText(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function parseSerializedSessionIdentity(sessionUser = ''): LooseRecord | null {
    const text = String(sessionUser || '').trim();
    if (!text.startsWith('{') || !text.endsWith('}')) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function formatSerializedSessionIdentity(parsedSessionIdentity: SessionIdentity | null, fallbackSessionUser = ''): string {
    if (!parsedSessionIdentity || typeof parsedSessionIdentity !== 'object') {
      return String(fallbackSessionUser || '').trim();
    }

    const parts = [
      parsedSessionIdentity.channel,
      parsedSessionIdentity.accountid,
      parsedSessionIdentity.chattype,
      parsedSessionIdentity.peerid || parsedSessionIdentity.groupid,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const displayName = String(
      parsedSessionIdentity.sendername
      || parsedSessionIdentity.peername
      || parsedSessionIdentity.groupname
      || '',
    ).trim();

    if (displayName) {
      const lastPart = parts.at(-1) || '';
      if (displayName !== lastPart) {
        parts.push(displayName);
      }
    }

    return parts.join(':') || String(fallbackSessionUser || '').trim();
  }

  function formatFriendlySessionLabel(value = '') {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
      return '';
    }

    return normalizedValue.replace(/^(?:user|group|channel|wecom|weixin|wechat|openclaw-weixin):/i, '').trim();
  }

  function buildSessionSearchMetadata(entry: LooseRecord = {}): SessionSearchMetadata {
    const normalizedAgentId = String(entry.agentId || config.agentId || 'main').trim() || 'main';
    const openAiUserPrefix = `agent:${normalizedAgentId}:openai-user:`;
    const rawOpenAiSessionUser = String(entry.sessionKey || '').startsWith(openAiUserPrefix)
      ? String(entry.sessionKey || '').slice(openAiUserPrefix.length).trim()
      : '';
    const parsedKeySerializedSessionIdentity = parseSerializedSessionIdentity(rawOpenAiSessionUser);
    const parsedSerializedSessionIdentity = parseSerializedSessionIdentity(entry.sessionUser);
    const parsedNativeSessionIdentity = parseNativeChannelSessionKey(entry.agentId, entry.sessionUser);
    const parsedSessionIdentity = parsedSerializedSessionIdentity || parsedKeySerializedSessionIdentity || parsedNativeSessionIdentity;
    const displaySessionUser = parsedSerializedSessionIdentity
      ? formatSerializedSessionIdentity(parsedSerializedSessionIdentity, entry.sessionUser)
      : parsedKeySerializedSessionIdentity
        ? formatSerializedSessionIdentity(parsedKeySerializedSessionIdentity, entry.sessionUser)
      : parsedNativeSessionIdentity
        ? [
            parsedNativeSessionIdentity.channel,
            parsedNativeSessionIdentity.chattype,
            parsedNativeSessionIdentity.peerid,
          ].filter(Boolean).join(':')
        : String(entry.sessionUser || '').trim();
    const friendlySessionLabel = formatFriendlySessionLabel(String(
      parsedSessionIdentity?.groupname
      || parsedSessionIdentity?.sendername
      || parsedSessionIdentity?.peername
      || entry.sessionRecord?.displayName
      || entry.sessionRecord?.origin?.label
      || entry.sessionRecord?.origin?.to
      || parsedSessionIdentity?.peerid
      || parsedSessionIdentity?.groupid
      || entry.sessionUser,
    ).trim());
    const resolvedChannel = String(
      entry.sessionRecord?.channel
      || entry.sessionRecord?.lastChannel
      || entry.sessionRecord?.origin?.provider
      || entry.sessionRecord?.deliveryContext?.channel
      || parsedSessionIdentity?.channel
      || '',
    ).trim();
    const metadataHaystack = [
      entry.sessionKey,
      entry.sessionUser,
      friendlySessionLabel,
      parsedSessionIdentity?.channel,
      parsedSessionIdentity?.accountid,
      parsedSessionIdentity?.chattype,
      parsedSessionIdentity?.peerid,
      parsedSessionIdentity?.peername,
      parsedSessionIdentity?.sendername,
      parsedSessionIdentity?.groupid,
      parsedSessionIdentity?.groupname,
      entry.sessionRecord?.displayName,
      entry.sessionRecord?.groupId,
      entry.sessionRecord?.channel,
      entry.sessionRecord?.lastChannel,
      entry.sessionRecord?.origin?.label,
      entry.sessionRecord?.origin?.provider,
      entry.sessionRecord?.origin?.surface,
      entry.sessionRecord?.origin?.from,
      entry.sessionRecord?.origin?.to,
      entry.sessionRecord?.deliveryContext?.channel,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      displaySessionUser,
      friendlySessionLabel,
      normalizedMetadataHaystack: normalizeSessionSearchText(metadataHaystack),
      parsedSessionIdentity,
      resolvedChannel,
    };
  }

  function buildSessionSearchPreview(entries: LooseRecord[] = [], searchTerm = ''): SessionSearchPreview {
    const normalizedSearchTerm = normalizeSessionSearchText(searchTerm);
    const messageSnippets = (entries || [])
      .filter((entry) => entry?.type === 'message')
      .map((entry) => {
        const role = String(entry?.message?.role || '').trim();
        const text = role === 'assistant'
          ? cleanAssistantReply(extractTextSegments(entry?.message?.content).join('\n'))
          : cleanUserMessage(extractTextSegments(entry?.message?.content).join('\n'));

        return {
          normalizedText: normalizeSessionSearchText(text),
          text: stripMarkdownForDisplay(text),
        };
      })
      .filter((entry) => entry.text);

    if (!messageSnippets.length) {
      return { matched: false, preview: '' };
    }

    const matchedSnippet = normalizedSearchTerm
      ? messageSnippets.find((entry) => entry.normalizedText.includes(normalizedSearchTerm))
      : null;

    if (matchedSnippet) {
      return {
        matched: true,
        preview: clip(matchedSnippet.text, SESSION_SEARCH_PREVIEW_CHARS),
      };
    }

    const latestSnippet = messageSnippets.at(-1) || messageSnippets[0];
    return {
      matched: false,
      preview: clip(latestSnippet?.text || '', SESSION_SEARCH_PREVIEW_CHARS),
    };
  }

  function findFallbackTranscriptPaths(agentId: string, sessionKey: string, limit = 2): string[] {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const normalizedSessionKey = String(sessionKey || '').trim();
    if (!normalizedSessionKey) {
      return [];
    }

    const sessionsDir = getSessionsDirPath(normalizedAgentId);
    let directoryEntries: any[] = [];
    try {
      directoryEntries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const escapedSessionKey = JSON.stringify(normalizedSessionKey).slice(1, -1);
    const rankedFiles = directoryEntries
      .filter((entry: any) => entry?.isFile?.() && entry.name.endsWith('.jsonl'))
      .map((entry: any) => {
        const filePath = path.join(sessionsDir, entry.name);
        let stat: import('node:fs').Stats | null = null;
        try {
          stat = fs.statSync(filePath);
        } catch {
          stat = null;
        }
        return {
          filePath,
          mtimeMs: Number(stat?.mtimeMs || 0),
        };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    const fallbackPaths: string[] = [];

    for (const file of rankedFiles) {
      if (fallbackPaths.length >= limit) {
        break;
      }

      const text = readTextIfExists(file.filePath);
      if (!text) {
        continue;
      }

      if (text.includes(normalizedSessionKey) || text.includes(escapedSessionKey)) {
        fallbackPaths.push(file.filePath);
      }
    }

    return fallbackPaths;
  }

  function getTranscriptEntriesForSession(
    agentId: string,
    sessionRecord: LooseRecord | null,
    sessionKey: string,
    windowSize = SESSION_SEARCH_TRANSCRIPT_WINDOW,
  ) {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const primaryPath = sessionRecord?.sessionId
      ? getTranscriptPath(normalizedAgentId, sessionRecord.sessionId)
      : '';
    const transcriptPaths: string[] = [];

    if (primaryPath && fileExists(primaryPath)) {
      transcriptPaths.push(primaryPath);
    } else {
      transcriptPaths.push(...findFallbackTranscriptPaths(normalizedAgentId, sessionKey));
    }

    const mergedEntries: LooseRecord[] = [];
    for (const transcriptPath of transcriptPaths) {
      const transcriptEntries = readJsonLines(transcriptPath);
      if (!transcriptEntries.length) {
        continue;
      }
      mergedEntries.push(...transcriptEntries.slice(-windowSize));
    }

    return mergedEntries.slice(-windowSize);
  }

  function searchSessionsForAgent(agentId: string, options: LooseRecord = {}) {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const normalizedSearchTerm = normalizeSessionSearchText(options.term);
    const normalizedChannel = normalizeSessionSearchText(options.channel);
    const requestedLimit = Number(options.limit || 0);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.max(1, Math.min(24, Math.floor(requestedLimit)))
      : SESSION_SEARCH_MAX_RESULTS;
    const sessions = loadSessionsIndex(normalizedAgentId);
    const indexedSessions: SessionSearchIndexEntry[] = Object.entries(sessions)
      .map(([sessionKey, sessionRecord]) => ({
        sessionKey,
        sessionRecord,
        agentId: normalizedAgentId,
        sessionUser: extractSearchableSessionUser(normalizedAgentId, sessionKey),
        updatedAt: Number(sessionRecord?.updatedAt || 0),
      }))
      .filter((entry) => entry.sessionUser && entry.updatedAt)
      .map((entry) => ({
        ...entry,
        ...buildSessionSearchMetadata(entry),
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);

    const candidates = indexedSessions
      .filter((entry) => (
        !normalizedChannel
        || entry.normalizedMetadataHaystack.includes(normalizedChannel)
      ))
      .slice(0, SESSION_SEARCH_MAX_CANDIDATES);

    const matches: LooseRecord[] = [];

    for (const entry of candidates) {
      const metadataMatched = normalizedSearchTerm
        ? entry.normalizedMetadataHaystack.includes(normalizedSearchTerm)
        : false;

      let transcriptMatched = false;
      let preview = '';

      if (entry.sessionRecord?.sessionId || entry.sessionKey) {
        const transcriptEntries = getTranscriptEntriesForSession(
          normalizedAgentId,
          entry.sessionRecord,
          entry.sessionKey,
          SESSION_SEARCH_TRANSCRIPT_WINDOW,
        );
        const previewResult = buildSessionSearchPreview(transcriptEntries, normalizedSearchTerm);
        preview = previewResult.preview;
        transcriptMatched = previewResult.matched;
      }

      if (normalizedSearchTerm && !metadataMatched && !transcriptMatched) {
        continue;
      }

      matches.push({
        agentId: normalizedAgentId,
        channel: entry.resolvedChannel,
        displaySessionUser: entry.displaySessionUser,
        matchSource: metadataMatched ? 'metadata' : transcriptMatched ? 'transcript' : 'recent',
        preview,
        sessionKey: entry.sessionKey,
        sessionUser: entry.sessionUser,
        title: entry.sessionRecord?.displayName || entry.friendlySessionLabel || entry.sessionUser,
        updatedAt: entry.updatedAt,
        updatedLabel: formatTimestamp(entry.updatedAt),
      });

      if (matches.length >= limit) {
        break;
      }
    }

    return matches;
  }

  function buildAgentGraph(): LooseRecord[] {
    const localConfig = config.localConfig;
    if (!localConfig?.agents?.list?.length) {
      return [{ id: config.agentId, label: config.agentId, state: 'active', detail: '当前 Agent' }];
    }

    const mainAgent = localConfig.agents.list.find((agent: LooseRecord) => agent.default) || localConfig.agents.list[0];
    const allowed = new Set(mainAgent?.subagents?.allowAgents || []);
    return localConfig.agents.list.map((agent: LooseRecord) => {
      const activity = collectAgentActivity(agent.id);
      const isMain = agent.id === mainAgent?.id;
      const role = isMain ? '主 Agent' : allowed.has(agent.id) ? '可调度子 Agent' : '独立 Agent';
      const modelPrimary =
        agent?.model?.primary ||
        (typeof agent?.model === 'string' ? agent.model : '') ||
        config.localConfig?.agents?.defaults?.model?.primary ||
        config.model;

      return {
        id: agent.id,
        label: agent.id,
        state: isMain ? 'active' : allowed.has(agent.id) ? 'ready' : 'idle',
        detail: `${role} · ${clip(modelPrimary, 42)}`,
        updatedAt: activity.updatedAt,
        sessionCount: activity.sessionCount,
      };
    });
  }

  function listImSessionsForAgent(agentId: string) {
    const normalizedAgentId = String(agentId || config.agentId || 'main').trim() || 'main';
    const sessions = loadSessionsIndex(normalizedAgentId);
    return Object.entries(sessions)
      .map(([sessionKey, sessionRecord]) => ({
        sessionKey,
        sessionRecord,
        sessionUser: extractSearchableSessionUser(normalizedAgentId, sessionKey),
        updatedAt: Number(sessionRecord?.updatedAt || 0),
      }))
      .filter((entry) => entry.sessionUser)
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  }

  return {
    buildAgentGraph,
    cleanAssistantReply,
    cleanUserMessage,
    collectArtifacts,
    collectConversationMessages,
    collectFiles,
    collectSnapshots,
    collectTaskRelationships,
    collectTaskTimeline,
    collectToolHistory,
    extractTextSegments,
    getTranscriptPath,
    listDirectoryPreview,
    listImSessionsForAgent,
    parseSessionStatusText,
    readJsonLines,
    findLatestSessionForAgent,
    getTranscriptEntriesForSession,
    searchSessionsForAgent,
    resolveSessionRecord,
  };
}
