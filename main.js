const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const { HierarchicalRAGComplete } = require('./rag-system/rag_complete_integration.js');
const { ContinuousAgent } = require('./rag-system/continuous_agent.js');

const store = new Store();

let tray = null;
let mainWindow = null;
let settingsWindow = null;
let memory = null;
let memoryStatus = 'idle';
let learningInterval = null;
let continuousAgent = null;

async function initializeMemory() {
  if (memory) return;
  memory = new HierarchicalRAGComplete();
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

async function startIRobotMode() {
  if (continuousAgent) return;
  await initializeMemory();
  continuousAgent = new ContinuousAgent({
    apiKey: store.get('api-key'),
    longTermMemory: memory,
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
  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 400,
    height: 600, // Increased height for the new option
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  stopIRobotMode();
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

  if (settings['irobot-mode']) {
    await startIRobotMode();
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
