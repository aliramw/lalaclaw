export type ChatPanelRenderAttachment = {
  dataUrl?: string;
  fullPath?: string;
  id?: string;
  kind?: string;
  mimeType?: string;
  name?: string;
  path?: string;
  previewUrl?: string;
  size?: number;
};

export type ChatPanelRenderMessage = {
  attachments?: ChatPanelRenderAttachment[];
  content?: string;
  id?: string;
  pending?: boolean;
  role?: string;
  streaming?: boolean;
  timestamp?: number | string;
  tokenBadge?: string;
};

export type ChatPanelRenderTool = {
  detail?: string;
  id?: string;
  input?: string;
  name?: string;
  output?: string;
  status?: string;
  timestamp?: number | string;
};

export type ChatPanelTaskTimelineEntry = {
  id?: string;
  timestamp?: number | string;
  tools?: ChatPanelRenderTool[];
};

type MessageRenderItem = {
  kind: "message";
  key: string;
  message: ChatPanelRenderMessage;
  messageId: string;
  previousMessageId: string;
  separated: boolean;
};

type TurnActivityRenderItem = {
  kind: "turn-activity";
  turnKey: string;
  tools: ChatPanelRenderTool[];
};

export type ChatPanelRenderItem = MessageRenderItem | TurnActivityRenderItem;

type DeriveChatPanelRenderItemsOptions = {
  getMessageKey: (message: ChatPanelRenderMessage, index: number) => string;
  messages?: ChatPanelRenderMessage[];
  taskTimeline?: ChatPanelTaskTimelineEntry[];
};

type UserTurn = {
  messageKey: string;
  nextUserTimestamp: number | null;
  startIndex: number;
  startTimestamp: number;
};

function toFiniteTimestamp(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function findMatchingUserTurnIndex(userTurns: UserTurn[], timestamp: number) {
  for (let index = 0; index < userTurns.length; index += 1) {
    const turn = userTurns[index];
    if (timestamp < turn.startTimestamp) {
      continue;
    }

    if (turn.nextUserTimestamp === null || timestamp < turn.nextUserTimestamp) {
      return index;
    }
  }

  return -1;
}

function findTurnActivityInsertionIndex(messages: ChatPanelRenderMessage[], userTurns: UserTurn[], turnIndex: number) {
  const turn = userTurns[turnIndex];
  const nextTurn = userTurns[turnIndex + 1];
  const turnEndIndex = nextTurn ? nextTurn.startIndex : messages.length;

  for (let messageIndex = turn.startIndex + 1; messageIndex < turnEndIndex; messageIndex += 1) {
    const message = messages[messageIndex];
    if (message?.role === "assistant" && !message.pending) {
      return messageIndex;
    }
  }

  return null;
}

export function deriveChatPanelRenderItems({
  getMessageKey,
  messages = [],
  taskTimeline = [],
}: DeriveChatPanelRenderItemsOptions): ChatPanelRenderItem[] {
  const renderItems: ChatPanelRenderItem[] = [];
  const userTurns: UserTurn[] = [];
  let lastUserMessageId = "";
  let lastAssistantMessageId = "";

  messages.forEach((message, index) => {
    const messageId = getMessageKey(message, index);

    renderItems.push({
      kind: "message",
      key: messageId,
      message,
      messageId,
      previousMessageId: message.role === "assistant" ? lastAssistantMessageId : lastUserMessageId,
      separated: index > 0 && messages[index - 1]?.role !== message.role,
    });

    if (message.role === "user") {
      const startTimestamp = toFiniteTimestamp(message.timestamp);
      if (startTimestamp !== null) {
        userTurns.push({
          messageKey: messageId,
          nextUserTimestamp: null,
          startIndex: index,
          startTimestamp,
        });
      }
      lastUserMessageId = messageId;
    } else if (message.role === "assistant") {
      lastAssistantMessageId = messageId;
    }
  });

  for (let index = 0; index < userTurns.length; index += 1) {
    userTurns[index].nextUserTimestamp = userTurns[index + 1]?.startTimestamp ?? null;
  }

  if (!userTurns.length) {
    return renderItems;
  }

  const toolsByTurnIndex = new Map<number, ChatPanelRenderTool[]>();

  for (const run of taskTimeline) {
    const tools = Array.isArray(run?.tools) ? run.tools.filter(Boolean) : [];
    if (!tools.length) {
      continue;
    }

    const runTimestamp = toFiniteTimestamp(run?.timestamp);
    if (runTimestamp === null) {
      continue;
    }

    const turnIndex = findMatchingUserTurnIndex(userTurns, runTimestamp);
    if (turnIndex < 0) {
      continue;
    }

    const existingTools = toolsByTurnIndex.get(turnIndex) || [];
    existingTools.push(...tools);
    toolsByTurnIndex.set(turnIndex, existingTools);
  }

  if (!toolsByTurnIndex.size) {
    return renderItems;
  }

  const activityItemsByMessageIndex = new Map<number, TurnActivityRenderItem>();

  for (const [turnIndex, tools] of toolsByTurnIndex.entries()) {
    if (!tools.length) {
      continue;
    }

    const insertionIndex = findTurnActivityInsertionIndex(messages, userTurns, turnIndex);
    if (insertionIndex === null) {
      continue;
    }

    const turn = userTurns[turnIndex];
    activityItemsByMessageIndex.set(insertionIndex, {
      kind: "turn-activity",
      turnKey: turn.messageKey,
      tools,
    });
  }

  const combinedItems: ChatPanelRenderItem[] = [];

  for (let messageIndex = 0; messageIndex < renderItems.length; messageIndex += 1) {
    const activityItem = activityItemsByMessageIndex.get(messageIndex);
    if (activityItem) {
      combinedItems.push(activityItem);
    }
    combinedItems.push(renderItems[messageIndex]);
  }

  return combinedItems;
}
