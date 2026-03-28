import { Send } from "lucide-react";
import { memo } from "react";
import { useI18n } from "@/lib/i18n";

export const EmptyConversation = memo(function EmptyConversation({ loading = false }: { loading?: boolean }) {
  const { messages } = useI18n();

  if (loading) {
    return (
      <div>
        <div className="flex min-h-56 items-center justify-center py-10 text-center">
          <div className="text-sm font-medium">{messages.chat.loadingConversation}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex min-h-56 flex-col items-center justify-center gap-4 py-10 text-center">
        <Send className="h-8 w-8 text-foreground/85" />
        <div className="space-y-1">
          <div className="text-sm font-medium">{messages.chat.waitingFirstPrompt}</div>
          <div className="text-sm text-muted-foreground">{messages.chat.conversationWillAppear}</div>
        </div>
      </div>
    </div>
  );
});
