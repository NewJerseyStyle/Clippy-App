const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

const settingsForm = document.getElementById('settings-form');
const apiEndpoint = document.getElementById('api-endpoint');
const apiKey = document.getElementById('api-key');
const model = document.getElementById('model');
const elizaMode = document.getElementById('eliza-mode');
const checkForUpdatesBtn = document.getElementById('check-for-updates');
const intelligentMemory = document.getElementById('intelligent-memory');
const memoryReadNews = document.getElementById('memory-read-news');
const clearMemoryBtn = document.getElementById('clear-memory');
const memoryStatusText = document.querySelector('#memory-status .status-text');
const memoryStatusAnimation = document.querySelector('#memory-status .status-animation');
const irobotMode = document.getElementById('irobot-mode');
const irobotWarningModal = document.getElementById('irobot-warning');
const confirmIrobotBtn = document.getElementById('confirm-irobot-mode');
const cancelIrobotBtn = document.getElementById('cancel-irobot-mode');
const closeWarningBtn = document.querySelector('#irobot-warning .close-button');

// Load saved settings
apiEndpoint.value = store.get('api-endpoint', '');
apiKey.value = store.get('api-key', '');
model.value = store.get('model', '');
elizaMode.checked = store.get('eliza-mode', false);
intelligentMemory.checked = store.get('intelligent-memory', false);
memoryReadNews.checked = store.get('memory-read-news', false);
irobotMode.checked = store.get('irobot-mode', false);

// "I, Robot" Mode Warning
irobotMode.addEventListener('change', (event) => {
  if (event.target.checked) {
    event.preventDefault();
    irobotWarningModal.style.display = 'block';
  }
});

confirmIrobotBtn.addEventListener('click', () => {
  irobotMode.checked = true;
  irobotWarningModal.style.display = 'none';
});

cancelIrobotBtn.addEventListener('click', () => {
  irobotMode.checked = false;
  irobotWarningModal.style.display = 'none';
});

closeWarningBtn.addEventListener('click', () => {
  irobotMode.checked = false;
  irobotWarningModal.style.display = 'none';
});

// Save settings on submit
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  store.set('api-endpoint', apiEndpoint.value);
  store.set('api-key', apiKey.value);
  store.set('model', model.value);
  store.set('eliza-mode', elizaMode.checked);
  store.set('intelligent-memory', intelligentMemory.checked);
  store.set('memory-read-news', memoryReadNews.checked);
  store.set('irobot-mode', irobotMode.checked);
  
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
  memoryStatusText.textContent = status;
  if (status === 'learning') {
    memoryStatusAnimation.style.backgroundColor = '#007bff';
  } else {
    memoryStatusAnimation.style.backgroundColor = '#ccc';
  }
});

// Initial status update
ipcRenderer.send('get-memory-status');
