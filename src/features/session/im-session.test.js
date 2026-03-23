import { describe, expect, it } from "vitest";
import {
  createImBootstrapSessionUser,
  createImRuntimeAnchorSessionUser,
  createResetImSessionUser,
  isImBootstrapSessionUser,
  isImSessionUser,
} from "@/features/session/im-session";

describe("createImBootstrapSessionUser", () => {
  it("creates the bootstrap session user for each supported IM channel", () => {
    expect(createImBootstrapSessionUser("dingtalk-connector")).toBe("dingtalk-connector");
    expect(createImBootstrapSessionUser("feishu")).toBe("feishu:direct:default");
    expect(createImBootstrapSessionUser("wecom")).toBe("wecom:direct:default");
    expect(createImBootstrapSessionUser("openclaw-weixin")).toBe("openclaw-weixin:direct:default");
    expect(createImBootstrapSessionUser("unknown")).toBe("");
  });
});

describe("createImRuntimeAnchorSessionUser", () => {
  it("maps any IM session back to its channel bootstrap anchor", () => {
    expect(createImRuntimeAnchorSessionUser("agent:main:feishu:group:chat-001")).toBe("feishu:direct:default");
    expect(createImRuntimeAnchorSessionUser("agent:main:wecom:direct:marila")).toBe("wecom:direct:default");
    expect(createImRuntimeAnchorSessionUser("agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat")).toBe("openclaw-weixin:direct:default");
    expect(createImRuntimeAnchorSessionUser('{"channel":"dingtalk-connector","peerid":"398058"}')).toBe("dingtalk-connector");
    expect(createImRuntimeAnchorSessionUser("command-center")).toBe("");
  });
});

describe("isImBootstrapSessionUser", () => {
  it("recognizes IM bootstrap placeholders before they resolve to real sessions", () => {
    expect(isImBootstrapSessionUser("dingtalk-connector")).toBe(true);
    expect(isImBootstrapSessionUser("feishu:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("wecom:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("openclaw-weixin:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("agent:main:feishu:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("agent:main:wecom:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("agent:main:openclaw-weixin:direct:default")).toBe(true);
    expect(isImBootstrapSessionUser("agent:main:feishu:direct:ou_xxx")).toBe(false);
  });
});

describe("createResetImSessionUser", () => {
  it("keeps DingTalk sessions on the same canonical DingTalk session key", () => {
    const nextSessionUser = createResetImSessionUser(
      '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}',
      1773319871765,
    );

    expect(nextSessionUser).toBe("agent:main:dingtalk-connector:direct:398058");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });

  it("keeps Feishu sessions on the same canonical Feishu session key", () => {
    const nextSessionUser = createResetImSessionUser(
      "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      1773319871765,
    );

    expect(nextSessionUser).toBe("agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });

  it("keeps WeCom sessions on the same canonical WeCom session key", () => {
    const nextSessionUser = createResetImSessionUser(
      "agent:main:wecom:direct:marila",
      1773319871765,
    );

    expect(nextSessionUser).toBe("agent:main:wecom:direct:marila");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });

  it("keeps Weixin sessions on the same canonical Weixin session key", () => {
    const nextSessionUser = createResetImSessionUser(
      "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat",
      1773319871765,
    );

    expect(nextSessionUser).toBe("agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });
});
