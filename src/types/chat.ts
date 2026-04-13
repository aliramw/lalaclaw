export type ChatRole = "system" | "user" | "assistant" | string;

export type AgentProgressStage = "thinking" | "inspecting" | "executing" | "synthesizing" | "finishing";

export type AgentProgressState = {
  stage: AgentProgressStage;
  label?: string;
  updatedAt: number;
};

export type ChatAttachment = {
  id?: string;
  kind?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  path?: string;
  fullPath?: string;
  dataUrl?: string;
  previewUrl?: string;
  textContent?: string;
  truncated?: boolean;
  storageKey?: string;
};

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content?: string;
  timestamp?: number;
  pending?: boolean;
  streaming?: boolean;
  tokenBadge?: string;
  attachments?: ChatAttachment[];
  suppressPendingPlaceholder?: boolean;
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

export type PendingUserMessage = ChatMessage & {
  role: "user";
  content: string;
};

export type ChatControllerEntry = {
  id?: string;
  key?: string;
  tabId?: string;
  content?: string;
  attachments?: ChatAttachment[];
  timestamp?: number;
  pendingTimestamp?: number;
  userMessageId?: string;
  assistantMessageId?: string;
  suppressPendingPlaceholder?: boolean;
  agentId?: string;
  sessionUser?: string;
  model?: string;
  fastMode?: boolean;
  thinkMode?: string;
  [key: string]: unknown;
};

export type ChatStreamPayload = {
  ok?: boolean;
  error?: string;
  outputText?: string;
  tokenBadge?: string;
  assistantMessageId?: string;
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
  conversation?: ChatMessage[];
  metadata?: Record<string, unknown>;
  session?: Record<string, unknown>;
  sessionSync?: Record<string, unknown>;
  resetSessionUser?: string;
  fastMode?: boolean;
  [key: string]: unknown;
};

export type ChatRequestMessage = {
  role: string;
  content?: string;
  attachments?: ChatAttachment[];
};

export type ChatRequestBody = {
  model?: string;
  agentId?: string;
  sessionUser?: string;
  assistantMessageId?: string;
  userLabel?: string;
  fastMode?: boolean;
  messages: ChatRequestMessage[];
  stream: boolean;
};

export type PendingChatTurn = {
  key?: string;
  tabId?: string;
  startedAt?: number;
  lastDeltaAt?: number;
  pendingTimestamp?: number;
  assistantMessageId?: string;
  streamText?: string;
  tokenBadge?: string;
  stopped?: boolean;
  stoppedAt?: number;
  suppressPendingPlaceholder?: boolean;
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
  userMessage?: PendingUserMessage;
  agentId?: string;
  sessionUser?: string;
};

export type ConversationPendingMap = Record<string, PendingChatTurn>;

export type ChatFontSize = "small" | "medium" | "large";
export type ComposerSendMode = "enter-send" | "double-enter-send";

export type ChatScrollState = {
  scrollTop: number;
  atBottom?: boolean;
  anchorNodeId?: string;
  anchorMessageId?: string;
  anchorOffset?: number;
};

export type SessionFile = {
  path: string;
  fullPath: string;
  name?: string;
  kind?: string;
  primaryAction?: string;
  observedAt?: number;
  updatedAt?: number;
  actions?: string[];
};

export type SessionFileRewrite = {
  previousPath: string;
  nextPath: string;
};

export type ChatTab = {
  id: string;
  agentId: string;
  sessionUser: string;
};

export type ChatTabMeta = {
  agentId: string;
  sessionUser: string;
  title?: string;
  model: string;
  fastMode: boolean;
  thinkMode: string;
  sessionFiles: SessionFile[];
  sessionFileRewrites: SessionFileRewrite[];
};

export type MessagesByTabId = Record<string, ChatMessage[]>;
export type TabMetaById = Record<string, ChatTabMeta>;

export type StoredUiState = {
  _persistedAt: number;
  activeTab: string;
  activeChatTabId: string;
  chatTabs: ChatTab[];
  messages: ChatMessage[];
  messagesByTabId: MessagesByTabId;
  tabMetaById: TabMetaById;
  fastMode: boolean;
  thinkMode: string;
  model: string;
  agentId: string;
  sessionUser: string;
  inspectorPanelWidth: number;
  chatFontSize: ChatFontSize;
  composerSendMode: ComposerSendMode;
  userLabel?: string;
  dismissedTaskRelationshipIdsByConversation: Record<string, string[]>;
  promptDraftsByConversation: Record<string, string>;
  workspaceFilesOpenByConversation: Record<string, boolean>;
};
