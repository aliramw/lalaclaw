import { describe, expect, it } from 'vitest';
import { parseAgentSessionKey } from './session-key';

describe('parseAgentSessionKey', () => {
  it('parses openai-user agent session keys', () => {
    expect(parseAgentSessionKey('agent:main:openai-user:command-center')).toEqual({
      agentId: 'main',
      namespace: 'openai-user',
      sessionKey: 'agent:main:openai-user:command-center',
      sessionUser: 'command-center',
    });
  });

  it('keeps non-openai namespaces as the session user payload', () => {
    expect(parseAgentSessionKey('agent:worker:wecom:direct:marila')).toEqual({
      agentId: 'worker',
      namespace: 'wecom',
      sessionKey: 'agent:worker:wecom:direct:marila',
      sessionUser: 'agent:worker:wecom:direct:marila',
    });
  });

  it('returns null for malformed keys', () => {
    expect(parseAgentSessionKey('command-center')).toBeNull();
    expect(parseAgentSessionKey('agent:')).toBeNull();
    expect(parseAgentSessionKey('agent:main')).toBeNull();
  });
});
