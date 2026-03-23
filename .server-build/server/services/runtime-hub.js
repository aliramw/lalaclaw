"use strict";
/**
 * Runtime Hub — per-channel subscription manager with diff-based broadcast.
 *
 * Instead of every browser tab polling /api/runtime independently, the hub
 * maintains one shared refresh loop per (sessionUser, agentId) channel and
 * pushes only the sections that changed to all subscribers on that channel.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeHub = createRuntimeHub;
exports.applyRuntimePatchToSnapshot = applyRuntimePatchToSnapshot;
exports.channelKey = channelKey;
exports.diffSnapshot = diffSnapshot;
const session_key_1 = require("../core/session-key");
const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;
// When gateway events are available, polling is just a safety net.
const ACTIVE_POLL_WITH_EVENTS_MS = 8000;
const IDLE_POLL_WITH_EVENTS_MS = 30000;
const CHANNEL_TTL_MS = 10 * 60 * 1000;
const CHANNEL_TTL_CHECK_MS = 60 * 1000;
const MAX_CONVERSATION_MESSAGES = 80;
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
const SYNC_SECTION_ALIASES = {
    session: 'session',
    conversation: 'conversation',
    taskrelationships: 'taskRelationships',
    task_relationships: 'taskRelationships',
    'task-relationships': 'taskRelationships',
    tasktimeline: 'taskTimeline',
    task_timeline: 'taskTimeline',
    'task-timeline': 'taskTimeline',
    files: 'files',
    artifacts: 'artifacts',
    snapshots: 'snapshots',
    agents: 'agents',
    peeks: 'peeks',
};
/**
 * Session 按字段逐个比较。只要有任何字段不同就算变了。
 * 避免对整个 session 做 JSON.stringify。
 */
function sessionChanged(prev, next) {
    if (prev === next)
        return false;
    if (prev == null || next == null)
        return prev !== next;
    const previousRecord = prev;
    const nextRecord = next;
    const allKeys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
    for (const key of allKeys) {
        const pv = previousRecord[key];
        const nv = nextRecord[key];
        if (pv === nv)
            continue;
        if (typeof pv !== typeof nv)
            return true;
        if (Array.isArray(pv)) {
            if (!Array.isArray(nv) || pv.length !== nv.length)
                return true;
            for (let i = 0; i < pv.length; i++) {
                if (pv[i] !== nv[i])
                    return true;
            }
            continue;
        }
        if (pv !== nv)
            return true;
    }
    return false;
}
/**
 * Conversation 用 length + 尾部 3 条内容 hash 快速判断。
 * 绝大多数变化是追加消息或尾部内容更新，这个策略能覆盖 >95% 的场景。
 */
function conversationChanged(prev, next) {
    if (prev === next)
        return false;
    if (!Array.isArray(prev) || !Array.isArray(next))
        return prev !== next;
    if (prev.length !== next.length)
        return true;
    const tailCount = Math.min(3, prev.length);
    for (let i = prev.length - tailCount; i < prev.length; i++) {
        const pe = prev[i];
        const ne = next[i];
        if (pe === ne)
            continue;
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
    if (prev === next)
        return false;
    if (!Array.isArray(prev) || !Array.isArray(next))
        return prev !== next;
    if (prev.length !== next.length)
        return true;
    if (prev.length === 0)
        return false;
    const first = (item) => item?.id || item?.path || item?.name || '';
    if (first(prev[0]) !== first(next[0]))
        return true;
    if (prev.length > 1 && first(prev[prev.length - 1]) !== first(next[next.length - 1]))
        return true;
    // 如果首尾 id 一致但长度相同，做尾部抽样深比较
    const tailIdx = Math.max(0, prev.length - 2);
    for (let i = tailIdx; i < prev.length; i++) {
        if (JSON.stringify(prev[i]) !== JSON.stringify(next[i]))
            return true;
    }
    return false;
}
/**
 * Peeks 按 key 比较每个 peek 的 items 数组长度和 summary。
 */
function peeksChanged(prev, next) {
    if (prev === next)
        return false;
    if (prev == null || next == null)
        return prev !== next;
    const previousRecord = prev;
    const nextRecord = next;
    const allKeys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
    for (const key of allKeys) {
        const pp = previousRecord[key];
        const np = nextRecord[key];
        if (pp === np)
            continue;
        if (pp == null || np == null)
            return true;
        if (pp.summary !== np.summary)
            return true;
        if ((pp.items?.length || 0) !== (np.items?.length || 0))
            return true;
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
    if (!prev)
        return null;
    const patches = [];
    for (const key of DIFF_SECTIONS) {
        const comparator = SECTION_COMPARATORS[key];
        if (!comparator) {
            continue;
        }
        if (comparator(prev[key], next[key])) {
            patches.push({ type: `${key}.sync`, [key]: next[key] });
        }
    }
    return patches;
}
function channelKey(sessionUser = '', agentId = '') {
    return `${String(agentId || 'main').trim()}::${String(sessionUser || 'command-center').trim()}`;
}
function resolveGatewayEventSessionKey(evt) {
    return String(evt?.payload?.sessionKey || evt?.sessionKey || '').trim();
}
function resolveGatewayEventData(evt) {
    const payloadData = evt?.payload?.data;
    if (payloadData && typeof payloadData === 'object' && !Array.isArray(payloadData)) {
        return payloadData;
    }
    const eventData = evt?.data;
    if (eventData && typeof eventData === 'object' && !Array.isArray(eventData)) {
        return eventData;
    }
    return {};
}
function resolveSyncSectionName(value = '') {
    const normalized = String(value || '')
        .trim()
        .replace(/\.sync$/i, '')
        .replace(/[.\s]+/g, '')
        .toLowerCase();
    return SYNC_SECTION_ALIASES[normalized] || '';
}
function extractPatchValueFromEvent(evt, sectionName) {
    const payload = evt?.payload;
    const eventData = resolveGatewayEventData(evt);
    if (payload && Object.prototype.hasOwnProperty.call(payload, sectionName)) {
        return payload[sectionName];
    }
    if (eventData && Object.prototype.hasOwnProperty.call(eventData, sectionName)) {
        return eventData[sectionName];
    }
    if (evt && Object.prototype.hasOwnProperty.call(evt, sectionName)) {
        return evt[sectionName];
    }
    return undefined;
}
function extractDirectPatchesFromGatewayEvent(evt) {
    const patches = [];
    const seenPatchTypes = new Set();
    const addPatch = (sectionName, value) => {
        if (!sectionName || typeof value === 'undefined') {
            return;
        }
        const patchType = `${sectionName}.sync`;
        if (seenPatchTypes.has(patchType)) {
            return;
        }
        seenPatchTypes.add(patchType);
        patches.push({ type: patchType, [sectionName]: value });
    };
    const payload = evt?.payload;
    const eventName = String(evt?.event || '').trim();
    const payloadType = String(payload?.type || '').trim();
    const patchSectionName = resolveSyncSectionName(payloadType || eventName);
    if (patchSectionName) {
        addPatch(patchSectionName, extractPatchValueFromEvent(evt, patchSectionName));
    }
    const eventData = resolveGatewayEventData(evt);
    for (const sectionName of DIFF_SECTIONS) {
        if (eventData && Object.prototype.hasOwnProperty.call(eventData, sectionName)) {
            addPatch(sectionName, eventData[sectionName]);
        }
    }
    return patches;
}
function extractGatewayMessageText(message) {
    if (!message) {
        return '';
    }
    if (typeof message === 'string') {
        return message.trim();
    }
    const messageRecord = message;
    const content = Array.isArray(messageRecord.content) ? messageRecord.content : [];
    const text = content
        .map((entry) => {
        if (!entry || typeof entry !== 'object') {
            return '';
        }
        if (entry.type === 'text' || entry.type === 'input_text') {
            return String(entry.text || '').trim();
        }
        if (typeof entry.text === 'string') {
            return entry.text.trim();
        }
        return '';
    })
        .filter(Boolean)
        .join('\n')
        .trim();
    if (text) {
        return text;
    }
    return String(messageRecord.text || '').trim();
}
function describeGatewayEvent(evt) {
    const payload = evt?.payload;
    const base = String(payload?.type || evt?.event || '').trim()
        || String(payload?.stream || evt?.stream || '').trim()
        || 'gateway';
    const detail = String(payload?.state || '').trim()
        || String(resolveGatewayEventData(evt)?.phase || '').trim();
    return detail ? `${base}:${detail}` : base;
}
function upsertAssistantConversationEntry(conversation = [], content = '', timestamp = Date.now()) {
    const nextConversation = Array.isArray(conversation) ? [...conversation] : [];
    const safeContent = String(content || '').trim();
    if (!safeContent) {
        return nextConversation;
    }
    const normalizedTimestamp = Number(timestamp) > 0 ? Number(timestamp) : Date.now();
    let existingIndex = -1;
    for (let i = nextConversation.length - 1; i >= 0; i -= 1) {
        const entry = nextConversation[i];
        if (entry?.role === 'assistant' && Number(entry?.timestamp || 0) === normalizedTimestamp) {
            existingIndex = i;
            break;
        }
    }
    const nextEntry = {
        role: 'assistant',
        content: safeContent,
        timestamp: normalizedTimestamp,
    };
    if (existingIndex >= 0) {
        nextConversation[existingIndex] = {
            ...nextConversation[existingIndex],
            ...nextEntry,
        };
    }
    else {
        nextConversation.push(nextEntry);
    }
    return nextConversation.slice(-MAX_CONVERSATION_MESSAGES);
}
function applyRuntimePatchToSnapshot(snapshot, patch) {
    if (!snapshot || !patch?.type) {
        return null;
    }
    switch (patch.type) {
        case 'session.sync':
            return {
                ...snapshot,
                session: {
                    ...(snapshot.session || {}),
                    ...(patch.session || {}),
                },
            };
        case 'conversation.sync':
            return {
                ...snapshot,
                conversation: Array.isArray(patch.conversation) ? patch.conversation : [],
            };
        case 'taskRelationships.sync':
            return {
                ...snapshot,
                taskRelationships: Array.isArray(patch.taskRelationships) ? patch.taskRelationships : [],
            };
        case 'taskTimeline.sync':
            return {
                ...snapshot,
                taskTimeline: Array.isArray(patch.taskTimeline) ? patch.taskTimeline : [],
            };
        case 'files.sync':
            return {
                ...snapshot,
                files: Array.isArray(patch.files) ? patch.files : [],
            };
        case 'artifacts.sync':
            return {
                ...snapshot,
                artifacts: Array.isArray(patch.artifacts) ? patch.artifacts : [],
            };
        case 'snapshots.sync':
            return {
                ...snapshot,
                snapshots: Array.isArray(patch.snapshots) ? patch.snapshots : [],
            };
        case 'agents.sync':
            return {
                ...snapshot,
                agents: Array.isArray(patch.agents) ? patch.agents : [],
            };
        case 'peeks.sync':
            return {
                ...snapshot,
                peeks: patch.peeks || { workspace: null, terminal: null, browser: null, environment: null },
            };
        default:
            return null;
    }
}
function createRuntimeHub({ buildDashboardSnapshot, config, subscribeGatewayEvents }) {
    const channels = new Map();
    let gatewaySubscription = null;
    let ttlCheckTimer = null;
    function safeSend(ws, data) {
        try {
            if (ws.readyState === 1) {
                ws.send(typeof data === 'string' ? data : JSON.stringify(data));
            }
        }
        catch { }
    }
    function broadcast(channel, message) {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        for (const ws of channel.subscribers) {
            safeSend(ws, payload);
        }
    }
    function broadcastPatches(channel, patches = []) {
        if (!Array.isArray(patches) || patches.length === 0) {
            return;
        }
        for (const patch of patches) {
            broadcast(channel, patch);
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
    async function refreshChannel(key, channel, reason = 'poll_timer') {
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
                channel.lastRefreshAt = Date.now();
                channel.lastRefreshReason = reason;
                return;
            }
            const patches = diffSnapshot(channel.latestSnapshot, next);
            channel.latestSnapshot = next;
            channel.lastActivityAt = Date.now();
            channel.lastRefreshAt = channel.lastActivityAt;
            channel.lastRefreshReason = reason;
            if (patches && patches.length > 0) {
                broadcastPatches(channel, patches);
            }
            const nextInterval = inferPollInterval(next);
            if (nextInterval !== channel.currentInterval) {
                channel.currentInterval = nextInterval;
                if (channel.timer) {
                    clearInterval(channel.timer);
                }
                channel.timer = setInterval(() => refreshChannel(key, channel), nextInterval);
            }
        }
        catch (error) {
            const nextError = error;
            broadcast(channel, { type: 'runtime.error', error: nextError?.message || 'Snapshot refresh failed' });
        }
        finally {
            channel.inFlight = false;
        }
    }
    function startChannelLoop(key, channel) {
        if (channel.timer)
            return;
        channel.currentInterval = ACTIVE_POLL_MS;
        channel.timer = setInterval(() => refreshChannel(key, channel, 'poll_timer'), channel.currentInterval);
    }
    function stopChannelLoop(channel) {
        if (channel.timer) {
            clearInterval(channel.timer);
            channel.timer = null;
        }
    }
    async function notifyChannelActivity(sessionUser = '', agentId = '') {
        if (sessionUser || agentId) {
            const key = channelKey(sessionUser, agentId);
            const channel = channels.get(key);
            if (channel) {
                await refreshChannel(key, channel, 'notify_activity');
            }
            return;
        }
        await Promise.all([...channels.entries()].map(([key, channel]) => refreshChannel(key, channel, 'notify_activity')));
    }
    function tryApplyDirectPatchEvent(channel, evt) {
        if (!channel?.latestSnapshot) {
            return false;
        }
        const patches = extractDirectPatchesFromGatewayEvent(evt);
        if (!patches.length) {
            return false;
        }
        let nextSnapshot = channel.latestSnapshot;
        const appliedPatches = [];
        for (const patch of patches) {
            const patchedSnapshot = applyRuntimePatchToSnapshot(nextSnapshot, patch);
            if (!patchedSnapshot) {
                continue;
            }
            nextSnapshot = patchedSnapshot;
            appliedPatches.push(patch);
        }
        if (!appliedPatches.length) {
            return false;
        }
        channel.latestSnapshot = nextSnapshot;
        channel.lastActivityAt = Date.now();
        broadcastPatches(channel, appliedPatches);
        return true;
    }
    function tryApplyGatewayChatEvent(key, channel, evt) {
        if (evt?.event !== 'chat' || !channel?.latestSnapshot) {
            return false;
        }
        const payload = evt?.payload;
        const state = String(payload?.state || '').trim().toLowerCase();
        if (!payload || (state !== 'delta' && state !== 'final')) {
            return false;
        }
        const nextText = extractGatewayMessageText(payload.message);
        if (!nextText) {
            return false;
        }
        const runId = String(payload?.runId || '').trim();
        const existingRunState = runId ? channel.liveRuns.get(runId) : null;
        const assistantTimestamp = existingRunState?.assistantTimestamp
            || Number(payload?.message?.timestamp || payload?.timestamp || Date.now())
            || Date.now();
        if (runId && !existingRunState) {
            channel.liveRuns.set(runId, { assistantTimestamp });
        }
        const nextSnapshot = {
            ...channel.latestSnapshot,
            session: {
                ...(channel.latestSnapshot.session || {}),
                status: state === 'final' ? '就绪' : '运行中',
            },
            conversation: upsertAssistantConversationEntry(channel.latestSnapshot.conversation, nextText, assistantTimestamp),
        };
        const patches = diffSnapshot(channel.latestSnapshot, nextSnapshot) || [];
        channel.latestSnapshot = nextSnapshot;
        channel.lastActivityAt = Date.now();
        broadcastPatches(channel, patches);
        if (state === 'final' && runId) {
            channel.liveRuns.delete(runId);
        }
        if (state === 'final') {
            return 'refresh';
        }
        return true;
    }
    function tryApplyGatewayAssistantStreamEvent(channel, evt) {
        if (!channel?.latestSnapshot) {
            return false;
        }
        const payload = evt?.payload;
        const eventName = String(evt?.event || '').trim();
        const streamName = String(payload?.stream || evt?.stream || '').trim();
        const isAssistantStream = streamName === 'assistant' || eventName === 'assistant_text_stream' || eventName === 'assistant_message_end';
        if (!isAssistantStream) {
            return false;
        }
        const data = resolveGatewayEventData(evt);
        const nextText = String(data.text || data.content || '').trim();
        if (!nextText) {
            return false;
        }
        const runId = String(payload?.runId || evt?.runId || '').trim();
        const existingRunState = runId ? channel.liveRuns.get(runId) : null;
        const assistantTimestamp = existingRunState?.assistantTimestamp
            || Number(payload?.ts || evt?.ts || Date.now())
            || Date.now();
        if (runId && !existingRunState) {
            channel.liveRuns.set(runId, { assistantTimestamp });
        }
        const nextSnapshot = {
            ...channel.latestSnapshot,
            session: {
                ...(channel.latestSnapshot.session || {}),
                status: '运行中',
            },
            conversation: upsertAssistantConversationEntry(channel.latestSnapshot.conversation, nextText, assistantTimestamp),
        };
        const patches = diffSnapshot(channel.latestSnapshot, nextSnapshot) || [];
        channel.latestSnapshot = nextSnapshot;
        channel.lastActivityAt = Date.now();
        broadcastPatches(channel, patches);
        if (eventName === 'assistant_message_end') {
            return 'refresh';
        }
        return true;
    }
    function tryHandleGatewayLifecycleEvent(channel, evt) {
        const payload = evt?.payload;
        const streamName = String(payload?.stream || evt?.stream || '').trim();
        if (streamName !== 'lifecycle') {
            return false;
        }
        const data = resolveGatewayEventData(evt);
        const phase = String(data.phase || '').trim().toLowerCase();
        if (phase === 'start') {
            if (!channel?.latestSnapshot) {
                return true;
            }
            const patch = {
                type: 'session.sync',
                session: {
                    ...(channel.latestSnapshot.session || {}),
                    status: '运行中',
                },
            };
            channel.latestSnapshot = applyRuntimePatchToSnapshot(channel.latestSnapshot, patch);
            channel.lastActivityAt = Date.now();
            broadcast(channel, patch);
            return true;
        }
        if (phase === 'end' || phase === 'error') {
            return 'refresh';
        }
        return false;
    }
    async function handleGatewayEvent(evt) {
        const parsedSession = (0, session_key_1.parseAgentSessionKey)(resolveGatewayEventSessionKey(evt));
        if (!parsedSession) {
            await notifyChannelActivity();
            return;
        }
        const key = channelKey(parsedSession.sessionUser, parsedSession.agentId);
        const channel = channels.get(key);
        if (!channel) {
            return;
        }
        const gatewayEventLabel = describeGatewayEvent(evt);
        channel.lastGatewayEvent = gatewayEventLabel;
        channel.lastGatewayEventAt = Date.now();
        if (tryApplyDirectPatchEvent(channel, evt)) {
            return;
        }
        const directResult = tryApplyGatewayChatEvent(key, channel, evt);
        if (directResult === true) {
            return;
        }
        if (directResult === 'refresh') {
            await refreshChannel(key, channel, `gateway_refresh:${gatewayEventLabel}`);
            return;
        }
        const assistantResult = tryApplyGatewayAssistantStreamEvent(channel, evt);
        if (assistantResult === true) {
            return;
        }
        if (assistantResult === 'refresh') {
            await refreshChannel(key, channel, `gateway_refresh:${gatewayEventLabel}`);
            return;
        }
        const lifecycleResult = tryHandleGatewayLifecycleEvent(channel, evt);
        if (lifecycleResult === true) {
            return;
        }
        if (lifecycleResult === 'refresh') {
            await refreshChannel(key, channel, `gateway_refresh:${gatewayEventLabel}`);
            return;
        }
        await refreshChannel(key, channel, `gateway_refresh:${gatewayEventLabel}`);
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
                lastActivityAt: Date.now(),
                timer: null,
                currentInterval: ACTIVE_POLL_MS,
                inFlight: false,
                liveRuns: new Map(),
                lastRefreshAt: 0,
                lastRefreshReason: '',
                lastGatewayEvent: '',
                lastGatewayEventAt: 0,
            };
            channels.set(key, channel);
        }
        channel.subscribers.add(ws);
        channel.lastActivityAt = Date.now();
        ws.on('close', () => {
            channel.subscribers.delete(ws);
            if (channel.subscribers.size === 0) {
                stopChannelLoop(channel);
                channels.delete(key);
            }
        });
        try {
            const snapshot = channel.latestSnapshot || await buildDashboardSnapshot(channel.sessionUser, channel.overrides);
            channel.latestSnapshot = snapshot;
            if (!channel.lastRefreshAt) {
                channel.lastRefreshAt = Date.now();
            }
            if (!channel.lastRefreshReason) {
                channel.lastRefreshReason = 'initial_snapshot';
            }
            safeSend(ws, JSON.stringify({
                type: 'runtime.snapshot',
                ok: true,
                mode: config.mode,
                model: snapshot.session?.model || config.model,
                ...snapshot,
            }));
        }
        catch (error) {
            const nextError = error;
            safeSend(ws, JSON.stringify({
                type: 'runtime.error',
                error: nextError?.message || 'Initial snapshot failed',
            }));
        }
        startChannelLoop(key, channel);
        startGatewaySubscription();
        ensureTtlCheck();
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
    function getDebugInfo({ sessionUser, agentId } = { sessionUser: '', agentId: '' }) {
        const info = {
            gatewayConnected: Boolean(gatewaySubscription),
            channelCount: getChannelCount(),
            subscriberCount: getSubscriberCount(),
            channel: null,
        };
        const hasChannelTarget = String(sessionUser || '').trim() || String(agentId || '').trim();
        if (!hasChannelTarget) {
            return info;
        }
        const key = channelKey(sessionUser, agentId);
        const channel = channels.get(key);
        if (!channel) {
            return info;
        }
        info.channel = {
            key,
            agentId: channel.agentId,
            sessionUser: channel.sessionUser,
            subscriberCount: channel.subscribers.size,
            pollIntervalMs: channel.currentInterval,
            hasSnapshot: Boolean(channel.latestSnapshot),
            lastActivityAt: channel.lastActivityAt || 0,
            lastRefreshAt: channel.lastRefreshAt || 0,
            lastRefreshReason: channel.lastRefreshReason || '',
            lastGatewayEvent: channel.lastGatewayEvent || '',
            lastGatewayEventAt: channel.lastGatewayEventAt || 0,
        };
        return info;
    }
    function startGatewaySubscription() {
        if (gatewaySubscription || config.mode !== 'openclaw' || typeof subscribeGatewayEvents !== 'function') {
            return;
        }
        gatewaySubscription = subscribeGatewayEvents({
            onEvent: async (evt) => {
                await handleGatewayEvent(evt);
            },
            onError: () => { },
            onClose: () => {
                gatewaySubscription = null;
                // 断线后 5 秒重试
                setTimeout(() => startGatewaySubscription(), 5000);
            },
        });
    }
    function evictStaleChannels() {
        const now = Date.now();
        for (const [key, channel] of channels) {
            if (channel.subscribers.size > 0)
                continue;
            if (now - channel.lastActivityAt > CHANNEL_TTL_MS) {
                stopChannelLoop(channel);
                channels.delete(key);
            }
        }
        if (channels.size === 0 && ttlCheckTimer) {
            clearInterval(ttlCheckTimer);
            ttlCheckTimer = null;
        }
    }
    function ensureTtlCheck() {
        if (ttlCheckTimer)
            return;
        ttlCheckTimer = setInterval(evictStaleChannels, CHANNEL_TTL_CHECK_MS);
        if (ttlCheckTimer.unref)
            ttlCheckTimer.unref();
    }
    function shutdown() {
        if (ttlCheckTimer) {
            clearInterval(ttlCheckTimer);
            ttlCheckTimer = null;
        }
        if (gatewaySubscription) {
            gatewaySubscription.stop();
            gatewaySubscription = null;
        }
        for (const channel of channels.values()) {
            stopChannelLoop(channel);
            for (const ws of channel.subscribers) {
                try {
                    ws.close(1001, 'Server shutting down');
                }
                catch { }
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
        getDebugInfo,
        getSubscriberCount,
        __test: {
            channels,
            channelKey,
            diffSnapshot,
            refreshChannel,
            applyRuntimePatchToSnapshot,
            handleGatewayEvent,
            tryApplyDirectPatchEvent,
            tryApplyGatewayChatEvent,
            tryApplyGatewayAssistantStreamEvent,
            tryHandleGatewayLifecycleEvent,
            startGatewaySubscription,
        },
    };
}
