import { Badge } from "@/components/ui/badge";
import { FileLink } from "@/components/command-center/inspector-panel-files";
import {
  EnvironmentSectionCard,
  HoverCopyValueButton,
} from "@/components/command-center/inspector-panel-primitives";
import {
  buildEnvironmentPathItem,
  getOpenClawDiagnosticBadgeProps,
  localizeEnvironmentItemLabel,
  localizeEnvironmentItemValue,
  localizeOpenClawDiagnosticLabel,
  localizeOpenClawDiagnosticValue,
  shouldRenderEnvironmentPathLink,
  shouldRenderOpenClawDiagnosticBadge,
} from "@/components/command-center/inspector-panel-utils";
import { useI18n } from "@/lib/i18n";

type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorPreviewHandler = (item: any, options?: any) => void;
type InspectorRevealHandler = (item: any) => Promise<void>;

export function EnvironmentDiagnosticsSections({
  messages,
  onOpenPreview,
  onRevealInFileManager,
  openClawDiagnostics = [],
  groupedEnvironmentItems = [],
}: {
  messages: InspectorMessages;
  onOpenPreview?: InspectorPreviewHandler;
  onRevealInFileManager?: InspectorRevealHandler;
  openClawDiagnostics?: Array<{ key: string; items: any[] }>;
  groupedEnvironmentItems?: Array<{ key: string; label: string; items: any[] }>;
}) {
  return (
    <>
      {openClawDiagnostics.length ? (
        <div className="grid gap-2">
          {openClawDiagnostics.map((section) => (
            <EnvironmentSectionCard
              key={section.key}
              count={section.items.length}
              label={messages.inspector.openClawDiagnostics.sections?.[section.key] || section.key}
              messages={messages}
            >
              {section.items.map((item, index) => {
                if (!item) {
                  return null;
                }
                const badgeProps = getOpenClawDiagnosticBadgeProps(item.value);
                return (
                  <div
                    key={`${item.label}-${index}`}
                    className="group grid gap-0.5 overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {localizeOpenClawDiagnosticLabel(item.label, messages)}
                      </div>
                      <HoverCopyValueButton content={localizeOpenClawDiagnosticValue(item.value, messages)} />
                    </div>
                    {shouldRenderOpenClawDiagnosticBadge(item.label) ? (
                      <div>
                        <Badge variant={badgeProps.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${badgeProps.className}`}>
                          {localizeOpenClawDiagnosticValue(item.value, messages)}
                        </Badge>
                      </div>
                    ) : shouldRenderEnvironmentPathLink(item) ? (
                      <div className="min-w-0 overflow-hidden">
                        <FileLink
                          item={buildEnvironmentPathItem(item)}
                          compact
                          currentWorkspaceRoot=""
                          label={localizeOpenClawDiagnosticValue(item.value, messages)}
                          onOpenPreview={onOpenPreview}
                          onRevealInFileManager={(targetItem) => {
                            onRevealInFileManager?.(targetItem).catch(() => {});
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                        {localizeOpenClawDiagnosticValue(item.value, messages)}
                      </div>
                    )}
                  </div>
                );
              })}
            </EnvironmentSectionCard>
          ))}
        </div>
      ) : null}
      {groupedEnvironmentItems.map((group) => (
        <EnvironmentSectionCard
          key={group.key}
          count={group.items.length}
          label={group.label}
          messages={messages}
        >
          {group.items.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="group w-full min-w-0 max-w-full overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 space-y-0.5 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {localizeEnvironmentItemLabel(item.label, messages)}
                  </div>
                  <HoverCopyValueButton content={localizeEnvironmentItemValue(item.value, messages)} />
                </div>
                {shouldRenderEnvironmentPathLink(item) ? (
                  <div className="min-w-0 overflow-hidden">
                    <FileLink
                      item={buildEnvironmentPathItem(item)}
                      compact
                      currentWorkspaceRoot=""
                      label={localizeEnvironmentItemValue(item.value, messages)}
                      onOpenPreview={onOpenPreview}
                      onRevealInFileManager={(targetItem) => {
                        onRevealInFileManager?.(targetItem).catch(() => {});
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                    {localizeEnvironmentItemValue(item.value, messages)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </EnvironmentSectionCard>
      ))}
    </>
  );
}
