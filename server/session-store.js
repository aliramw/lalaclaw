const THINK_MODES = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive'];

function normalizeSessionUser(sessionUser = '') {
  const normalized = String(sessionUser || 'command-center')
    .trim()
    .replace(/[^\w:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-:]+|[-:]+$/g, '');

  return normalized || 'command-center';
}

function normalizeThinkMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return THINK_MODES.includes(normalized) ? normalized : '';
}

function createSessionStore({ getDefaultAgentId, getDefaultModelForAgent, resolveCanonicalModelId }) {
  const sessionPreferences = new Map();
  const localSessionConversation = new Map();

  function getSessionPreferences(sessionUser = 'command-center') {
    const key = normalizeSessionUser(sessionUser);
    return sessionPreferences.get(key) || {};
  }

  function setSessionPreferences(sessionUser = 'command-center', next = {}) {
    const key = normalizeSessionUser(sessionUser);
    const current = sessionPreferences.get(key) || {};
    const merged = { ...current, ...next };

    if (!merged.model) {
      delete merged.model;
    }
    if (!merged.agentId) {
      delete merged.agentId;
    }
    if (typeof merged.fastMode !== 'boolean') {
      delete merged.fastMode;
    }
    if (!THINK_MODES.includes(String(merged.thinkMode || '').trim().toLowerCase())) {
      delete merged.thinkMode;
    } else {
      merged.thinkMode = String(merged.thinkMode).trim().toLowerCase();
    }

    if (!Object.keys(merged).length) {
      sessionPreferences.delete(key);
      return {};
    }

    sessionPreferences.set(key, merged);
    return merged;
  }

  function resolveSessionAgentId(sessionUser = 'command-center') {
    const preferences = getSessionPreferences(sessionUser);
    return String(preferences.agentId || getDefaultAgentId()).trim() || getDefaultAgentId();
  }

  function resolveSessionModel(sessionUser = 'command-center', agentId = resolveSessionAgentId(sessionUser)) {
    const preferences = getSessionPreferences(sessionUser);
    return resolveCanonicalModelId(preferences.model || getDefaultModelForAgent(agentId)) || getDefaultModelForAgent(agentId);
  }

  function resolveSessionFastMode(sessionUser = 'command-center') {
    const preferences = getSessionPreferences(sessionUser);
    return Boolean(preferences.fastMode);
  }

  function resolveSessionThinkMode(sessionUser = 'command-center') {
    const preferences = getSessionPreferences(sessionUser);
    return normalizeThinkMode(preferences.thinkMode) || 'off';
  }

  function clearSessionPreferences(sessionUser = 'command-center') {
    sessionPreferences.delete(normalizeSessionUser(sessionUser));
  }

  function getLocalSessionConversation(sessionUser = 'command-center') {
    return localSessionConversation.get(normalizeSessionUser(sessionUser)) || [];
  }

  function appendLocalSessionConversation(sessionUser = 'command-center', entries = []) {
    const key = normalizeSessionUser(sessionUser);
    const current = localSessionConversation.get(key) || [];
    const normalizedEntries = entries
      .filter(Boolean)
      .map((entry) => ({
        role: entry.role,
        content: String(entry.content || '').trim(),
        timestamp: Number(entry.timestamp) || Date.now(),
        ...(entry.tokenBadge ? { tokenBadge: String(entry.tokenBadge) } : {}),
      }))
      .filter((entry) => entry.role && entry.content);

    if (!normalizedEntries.length) {
      return current;
    }

    const merged = [...current, ...normalizedEntries]
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-80);
    localSessionConversation.set(key, merged);
    return merged;
  }

  return {
    appendLocalSessionConversation,
    clearSessionPreferences,
    getLocalSessionConversation,
    getSessionPreferences,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    setSessionPreferences,
  };
}

module.exports = {
  THINK_MODES,
  createSessionStore,
  normalizeSessionUser,
  normalizeThinkMode,
};
