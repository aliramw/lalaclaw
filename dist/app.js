const state = {
  model: '',
  availableModels: [],
  availableAgents: [],
  messages: [],
  contextMax: 16000,
  taskTimeline: [],
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
    sessionUser: 'command-center',
    status: '空闲',
    fastMode: '关闭',
    contextUsed: 0,
    contextMax: 16000,
    runtime: 'mock',
    queue: '无',
    updatedLabel: '暂无更新',
    sessionKey: '',
  },
  activeTab: 'timeline',
  busy: false,
};

const modeLabels = {
  mock: '模拟',
  openclaw: '真实网关',
};

const storageKey = 'command-center-ui-state-v1';
const defaultTab = 'timeline';

const elements = {
  fastMode: document.querySelector('#fast-mode'),
  resetButton: document.querySelector('#reset-button'),
  sendButton: document.querySelector('#send-button'),
  modelMenuButton: document.querySelector('#model-menu-button'),
  agentMenuButton: document.querySelector('#agent-menu-button'),
  modelMenu: document.querySelector('#model-menu'),
  agentMenu: document.querySelector('#agent-menu'),
  promptInput: document.querySelector('#prompt-input'),
  messageList: document.querySelector('#message-list'),
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
  tabButtons: [...document.querySelectorAll('[data-tab]')],
  tabPanels: [...document.querySelectorAll('[data-tab-panel]')],
};

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function adjustPromptHeight() {
  const textarea = elements.promptInput;
  if (!textarea) {
    return;
  }

  const computed = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
  const maxHeight = lineHeight * 10 + paddingTop + paddingBottom + borderTop + borderBottom;

  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = '';
  let inCodeBlock = false;
  let codeFence = '';
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }

    blocks.push(`<p>${paragraph.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) {
      return;
    }

    const tag = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tag}>`);
    listItems = [];
    listType = '';
  }

  function flushCodeBlock() {
    const language = codeFence ? `<span class="code-fence-label">${escapeHtml(codeFence)}</span>` : '';
    blocks.push(`<pre><code>${language}${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
    codeFence = '';
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\S+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeFence = fenceMatch[1] || '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(6, headingMatch[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listItems.push(bulletMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }
  flushParagraph();
  flushList();

  return blocks.join('') || `<p>${renderInlineMarkdown(source)}</p>`;
}

function formatStatusLabel(text) {
  if (!text) {
    return '空闲';
  }

  return text
    .replaceAll('Fast', '快速')
    .replaceAll('Standard', '标准');
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      fastMode: Boolean(parsed?.fastMode),
      activeTab: parsed?.activeTab || defaultTab,
      model: parsed?.model || '',
      agentId: parsed?.agentId || '',
      sessionUser: parsed?.sessionUser || 'command-center',
    };
  } catch {
    return null;
  }
}

function persistState() {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        messages: state.messages.filter((message) => !message.pending).slice(-80),
        fastMode: elements.fastMode.checked,
        activeTab: state.activeTab || defaultTab,
        model: state.model,
        agentId: state.session.agentId || '',
        sessionUser: state.session.sessionUser || 'command-center',
      }),
    );
  } catch {}
}

function upsertPendingAssistant(content = '正在思考…') {
  const pendingMessage = {
    role: 'assistant',
    content,
    timestamp: Date.now(),
    pending: true,
  };
  const pendingIndex = state.messages.findIndex((message) => message.pending);

  if (pendingIndex >= 0) {
    state.messages.splice(pendingIndex, 1, pendingMessage);
    return;
  }

  state.messages.push(pendingMessage);
}

function resolvePendingAssistant(message) {
  const pendingIndex = state.messages.findIndex((item) => item.pending);
  if (pendingIndex >= 0) {
    state.messages.splice(pendingIndex, 1, message);
    return;
  }

  state.messages.push(message);
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
    if (message.pending) {
      node.classList.add('message-pending');
    }
    node.querySelector('.message-role').textContent = message.role === 'user' ? '你' : 'OpenClaw';
    node.querySelector('.message-time').textContent = formatTime(message.timestamp);
    const body = node.querySelector('.message-body');
    if (message.role === 'assistant') {
      body.innerHTML = renderMarkdown(message.content);
    } else {
      body.innerHTML = `<p>${escapeHtml(message.content).replace(/\n/g, '<br>')}</p>`;
    }
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
    if (item?.id) {
      node.dataset.itemId = item.id;
    }
    node.innerHTML = renderItem(item);
    container.appendChild(node);
  });
}

function setActiveTab(tabName) {
  state.activeTab = tabName || defaultTab;
  elements.tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === state.activeTab);
  });
  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === state.activeTab);
  });
}

function closeStatusMenus() {
  elements.modelMenu.hidden = true;
  elements.agentMenu.hidden = true;
  elements.modelMenuButton.setAttribute('aria-expanded', 'false');
  elements.agentMenuButton.setAttribute('aria-expanded', 'false');
}

function toggleStatusMenu(menuName) {
  const isModel = menuName === 'model';
  const button = isModel ? elements.modelMenuButton : elements.agentMenuButton;
  const menu = isModel ? elements.modelMenu : elements.agentMenu;
  const shouldOpen = menu.hidden;

  closeStatusMenus();
  if (!shouldOpen) {
    return;
  }

  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

function renderStatusMenu(menu, values, selectedValue, emptyText, kind) {
  if (!menu) {
    return;
  }

  const currentValue = String(selectedValue || '').trim();
  const options = [...new Set([currentValue, ...(values || [])].filter(Boolean))];
  menu.innerHTML = options.length
    ? options
        .map((value) => `<option value="${escapeHtml(value)}"${value === currentValue ? ' selected' : ''}>${escapeHtml(value)}</option>`)
        .map(
          (optionHtml, index) => `
            <button type="button" class="status-menu-item${options[index] === currentValue ? ' is-selected' : ''}" data-menu-kind="${kind}" data-menu-value="${escapeHtml(options[index])}">
              <span>${escapeHtml(options[index])}</span>
              <span class="status-menu-check">${options[index] === currentValue ? '当前' : ''}</span>
            </button>
          `,
        )
        .join('')
    : `<div class="status-menu-empty">${escapeHtml(emptyText)}</div>`;
}

function renderTimeline() {
  elements.toolList.innerHTML = '';

  if (!state.taskTimeline.length) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.innerHTML = '<strong>暂无执行记录</strong><small>每次任务执行后，这里会按时间线聚合展示工具链路。</small>';
    elements.toolList.appendChild(empty);
    return;
  }

  state.taskTimeline.forEach((item, index) => {
    const node = document.createElement('article');
    node.className = 'list-item timeline-item';
    const toolsList = item.tools || [];
    const fileList = item.files || [];
    const snapshotList = item.snapshots || [];

    const tools = toolsList.length
      ? toolsList
          .map(
            (tool) => `
              <div class="timeline-detail-row">
                <div class="timeline-detail-head">
                  <strong>${escapeHtml(tool.name)}</strong>
                  <small>${escapeHtml(tool.status)}</small>
                </div>
                <pre class="timeline-code"><span class="timeline-code-label">输入</span>${escapeHtml(tool.input || '无')}</pre>
                <pre class="timeline-code"><span class="timeline-code-label">输出</span>${escapeHtml(tool.output || tool.detail || '等待结果')}</pre>
              </div>
            `,
          )
          .join('')
      : '<div class="timeline-empty">本轮未调用工具</div>';

    const files = fileList.length
      ? fileList
          .map(
            (file) => `
              <div class="timeline-detail-row timeline-file-row">
                <strong>${escapeHtml(file.path)}</strong>
                <small>${escapeHtml(file.kind)}${file.updatedLabel ? ` · ${escapeHtml(file.updatedLabel)}` : ''}</small>
              </div>
            `,
          )
          .join('')
      : '<div class="timeline-empty">未检测到文件变更</div>';

    const snapshots = snapshotList.length
      ? snapshotList
          .map(
            (snapshot) => `
              <div class="timeline-detail-row timeline-snapshot-row">
                <div>
                  <strong>${escapeHtml(snapshot.title)}</strong>
                  <small>${escapeHtml(snapshot.detail)}</small>
                </div>
                <button type="button" class="ghost timeline-link" data-snapshot-id="${escapeHtml(snapshot.id)}">定位快照</button>
              </div>
            `,
          )
          .join('')
      : '<div class="timeline-empty">本轮暂无快照</div>';

    node.innerHTML = `
      <details class="timeline-card"${index === 0 ? ' open' : ''}>
        <summary class="timeline-summary">
          <div class="timeline-head">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.status)}</small>
          </div>
          <p class="timeline-prompt">${escapeHtml(item.prompt)}</p>
          <div class="timeline-meta-line">
            <small>工具：${escapeHtml(item.toolsSummary || '未调用工具')}</small>
            <small>结果：${escapeHtml(item.outcome)}</small>
          </div>
        </summary>
        <div class="timeline-body">
          <section class="timeline-section">
            <div class="timeline-section-head">
              <strong>工具输入 / 输出</strong>
            </div>
            ${tools}
          </section>
          <section class="timeline-section">
            <div class="timeline-section-head">
              <strong>文件变更</strong>
            </div>
            ${files}
          </section>
          <section class="timeline-section">
            <div class="timeline-section-head">
              <strong>快照入口</strong>
            </div>
            ${snapshots}
          </section>
        </div>
      </details>
    `;
    elements.toolList.appendChild(node);
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

function renderPeek(target, section, fallback) {
  if (!section) {
    target.textContent = fallback;
    return;
  }

  const lines = [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].filter(Boolean);
  target.textContent = lines.join('\n');
}

function renderMeta() {
  const resolvedModel = state.model || state.session.selectedModel || state.session.model || '未知';
  const statusText = state.session.status || '空闲';
  elements.modeBadge.textContent = modeLabels[state.session.mode] || state.session.mode;
  elements.modelBadge.textContent = resolvedModel;
  elements.modelMeta.textContent = state.session.auth || state.session.time || '等待模型状态';
  elements.agentBadge.textContent = state.session.agentId || 'main';
  elements.sessionBadge.textContent = state.session.sessionKey || '等待会话';
  elements.statusBadge.textContent = statusText;
  elements.statusBadge.classList.toggle('status-running', statusText.includes('执行中'));
  elements.runtimeBadge.textContent = state.session.runtime || '未知';
  elements.fastBadge.textContent = elements.fastMode.checked ? '开启' : '关闭';
  elements.queueBadge.textContent = state.session.queue || '无';
  elements.updatedBadge.textContent = state.session.updatedLabel || '暂无更新';
  elements.contextLength.textContent = String(state.session.contextUsed || 0);
  elements.contextMax.textContent = String(state.session.contextMax || state.contextMax);
  elements.contextMeta.textContent = state.session.tokens || state.session.contextDisplay || '等待状态';
  renderStatusMenu(elements.modelMenu, state.availableModels, resolvedModel, '暂无可选模型', 'model');
  renderStatusMenu(elements.agentMenu, state.availableAgents, state.session.agentId || 'main', '暂无可选 Agent', 'agent');
  renderPeek(elements.workspacePeek, state.peeks.workspace, '等待工作区预览…');
  renderPeek(elements.terminalPeek, state.peeks.terminal, '等待终端预览…');
  renderPeek(elements.browserPeek, state.peeks.browser, '等待浏览器预览…');
}

function renderAll() {
  renderMessages();
  renderTimeline();
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
  persistState();
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
  state.availableModels = snapshot.session?.availableModels || snapshot.availableModels || state.availableModels;
  state.availableAgents = snapshot.session?.availableAgents || snapshot.availableAgents || state.availableAgents;
  state.taskTimeline = snapshot.taskTimeline || [];
  state.toolHistory = snapshot.toolHistory || [];
  state.files = snapshot.files || [];
  state.artifacts = snapshot.artifacts || [];
  state.snapshots = snapshot.snapshots || [];
  state.agents = snapshot.agents || [];
  state.peeks = snapshot.peeks || state.peeks;
  if (snapshot.session?.fastMode) {
    elements.fastMode.checked = snapshot.session.fastMode === '开启';
  }
  state.model = snapshot.session?.selectedModel || snapshot.model || state.model;
}

async function loadRuntime() {
  const response = await fetch(`/api/runtime?sessionUser=${encodeURIComponent(state.session.sessionUser || 'command-center')}`);
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

  elements.promptInput.value = '';
  adjustPromptHeight();

  const userMessage = {
    role: 'user',
    content,
    timestamp: Date.now(),
  };
  state.messages.push(userMessage);
  upsertPendingAssistant();
  state.busy = true;
  setStatus('执行中');
  renderAll();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: state.model,
        agentId: state.session.agentId,
        sessionUser: state.session.sessionUser || 'command-center',
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
    resolvePendingAssistant({
      role: 'assistant',
      content: payload.outputText,
      timestamp: Date.now(),
      summary: payload.metadata?.summary || '暂无摘要。',
      usage: payload.usage || null,
    });
    setStatus(formatStatusLabel(payload.metadata?.status || state.session.status || '已完成'));
  } catch (error) {
    resolvePendingAssistant({
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

async function resetSession() {
  state.messages = [];
  state.taskTimeline = [];
  state.toolHistory = [];
  state.files = [];
  state.artifacts = [];
  state.snapshots = [];
  elements.promptInput.value = '';
  adjustPromptHeight();
  state.session.sessionUser = `command-center-${Date.now()}`;
  state.session.contextUsed = 0;
  state.session.contextMax = state.contextMax;
  state.session.contextDisplay = `0 / ${state.contextMax}`;
  state.session.tokens = '0 in / 0 out';
  state.session.updatedLabel = '刚刚重置';
  state.session.sessionKey = '';
  setStatus('空闲');
  renderAll();
  await loadRuntime().catch(() => {});
}

function focusSnapshot(snapshotId) {
  if (!snapshotId) {
    return;
  }

  const current = elements.snapshotList.querySelector('.is-highlighted');
  current?.classList.remove('is-highlighted');

  const target = elements.snapshotList.querySelector(`[data-item-id="${CSS.escape(snapshotId)}"]`);
  if (!target) {
    return;
  }

  target.classList.add('is-highlighted');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const storedState = loadStoredState();
if (storedState) {
  state.messages = storedState.messages;
  elements.fastMode.checked = storedState.fastMode;
  state.activeTab = storedState.activeTab || defaultTab;
  state.model = storedState.model || state.model;
  state.session.agentId = storedState.agentId || state.session.agentId;
  state.session.sessionUser = storedState.sessionUser || state.session.sessionUser;
}
setActiveTab(state.activeTab || defaultTab);

async function updateSessionSettings(nextSettings) {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionUser: state.session.sessionUser || 'command-center',
      ...nextSettings,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Session update failed');
  }

  applyRuntimeSnapshot(payload);
  state.model = payload.session?.selectedModel || payload.model || state.model;
  renderAll();
}

elements.sendButton.addEventListener('click', dispatchPrompt);
elements.resetButton.addEventListener('click', () => {
  resetSession().catch(() => {});
});
elements.fastMode.addEventListener('change', () => {
  renderMeta();
  persistState();
});
elements.tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
    persistState();
  });
});
elements.modelMenuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleStatusMenu('model');
});
elements.agentMenuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleStatusMenu('agent');
});
document.addEventListener('click', async (event) => {
  const option = event.target.closest('[data-menu-kind][data-menu-value]');
  if (!option) {
    closeStatusMenus();
    return;
  }

  const kind = option.dataset.menuKind;
  const value = option.dataset.menuValue;
  closeStatusMenus();

  if (kind === 'model') {
    if (!value || value === state.model) {
      return;
    }
    state.model = value;
    renderMeta();
    persistState();
    try {
      await updateSessionSettings({ model: value });
    } catch {}
    return;
  }

  if (kind === 'agent') {
    if (!value || value === state.session.agentId) {
      return;
    }
    state.session.agentId = value;
    renderMeta();
    persistState();
    try {
      await updateSessionSettings({ agentId: value });
    } catch {}
  }
});
elements.toolList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-snapshot-id]');
  if (!button) {
    return;
  }

  focusSnapshot(button.dataset.snapshotId);
});
elements.promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault();
    dispatchPrompt();
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    resetSession().catch(() => {});
  }
});
elements.promptInput.addEventListener('input', adjustPromptHeight);

adjustPromptHeight();
renderAll();

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
