import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseAgentSessionKey } = require("../server/core/session-key");

describe("parseAgentSessionKey", () => {
  it("extracts agentId and raw sessionUser from openai-user session keys", () => {
    expect(parseAgentSessionKey("agent:main:openai-user:command-center")).toEqual({
      agentId: "main",
      namespace: "openai-user",
      sessionKey: "agent:main:openai-user:command-center",
      sessionUser: "command-center",
    });
  });

  it("preserves JSON session users wrapped by openai-user keys", () => {
    const sessionKey = 'agent:main:openai-user:{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    expect(parseAgentSessionKey(sessionKey)).toEqual({
      agentId: "main",
      namespace: "openai-user",
      sessionKey,
      sessionUser: '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}',
    });
  });

  it("preserves native channel session keys as the runtime sessionUser", () => {
    const sessionKey = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    expect(parseAgentSessionKey(sessionKey)).toEqual({
      agentId: "main",
      namespace: "feishu",
      sessionKey,
      sessionUser: sessionKey,
    });
  });

  it("returns null for malformed keys", () => {
    expect(parseAgentSessionKey("")).toBeNull();
    expect(parseAgentSessionKey("agent:")).toBeNull();
    expect(parseAgentSessionKey("agent:main")).toBeNull();
    expect(parseAgentSessionKey("agent:main:openai-user:")).toBeNull();
    expect(parseAgentSessionKey("command-center")).toBeNull();
  });
});
