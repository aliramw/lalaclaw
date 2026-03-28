import { memo } from "react";
import { cn } from "@/lib/utils";
import dingtalkLogoMarkup from "@/assets/im-logos/im-logo-dingtalk.svg?raw";
import feishuLogoMarkup from "@/assets/im-logos/im-logo-feishu.svg?raw";
import wecomLogoMarkup from "@/assets/im-logos/im-logo-wecom.svg?raw";
import weixinLogoMarkup from "@/assets/im-logos/im-logo-weixin.svg?raw";

const IM_TAB_LOGOS = {
  "dingtalk-connector": dingtalkLogoMarkup,
  feishu: feishuLogoMarkup,
  wecom: wecomLogoMarkup,
  "openclaw-weixin": weixinLogoMarkup,
};

export const ImTabLogo = memo(function ImTabLogo({ active = false, channel = "" }) {
  const markup = IM_TAB_LOGOS[channel];

  if (!markup) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      data-im-logo={channel}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] [&_svg]:h-full [&_svg]:w-full",
        active
          ? "h-[18px] w-[18px] border border-white/55 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.18),0_0_0_1px_rgba(255,255,255,0.14)]"
          : "h-4 w-4 bg-muted/65",
      )}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});
