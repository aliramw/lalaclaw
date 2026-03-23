"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentSessionKey = parseAgentSessionKey;
function parseAgentSessionKey(sessionKey = '') {
    const normalizedSessionKey = String(sessionKey || '').trim();
    if (!normalizedSessionKey.startsWith('agent:')) {
        return null;
    }
    const agentPayload = normalizedSessionKey.slice('agent:'.length);
    const agentSeparatorIndex = agentPayload.indexOf(':');
    if (agentSeparatorIndex <= 0) {
        return null;
    }
    const agentId = agentPayload.slice(0, agentSeparatorIndex).trim();
    const namespacePayload = agentPayload.slice(agentSeparatorIndex + 1);
    if (!agentId || !namespacePayload) {
        return null;
    }
    if (namespacePayload.startsWith('openai-user:')) {
        const sessionUser = namespacePayload.slice('openai-user:'.length).trim();
        if (!sessionUser) {
            return null;
        }
        return {
            agentId,
            namespace: 'openai-user',
            sessionKey: normalizedSessionKey,
            sessionUser,
        };
    }
    const namespaceSeparatorIndex = namespacePayload.indexOf(':');
    const namespace = (namespaceSeparatorIndex >= 0 ? namespacePayload.slice(0, namespaceSeparatorIndex) : namespacePayload).trim();
    if (!namespace) {
        return null;
    }
    return {
        agentId,
        namespace,
        sessionKey: normalizedSessionKey,
        sessionUser: normalizedSessionKey,
    };
}
