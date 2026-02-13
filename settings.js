const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

const settingsForm = document.getElementById('settings-form');
const apiEndpoint = document.getElementById('api-endpoint');
const apiKey = document.getElementById('api-key');
const model = document.getElementById('model');
const elizaMode = document.getElementById('eliza-mode');
const checkForUpdatesBtn = document.getElementById('check-for-updates');
const irobotMode = document.getElementById('irobot-mode');
const irobotWarningModal = document.getElementById('irobot-warning');
const confirmIrobotBtn = document.getElementById('confirm-irobot-mode');
const cancelIrobotBtn = document.getElementById('cancel-irobot-mode');
const closeWarningBtn = document.querySelector('#irobot-warning .close-button');

// Intelligent Memory elements
const intelligentMemory = document.getElementById('intelligent-memory');
const memoryOptions = document.getElementById('memory-options');
const embeddingProvider = document.getElementById('embedding-provider');
const openaiEmbeddingOptions = document.getElementById('openai-embedding-options');
const openaiEmbeddingApiKey = document.getElementById('openai-embedding-api-key');
const openaiEmbeddingBaseUrl = document.getElementById('openai-embedding-base-url');
const memoryReadNews = document.getElementById('memory-read-news');
const clearMemoryBtn = document.getElementById('clear-memory');
const memoryStatus = document.getElementById('memory-status');

// Symbolic Reasoning elements
const symbolicEnabled = document.getElementById('symbolic-enabled');
const symbolicOptions = document.getElementById('symbolic-options');
const symbolicOpenaiBaseUrl = document.getElementById('symbolic-openai-base-url');
const symbolicOpenaiApiKey = document.getElementById('symbolic-openai-api-key');
const symbolicOpenaiModel = document.getElementById('symbolic-openai-model');
const symbolicAlgebrite = document.getElementById('symbolic-algebrite');
const symbolicZ3 = document.getElementById('symbolic-z3');
const symbolicSwipl = document.getElementById('symbolic-swipl');
const mcpServerList = document.getElementById('mcp-server-list');
const mcpAddBtn = document.getElementById('mcp-add-btn');

// Load saved settings
apiEndpoint.value = store.get('api-endpoint', '');
apiKey.value = store.get('api-key', '');
model.value = store.get('model', '');
elizaMode.checked = store.get('eliza-mode', false);
if (irobotMode) irobotMode.checked = store.get('irobot-mode', false);

// Load memory settings
intelligentMemory.checked = store.get('intelligent-memory', false);
embeddingProvider.value = store.get('embedding-provider', 'local');
openaiEmbeddingApiKey.value = store.get('openai-embedding-api-key', '');
openaiEmbeddingBaseUrl.value = store.get('openai-embedding-base-url', 'https://api.openai.com/v1');
memoryReadNews.checked = store.get('memory-read-news', false);

// Load symbolic reasoning settings
symbolicEnabled.checked = store.get('symbolic-enabled', false);
symbolicOpenaiBaseUrl.value = store.get('symbolic-openai-base-url', '');
symbolicOpenaiApiKey.value = store.get('symbolic-openai-api-key', '');
symbolicOpenaiModel.value = store.get('symbolic-openai-model', 'gpt-4o-mini');
symbolicAlgebrite.checked = store.get('symbolic-algebrite', false);
symbolicZ3.checked = store.get('symbolic-z3', false);
symbolicSwipl.checked = store.get('symbolic-swipl', false);

// MCP servers state
let mcpServers = store.get('symbolic-mcp-servers', []);

function renderMcpServers() {
  mcpServerList.innerHTML = '';
  mcpServers.forEach((server, index) => {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.innerHTML = `
      <span class="mcp-name">${escapeHtml(server.name)}</span>
      <span class="mcp-url">${escapeHtml(server.url)}</span>
      <span class="mcp-desc">${escapeHtml(server.description || '')}</span>
      <button type="button" class="btn-remove" data-index="${index}">Remove</button>
    `;
    mcpServerList.appendChild(item);
  });

  // Attach remove handlers
  mcpServerList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      mcpServers.splice(idx, 1);
      renderMcpServers();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderMcpServers();

// Add MCP server
mcpAddBtn.addEventListener('click', () => {
  const nameInput = document.getElementById('mcp-new-name');
  const urlInput = document.getElementById('mcp-new-url');
  const descInput = document.getElementById('mcp-new-desc');

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const description = descInput.value.trim();

  if (!name || !url) return;

  mcpServers.push({ name, url, description });
  renderMcpServers();

  nameInput.value = '';
  urlInput.value = '';
  descInput.value = '';
});

function updateMemoryOptionsVisibility() {
  if (intelligentMemory.checked) {
    memoryOptions.style.display = 'block';
    if (embeddingProvider.value === 'openai') {
      openaiEmbeddingOptions.style.display = 'block';
    } else {
      openaiEmbeddingOptions.style.display = 'none';
    }
  } else {
    memoryOptions.style.display = 'none';
  }
}

intelligentMemory.addEventListener('change', updateMemoryOptionsVisibility);
embeddingProvider.addEventListener('change', updateMemoryOptionsVisibility);
updateMemoryOptionsVisibility();

// Toggle symbolic reasoning options visibility
function updateSymbolicVisibility() {
  if (symbolicEnabled.checked) {
    symbolicOptions.style.display = 'block';
  } else {
    symbolicOptions.style.display = 'none';
  }
}
symbolicEnabled.addEventListener('change', updateSymbolicVisibility);
updateSymbolicVisibility(); // Apply on load

// "I, Robot" Mode Warning
if (irobotMode && irobotWarningModal) {
  irobotMode.addEventListener('change', (event) => {
    if (event.target.checked) {
      event.preventDefault();
      irobotWarningModal.style.display = 'block';
    }
  });

  if (confirmIrobotBtn) {
    confirmIrobotBtn.addEventListener('click', () => {
      irobotMode.checked = true;
      irobotWarningModal.style.display = 'none';
    });
  }

  if (cancelIrobotBtn) {
    cancelIrobotBtn.addEventListener('click', () => {
      irobotMode.checked = false;
      irobotWarningModal.style.display = 'none';
    });
  }

  if (closeWarningBtn) {
    closeWarningBtn.addEventListener('click', () => {
      irobotMode.checked = false;
      irobotWarningModal.style.display = 'none';
    });
  }
}

// Save settings on submit
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  store.set('api-endpoint', apiEndpoint.value);
  store.set('api-key', apiKey.value);
  store.set('model', model.value);
  store.set('eliza-mode', elizaMode.checked);
  if (irobotMode) store.set('irobot-mode', irobotMode.checked);

  // Save memory settings
  store.set('intelligent-memory', intelligentMemory.checked);
  store.set('embedding-provider', embeddingProvider.value);
  store.set('openai-embedding-api-key', openaiEmbeddingApiKey.value);
  store.set('openai-embedding-base-url', openaiEmbeddingBaseUrl.value);
  store.set('memory-read-news', memoryReadNews.checked);

  // Save symbolic reasoning settings
  store.set('symbolic-enabled', symbolicEnabled.checked);
  store.set('symbolic-openai-base-url', symbolicOpenaiBaseUrl.value);
  store.set('symbolic-openai-api-key', symbolicOpenaiApiKey.value);
  store.set('symbolic-openai-model', symbolicOpenaiModel.value);
  store.set('symbolic-algebrite', symbolicAlgebrite.checked);
  store.set('symbolic-z3', symbolicZ3.checked);
  store.set('symbolic-swipl', symbolicSwipl.checked);
  store.set('symbolic-mcp-servers', mcpServers);

  ipcRenderer.send('settings-updated', store.store);
  window.close();
});

// Check for updates
checkForUpdatesBtn.addEventListener('click', () => {
  ipcRenderer.send('check-for-updates');
});

// Clear memory
clearMemoryBtn.addEventListener('click', () => {
  ipcRenderer.send('clear-memory');
});

// Update memory status display
ipcRenderer.on('memory-status-update', (event, status) => {
  memoryStatus.textContent = status;
});

// Initial status update
ipcRenderer.send('get-memory-status');

