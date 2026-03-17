import { describe, expect, it } from "vitest";
import { createResetImSessionUser, isImSessionUser } from "@/features/session/im-session";

describe("createResetImSessionUser", () => {
  it("keeps DingTalk sessions on the DingTalk channel while rotating the peer identity", () => {
    const nextSessionUser = createResetImSessionUser(
      '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}',
      1773319871765,
    );

    expect(JSON.parse(nextSessionUser)).toMatchObject({
      channel: "dingtalk-connector",
      peerid: "398058:reset:1773319871765",
      sendername: "马锐拉",
    });
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });

  it("keeps Feishu sessions on the Feishu channel while rotating the peer identity", () => {
    const nextSessionUser = createResetImSessionUser(
      "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      1773319871765,
    );

    expect(nextSessionUser).toBe("feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58:reset:1773319871765");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });

  it("keeps WeCom sessions on the WeCom channel while rotating the peer identity", () => {
    const nextSessionUser = createResetImSessionUser(
      "agent:main:wecom:direct:marila",
      1773319871765,
    );

    expect(nextSessionUser).toBe("wecom:direct:marila:reset:1773319871765");
    expect(isImSessionUser(nextSessionUser)).toBe(true);
  });
});
