const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const { HierarchicalRAGComplete } = require('./rag-system/rag_complete_integration.js');
const { ContinuousAgent } = require('./rag-system/continuous_agent.js');
const { SymbolicReasoningManager } = require('./rag-system/symbolic_reasoning.js');
const { IRobotBenchmark, RECOMMENDED_MODELS } = require('./rag-system/benchmark.js');
const { LeaderboardClient, buildModelWarning } = require('./rag-system/leaderboard_client.js');

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

  const baseUrl = store.get('symbolic-openai-base-url', '');
  const apiKey = store.get('symbolic-openai-api-key', '');
  if (!baseUrl || !apiKey) {
    console.log('Symbolic reasoning enabled but no OpenAI-compatible API configured');
    return null;
  }

  symbolicReasoning = new SymbolicReasoningManager({
    openaiBaseUrl: baseUrl,
    openaiApiKey: apiKey,
    openaiModel: store.get('symbolic-openai-model', 'gpt-4o-mini'),
    enableAlgebrite: store.get('symbolic-algebrite', false),
    enableZ3: store.get('symbolic-z3', false),
    enableSwipl: store.get('symbolic-swipl', false),
    mcpServers: store.get('symbolic-mcp-servers', []),
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
    width: 350,
    height: 400,
    x: screenW - 350,
    y: screenH - 400,
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
  createMainWindow();
  if (store.get('intelligent-memory')) {
    await initializeMemory();
  }
  if (store.get('irobot-mode')) {
    await startIRobotMode();
  }

  tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide Clippy', click: () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } },
    { label: 'Settings', click: () => { if (settingsWindow === null) { createSettingsWindow(); } else { settingsWindow.focus(); } } },
    { label: 'Check for Updates', click: () => { checkForUpdates(); } },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Clippy');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit — app lives in tray
});

app.on('before-quit', async () => {
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

ipcMain.on('check-for-updates', () => {
  checkForUpdates();
});

ipcMain.on('settings-updated', async (event, settings) => {
  if (settings['intelligent-memory']) {
    await initializeMemory();
    startBackgroundLearning();
  } else {
    stopBackgroundLearning();
  }

  // Reinitialize symbolic reasoning if i,Robot is running and settings changed
  if (settings['irobot-mode']) {
    // If agent is already running, update its symbolic reasoning in-place
    if (continuousAgent) {
      await initializeSymbolicReasoning();
      continuousAgent.symbolicReasoning = symbolicReasoning;
    } else {
      await startIRobotMode();
    }
  } else {
    stopIRobotMode();
  }
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
    // Try to download external dataset (skip if not available)
    const dataset = await leaderboardClient.downloadDataset();

    const benchmark = new IRobotBenchmark({
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model: config.model,
      externalDataset: dataset,
      verbose: true
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
