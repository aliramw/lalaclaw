import { Send } from "lucide-react";
import { memo } from "react";
import { useI18n } from "@/lib/i18n";

export const EmptyConversation = memo(function EmptyConversation({ loading = false }: { loading?: boolean }) {
  const { messages } = useI18n();

  if (loading) {
    return (
      <div className="cc-chat-empty-state">
        <div className="flex min-h-56 items-center justify-center rounded-[20px] border border-dashed border-border/70 bg-[var(--panel-muted)] px-6 py-12 text-center">
          <div className="text-sm font-medium">{messages.chat.loadingConversation}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-chat-empty-state">
      <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-border/70 bg-[var(--panel-muted)] px-6 py-12 text-center">
        <Send className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">{messages.chat.waitingFirstPrompt}</div>
          <div className="text-sm text-muted-foreground">{messages.chat.conversationWillAppear}</div>
        </div>
      </div>
    </div>
  );
});
