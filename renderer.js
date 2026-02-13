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

clippy.load('Clippy', (agent) => {
  agent.show();

  // Log all available animations to the console
  console.log('Available animations:', agent.animations());

  // Listen for messages from the continuous agent
  ipcRenderer.on('clippy-message', (event, msg) => {
    if (msg.animation && store.get('enable-animations')) {
      agent.play(msg.animation);
    }
    if (msg.content) {
      agent.speak(msg.content);
    }
    if (msg.metadata?.reasoning) {
      console.log(`Clippy's thoughts: ${msg.metadata.reasoning}`);
    }
  });

  $('.clippy').on('click', async () => {
    const userInput = prompt("What would you like to say to Clippy?");
    if (userInput) {
      const irobotModeEnabled = store.get('irobot-mode', false);

      if (irobotModeEnabled) {
        // In "I, Robot" mode, just send the message to the agent
        ipcRenderer.send('user-message', userInput);
      } else {
        // Original logic for direct LLM call
        const apiEndpoint = store.get('api-endpoint');
        const apiKey = store.get('api-key');
        const model = store.get('model');
        const elizaMode = store.get('eliza-mode');
        const intelligentMemoryEnabled = store.get('intelligent-memory');
        const animationsEnabled = store.get('enable-animations');

        if (!apiEndpoint) {
          const reply = eliza.transform(userInput);
          agent.speak(reply);
          return;
        }

        let prompt = userInput;

        if (intelligentMemoryEnabled) {
          const memoryResults = await ipcRenderer.invoke('search-memory', userInput);
          if (memoryResults && memoryResults.length > 0) {
            const memoryContext = memoryResults.map(r => r.content).join('\n---\n');
            prompt = `Based on the following information:\n${memoryContext}\n\nHow would you respond to this question: "${userInput}"?`;
          }
        }

        if (elizaMode) {
          const elizaReply = eliza.transform(userInput);
          prompt = `The classic Eliza chatbot would have responded to "${userInput}" with "${elizaReply}". How would you, a modern AI, respond?`;
        }

        if (animationsEnabled) {
            prompt += `\n\nAlso, suggest a suitable animation from the following list: ${animations.join(', ')}. The animation should be enclosed in square brackets, like [animation_name].`;
        }

        try {
          const response = await axios.post(
            apiEndpoint,
            {
              model: model,
              messages: [{ role: 'user', content: prompt }],
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
        } catch (error) {
          console.error('Error calling LLM:', error);
          agent.speak("I'm having trouble connecting to the AI. Please check your settings.");
        }
      }
    }
  });
});
