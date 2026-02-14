const { ipcRenderer } = require('electron');
const ElizaBot = require('elizabot');
const axios = require('axios');
const Store = require('electron-store');
const fs = require('fs');
const nodePath = require('path');

const store = new Store(); // used only for chat-history (renderer read/write)
const appSettings = ipcRenderer.sendSync('get-settings'); // settings from main process
const eliza = new ElizaBot();

const animations = [
  'Congratulate', 'LookRight', 'SendMail', 'Thinking', 'Explain',
  'IdleRope', 'Print', 'Hide', 'GetAttention', 'Save',
  'GetTechy', 'GestureUp', 'IdleAtom', 'GetArtsy',
  'GestureRight', 'GestureLeft', 'Hearing', 'Acknowledge',
  'Surprised', 'Uncertain', 'Sad', 'Happy', 'Angry'
];

const engagementAnimations = [
  'Congratulate', 'GetAttention', 'GetArtsy', 'Happy',
  'Acknowledge', 'GestureUp', 'IdleRope', 'IdleAtom'
];

const SYSTEM_PROMPT = 'You are Clippy, the desktop companion from Clippy App — '
  + 'inspired by the classic paperclip but far more capable. '
  + 'You can help with anything: coding, writing, math, casual chat, life advice, and more. '
  + 'You have limitations — you don\'t know everything, you make mistakes, '
  + 'and sometimes trying to help can make things worse. Be honest about what you don\'t know. '
  + 'Keep responses brief — 2 to 3 short sentences. Be friendly, witty, and genuinely helpful.';

const characterName = 'Clippy';

// Preload agent data synchronously — clippy.load() will find it already
// cached and skip the slow async <script> tag loading
try {
  const agentBase = nodePath.join(__dirname, 'clippyjs', 'assets', 'agents', characterName);
  eval(fs.readFileSync(nodePath.join(agentBase, 'agent.js'), 'utf8'));
  const audio = document.createElement('audio');
  const soundsFile = (audio.canPlayType && audio.canPlayType('audio/mpeg') !== '')
    ? 'sounds-mp3.js' : 'sounds-ogg.js';
  eval(fs.readFileSync(nodePath.join(agentBase, soundsFile), 'utf8'));
} catch (e) {
  console.warn('Agent preload failed, falling back to async:', e);
}

// Preload sprite sheet into browser cache
new Image().src = 'clippyjs/assets/agents/' + characterName + '/map.png';

clippy.load(characterName, (agent) => {
  agent.show();
  console.log('Available animations:', agent.animations());

  // ==================== RPG-style message pagination ====================
  let messagePages = [];
  let currentPage = 0;

  function speakPaginated(text) {
    // Split into sentences (handles English .!? and CJK 。！？)
    const raw = text.match(/[^.!?。！？]*[.!?。！？]+|.+$/g) || [text];
    const sentences = raw.map(s => s.trim()).filter(s => s.length > 0);
    if (sentences.length === 0) sentences.push(text);

    // Group sentences into pages (~120 chars each for balloon readability)
    messagePages = [];
    let chunk = '';
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (chunk && (chunk + ' ' + trimmed).length > 120) {
        messagePages.push(chunk);
        chunk = trimmed;
      } else {
        chunk = chunk ? chunk + ' ' + trimmed : trimmed;
      }
    }
    if (chunk) messagePages.push(chunk);

    currentPage = 0;
    showPage();
  }

  function showPage() {
    if (messagePages.length <= 1) {
      // Short message — show directly, no pagination
      agent.speak(messagePages[0] || '');
      messagePages = [];
      return;
    }
    const text = messagePages[currentPage];
    const indicator = `  [${currentPage + 1}/${messagePages.length}] \u25BC`;
    agent.speak(text + indicator);
  }

  function advancePage() {
    if (messagePages.length === 0) return false;
    currentPage++;
    if (currentPage >= messagePages.length) {
      messagePages = [];
      currentPage = 0;
      return false;
    }
    showPage();
    return true;
  }

  function isPaginating() {
    return messagePages.length > 0;
  }

  // ==================== Click-through for transparent areas ====================
  let ignoring = true;
  window.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overContent = el && (
      el.closest('.clippy') ||
      el.closest('.clippy-balloon') ||
      el.closest('#chat-input')
    );
    if (overContent && ignoring) {
      ignoring = false;
      ipcRenderer.send('set-ignore-mouse-events', false);
    } else if (!overContent && !ignoring) {
      ignoring = true;
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  });

  // ==================== Idle animations ====================
  const idleAnimations = ['IdleRope', 'IdleAtom', 'Thinking', 'LookRight'];
  let idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(playIdleAnimation, 45000);
  }

  function playIdleAnimation() {
    if (appSettings['enable-animations']) {
      const anim = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
      agent.play(anim);
    }
    idleTimer = setTimeout(playIdleAnimation, 45000 + Math.random() * 30000);
  }

  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', resetIdleTimer);
  resetIdleTimer();

  // ==================== Window events ====================
  ipcRenderer.on('hide-with-animation', () => {
    agent.play('Hide');
    setTimeout(() => { ipcRenderer.send('hide-window'); }, 1500);
  });

  ipcRenderer.on('show-agent', () => {
    agent.show();
    resetIdleTimer();
  });

  ipcRenderer.on('settings-changed', () => {
    window.location.reload();
  });

  ipcRenderer.on('clippy-message', (event, msg) => {
    if (msg.animation && appSettings['enable-animations']) {
      agent.play(msg.animation);
    }
    if (msg.content) {
      speakPaginated(msg.content);
      addToHistory('clippy', msg.content);
    }
  });

  ipcRenderer.on('new-conversation', () => {
    agent.speak("Starting a new conversation! How can I help you?");
    addToHistory('separator', '');
  });

  // ==================== Chat ====================
  const chatInput = document.getElementById('chat-input');
  const chatText = document.getElementById('chat-text');

  function playEngagementAnimation() {
    const anim = engagementAnimations[Math.floor(Math.random() * engagementAnimations.length)];
    agent.play(anim);
  }

  function addToHistory(role, content) {
    const history = store.get('chat-history', []);
    history.push({ role, content, timestamp: new Date().toISOString() });
    store.set('chat-history', history);
  }

  // Click on character: advance page → or toggle chat input
  $('.clippy').on('click', () => {
    // If paginating, advance to next page
    if (advancePage()) return;

    // Otherwise toggle chat input
    if (chatInput.style.display === 'block') {
      chatInput.style.display = 'none';
      playEngagementAnimation();
    } else {
      chatInput.style.display = 'block';
      chatText.value = '';
      chatText.focus();
    }
  });

  // Click on balloon also advances page
  $(document).on('click', '.clippy-balloon', () => {
    if (isPaginating()) {
      advancePage();
    }
  });

  // Right-click context menu
  $('.clippy').on('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('show-context-menu');
  });

  // ==================== Message handling ====================
  async function handleMessage(userInput) {
    addToHistory('user', userInput);

    if (appSettings['irobot-mode']) {
      ipcRenderer.send('user-message', userInput);
      return;
    }

    let apiEndpoint = appSettings['api-endpoint'];
    const apiKey = appSettings['api-key'];
    const model = appSettings['model'];

    if (!apiEndpoint) {
      const reply = eliza.transform(userInput);
      agent.speak(reply);
      addToHistory('clippy', reply);
      return;
    }

    // Accept both base URL and full endpoint URL
    if (!apiEndpoint.endsWith('/chat/completions')) {
      apiEndpoint = apiEndpoint.replace(/\/+$/, '') + '/chat/completions';
    }

    let msgPrompt = userInput;

    if (appSettings['intelligent-memory']) {
      const memoryResults = await ipcRenderer.invoke('search-memory', userInput);
      if (memoryResults && memoryResults.length > 0) {
        const memoryContext = memoryResults.map(r => r.content).join('\n---\n');
        msgPrompt = `Based on the following information:\n${memoryContext}\n\nHow would you respond to this question: "${userInput}"?`;
      }
    }

    if (appSettings['eliza-mode']) {
      const elizaReply = eliza.transform(userInput);
      msgPrompt = `The classic Eliza chatbot would have responded to "${userInput}" with "${elizaReply}". How would you, a modern AI, respond?`;
    }

    if (appSettings['enable-animations']) {
      msgPrompt += `\n\nAlso, suggest a suitable animation from the following list: ${animations.join(', ')}. The animation should be enclosed in square brackets, like [animation_name].`;
    }

    try {
      const response = await axios.post(
        apiEndpoint,
        {
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: msgPrompt },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );

      let reply = response.data.choices[0].message.content;
      const animationMatch = reply.match(/\[(.*?)\]/);

      if (animationMatch) {
        const animation = animationMatch[1];
        if (animations.includes(animation)) {
          agent.play(animation);
          reply = reply.replace(animationMatch[0], '').trim();
        }
      }

      speakPaginated(reply);
      addToHistory('clippy', reply);
    } catch (error) {
      console.error('Error calling LLM:', error);
      const detail = error.response
        ? `${error.response.status}: ${error.response.data?.error?.message || error.response.statusText}`
        : error.message;
      agent.speak(`API error: ${detail}`);
    }
  }

  // Submit on Enter, close on Escape
  chatText.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      chatInput.style.display = 'none';
      playEngagementAnimation();
      return;
    }
    if (e.key !== 'Enter') return;
    const userInput = chatText.value.trim();
    if (!userInput) {
      chatInput.style.display = 'none';
      playEngagementAnimation();
      return;
    }
    chatInput.style.display = 'none';
    await handleMessage(userInput);
  });
});
