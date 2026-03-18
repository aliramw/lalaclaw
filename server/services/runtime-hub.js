/**
 * Runtime Hub — per-channel subscription manager with diff-based broadcast.
 *
 * Instead of every browser tab polling /api/runtime independently, the hub
 * maintains one shared refresh loop per (sessionUser, agentId) channel and
 * pushes only the sections that changed to all subscribers on that channel.
 */

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;
// When gateway events are available, polling is just a safety net.
const ACTIVE_POLL_WITH_EVENTS_MS = 8000;
const IDLE_POLL_WITH_EVENTS_MS = 30000;

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

/**
 * Session 按字段逐个比较。只要有任何字段不同就算变了。
 * 避免对整个 session 做 JSON.stringify。
 */
function sessionChanged(prev, next) {
  if (prev === next) return false;
  if (prev == null || next == null) return prev !== next;
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    const pv = prev[key];
    const nv = next[key];
    if (pv === nv) continue;
    if (typeof pv !== typeof nv) return true;
    if (Array.isArray(pv)) {
      if (!Array.isArray(nv) || pv.length !== nv.length) return true;
      for (let i = 0; i < pv.length; i++) {
        if (pv[i] !== nv[i]) return true;
      }
      continue;
    }
    if (pv !== nv) return true;
  }
  return false;
}

/**
 * Conversation 用 length + 尾部 3 条内容 hash 快速判断。
 * 绝大多数变化是追加消息或尾部内容更新，这个策略能覆盖 >95% 的场景。
 */
function conversationChanged(prev, next) {
  if (prev === next) return false;
  if (!Array.isArray(prev) || !Array.isArray(next)) return prev !== next;
  if (prev.length !== next.length) return true;
  const tailCount = Math.min(3, prev.length);
  for (let i = prev.length - tailCount; i < prev.length; i++) {
    const pe = prev[i];
    const ne = next[i];
    if (pe === ne) continue;
    if (pe?.role !== ne?.role || pe?.content !== ne?.content || pe?.timestamp !== ne?.timestamp) {
      return true;
    }
  }
  return false;
}

/**
 * 数组类型的 section（taskRelationships, taskTimeline, files, artifacts,
 * snapshots, agents）用 length + 首尾元素 id/path 快速判断。
 */
function arrayChanged(prev, next) {
  if (prev === next) return false;
  if (!Array.isArray(prev) || !Array.isArray(next)) return prev !== next;
  if (prev.length !== next.length) return true;
  if (prev.length === 0) return false;
  const first = (item) => item?.id || item?.path || item?.name || '';
  if (first(prev[0]) !== first(next[0])) return true;
  if (prev.length > 1 && first(prev[prev.length - 1]) !== first(next[next.length - 1])) return true;
  // 如果首尾 id 一致但长度相同，做尾部抽样深比较
  const tailIdx = Math.max(0, prev.length - 2);
  for (let i = tailIdx; i < prev.length; i++) {
    if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) return true;
  }
  return false;
}

/**
 * Peeks 按 key 比较每个 peek 的 items 数组长度和 summary。
 */
function peeksChanged(prev, next) {
  if (prev === next) return false;
  if (prev == null || next == null) return prev !== next;
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    const pp = prev[key];
    const np = next[key];
    if (pp === np) continue;
    if (pp == null || np == null) return true;
    if (pp.summary !== np.summary) return true;
    if ((pp.items?.length || 0) !== (np.items?.length || 0)) return true;
    if (pp.items && np.items) {
      for (let i = 0; i < pp.items.length; i++) {
        if (pp.items[i]?.value !== np.items[i]?.value || pp.items[i]?.label !== np.items[i]?.label) {
          return true;
        }
      }
    }
  }
  return false;
}

const SECTION_COMPARATORS = {
  session: sessionChanged,
  conversation: conversationChanged,
  taskRelationships: arrayChanged,
  taskTimeline: arrayChanged,
  files: arrayChanged,
  artifacts: arrayChanged,
  snapshots: arrayChanged,
  agents: arrayChanged,
  peeks: peeksChanged,
};

function diffSnapshot(prev, next) {
  if (!prev) return null;

  const patches = [];
  for (const key of DIFF_SECTIONS) {
    const comparator = SECTION_COMPARATORS[key];
    if (comparator(prev[key], next[key])) {
      patches.push({ type: `${key}.sync`, [key]: next[key] });
    }
  }
  return patches;
}

function channelKey(sessionUser, agentId) {
  return `${String(agentId || 'main').trim()}::${String(sessionUser || 'command-center').trim()}`;
}

function createRuntimeHub({ buildDashboardSnapshot, config, subscribeGatewayEvents }) {
  const channels = new Map();
  let gatewaySubscription = null;

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
    const hasEvents = Boolean(gatewaySubscription);
    const status = String(snapshot?.session?.status || '');
    if (/运行中|running|thinking|busy/i.test(status)) {
      return hasEvents ? ACTIVE_POLL_WITH_EVENTS_MS : ACTIVE_POLL_MS;
    }
    return hasEvents ? IDLE_POLL_WITH_EVENTS_MS : IDLE_POLL_MS;
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
    startGatewaySubscription();
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

  /**
   * Immediately trigger a refresh for a specific channel or all channels.
   * Called when an external event (gateway activity, chat send, etc.)
   * indicates the snapshot is likely stale.
   */
  function notifyChannelActivity(sessionUser, agentId) {
    if (sessionUser || agentId) {
      const key = channelKey(sessionUser, agentId);
      const channel = channels.get(key);
      if (channel) {
        refreshChannel(key, channel);
      }
      return;
    }
    for (const [key, channel] of channels) {
      refreshChannel(key, channel);
    }
  }

  function startGatewaySubscription() {
    if (gatewaySubscription || config.mode !== 'openclaw' || typeof subscribeGatewayEvents !== 'function') {
      return;
    }

    gatewaySubscription = subscribeGatewayEvents({
      onEvent: (evt) => {
        if (!evt?.payload?.sessionKey) {
          notifyChannelActivity();
          return;
        }
        // sessionKey 格式: agent:<agentId>:openai-user:<sessionUser>
        const parts = String(evt.payload.sessionKey).split(':');
        const evtAgentId = parts[1] || '';
        const evtSessionUser = parts[3] || '';
        if (evtAgentId || evtSessionUser) {
          notifyChannelActivity(evtSessionUser, evtAgentId);
        } else {
          notifyChannelActivity();
        }
      },
      onError: () => {},
      onClose: () => {
        gatewaySubscription = null;
        // 断线后 5 秒重试
        setTimeout(() => startGatewaySubscription(), 5000);
      },
    });
  }

  function shutdown() {
    if (gatewaySubscription) {
      gatewaySubscription.stop();
      gatewaySubscription = null;
    }
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
    notifyChannelActivity,
    getChannelCount,
    getSubscriberCount,
    __test: {
      channels,
      channelKey,
      diffSnapshot,
      refreshChannel,
      startGatewaySubscription,
    },
  };
}

module.exports = {
  createRuntimeHub,
  channelKey,
  diffSnapshot,
};
