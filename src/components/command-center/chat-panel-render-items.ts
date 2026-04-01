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
  messageIndex: number;
  previousMessageId: string;
  separated: boolean;
};

type TurnActivityRenderItem = {
  kind: "turn-activity";
  key: string;
  tool: ChatPanelRenderTool;
  turnKey: string;
};

export type ChatPanelRenderItem = MessageRenderItem | TurnActivityRenderItem;

type DeriveChatPanelRenderItemsOptions = {
  getMessageKey: (message: ChatPanelRenderMessage, index: number) => string;
  getMessageRenderKey?: (message: ChatPanelRenderMessage, index: number) => string;
  messages?: ChatPanelRenderMessage[];
  taskTimeline?: ChatPanelTaskTimelineEntry[];
};

type UserTurn = {
  messageKey: string;
  nextUserTimestamp: number | null;
  startIndex: number;
  startTimestamp: number;
};

type TurnToolEntry = {
  key: string;
  orderIndex: number;
  sortTimestamp: number;
  tool: ChatPanelRenderTool;
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

export function deriveChatPanelRenderItems({
  getMessageKey,
  getMessageRenderKey = getMessageKey,
  messages = [],
  taskTimeline = [],
}: DeriveChatPanelRenderItemsOptions): ChatPanelRenderItem[] {
  const renderItems: ChatPanelRenderItem[] = [];
  const userTurns: UserTurn[] = [];
  let lastUserMessageId = "";
  let lastAssistantMessageId = "";

  messages.forEach((message, index) => {
    const messageId = getMessageKey(message, index);
    const messageRenderKey = getMessageRenderKey(message, index);

    renderItems.push({
      kind: "message",
      key: messageRenderKey,
      message,
      messageId,
      messageIndex: index,
      previousMessageId: message.role === "assistant" ? lastAssistantMessageId : lastUserMessageId,
      separated: index > 0 && messages[index - 1]?.role !== message.role,
    });

    if (message.role === "user") {
      const startTimestamp = toFiniteTimestamp(message.timestamp);
      if (startTimestamp !== null) {
        userTurns.push({
          messageKey: messageRenderKey,
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

  const toolsByTurnIndex = new Map<number, TurnToolEntry[]>();
  let toolOrderIndex = 0;

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
    tools.forEach((tool) => {
      const sortTimestamp = toFiniteTimestamp(tool?.timestamp) ?? runTimestamp;
      existingTools.push({
        key: String(tool?.id || "").trim() || `tool-${toolOrderIndex}`,
        orderIndex: toolOrderIndex,
        sortTimestamp,
        tool,
      });
      toolOrderIndex += 1;
    });
    toolsByTurnIndex.set(turnIndex, existingTools);
  }

  if (!toolsByTurnIndex.size) {
    return renderItems;
  }

  const combinedItems: ChatPanelRenderItem[] = [];
  let nextMessageIndex = 0;

  for (let turnIndex = 0; turnIndex < userTurns.length; turnIndex += 1) {
    const turn = userTurns[turnIndex];
    const nextTurn = userTurns[turnIndex + 1];
    const turnEndIndex = nextTurn ? nextTurn.startIndex : renderItems.length;
    const orderedTools = (toolsByTurnIndex.get(turnIndex) || [])
      .slice()
      .sort((left, right) => {
        if (left.sortTimestamp !== right.sortTimestamp) {
          return left.sortTimestamp - right.sortTimestamp;
        }

        return left.orderIndex - right.orderIndex;
      });
    let toolIndex = 0;

    while (nextMessageIndex < turn.startIndex) {
      combinedItems.push(renderItems[nextMessageIndex]);
      nextMessageIndex += 1;
    }

    for (let messageIndex = turn.startIndex; messageIndex < turnEndIndex; messageIndex += 1) {
      combinedItems.push(renderItems[messageIndex]);

      const nextMessageTimestamp =
        messageIndex + 1 < turnEndIndex
          ? toFiniteTimestamp(messages[messageIndex + 1]?.timestamp)
          : null;

      while (toolIndex < orderedTools.length) {
        const toolEntry = orderedTools[toolIndex];
        if (nextMessageTimestamp !== null && toolEntry.sortTimestamp > nextMessageTimestamp) {
          break;
        }

        combinedItems.push({
          key: `turn-activity-${turn.messageKey}-${toolEntry.key}`,
          kind: "turn-activity",
          tool: toolEntry.tool,
          turnKey: turn.messageKey,
        });
        toolIndex += 1;
      }
    }

    nextMessageIndex = turnEndIndex;
  }

  while (nextMessageIndex < renderItems.length) {
    combinedItems.push(renderItems[nextMessageIndex]);
    nextMessageIndex += 1;
  }

  return combinedItems;
}
