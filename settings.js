const { ipcRenderer } = require('electron');

// Forward any JS errors to the terminal (main process console)
window.onerror = (msg, url, line, col, error) => {
  ipcRenderer.send('renderer-error', `settings.js:${line}:${col} ${msg}`);
};

const settingsForm = document.getElementById('settings-form');
const apiEndpoint = document.getElementById('api-endpoint');
const apiKey = document.getElementById('api-key');
const model = document.getElementById('model');
const elizaMode = document.getElementById('eliza-mode');
const enableAnimations = document.getElementById('enable-animations');
const character = document.getElementById('character');
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
const symbolicAlgebrite = document.getElementById('symbolic-algebrite');
const symbolicZ3 = document.getElementById('symbolic-z3');
const symbolicSwipl = document.getElementById('symbolic-swipl');
const mcpServerList = document.getElementById('mcp-server-list');
const mcpAddBtn = document.getElementById('mcp-add-btn');

// Extensions elements
const extensionsSection = document.getElementById('extensions-section');
const generalMcpServerList = document.getElementById('general-mcp-server-list');
const generalMcpAddBtn = document.getElementById('general-mcp-add-btn');

// Benchmark elements
const benchmarkSection = document.getElementById('benchmark-section');
const benchmarkModelStatus = document.getElementById('benchmark-model-status');
const checkLeaderboardBtn = document.getElementById('check-leaderboard-btn');
const runBenchmarkBtn = document.getElementById('run-benchmark-btn');
const benchmarkProgress = document.getElementById('benchmark-progress');
const benchmarkPhaseLabel = document.getElementById('benchmark-phase-label');
const benchmarkFill = document.getElementById('benchmark-fill');
const benchmarkProgressText = document.getElementById('benchmark-progress-text');
const benchmarkResultsDiv = document.getElementById('benchmark-results');
const benchmarkResultsTable = document.getElementById('benchmark-results-table');
const benchmarkOverall = document.getElementById('benchmark-overall');
const benchmarkConfirmModal = document.getElementById('benchmark-confirm');
const confirmBenchmarkBtn = document.getElementById('confirm-benchmark-run');
const cancelBenchmarkBtn = document.getElementById('cancel-benchmark-run');
const benchmarkConfirmClose = document.getElementById('benchmark-confirm-close');

// Load all settings from main process (single source of truth)
const saved = ipcRenderer.sendSync('get-settings');

apiEndpoint.value = saved['api-endpoint'] || '';
apiKey.value = saved['api-key'] || '';
model.value = saved['model'] || '';
elizaMode.checked = !!saved['eliza-mode'];
enableAnimations.checked = !!saved['enable-animations'];
if (character) character.value = saved['character'] || 'Clippy';
if (irobotMode) irobotMode.checked = !!saved['irobot-mode'];

// Load memory settings
intelligentMemory.checked = !!saved['intelligent-memory'];
embeddingProvider.value = saved['embedding-provider'] || 'local';
openaiEmbeddingApiKey.value = saved['openai-embedding-api-key'] || '';
openaiEmbeddingBaseUrl.value = saved['openai-embedding-base-url'] || 'https://api.openai.com/v1';
openaiEmbeddingModel.value = saved['openai-embedding-model'] || 'text-embedding-ada-002';
memoryReadNews.checked = !!saved['memory-read-news'];

// Load symbolic reasoning settings
symbolicEnabled.checked = !!saved['symbolic-enabled'];
symbolicAlgebrite.checked = !!saved['symbolic-algebrite'];
symbolicZ3.checked = !!saved['symbolic-z3'];
symbolicSwipl.checked = !!saved['symbolic-swipl'];

// MCP servers state
let mcpServers = saved['symbolic-mcp-servers'] || [];
let generalMcpServers = saved['mcp-servers'] || [];

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

// General MCP servers
function renderGeneralMcpServers() {
  generalMcpServerList.innerHTML = '';
  generalMcpServers.forEach((server, index) => {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.innerHTML = `
      <span class="mcp-name">${escapeHtml(server.name)}</span>
      <span class="mcp-url">${escapeHtml(server.url)}</span>
      <span class="mcp-desc">${escapeHtml(server.description || '')}</span>
      <button type="button" class="btn-remove" data-index="${index}">Remove</button>
    `;
    generalMcpServerList.appendChild(item);
  });
  generalMcpServerList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      generalMcpServers.splice(idx, 1);
      renderGeneralMcpServers();
    });
  });
}

renderGeneralMcpServers();

generalMcpAddBtn.addEventListener('click', () => {
  const nameInput = document.getElementById('general-mcp-new-name');
  const urlInput = document.getElementById('general-mcp-new-url');
  const descInput = document.getElementById('general-mcp-new-desc');
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const description = descInput.value.trim();
  if (!name || !url) return;
  generalMcpServers.push({ name, url, description });
  renderGeneralMcpServers();
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

// Disable MCP servers when i,Robot mode is active (safety measure)
function updateMcpAvailability() {
  const irobotOn = irobotMode && irobotMode.checked;

  // Reasoning MCP section
  const mcpReasoningWarning = document.getElementById('mcp-irobot-warning');
  const mcpReasoningFieldset = document.getElementById('mcp-reasoning-fieldset');
  const mcpReasoningAddRow = document.getElementById('mcp-reasoning-add-row');
  if (mcpReasoningWarning) mcpReasoningWarning.style.display = irobotOn ? 'block' : 'none';
  if (mcpReasoningAddRow) mcpReasoningAddRow.style.display = irobotOn ? 'none' : 'flex';
  if (mcpServerList) mcpServerList.classList.toggle('mcp-section-disabled', irobotOn);

  // General MCP section
  const generalMcpWarning = document.getElementById('general-mcp-irobot-warning');
  const generalMcpAddRow = document.getElementById('mcp-general-add-row');
  if (generalMcpWarning) generalMcpWarning.style.display = irobotOn ? 'block' : 'none';
  if (generalMcpAddRow) generalMcpAddRow.style.display = irobotOn ? 'none' : 'flex';
  if (generalMcpServerList) generalMcpServerList.classList.toggle('mcp-section-disabled', irobotOn);
}

if (irobotMode) irobotMode.addEventListener('change', updateMcpAvailability);
updateMcpAvailability(); // Apply on load

// Mode dependencies: API endpoint → eliza/memory/irobot, memory → irobot
function updateModeDependencies() {
  const hasEndpoint = apiEndpoint.value.trim() !== '';

  elizaMode.disabled = !hasEndpoint;
  enableAnimations.disabled = !hasEndpoint;
  intelligentMemory.disabled = !hasEndpoint;
  symbolicEnabled.disabled = !hasEndpoint;

  if (!hasEndpoint && enableAnimations.checked) {
    enableAnimations.checked = false;
  }

  if (!hasEndpoint && intelligentMemory.checked) {
    intelligentMemory.checked = false;
    updateMemoryOptionsVisibility();
  }

  const canIrobot = hasEndpoint && intelligentMemory.checked;
  if (irobotMode) {
    irobotMode.disabled = !canIrobot;
    if (!canIrobot && irobotMode.checked) irobotMode.checked = false;
  }

  extensionsSection.style.display = hasEndpoint ? 'block' : 'none';
  updateBenchmarkVisibility();
  updateMcpAvailability();
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

// Save settings on submit — send plain object to main process, no electron-store
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const settings = {
    'api-endpoint': apiEndpoint.value,
    'api-key': apiKey.value,
    'model': model.value,
    'eliza-mode': elizaMode.checked,
    'enable-animations': enableAnimations.checked,
    'irobot-mode': irobotMode ? irobotMode.checked : false,
    'intelligent-memory': intelligentMemory.checked,
    'embedding-provider': embeddingProvider.value,
    'openai-embedding-api-key': openaiEmbeddingApiKey.value,
    'openai-embedding-base-url': openaiEmbeddingBaseUrl.value,
    'openai-embedding-model': openaiEmbeddingModel.value,
    'memory-read-news': memoryReadNews.checked,
    'symbolic-enabled': symbolicEnabled.checked,
    'symbolic-algebrite': symbolicAlgebrite.checked,
    'symbolic-z3': symbolicZ3.checked,
    'symbolic-swipl': symbolicSwipl.checked,
    'symbolic-mcp-servers': mcpServers,
    'mcp-servers': generalMcpServers,
  };

  if (character) settings['character'] = character.value;

  // sendSync blocks until main process confirms save — prevents window.close()
  // from destroying the IPC channel before the message is delivered
  const saved = ipcRenderer.sendSync('save-settings', settings);
  console.log('Settings saved:', saved);
  window.close();
});

// ==================== Benchmark ====================

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

// Run benchmark button — show confirmation modal first
runBenchmarkBtn.addEventListener('click', () => {
  const endpoint = apiEndpoint.value.trim();
  const key = apiKey.value.trim();
  const modelName = model.value.trim();

  if (!endpoint || !key || !modelName) {
    benchmarkModelStatus.className = 'benchmark-status status-warn';
    benchmarkModelStatus.textContent = 'Please fill in API Endpoint, API Key, and Model to run the benchmark.';
    return;
  }

  // Show confirmation modal
  benchmarkConfirmModal.style.display = 'block';
});

// Benchmark confirmation modal handlers
function startBenchmarkRun() {
  benchmarkConfirmModal.style.display = 'none';
  runBenchmarkBtn.disabled = true;
  benchmarkProgress.style.display = 'block';
  benchmarkResultsDiv.style.display = 'none';
  benchmarkFill.style.width = '0%';
  benchmarkPhaseLabel.textContent = 'Preparing...';
  benchmarkProgressText.textContent = 'Downloading external datasets...';

  const endpoint = apiEndpoint.value.trim();
  const key = apiKey.value.trim();
  const modelName = model.value.trim();
  ipcRenderer.send('run-benchmark', { apiEndpoint: endpoint, apiKey: key, model: modelName });
}

function cancelBenchmarkConfirm() {
  benchmarkConfirmModal.style.display = 'none';
}

confirmBenchmarkBtn.addEventListener('click', startBenchmarkRun);
cancelBenchmarkBtn.addEventListener('click', cancelBenchmarkConfirm);
benchmarkConfirmClose.addEventListener('click', cancelBenchmarkConfirm);

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

// Benchmark progress updates — handles setup, irobot, and external phases
const TOTAL_IROBOT_CATEGORIES = 8;
const EXTERNAL_BENCHMARK_NAMES = { hle: 'HLE', tau2: 'Tau2', arc_agi2: 'ARC-AGI-2', vending2: 'Vending Bench 2' };
const TOTAL_EXTERNAL = Object.keys(EXTERNAL_BENCHMARK_NAMES).length;
let irobotCategoriesDone = 0;
let externalBenchmarksDone = 0;

ipcRenderer.on('benchmark-progress', (event, data) => {
  const phase = data.phase || 'irobot';

  if (phase === 'setup') {
    benchmarkPhaseLabel.textContent = 'Setup';
    benchmarkProgressText.textContent = data.message || 'Preparing...';
    benchmarkFill.style.width = '0%';
    irobotCategoriesDone = 0;
    externalBenchmarksDone = 0;
    return;
  }

  if (phase === 'irobot') {
    benchmarkPhaseLabel.textContent = 'Phase 1/2: i,Robot Categories';
    if (data.status === 'done') irobotCategoriesDone++;
    // i,Robot phase is 0-70% of the bar
    const pct = Math.round((irobotCategoriesDone / TOTAL_IROBOT_CATEGORIES) * 70);
    benchmarkFill.style.width = pct + '%';
    const label = data.category || '';
    const scoreText = data.score !== undefined ? ` (${data.score}/100)` : '';
    benchmarkProgressText.textContent = `${label}: ${data.status}${scoreText}`;
    return;
  }

  if (phase === 'external') {
    benchmarkPhaseLabel.textContent = 'Phase 2/2: External Benchmarks';
    const benchLabel = EXTERNAL_BENCHMARK_NAMES[data.benchmark] || data.benchmark;

    if (data.status === 'done' || data.status === 'error') {
      externalBenchmarksDone++;
    }

    // External phase is 70-100% of the bar
    const pct = 70 + Math.round((externalBenchmarksDone / TOTAL_EXTERNAL) * 30);
    benchmarkFill.style.width = pct + '%';

    if (data.current && data.total) {
      benchmarkProgressText.textContent = `${benchLabel}: ${data.current}/${data.total}`;
    } else {
      const scoreText = data.score !== undefined ? ` (${data.score}/100)` : '';
      benchmarkProgressText.textContent = `${benchLabel}: ${data.status}${scoreText}`;
    }
    return;
  }
});

// Benchmark complete
ipcRenderer.on('benchmark-complete', (event, results) => {
  runBenchmarkBtn.disabled = false;
  benchmarkProgress.style.display = 'none';
  benchmarkResultsDiv.style.display = 'block';

  // Build results table — i,Robot categories
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

  let tableHtml = '<table><tr><th colspan="3" style="text-align:left">i,Robot Categories</th></tr>';
  tableHtml += '<tr><th>Category</th><th>Score</th><th>Passed</th></tr>';
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

  // External benchmarks
  if (results.external && Object.keys(results.external).length > 0) {
    const extLabels = { hle: 'HLE', tau2: 'Tau2', arc_agi2: 'ARC-AGI-2', vending2: 'Vending Bench 2' };
    tableHtml += '<tr><th colspan="3" style="text-align:left;padding-top:10px">External Benchmarks</th></tr>';
    tableHtml += '<tr><th>Benchmark</th><th>Score</th><th>Items</th></tr>';
    for (const [bench, label] of Object.entries(extLabels)) {
      const ext = results.external[bench];
      if (ext) {
        const scoreColor = ext.score >= 60 ? '#155724' : ext.score >= 40 ? '#856404' : '#721c24';
        const status = ext.skipped ? 'skipped' : `${ext.count}`;
        tableHtml += `<tr>
          <td>${label}</td>
          <td style="color:${scoreColor};font-weight:bold">${ext.skipped ? '-' : ext.score + '/100'}</td>
          <td>${status}</td>
        </tr>`;
      }
    }
  }

  tableHtml += '</table>';
  benchmarkResultsTable.innerHTML = tableHtml;

  // Overall scores
  const combined = results.combinedOverall || results.overall;
  let overallHtml = `i,Robot: ${results.overall}/100`;
  if (results.externalOverall !== undefined) {
    overallHtml += ` | External: ${results.externalOverall}/100`;
  }
  overallHtml += ` | Combined: ${combined}/100`;
  if (results.mindFlow) overallHtml += ' (Mind Flow)';
  benchmarkOverall.textContent = overallHtml;

  if (combined >= 60) {
    benchmarkOverall.className = 'score-high';
  } else if (combined >= 40) {
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
