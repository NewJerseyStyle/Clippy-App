const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, powerMonitor } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const { HierarchicalRAGComplete } = require('./rag-system/rag_complete_integration.js');
const { ContinuousAgent } = require('./rag-system/continuous_agent.js');
const { SymbolicReasoningManager } = require('./rag-system/symbolic_reasoning.js');
const { IRobotBenchmark, RECOMMENDED_MODELS } = require('./rag-system/benchmark.js');
const { LeaderboardClient, buildModelWarning } = require('./rag-system/leaderboard_client.js');
const { downloadAll, datasetsExist, DEFAULT_OUTPUT_DIR } = require('./benchmark/download_datasets.js');

const store = new Store();
const leaderboardClient = new LeaderboardClient({ verbose: true });

let tray = null;
let mainWindow = null;
let settingsWindow = null;
let memory = null;
let memoryStatus = 'idle';
let learningInterval = null;
let continuousAgent = null;
let symbolicReasoning = null;
let chatHistoryWindow = null;
let autoHideInterval = null;
let autoHidden = false;
let currentCharacter = store.get('character', 'Clippy');

async function initializeMemory() {
  if (memory) return;
  memory = new HierarchicalRAGComplete({
    embeddingProvider: store.get('embedding-provider', 'local'),
    openaiApiKey: store.get('openai-embedding-api-key', ''),
    openaiApiBaseUrl: store.get('openai-embedding-base-url', 'https://api.openai.com/v1'),
    openaiEmbeddingModel: store.get('openai-embedding-model', 'text-embedding-ada-002'),
  });
  await memory.initialize();
  console.log('Memory initialized');
  if (store.get('intelligent-memory')) {
    startBackgroundLearning();
  }
}

function startBackgroundLearning() {
  if (learningInterval) return;
  if (store.get('memory-read-news')) {
    learningInterval = setInterval(async () => {
      memoryStatus = 'learning';
      if (settingsWindow) {
        settingsWindow.webContents.send('memory-status-update', memoryStatus);
      }
      await memory.addNode({ content: 'New news article about AI', context: 'news', layer: 1, parentId: 'root' });
      memoryStatus = 'idle';
      if (settingsWindow) {
        settingsWindow.webContents.send('memory-status-update', memoryStatus);
      }
    }, 60000); // Learn every minute
  }
}

function stopBackgroundLearning() {
  if (learningInterval) {
    clearInterval(learningInterval);
    learningInterval = null;
  }
}

async function initializeSymbolicReasoning() {
  if (symbolicReasoning) {
    await symbolicReasoning.dispose();
    symbolicReasoning = null;
  }

  if (!store.get('symbolic-enabled')) return null;

  const baseUrl = store.get('api-endpoint', '');
  const apiKey = store.get('api-key', '');
  if (!baseUrl || !apiKey) {
    console.log('Symbolic reasoning enabled but no API configured');
    return null;
  }

  // Disable MCP servers when i,Robot mode is active (safety measure)
  const irobotActive = store.get('irobot-mode', false);
  const mcpServers = irobotActive ? [] : store.get('symbolic-mcp-servers', []);
  if (irobotActive && store.get('symbolic-mcp-servers', []).length > 0) {
    console.log('MCP servers disabled: i,Robot mode is active');
  }

  symbolicReasoning = new SymbolicReasoningManager({
    openaiBaseUrl: baseUrl.replace(/\/chat\/completions$/, ''),
    openaiApiKey: apiKey,
    openaiModel: store.get('model', 'gpt-4o-mini'),
    enableAlgebrite: store.get('symbolic-algebrite', false),
    enableZ3: store.get('symbolic-z3', false),
    enableSwipl: store.get('symbolic-swipl', false),
    mcpServers: mcpServers,
    verbose: true
  });

  await symbolicReasoning.initialize();
  console.log('Symbolic reasoning initialized:', symbolicReasoning.getAvailableEngines());
  return symbolicReasoning;
}

async function startIRobotMode() {
  if (continuousAgent) return;
  await initializeMemory();
  await initializeSymbolicReasoning();

  continuousAgent = new ContinuousAgent({
    apiKey: store.get('api-key'),
    longTermMemory: memory,
    symbolicReasoning: symbolicReasoning,
    webSearchEnabled: store.get('web-search-enabled', false),
    verbose: true,
    cycleDelay: 1000,
  });

  continuousAgent.on('message', (msg) => {
    if (mainWindow) {
      mainWindow.webContents.send('clippy-message', msg);
    }
  });

  await continuousAgent.start();
}

function stopIRobotMode() {
  if (continuousAgent) {
    continuousAgent.stop();
    continuousAgent = null;
  }
}

function createMainWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 500,
    height: 500,
    x: screenW - 500 - 80,
    y: screenH - 500 - 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.removeMenu();
  settingsWindow.loadFile('settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function checkForUpdates() {
  const owner = "NewJerseyStyle";
  const repo = "Clippy-App";
  if (owner && repo) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: owner,
      repo: repo
    });
    autoUpdater.checkForUpdatesAndNotify();
  } else {
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: "Invalid GitHub repository format. Please use 'owner/repo'."
    });
  }
}

app.on('ready', async () => {
  Store.initRenderer();
  createMainWindow();
  if (store.get('intelligent-memory')) {
    await initializeMemory();
  }
  if (store.get('irobot-mode')) {
    await startIRobotMode();
  }

  tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide Clippy', click: () => {
      if (mainWindow.isVisible()) {
        mainWindow.webContents.send('hide-with-animation');
      } else {
        mainWindow.show();
        mainWindow.webContents.send('show-agent');
        autoHidden = false;
      }
    }},
    { label: 'Settings', click: () => { if (settingsWindow === null) { createSettingsWindow(); } else { settingsWindow.focus(); } } },
    { label: 'Check for Updates', click: () => { checkForUpdates(); } },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Clippy');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.webContents.send('hide-with-animation');
      } else {
        mainWindow.show();
        mainWindow.webContents.send('show-agent');
        autoHidden = false;
      }
    }
  });

  // Auto-hide after 5 minutes of system idle
  autoHideInterval = setInterval(() => {
    if (!mainWindow || !mainWindow.isVisible()) return;
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime > 300 && !autoHidden) {
      autoHidden = true;
      mainWindow.webContents.send('hide-with-animation');
    } else if (idleTime < 10) {
      autoHidden = false;
    }
  }, 30000);
});

app.on('window-all-closed', () => {
  // Don't quit — app lives in tray
});

app.on('before-quit', async () => {
  if (autoHideInterval) clearInterval(autoHideInterval);
  stopIRobotMode();
  if (symbolicReasoning) {
    await symbolicReasoning.dispose();
    symbolicReasoning = null;
  }
  if (memory) {
    await memory.dispose();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

ipcMain.on('show-context-menu', () => {
  const irobotOn = store.get('irobot-mode', false);
  const menu = Menu.buildFromTemplate([
    { label: 'Chat History', click: () => { createChatHistoryWindow(); } },
    { label: 'New Conversation', visible: !irobotOn, click: () => {
      const history = store.get('chat-history', []);
      history.push({ role: 'separator', timestamp: new Date().toISOString() });
      store.set('chat-history', history);
      if (mainWindow) mainWindow.webContents.send('new-conversation');
    }},
    { type: 'separator' },
    { label: 'Settings', click: () => { if (settingsWindow === null) { createSettingsWindow(); } else { settingsWindow.focus(); } } },
    { label: 'Check for Updates', click: () => { checkForUpdates(); } },
    { type: 'separator' },
    { label: 'Hide Clippy', click: () => { if (mainWindow) mainWindow.webContents.send('hide-with-animation'); } },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  menu.popup({ window: mainWindow });
});

function createChatHistoryWindow() {
  if (chatHistoryWindow) {
    chatHistoryWindow.focus();
    return;
  }
  chatHistoryWindow = new BrowserWindow({
    width: 420,
    height: 500,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  chatHistoryWindow.removeMenu();
  chatHistoryWindow.loadFile('chat-history.html');
  chatHistoryWindow.on('closed', () => {
    chatHistoryWindow = null;
  });
}

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options || {});
  }
});

ipcMain.on('renderer-error', (event, msg) => {
  console.error('RENDERER ERROR:', msg);
});

ipcMain.on('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('check-for-updates', () => {
  checkForUpdates();
});

// Return all settings to renderer (used by settings.js via sendSync)
ipcMain.on('get-settings', (event) => {
  event.returnValue = store.store;
});

ipcMain.on('save-settings', (event, settings) => {
  // Save all settings synchronously — must complete before renderer closes
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }

  // Unblock the renderer so window.close() can proceed
  event.returnValue = true;

  // Async side effects run after the renderer is unblocked
  (async () => {
    // Notify main window to reload settings from store
    if (mainWindow) {
      mainWindow.webContents.send('settings-changed');
    }

    if (settings['intelligent-memory']) {
      await initializeMemory();
      startBackgroundLearning();
    } else {
      stopBackgroundLearning();
    }

    if (settings['irobot-mode']) {
      if (continuousAgent) {
        await initializeSymbolicReasoning();
        continuousAgent.symbolicReasoning = symbolicReasoning;
      } else {
        await startIRobotMode();
      }
    } else {
      stopIRobotMode();
    }
  })();
});

ipcMain.on('clear-memory', async () => {
  if (continuousAgent) {
    stopIRobotMode();
  }
  if (memory) {
    await memory.dispose();
    memory = null;
  }
  await initializeMemory();
  if (store.get('irobot-mode')) {
    await startIRobotMode();
  }
  dialog.showMessageBox({ type: 'info', title: 'Memory Cleared', message: 'The intelligent memory has been cleared.' });
});

ipcMain.on('get-memory-status', (event) => {
  event.sender.send('memory-status-update', memoryStatus);
});

ipcMain.handle('search-memory', async (event, query) => {
  if (memory && store.get('intelligent-memory')) {
    try {
      const results = await memory.traverseSearch(query);
      return results;
    } catch (error) { 
      console.error('Error searching memory:', error);
      return [];
    }
  }
  return [];
});

ipcMain.on('user-message', (event, message) => {
  if (continuousAgent) {
    continuousAgent.onUserMessage(message);
  }
});

// ==================== Benchmark IPC ====================

ipcMain.on('check-model-leaderboard', async (event, modelName) => {
  try {
    const result = await leaderboardClient.checkModel(modelName);
    const message = buildModelWarning(modelName, result, RECOMMENDED_MODELS);
    event.sender.send('model-leaderboard-result', {
      found: result.found,
      record: result.record || null,
      message,
      error: result.error || null
    });
  } catch (error) {
    event.sender.send('model-leaderboard-result', {
      found: false,
      record: null,
      message: `Could not reach leaderboard: ${error.message}\n\nFor best results, we recommend: DeepSeek V3.2, GPT-5.2, Claude Sonnet 4.5, or GLM-4.7.`,
      error: error.message
    });
  }
});

ipcMain.on('run-benchmark', async (event, config) => {
  try {
    // Auto-download external datasets if not present
    if (!datasetsExist(DEFAULT_OUTPUT_DIR)) {
      event.sender.send('benchmark-progress', {
        phase: 'setup', status: 'running', message: 'Downloading external benchmark datasets...'
      });
      try {
        await downloadAll(DEFAULT_OUTPUT_DIR);
        event.sender.send('benchmark-progress', {
          phase: 'setup', status: 'done', message: 'External datasets ready'
        });
      } catch (dlError) {
        console.error('Dataset download failed (non-fatal):', dlError.message);
        event.sender.send('benchmark-progress', {
          phase: 'setup', status: 'done', message: 'Using fallback datasets'
        });
      }
    }

    // Try to download external dataset from HuggingFace (for i,Robot tests)
    const dataset = await leaderboardClient.downloadDataset();

    const benchmark = new IRobotBenchmark({
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model: config.model,
      externalDataset: dataset,
      verbose: true,
      // New options for mind flow and external benchmarks
      useMindFlow: config.useMindFlow !== undefined ? config.useMindFlow : true,
      externalBenchmarks: config.externalBenchmarks || ['hle', 'tau2', 'arc_agi2', 'vending2'],
      externalDataDir: DEFAULT_OUTPUT_DIR,
      embeddingOptions: {
        embeddingProvider: store.get('embedding-provider', 'local'),
        openaiApiKey: store.get('openai-embedding-api-key', ''),
        openaiApiBaseUrl: store.get('openai-embedding-base-url', 'https://api.openai.com/v1'),
        openaiEmbeddingModel: store.get('openai-embedding-model', 'text-embedding-ada-002'),
      },
    });

    let categoriesDone = 0;
    benchmark.on('progress', (progress) => {
      if (progress.status === 'done') categoriesDone++;
      event.sender.send('benchmark-progress', {
        ...progress,
        categoriesDone
      });
    });

    const results = await benchmark.runAll();

    // Upload results to leaderboard
    const uploadResult = await leaderboardClient.uploadResults(results);
    console.log('Benchmark upload:', uploadResult.message);

    event.sender.send('benchmark-complete', results);
  } catch (error) {
    console.error('Benchmark error:', error);
    event.sender.send('benchmark-error', error.message);
  }
});

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({ type: 'info', title: 'Update Available', message: 'A new version of Clippy is available...' });
});

autoUpdater.on('update-downloaded', (info) => {
  const dialogOpts = { type: 'info', buttons: ['Restart', 'Later'], title: 'Application Update', message: `A new version has been downloaded. Restart to apply updates.` };
  dialog.showMessageBox(dialogOpts).then((returnValue) => { if (returnValue.response === 0) autoUpdater.quitAndInstall(); });
});

autoUpdater.on('error', (err) => {
  dialog.showMessageBox({ type: 'error', title: 'Update Error', message: `There was a problem updating: ${err}` });
});
