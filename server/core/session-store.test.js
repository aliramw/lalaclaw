import { describe, expect, it } from 'vitest';
import {
  createSessionStore,
  extractAgentIdFromNativeSessionKey,
  normalizeSessionUser,
  normalizeThinkMode,
} from './session-store';

describe('session-store helpers', () => {
  it('normalizes session users and think modes', () => {
    expect(normalizeSessionUser('  weird user/name  ')).toBe('weird-user-name');
    expect(normalizeThinkMode(' HIGH ')).toBe('high');
    expect(normalizeThinkMode('unknown')).toBe('');
    expect(extractAgentIdFromNativeSessionKey('agent:main:openai-user:command-center')).toBe('main');
  });

  it('resolves and stores session preferences consistently', () => {
    const store = createSessionStore({
      getDefaultAgentId: () => 'main',
      getDefaultModelForAgent: (agentId) => `model:${agentId}`,
      resolveCanonicalModelId: (model) => String(model || '').trim(),
    });

    expect(store.resolveSessionAgentId('command-center')).toBe('main');
    expect(store.resolveSessionModel('command-center')).toBe('model:main');
    expect(store.resolveSessionThinkMode('command-center')).toBe('off');

    store.setSessionPreferences('command-center', {
      agentId: 'worker',
      fastMode: true,
      model: 'worker-model',
      thinkMode: 'high',
    });

    expect(store.resolveSessionAgentId('command-center')).toBe('worker');
    expect(store.resolveSessionModel('command-center')).toBe('worker-model');
    expect(store.resolveSessionFastMode('command-center')).toBe(true);
    expect(store.resolveSessionThinkMode('command-center')).toBe('high');
  });
});
