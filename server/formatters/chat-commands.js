function parseSlashCommandState(message = '', normalizeThinkMode = (value) => String(value || '').trim().toLowerCase()) {
  const normalized = String(message || '').trim().toLowerCase();
  if (/^\/fast\s+(on|yes|true|1)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: true };
  }
  if (/^\/fast\s+(off|no|false|0)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: false };
  }
  const thinkMatch = normalized.match(/^\/think(?:\s+([^\s]+))?\s*$/i);
  const thinkMode = normalizeThinkMode(thinkMatch?.[1] || '');
  if (thinkMode) {
    return { kind: 'thinkMode', value: thinkMode };
  }
  return null;
}

function parseFastCommand(message = '') {
  const normalized = String(message || '').trim().toLowerCase();
  const match = normalized.match(/^\/fast(?:\s+([^\s]+))?\s*$/);
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

function parseSessionResetCommand(message = '') {
  const match = String(message || '').trim().match(/^\/(new|reset)(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return null;
  }

  return {
    kind: match[1].toLowerCase() === 'reset' ? 'reset' : 'new',
    tail: (match[2] || '').trim(),
  };
}

module.exports = {
  parseFastCommand,
  parseSessionResetCommand,
  parseSlashCommandState,
};
