const state = {
  messages: [],
  contextMax: 16000,
  files: [],
  artifacts: [],
  snapshots: [],
  toolHistory: [],
  agents: [],
  mode: 'mock',
  model: 'openclaw-agent',
  busy: false,
};

const elements = {
  modelInput: document.querySelector('#model-input'),
  fastMode: document.querySelector('#fast-mode'),
  resetButton: document.querySelector('#reset-button'),
  seedButton: document.querySelector('#seed-button'),
  sendButton: document.querySelector('#send-button'),
  promptInput: document.querySelector('#prompt-input'),
  messageList: document.querySelector('#message-list'),
  sessionSummary: document.querySelector('#session-summary'),
  toolList: document.querySelector('#tool-list'),
  fileList: document.querySelector('#file-list'),
  artifactList: document.querySelector('#artifact-list'),
  snapshotList: document.querySelector('#snapshot-list'),
  agentGraph: document.querySelector('#agent-graph'),
  modeBadge: document.querySelector('#mode-badge'),
  statusBadge: document.querySelector('#status-badge'),
  contextLength: document.querySelector('#context-length'),
  contextMax: document.querySelector('#context-max'),
  fileCount: document.querySelector('#file-count'),
  messageTemplate: document.querySelector('#message-template'),
};

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function getContextLength() {
  return state.messages.reduce((total, message) => total + (message.content?.length || 0), 0);
}

function setStatus(text) {
  elements.statusBadge.textContent = text;
}

function renderMessages() {
  elements.messageList.innerHTML = '';

  if (!state.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.innerHTML = '<strong>No messages</strong><small>Send the first operator prompt to start the session.</small>';
    elements.messageList.appendChild(empty);
    return;
  }

  for (const message of state.messages) {
    const node = elements.messageTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.role = message.role;
    node.querySelector('.message-role').textContent = message.role === 'user' ? 'Operator' : 'OpenClaw';
    node.querySelector('.message-time').textContent = formatTime(message.timestamp);
    node.querySelector('.message-body').textContent = message.content;
    elements.messageList.appendChild(node);
  }

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderList(container, items, renderItem, emptyTitle, emptyDetail) {
  container.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.innerHTML = `<strong>${emptyTitle}</strong><small>${emptyDetail}</small>`;
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const node = document.createElement('article');
    node.className = 'list-item';
    node.innerHTML = renderItem(item);
    container.appendChild(node);
  });
}

function renderAgents() {
  elements.agentGraph.innerHTML = '';

  if (!state.agents.length) {
    elements.agentGraph.innerHTML = '<div class="list-item"><strong>No agent topology</strong><small>Agent graph appears after the first run.</small></div>';
    return;
  }

  state.agents.forEach((agent) => {
    const node = document.createElement('article');
    node.className = 'agent-node';
    node.innerHTML = `<strong>${agent.label}</strong><small>${agent.state}</small>`;
    elements.agentGraph.appendChild(node);
  });
}

function renderSummary() {
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant');
  elements.sessionSummary.textContent = lastAssistant?.summary || 'No conversation yet.';
}

function renderMeta() {
  elements.modeBadge.textContent = state.mode;
  elements.contextLength.textContent = String(getContextLength());
  elements.contextMax.textContent = String(state.contextMax);
  elements.fileCount.textContent = String(state.files.length);
}

function renderAll() {
  renderMessages();
  renderSummary();
  renderList(
    elements.toolList,
    state.toolHistory,
    (item) => `<strong>${item.name}</strong><small>${item.status} · ${item.detail}</small>`,
    'No tool calls',
    'Tool trace will appear after the agent starts executing.',
  );
  renderList(
    elements.fileList,
    state.files,
    (item) => `<strong>${item.path}</strong><small>${item.kind}</small>`,
    'No imported files',
    'Attach or detect files during the next iteration.',
  );
  renderList(
    elements.artifactList,
    state.artifacts,
    (item) => `<strong>${item.title}</strong><small>${item.type} · ${item.detail}</small>`,
    'No artifacts',
    'Generated outputs will show up here.',
  );
  renderList(
    elements.snapshotList,
    state.snapshots,
    (item) => `<strong>${item.title}</strong><small>${item.detail}</small>`,
    'No snapshots',
    'State checkpoints will be listed here.',
  );
  renderAgents();
  renderMeta();
}

async function loadSession() {
  const response = await fetch('/api/session');
  const session = await response.json();
  state.mode = session.mode;
  state.model = session.model;
  elements.modelInput.value = session.model;
  renderAll();
}

async function dispatchPrompt() {
  const content = elements.promptInput.value.trim();
  if (!content || state.busy) {
    return;
  }

  const userMessage = {
    role: 'user',
    content,
    timestamp: Date.now(),
  };
  state.messages.push(userMessage);
  state.busy = true;
  setStatus('Executing');
  renderAll();
  elements.promptInput.value = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: elements.modelInput.value.trim() || state.model,
        fastMode: elements.fastMode.checked,
        messages: state.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    state.mode = payload.mode;
    state.model = payload.model;
    state.toolHistory = payload.toolHistory || [];
    state.files = payload.files || [];
    state.artifacts = payload.artifacts || [];
    state.snapshots = payload.snapshots || [];
    state.agents = payload.agents || [];
    state.messages.push({
      role: 'assistant',
      content: payload.outputText,
      timestamp: Date.now(),
      summary: payload.metadata?.summary || 'No summary available.',
      usage: payload.usage || null,
    });
    setStatus(payload.metadata?.status || 'Completed');
  } catch (error) {
    state.messages.push({
      role: 'assistant',
      content: `Command dispatch failed.\n${error.message}`,
      timestamp: Date.now(),
      summary: 'Request failed.',
    });
    setStatus('Failed');
  } finally {
    state.busy = false;
    renderAll();
  }
}

function resetSession() {
  state.messages = [];
  state.files = [];
  state.artifacts = [];
  state.snapshots = [];
  state.toolHistory = [];
  state.agents = [];
  elements.promptInput.value = '';
  setStatus('Idle');
  renderAll();
}

function loadSeedPrompt() {
  elements.promptInput.value = [
    '你现在是 OpenClaw 的 Agent 指挥中心。',
    '请先确认当前 workspace 状态，并给出把单 Agent 聊天跑通的最小实施路径。',
    '同时返回你预计会记录哪些 tool trace 和 session state。',
  ].join('\n');
  elements.promptInput.focus();
}

elements.sendButton.addEventListener('click', dispatchPrompt);
elements.resetButton.addEventListener('click', resetSession);
elements.seedButton.addEventListener('click', loadSeedPrompt);
elements.promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    dispatchPrompt();
  }
});

loadSession().catch(() => {
  setStatus('Offline');
});
