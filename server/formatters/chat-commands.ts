type FastModeCommand =
  | { kind: 'fastMode'; value: true }
  | { kind: 'fastMode'; value: false };

type ThinkModeCommand = {
  kind: 'thinkMode';
  value: string;
};

type FastCommand = {
  kind: 'fast';
  action: 'status' | 'on' | 'off' | 'invalid';
};

type ModelCommand =
  | { kind: 'model'; action: 'list' | 'status' }
  | { kind: 'model'; action: 'set'; value: string };

type SessionResetCommand = {
  kind: 'new' | 'reset';
  tail: string;
};

export function parseSlashCommandState(
  message = '',
  normalizeThinkMode: (value?: string) => string = (value) => String(value || '').trim().toLowerCase(),
): FastModeCommand | ThinkModeCommand | null {
  const normalized = String(message || '').trim().toLowerCase();
  if (/^\/fast\s*:?\s*(on|yes|true|1)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: true };
  }
  if (/^\/fast\s*:?\s*(off|no|false|0)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: false };
  }
  const thinkMatch = normalized.match(/^\/(?:think|thinking|t)(?:\s*:?\s*([^\s]+))?\s*$/i);
  const thinkMode = normalizeThinkMode(thinkMatch?.[1] || '');
  if (thinkMode) {
    return { kind: 'thinkMode', value: thinkMode };
  }
  return null;
}

export function parseFastCommand(message = ''): FastCommand | null {
  const normalized = String(message || '').trim().toLowerCase();
  const match = normalized.match(/^\/fast(?:\s*:?\s*([^\s]+))?\s*$/);
  if (!match) {
    return null;
  }

  const mode = match[1] || 'status';
  if (['status'].includes(mode)) {
    return { kind: 'fast', action: 'status' };
  }
  if (['on', 'yes', 'true', '1'].includes(mode)) {
    return { kind: 'fast', action: 'on' };
  }
  if (['off', 'no', 'false', '0'].includes(mode)) {
    return { kind: 'fast', action: 'off' };
  }

  return { kind: 'fast', action: 'invalid' };
}

export function parseModelCommand(message = ''): ModelCommand | null {
  const trimmed = String(message || '').trim();
  if (/^\/models\s*$/i.test(trimmed)) {
    return { kind: 'model', action: 'list' };
  }

  const match = trimmed.match(/^\/model(?:\s*:?\s*([\s\S]+))?\s*$/i);
  if (!match) {
    return null;
  }

  const tail = String(match[1] || '').trim();
  if (!tail || /^status$/i.test(tail)) {
    return { kind: 'model', action: 'status' };
  }
  if (/^(list|ls)$/i.test(tail)) {
    return { kind: 'model', action: 'list' };
  }

  return { kind: 'model', action: 'set', value: tail };
}

export function parseSessionResetCommand(message = ''): SessionResetCommand | null {
  const match = String(message || '')
    .trim()
    .match(/^\/(new|reset)(?:\s*:?\s*([\s\S]+))?$/i);
  if (!match) {
    return null;
  }

  return {
    kind: String(match[1] || '').toLowerCase() === 'reset' ? 'reset' : 'new',
    tail: (match[2] || '').trim(),
  };
}
