/**
 * Runtime Hub — per-channel subscription manager with diff-based broadcast.
 *
 * Instead of every browser tab polling /api/runtime independently, the hub
 * maintains one shared refresh loop per (sessionUser, agentId) channel and
 * pushes only the sections that changed to all subscribers on that channel.
 */

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;

const DIFF_SECTIONS = [
  'session',
  'conversation',
  'taskRelationships',
  'taskTimeline',
  'files',
  'artifacts',
  'snapshots',
  'agents',
  'peeks',
];

function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffSnapshot(prev, next) {
  if (!prev) return null;

  const patches = [];
  for (const key of DIFF_SECTIONS) {
    if (!shallowEqual(prev[key], next[key])) {
      patches.push({ type: `${key}.sync`, [key]: next[key] });
    }
  }
  return patches;
}

function channelKey(sessionUser, agentId) {
  return `${String(agentId || 'main').trim()}::${String(sessionUser || 'command-center').trim()}`;
}

function createRuntimeHub({ buildDashboardSnapshot, config }) {
  const channels = new Map();

  function safeSend(ws, data) {
    try {
      if (ws.readyState === 1) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
      }
    } catch {}
  }

  function broadcast(channel, message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const ws of channel.subscribers) {
      safeSend(ws, payload);
    }
  }

  function inferPollInterval(snapshot) {
    const status = String(snapshot?.session?.status || '');
    if (/运行中|running|thinking|busy/i.test(status)) {
      return ACTIVE_POLL_MS;
    }
    return IDLE_POLL_MS;
  }

  async function refreshChannel(key, channel) {
    if (channel.inFlight || channel.subscribers.size === 0) {
      return;
    }

    channel.inFlight = true;
    try {
      const next = await buildDashboardSnapshot(channel.sessionUser, channel.overrides);

      if (channel.subscribers.size === 0) {
        return;
      }

      if (!channel.latestSnapshot) {
        channel.latestSnapshot = next;
        return;
      }

      const patches = diffSnapshot(channel.latestSnapshot, next);
      channel.latestSnapshot = next;

      if (patches && patches.length > 0) {
        for (const patch of patches) {
          broadcast(channel, patch);
        }
      }

      const nextInterval = inferPollInterval(next);
      if (nextInterval !== channel.currentInterval) {
        channel.currentInterval = nextInterval;
        clearInterval(channel.timer);
        channel.timer = setInterval(() => refreshChannel(key, channel), nextInterval);
      }
    } catch (error) {
      broadcast(channel, { type: 'runtime.error', error: error?.message || 'Snapshot refresh failed' });
    } finally {
      channel.inFlight = false;
    }
  }

  function startChannelLoop(key, channel) {
    if (channel.timer) return;
    channel.currentInterval = ACTIVE_POLL_MS;
    channel.timer = setInterval(() => refreshChannel(key, channel), channel.currentInterval);
  }

  function stopChannelLoop(channel) {
    if (channel.timer) {
      clearInterval(channel.timer);
      channel.timer = null;
    }
  }

  async function subscribe(ws, { sessionUser, agentId, overrides = {} }) {
    const key = channelKey(sessionUser, agentId);
    let channel = channels.get(key);

    if (!channel) {
      channel = {
        sessionUser: String(sessionUser || 'command-center').trim() || 'command-center',
        agentId: String(agentId || '').trim(),
        overrides,
        subscribers: new Set(),
        latestSnapshot: null,
        timer: null,
        currentInterval: ACTIVE_POLL_MS,
        inFlight: false,
      };
      channels.set(key, channel);
    }

    channel.subscribers.add(ws);

    ws.on('close', () => {
      channel.subscribers.delete(ws);
      if (channel.subscribers.size === 0) {
        stopChannelLoop(channel);
        channels.delete(key);
      }
    });

    try {
      const snapshot = channel.latestSnapshot || await buildDashboardSnapshot(
        channel.sessionUser,
        channel.overrides,
      );
      channel.latestSnapshot = snapshot;

      safeSend(ws, JSON.stringify({
        type: 'runtime.snapshot',
        ok: true,
        mode: config.mode,
        model: snapshot.session?.model || config.model,
        ...snapshot,
      }));
    } catch (error) {
      safeSend(ws, JSON.stringify({
        type: 'runtime.error',
        error: error?.message || 'Initial snapshot failed',
      }));
    }

    startChannelLoop(key, channel);
  }

  function getChannelCount() {
    return channels.size;
  }

  function getSubscriberCount() {
    let total = 0;
    for (const channel of channels.values()) {
      total += channel.subscribers.size;
    }
    return total;
  }

  function shutdown() {
    for (const channel of channels.values()) {
      stopChannelLoop(channel);
      for (const ws of channel.subscribers) {
        try { ws.close(1001, 'Server shutting down'); } catch {}
      }
      channel.subscribers.clear();
    }
    channels.clear();
  }

  return {
    subscribe,
    shutdown,
    getChannelCount,
    getSubscriberCount,
    __test: {
      channels,
      channelKey,
      diffSnapshot,
      refreshChannel,
    },
  };
}

module.exports = {
  createRuntimeHub,
  channelKey,
  diffSnapshot,
};
