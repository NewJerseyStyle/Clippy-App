const { ipcRenderer } = require('electron');
const ElizaBot = require('elizabot');
const axios = require('axios');
const Store = require('electron-store');

const store = new Store();
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

clippy.load(store.get('character', 'Clippy'), (agent) => {
  agent.show();
  console.log('Available animations:', agent.animations());

  // Click-through for transparent areas
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

  // Idle animations
  const idleAnimations = ['IdleRope', 'IdleAtom', 'Thinking', 'LookRight'];
  let idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(playIdleAnimation, 45000);
  }

  function playIdleAnimation() {
    if (store.get('enable-animations', false)) {
      const anim = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
      agent.play(anim);
    }
    idleTimer = setTimeout(playIdleAnimation, 45000 + Math.random() * 30000);
  }

  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', resetIdleTimer);
  resetIdleTimer();

  // Hide with animation (from menu or auto-hide)
  ipcRenderer.on('hide-with-animation', () => {
    agent.play('Hide');
    setTimeout(() => {
      ipcRenderer.send('hide-window');
    }, 1500);
  });

  // Show agent when window becomes visible again
  ipcRenderer.on('show-agent', () => {
    agent.show();
    resetIdleTimer();
  });

  // Listen for messages from the continuous agent
  ipcRenderer.on('clippy-message', (event, msg) => {
    if (msg.animation && store.get('enable-animations')) {
      agent.play(msg.animation);
    }
    if (msg.content) {
      agent.speak(msg.content);
      addToHistory('clippy', msg.content);
    }
    if (msg.metadata?.reasoning) {
      console.log(`Clippy's thoughts: ${msg.metadata.reasoning}`);
    }
  });

  // Chat input elements
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

  // Toggle chat balloon on character click
  $('.clippy').on('click', () => {
    if (chatInput.style.display === 'block') {
      chatInput.style.display = 'none';
      playEngagementAnimation();
    } else {
      chatInput.style.display = 'block';
      chatText.value = '';
      chatText.focus();
    }
  });

  // Right-click context menu on character
  $('.clippy').on('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('show-context-menu');
  });

  // Process a user message
  async function handleMessage(userInput) {
    addToHistory('user', userInput);

    const irobotModeEnabled = store.get('irobot-mode', false);

    if (irobotModeEnabled) {
      ipcRenderer.send('user-message', userInput);
      return;
    }

    const apiEndpoint = store.get('api-endpoint');
    const apiKey = store.get('api-key');
    const model = store.get('model');
    const elizaMode = store.get('eliza-mode');
    const intelligentMemoryEnabled = store.get('intelligent-memory');
    const animationsEnabled = store.get('enable-animations');

    if (!apiEndpoint) {
      const reply = eliza.transform(userInput);
      agent.speak(reply);
      addToHistory('clippy', reply);
      return;
    }

    let msgPrompt = userInput;

    if (intelligentMemoryEnabled) {
      const memoryResults = await ipcRenderer.invoke('search-memory', userInput);
      if (memoryResults && memoryResults.length > 0) {
        const memoryContext = memoryResults.map(r => r.content).join('\n---\n');
        msgPrompt = `Based on the following information:\n${memoryContext}\n\nHow would you respond to this question: "${userInput}"?`;
      }
    }

    if (elizaMode) {
      const elizaReply = eliza.transform(userInput);
      msgPrompt = `The classic Eliza chatbot would have responded to "${userInput}" with "${elizaReply}". How would you, a modern AI, respond?`;
    }

    if (animationsEnabled) {
      msgPrompt += `\n\nAlso, suggest a suitable animation from the following list: ${animations.join(', ')}. The animation should be enclosed in square brackets, like [animation_name].`;
    }

    try {
      const response = await axios.post(
        apiEndpoint,
        {
          model: model,
          messages: [{ role: 'user', content: msgPrompt }],
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

      agent.speak(reply);
      addToHistory('clippy', reply);
    } catch (error) {
      console.error('Error calling LLM:', error);
      agent.speak("I'm having trouble connecting to the AI. Please check your settings.");
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
