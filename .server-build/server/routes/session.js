"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionHandlers = createSessionHandlers;
const node_url_1 = require("node:url");
function parseRequestedSessionUser(value) {
    return String(value || 'command-center').trim() || 'command-center';
}
function createSessionHandlers({ buildDashboardSnapshot, callOpenClawGateway, collectAvailableAgents, collectAvailableSkills, collectAllowedSubagents, collectAvailableModels, config, delay, getCommandCenterSessionKey, getDefaultAgentId, getDefaultModelForAgent, getSessionPreferences, normalizeThinkMode, parseRequestBody, resolveAgentDisplayName, resolveCanonicalModelId, resolveSessionAgentId, resolveSessionFastMode, resolveSessionModel, resolveSessionThinkMode, searchSessionsForAgent, sendJson, setSessionPreferences, }) {
    function handleSession(req, res) {
        const sessionUser = parseRequestedSessionUser(new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).searchParams.get('sessionUser'));
        const agentId = resolveSessionAgentId(sessionUser);
        const agentLabel = resolveAgentDisplayName(agentId);
        const model = resolveSessionModel(sessionUser, agentId);
        const thinkMode = resolveSessionThinkMode(sessionUser);
        sendJson(res, 200, {
            mode: config.mode,
            model,
            agentId,
            agentLabel,
            thinkMode,
            sessionUser,
            sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
            availableModels: collectAvailableModels(config.localConfig, [model]),
            availableAgents: collectAvailableAgents(config.localConfig, [agentId]),
            availableMentionAgents: collectAllowedSubagents(config.localConfig, agentId),
            availableSkills: collectAvailableSkills(config.localConfig, agentId),
            apiStyle: config.apiStyle,
            hasBaseUrl: Boolean(config.baseUrl),
            hasApiKey: Boolean(config.apiKey),
            localDetected: config.localDetected,
        });
    }
    function handleSessionSearch(req, res) {
        const url = new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        const requestedAgentId = String(url.searchParams.get('agentId') || '').trim();
        const agentId = requestedAgentId || getDefaultAgentId();
        const query = String(url.searchParams.get('q') || '').trim();
        const channel = String(url.searchParams.get('channel') || '').trim();
        const limit = Number(url.searchParams.get('limit') || 0);
        sendJson(res, 200, {
            ok: true,
            agentId,
            query,
            sessions: searchSessionsForAgent(agentId, {
                channel,
                limit,
                term: query,
            }),
        });
    }
    async function handleSessionUpdate(req, res) {
        try {
            const body = await parseRequestBody(req);
            const sessionUser = parseRequestedSessionUser(body.sessionUser);
            const currentPreferences = getSessionPreferences(sessionUser);
            const nextFastMode = typeof body.fastMode === 'boolean' ? body.fastMode : resolveSessionFastMode(sessionUser);
            const requestedThinkMode = typeof body.thinkMode === 'string' ? normalizeThinkMode(body.thinkMode) : '';
            if (typeof body.thinkMode === 'string' && !requestedThinkMode) {
                sendJson(res, 400, { ok: false, error: 'Invalid think mode' });
                return;
            }
            const nextThinkMode = requestedThinkMode || resolveSessionThinkMode(sessionUser);
            const previousAgentId = resolveSessionAgentId(sessionUser);
            const nextAgentId = body.agentId ? String(body.agentId).trim() || previousAgentId : previousAgentId;
            const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
            let nextModel = resolveSessionModel(sessionUser, previousAgentId);
            let shouldPersistModel = Boolean(currentPreferences.model);
            if (body.agentId && !body.model) {
                nextModel = defaultModelForNextAgent;
                shouldPersistModel = false;
            }
            if (body.model) {
                const requestedModel = resolveCanonicalModelId(body.model);
                nextModel = requestedModel || defaultModelForNextAgent;
                shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForNextAgent;
            }
            const nextPreferences = {
                agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
                model: shouldPersistModel ? nextModel : undefined,
                fastMode: nextFastMode,
                thinkMode: nextThinkMode,
            };
            const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
            if (config.mode === 'openclaw' && (body.model || body.agentId)) {
                await callOpenClawGateway('sessions.patch', {
                    key: sessionKey,
                    model: nextModel,
                });
                await delay(150);
            }
            if (config.mode === 'openclaw' && requestedThinkMode) {
                await callOpenClawGateway('sessions.patch', {
                    key: sessionKey,
                    thinkingLevel: requestedThinkMode,
                });
                await delay(150);
            }
            setSessionPreferences(sessionUser, nextPreferences);
            const snapshot = await buildDashboardSnapshot(sessionUser);
            sendJson(res, 200, {
                ok: true,
                mode: config.mode,
                model: snapshot.session?.selectedModel || resolveSessionModel(sessionUser, nextAgentId),
                agentId: snapshot.session?.agentId || nextAgentId,
                sessionUser,
                ...snapshot,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                ok: false,
                error: error?.message || 'Session update failed',
            });
        }
    }
    async function handleSessionContext(req, res) {
        if (config.mode !== 'openclaw') {
            sendJson(res, 200, { ok: true, messages: [] });
            return;
        }
        try {
            const url = new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
            const sessionUser = parseRequestedSessionUser(url.searchParams.get('sessionUser'));
            const agentId = resolveSessionAgentId(sessionUser);
            const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
            const limitParam = Number(url.searchParams.get('limit') || 200);
            const limit = Math.max(1, Math.min(1000, limitParam));
            const result = await callOpenClawGateway('chat.history', { sessionKey, limit }, 15000);
            sendJson(res, 200, {
                ok: true,
                sessionKey: result.sessionKey || sessionKey,
                messages: result.messages || [],
                thinkingLevel: result.thinkingLevel,
                fastMode: result.fastMode,
                verboseLevel: result.verboseLevel,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                ok: false,
                error: error?.message || 'Failed to fetch session context',
            });
        }
    }
    return {
        handleSession,
        handleSessionContext,
        handleSessionSearch,
        handleSessionUpdate,
    };
}
