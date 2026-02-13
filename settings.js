const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

const settingsForm = document.getElementById('settings-form');
const apiEndpoint = document.getElementById('api-endpoint');
const apiKey = document.getElementById('api-key');
const model = document.getElementById('model');
const elizaMode = document.getElementById('eliza-mode');
const enableAnimations = document.getElementById('enable-animations');
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
const openaiEmbeddingModel = document.getElementById('openai-embedding-model');
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
enableAnimations.checked = store.get('enable-animations', false);
if (irobotMode) irobotMode.checked = store.get('irobot-mode', false);

// Load memory settings
intelligentMemory.checked = store.get('intelligent-memory', false);
embeddingProvider.value = store.get('embedding-provider', 'local');
openaiEmbeddingApiKey.value = store.get('openai-embedding-api-key', '');
openaiEmbeddingBaseUrl.value = store.get('openai-embedding-base-url', 'https://api.openai.com/v1');
openaiEmbeddingModel.value = store.get('openai-embedding-model', 'text-embedding-ada-002');
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

// Mode dependencies: API endpoint → eliza/memory/irobot, memory → irobot
function updateModeDependencies() {
  const hasEndpoint = apiEndpoint.value.trim() !== '';

  elizaMode.disabled = !hasEndpoint;
  intelligentMemory.disabled = !hasEndpoint;

  if (!hasEndpoint && intelligentMemory.checked) {
    intelligentMemory.checked = false;
    updateMemoryOptionsVisibility();
  }

  const canIrobot = hasEndpoint && intelligentMemory.checked;
  if (irobotMode) {
    irobotMode.disabled = !canIrobot;
    if (!canIrobot && irobotMode.checked) irobotMode.checked = false;
  }

  updateBenchmarkVisibility();
}

apiEndpoint.addEventListener('input', updateModeDependencies);
intelligentMemory.addEventListener('change', updateModeDependencies);
updateModeDependencies();

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
  store.set('enable-animations', enableAnimations.checked);
  if (irobotMode) store.set('irobot-mode', irobotMode.checked);

  // Save memory settings
  store.set('intelligent-memory', intelligentMemory.checked);
  store.set('embedding-provider', embeddingProvider.value);
  store.set('openai-embedding-api-key', openaiEmbeddingApiKey.value);
  store.set('openai-embedding-base-url', openaiEmbeddingBaseUrl.value);
  store.set('openai-embedding-model', openaiEmbeddingModel.value);
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

// ==================== Benchmark ====================

const benchmarkSection = document.getElementById('benchmark-section');
const benchmarkModelStatus = document.getElementById('benchmark-model-status');
const checkLeaderboardBtn = document.getElementById('check-leaderboard-btn');
const runBenchmarkBtn = document.getElementById('run-benchmark-btn');
const benchmarkProgress = document.getElementById('benchmark-progress');
const benchmarkFill = document.getElementById('benchmark-fill');
const benchmarkProgressText = document.getElementById('benchmark-progress-text');
const benchmarkResultsDiv = document.getElementById('benchmark-results');
const benchmarkResultsTable = document.getElementById('benchmark-results-table');
const benchmarkOverall = document.getElementById('benchmark-overall');

// Show benchmark section when i,Robot mode is on and API is configured
function updateBenchmarkVisibility() {
  const hasApi = apiEndpoint.value.trim() && apiKey.value.trim() && model.value.trim();
  const irobotOn = irobotMode && irobotMode.checked;
  benchmarkSection.style.display = (hasApi || irobotOn) ? 'block' : 'none';
}

// Listen for changes that affect benchmark visibility
if (irobotMode) irobotMode.addEventListener('change', updateBenchmarkVisibility);
apiEndpoint.addEventListener('input', updateBenchmarkVisibility);
apiKey.addEventListener('input', updateBenchmarkVisibility);
model.addEventListener('input', updateBenchmarkVisibility);
updateBenchmarkVisibility();

// Auto-check leaderboard when model changes (debounced)
let modelCheckTimeout = null;
model.addEventListener('input', () => {
  clearTimeout(modelCheckTimeout);
  modelCheckTimeout = setTimeout(() => {
    const modelName = model.value.trim();
    if (modelName && apiEndpoint.value.trim()) {
      ipcRenderer.send('check-model-leaderboard', modelName);
    }
  }, 800);
});

// Check leaderboard button
checkLeaderboardBtn.addEventListener('click', () => {
  const modelName = model.value.trim();
  if (!modelName) {
    benchmarkModelStatus.className = 'benchmark-status status-warn';
    benchmarkModelStatus.textContent = 'Please enter a model name first.';
    return;
  }
  benchmarkModelStatus.className = 'benchmark-status status-info';
  benchmarkModelStatus.textContent = 'Checking leaderboard...';
  ipcRenderer.send('check-model-leaderboard', modelName);
});

// Run benchmark button
runBenchmarkBtn.addEventListener('click', () => {
  const endpoint = apiEndpoint.value.trim();
  const key = apiKey.value.trim();
  const modelName = model.value.trim();

  if (!endpoint || !key || !modelName) {
    benchmarkModelStatus.className = 'benchmark-status status-warn';
    benchmarkModelStatus.textContent = 'Please fill in API Endpoint, API Key, and Model to run the benchmark.';
    return;
  }

  runBenchmarkBtn.disabled = true;
  benchmarkProgress.style.display = 'block';
  benchmarkResultsDiv.style.display = 'none';
  benchmarkFill.style.width = '0%';
  benchmarkProgressText.textContent = 'Starting benchmark...';

  ipcRenderer.send('run-benchmark', { apiEndpoint: endpoint, apiKey: key, model: modelName });
});

// Leaderboard check result
ipcRenderer.on('model-leaderboard-result', (event, data) => {
  benchmarkModelStatus.textContent = data.message;
  if (data.found && data.record?.overall >= 60) {
    benchmarkModelStatus.className = 'benchmark-status status-ok';
  } else if (data.found && data.record?.overall < 60) {
    benchmarkModelStatus.className = 'benchmark-status status-warn';
  } else if (data.error) {
    benchmarkModelStatus.className = 'benchmark-status status-info';
  } else {
    benchmarkModelStatus.className = 'benchmark-status status-warn';
  }
});

// Benchmark progress updates
ipcRenderer.on('benchmark-progress', (event, data) => {
  const totalCategories = 8;
  const categoriesDone = data.categoriesDone || 0;
  const pct = Math.round((categoriesDone / totalCategories) * 100);
  benchmarkFill.style.width = pct + '%';
  benchmarkProgressText.textContent = `${data.category}: ${data.status} ${data.score !== undefined ? '(' + data.score + '/100)' : ''}`;
});

// Benchmark complete
ipcRenderer.on('benchmark-complete', (event, results) => {
  runBenchmarkBtn.disabled = false;
  benchmarkProgress.style.display = 'none';
  benchmarkResultsDiv.style.display = 'block';

  // Build results table
  const categoryLabels = {
    memory_maintenance: 'Memory Maintenance',
    self_consciousness: 'Self-Consciousness',
    meaningful_response: 'Meaningful Response',
    complex_problem: 'Complex Problem',
    memory_building: 'Memory Building',
    knowledge_production: 'Knowledge Production',
    skill_application: 'Skill Application',
    checkpoint_handling: 'Checkpoint Handling'
  };

  let tableHtml = '<table><tr><th>Category</th><th>Score</th><th>Passed</th></tr>';
  for (const [cat, label] of Object.entries(categoryLabels)) {
    const catResult = results.categories[cat];
    if (catResult) {
      const scoreColor = catResult.score >= 60 ? '#155724' : catResult.score >= 40 ? '#856404' : '#721c24';
      tableHtml += `<tr>
        <td>${label}</td>
        <td style="color:${scoreColor};font-weight:bold">${catResult.score}/100</td>
        <td>${catResult.passed}/${catResult.count}</td>
      </tr>`;
    }
  }
  tableHtml += '</table>';
  benchmarkResultsTable.innerHTML = tableHtml;

  // Overall score
  benchmarkOverall.textContent = `Overall Score: ${results.overall}/100`;
  if (results.overall >= 60) {
    benchmarkOverall.className = 'score-high';
  } else if (results.overall >= 40) {
    benchmarkOverall.className = 'score-mid';
  } else {
    benchmarkOverall.className = 'score-low';
  }
});

// Benchmark error
ipcRenderer.on('benchmark-error', (event, error) => {
  runBenchmarkBtn.disabled = false;
  benchmarkProgress.style.display = 'none';
  benchmarkModelStatus.className = 'benchmark-status status-error';
  benchmarkModelStatus.textContent = `Benchmark failed: ${error}`;
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

