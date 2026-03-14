const state = {
  model: '',
  messages: [],
  contextMax: 16000,
  toolHistory: [],
  files: [],
  artifacts: [],
  snapshots: [],
  agents: [],
  peeks: {
    workspace: null,
    terminal: null,
    browser: null,
  },
  session: {
    mode: 'mock',
    model: '',
    agentId: 'main',
    status: '空闲',
    fastMode: '关闭',
    contextUsed: 0,
    contextMax: 16000,
    runtime: 'mock',
    queue: '无',
    updatedLabel: '暂无更新',
    sessionKey: '',
  },
  busy: false,
};

const modeLabels = {
  mock: '模拟',
  openclaw: '真实网关',
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
  modelBadge: document.querySelector('#model-badge'),
  modelMeta: document.querySelector('#model-meta'),
  agentBadge: document.querySelector('#agent-badge'),
  sessionBadge: document.querySelector('#session-badge'),
  statusBadge: document.querySelector('#status-badge'),
  runtimeBadge: document.querySelector('#runtime-badge'),
  fastBadge: document.querySelector('#fast-badge'),
  queueBadge: document.querySelector('#queue-badge'),
  updatedBadge: document.querySelector('#updated-badge'),
  contextLength: document.querySelector('#context-length'),
  contextMax: document.querySelector('#context-max'),
  contextMeta: document.querySelector('#context-meta'),
  workspacePeek: document.querySelector('#workspace-peek'),
  terminalPeek: document.querySelector('#terminal-peek'),
  browserPeek: document.querySelector('#browser-peek'),
  messageTemplate: document.querySelector('#message-template'),
};

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatStatusLabel(text) {
  if (!text) {
    return '空闲';
  }

  return text
    .replaceAll('Fast', '快速')
    .replaceAll('Standard', '标准');
}

function setStatus(text) {
  state.session.status = text;
  elements.statusBadge.textContent = text;
}

function renderMessages() {
  elements.messageList.innerHTML = '';

  if (!state.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.innerHTML = '<strong>暂无消息</strong><small>发送第一条指令后开始会话。</small>';
    elements.messageList.appendChild(empty);
    return;
  }

  for (const message of state.messages) {
    const node = elements.messageTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.role = message.role;
    node.querySelector('.message-role').textContent = message.role === 'user' ? '你' : 'OpenClaw';
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
    elements.agentGraph.innerHTML = '<div class="list-item"><strong>暂无结构</strong><small>首次执行后显示 Agent 协作结构。</small></div>';
    return;
  }

  state.agents.forEach((agent) => {
    const node = document.createElement('article');
    node.className = 'agent-node';
    node.innerHTML = `<strong>${agent.label}</strong><small>${agent.detail || agent.state}</small>`;
    elements.agentGraph.appendChild(node);
  });
}

function renderSummary() {
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant');
  elements.sessionSummary.textContent = lastAssistant?.summary || `会话键：${state.session.sessionKey || '暂无对话。'}`;
}

function renderPeek(target, section, fallback) {
  if (!section) {
    target.textContent = fallback;
    return;
  }

  const lines = [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].filter(Boolean);
  target.textContent = lines.join('\n');
}

function renderMeta() {
  const resolvedModel = state.session.model || state.model || '未知';
  elements.modeBadge.textContent = modeLabels[state.session.mode] || state.session.mode;
  elements.modelBadge.textContent = resolvedModel;
  elements.modelMeta.textContent = state.session.auth || state.session.time || '等待模型状态';
  elements.agentBadge.textContent = state.session.agentId || 'main';
  elements.sessionBadge.textContent = state.session.sessionKey || '等待会话';
  elements.statusBadge.textContent = state.session.status || '空闲';
  elements.runtimeBadge.textContent = state.session.runtime || '未知';
  elements.fastBadge.textContent = elements.fastMode.checked ? '开启' : '关闭';
  elements.queueBadge.textContent = state.session.queue || '无';
  elements.updatedBadge.textContent = state.session.updatedLabel || '暂无更新';
  elements.contextLength.textContent = String(state.session.contextUsed || 0);
  elements.contextMax.textContent = String(state.session.contextMax || state.contextMax);
  elements.contextMeta.textContent = state.session.tokens || state.session.contextDisplay || '等待状态';
  renderPeek(elements.workspacePeek, state.peeks.workspace, '等待工作区预览…');
  renderPeek(elements.terminalPeek, state.peeks.terminal, '等待终端预览…');
  renderPeek(elements.browserPeek, state.peeks.browser, '等待浏览器预览…');

  if (document.activeElement !== elements.modelInput) {
    elements.modelInput.value = resolvedModel === '未知' ? '' : resolvedModel;
  }
}

function renderAll() {
  renderMessages();
  renderSummary();
  renderList(
    elements.toolList,
    state.toolHistory,
    (item) => `<strong>${item.name}</strong><small>${item.status} · ${item.detail}</small>`,
    '暂无工具调用',
    'Agent 开始执行后会在这里记录工具轨迹。',
  );
  renderList(
    elements.fileList,
    state.files,
    (item) => `<strong>${item.path}</strong><small>${item.kind}</small>`,
    '暂无文件',
    '当前会话中检测到的文件会显示在这里。',
  );
  renderList(
    elements.artifactList,
    state.artifacts,
    (item) => `<strong>${item.title}</strong><small>${item.type} · ${item.detail}</small>`,
    '暂无产出物',
    '助手的真实产出会显示在这里。',
  );
  renderList(
    elements.snapshotList,
    state.snapshots,
    (item) => `<strong>${item.title}</strong><small>${item.detail}</small>`,
    '暂无快照',
    '每次完成回复后会生成一个可回看快照。',
  );
  renderAgents();
  renderMeta();
}

function applyRuntimeSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  state.session = {
    ...state.session,
    ...(snapshot.session || {}),
    mode: snapshot.session?.mode || state.session.mode,
  };
  state.toolHistory = snapshot.toolHistory || [];
  state.files = snapshot.files || [];
  state.artifacts = snapshot.artifacts || [];
  state.snapshots = snapshot.snapshots || [];
  state.agents = snapshot.agents || [];
  state.peeks = snapshot.peeks || state.peeks;
}

async function loadRuntime() {
  const response = await fetch('/api/runtime');
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Runtime snapshot failed');
  }

  applyRuntimeSnapshot(payload);
  state.model = payload.session?.model || payload.model || state.model;
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
  setStatus('执行中');
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

    applyRuntimeSnapshot(payload);
    state.model = payload.session?.model || payload.model || state.model;
    state.messages.push({
      role: 'assistant',
      content: payload.outputText,
      timestamp: Date.now(),
      summary: payload.metadata?.summary || '暂无摘要。',
      usage: payload.usage || null,
    });
    setStatus(formatStatusLabel(payload.metadata?.status || state.session.status || '已完成'));
  } catch (error) {
    state.messages.push({
      role: 'assistant',
      content: `请求失败。\n${error.message}`,
      timestamp: Date.now(),
      summary: '请求失败。',
    });
    setStatus('失败');
  } finally {
    state.busy = false;
    renderAll();
  }
}

function resetSession() {
  state.messages = [];
  elements.promptInput.value = '';
  setStatus('空闲');
  renderAll();
}

function loadSeedPrompt() {
  elements.promptInput.value = [
    '请先给我当前 OpenClaw 会话的真实 session_status。',
    '然后列出最近发生的工具调用、文件涉及和可回看的会话快照。',
    '如果有可调度的 subagent，也一起说明当前关系。',
  ].join('\n');
  elements.promptInput.focus();
}

elements.sendButton.addEventListener('click', dispatchPrompt);
elements.resetButton.addEventListener('click', resetSession);
elements.seedButton.addEventListener('click', loadSeedPrompt);
elements.fastMode.addEventListener('change', renderMeta);
elements.promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    dispatchPrompt();
  }
});

loadRuntime()
  .then(() => {
    setInterval(() => {
      if (!state.busy) {
        loadRuntime().catch(() => {});
      }
    }, 15000);
  })
  .catch(() => {
    setStatus('离线');
  });
