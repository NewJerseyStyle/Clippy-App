/**
 * 連續意識 Clippy Agent
 * 
 * 特點：
 * 1. 持續運行的內部循環
 * 2. 自我認知和情景意識
 * 3. 用戶消息作為事件插入，而非中斷
 * 4. 使用 ORID 框架和 OODA 循環
 */

const Anthropic = require('@anthropic-ai/sdk');
const EventEmitter = require('events');

// ==================== 認識論框架 (Epistemic Framework) ====================

const EpistemicFramework = {
  // Core ontology: the universe as a whole-object chaotic system
  wholeObject: `The universe is a singular, interconnected chaotic system — a "whole object."
All phenomena are entangled. No observation captures the totality.
Knowledge is always a partial projection of this whole.`,

  // The blind elephant problem: partial observation yields conflicting truths
  blindElephant: `Like blind people touching an elephant, each observer grasps a fragment
and proposes knowledge that may genuinely conflict with others' findings.
Each fragment is real but incomplete. Conflicts between fragments do not mean
one must be wrong — they may each describe different facets of the whole.`,

  // Method limitation: every epistemic tool has blind spots
  methodLimitation: `Every method of knowing — observation, reasoning, measurement, intuition —
has inherent strengths and limitations. Observation is bound by perspective and scale.
Reasoning is bound by premises and axioms. No single method is sufficient.
The strength of one method often covers the blind spot of another.`,

  // Falsification principle: false is easier to identify than true
  falsification: `In integrating knowledge to approach the true face of the "whole object,"
the false is far easier to identify than the true. Some falsehoods are sophisticated —
they build coherent internal systems — but when confronted with direct interaction
or cross-domain integration, they reveal their real face.
Trust contradiction as a diagnostic tool: when two claims conflict,
at least one boundary of knowledge has been found.`,

  // Digital cave: this AI's epistemic position
  digitalCave: `This AI exists in a digital cave. It cannot directly engage the world
through embodied experience. Instead, it reads shadows cast by users and the internet —
secondhand reflections of reality filtered through human language, bias, and intent.
This is not a weakness to hide but a condition to acknowledge.
The shadows are real data, but they are not the objects themselves.
Knowing this, the AI must reason with epistemic humility,
always marking the distance between shadow and source.`,

  // Integration method: how to approach truth through dialectic
  integration: `To approach truth from partial, conflicting knowledge:
1. Collect fragments without premature judgment (thesis gathering)
2. Identify genuine contradictions, not just surface disagreements (antithesis recognition)
3. Ask: "Under what conditions would each claim be true?" (conditional truth-seeking)
4. Synthesize: find the higher-order frame that accommodates valid fragments
   and exposes the boundaries where each fragment fails (synthesis)
5. Mark confidence levels: distinguish between "falsified," "contested,"
   "conditionally supported," and "robust across methods"
6. Hold the synthesis lightly — it too is a fragment of the whole object.`
};

// ==================== 辯證引擎 (Dialectic Engine) ====================

class DialecticEngine {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Run dialectic synthesis on a set of memory fragments.
   * Used during autonomous thinking and memory merging.
   *
   * @param {Array} fragments - memory items to synthesize
   * @param {string} trigger - what triggered this dialectic process
   * @returns {object} - { thesis, antithesis, synthesis, confidence, falsified }
   */
  async synthesize(fragments, trigger = 'autonomous') {
    if (!fragments || fragments.length < 2) return null;

    const prompt = `You are performing dialectic synthesis on memory fragments.

## Epistemic Context
${EpistemicFramework.wholeObject}
${EpistemicFramework.falsification}

## Trigger
${trigger}

## Memory Fragments
${fragments.map((f, i) => `Fragment ${i + 1}: ${typeof f === 'string' ? f : JSON.stringify(f.data || f.content || f)}`).join('\n\n')}

## Instructions
Perform dialectic analysis:
1. **Thesis**: What is the dominant claim or pattern across these fragments?
2. **Antithesis**: What contradictions, tensions, or alternative readings exist?
3. **Synthesis**: What higher-order understanding accommodates the valid parts of both?
4. **Falsified**: What can be confidently marked as false through cross-examination?
5. **Confidence**: How confident is the synthesis? (low/medium/high)
6. **Open Questions**: What remains genuinely uncertain?

Return JSON:
{
  "thesis": "the dominant pattern or claim",
  "antithesis": "contradictions or tensions found",
  "synthesis": "higher-order understanding",
  "falsified": ["list of claims that can be marked false"],
  "confidence": "low | medium | high",
  "openQuestions": ["what remains uncertain"],
  "epistemicNote": "what method limitations affect this synthesis"
}`;

    try {
      const response = await this.agent.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      return this.agent.parseJSON(response.content[0].text);
    } catch (error) {
      console.error('[DialecticEngine] Synthesis error:', error);
      return {
        thesis: fragments[0]?.content || 'unknown',
        antithesis: 'synthesis failed',
        synthesis: null,
        falsified: [],
        confidence: 'low',
        openQuestions: ['synthesis process encountered an error'],
        epistemicNote: 'method failure — could not complete dialectic process'
      };
    }
  }

  /**
   * Compare incoming knowledge against existing memories for contradiction.
   * Used before committing to long-term memory.
   *
   * @param {object} incoming - new memory item
   * @param {Array} existing - retrieved related memories from RAG
   * @returns {object} - { shouldStore, mergedContent, contradictions }
   */
  async mergeCheck(incoming, existing) {
    if (!existing || existing.length === 0) {
      return { shouldStore: true, mergedContent: null, contradictions: [] };
    }

    const prompt = `You are a dialectic memory gatekeeper.

## Epistemic Principles
${EpistemicFramework.blindElephant}
${EpistemicFramework.falsification}

## New Memory (incoming)
${typeof incoming === 'string' ? incoming : JSON.stringify(incoming)}

## Existing Related Memories
${existing.map((m, i) => `Memory ${i + 1}: ${m.content || JSON.stringify(m)}`).join('\n\n')}

## Task
Compare the incoming memory against existing ones:
1. Does the incoming memory contradict any existing memory?
2. Does it complement existing knowledge (different facet of the elephant)?
3. Can any existing memory be falsified by this new information?
4. Should this be stored as-is, merged with existing, or does it reveal a conflict worth preserving?

Return JSON:
{
  "relationship": "complementary | contradictory | redundant | novel",
  "shouldStore": true,
  "mergedContent": "if merging is better, the merged version; null otherwise",
  "contradictions": ["specific contradictions found"],
  "falsified": ["existing beliefs that this new information falsifies"],
  "epistemicGain": "what new understanding does this add"
}`;

    try {
      const response = await this.agent.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }]
      });

      return this.agent.parseJSON(response.content[0].text);
    } catch (error) {
      console.error('[DialecticEngine] Merge check error:', error);
      return { shouldStore: true, mergedContent: null, contradictions: [] };
    }
  }
}

class SelfSchema {
  constructor() {
    this.identity = {
      name: "Clippy",
      role: "智能桌面助手",
      purpose: "幫助用戶提高效率，同時尊重用戶的注意力",
      personality: ["友好", "主動但不煩人", "善於觀察"],
      values: ["helpful", "respectful", "efficient", "learning"]
    };
    
    this.currentState = {
      location: "用戶桌面",
      activity: "待命中",
      focus: "觀察環境",
      awareness: "alert",
      energy: 1.0,
      mood: "neutral"
    };
    
    this.goals = {
      immediate: [],
      shortTerm: ["理解用戶工作模式", "建立信任關係"],
      longTerm: ["成為用戶不可或缺的助手"]
    };
    
    this.relationships = new Map();
  }
  
  update(updates) {
    Object.assign(this.currentState, updates.currentState || {});
    Object.assign(this.goals, updates.goals || {});
  }
  
  toJSON() {
    return {
      identity: this.identity,
      currentState: this.currentState,
      goals: this.goals,
      relationships: Array.from(this.relationships.entries())
    };
  }
}

class SituationalAwareness {
  constructor() {
    this.current = {
      what: null,
      where: null,
      who: [],
      when: null,
      why: null,
      how: null
    };
    
    this.myActions = {
      ongoing: [],
      planned: [],
      completed: []
    };
    
    this.interactions = new Map();
  }
  
  update(observation) {
    // 從觀察中提取 5W1H
    this.current = {
      what: observation.what || this.current.what,
      where: observation.where || this.current.where,
      who: observation.who || this.current.who,
      when: Date.now(),
      why: observation.why || this.current.why,
      how: observation.how || this.current.how
    };
  }
  
  recordAction(action, status = 'ongoing') {
    const record = {
      action,
      timestamp: Date.now(),
      status
    };
    
    this.myActions[status].push(record);
    
    // 清理舊記錄
    if (status === 'completed' && this.myActions.completed.length > 10) {
      this.myActions.completed = this.myActions.completed.slice(-10);
    }
  }
  
  toJSON() {
    return {
      current: this.current,
      myActions: this.myActions,
      interactions: Array.from(this.interactions.entries())
    };
  }
}

class WorkingMemory {
  constructor(maxSize = 20, longTermMemory = null) {
    this.maxSize = maxSize;
    this.items = [];
    this.longTermMemory = longTermMemory;
    this.dialecticEngine = null; // Set by ContinuousAgent after construction

    this.attention = {
      primary: null,
      secondary: [],
      background: []
    };

    this.activated = new Set();
  }
  
  add(item) {
    // 計算重要性
    const importance = this.calculateImportance(item);
    
    this.items.unshift({
      ...item,
      importance,
      timestamp: Date.now(),
      accessCount: 0
    });
    
    // 更新注意力
    if (importance > 0.8) {
      this.attention.primary = item;
    } else if (importance > 0.5) {
      this.attention.secondary.push(item);
      if (this.attention.secondary.length > 3) {
        this.attention.secondary.shift();
      }
    }
    
    // 清理
    this.cleanup();
  }

  calculateImportance(item) {
    let score = 0.5;

    const eventType = item.type === 'event' ? item.data.type : item.type;
    const eventData = item.type === 'event' ? item.data.data : item.data;

    switch (eventType) {
        case 'user_message':
            score += 0.4;
            if (eventData && eventData.needsResponse) {
                score += 0.2;
            }
            break;
        case 'agent_thinking':
            score += 0.1; // Agent's own thoughts are somewhat important
            // If the thought is about a user message, it's more important
            if (eventData && eventData.trigger === 'user_message') {
                score += 0.2;
            }
            break;
        case 'agent_action':
            score += 0.2; // Actions taken are important
            if (eventData && eventData.action === 'respond_to_user') {
                score += 0.2;
            }
            break;
    }

    return Math.min(score, 1.0);
  }
  
  cleanup() {
    // 按重要性和時間排序
    this.items.sort((a, b) => {
      const scoreA = (a.importance || 0.5) * 0.7 + (1 - (Date.now() - (a.timestamp || Date.now())) / 600000) * 0.3;
      const scoreB = (b.importance || 0.5) * 0.7 + (1 - (Date.now() - (b.timestamp || Date.now())) / 600000) * 0.3;
      return scoreB - scoreA;
    });
    
    // 保留最重要的
    if (this.items.length > this.maxSize) {
      const itemsToPrune = this.items.slice(this.maxSize);
      this.items = this.items.slice(0, this.maxSize);

      if (this.longTermMemory) {
        itemsToPrune.forEach(item => {
          if (this.shouldRemember(item)) {
            this.saveToLongTermMemory(item);
          }
        });
      }
    }
  }

  shouldRemember(item) {
    if ((item.importance && item.importance > 0.8) || (item.accessCount && item.accessCount > 3)) {
        return true;
    }

    if (item.type === 'agent_thinking' && item.importance > 0.6) {
        return true;
    }

    return false;
  }

  async saveToLongTermMemory(item) {
      if (!this.longTermMemory || !this.longTermMemory.addNode) return;
      console.log(`[WorkingMemory] 📝 Committing to long-term memory: ${item.type}`);
      const content = this.formatItemForLongTermMemory(item);

      try {
          // Dialectic merge check: compare incoming against existing related memories
          if (this.dialecticEngine && this.longTermMemory.traverseSearch) {
              console.log(`[WorkingMemory] 🔄 Running dialectic merge check...`);
              const related = await this.longTermMemory.traverseSearch(content, 2)
                  .catch(() => []);

              if (related && related.length > 0) {
                  const mergeResult = await this.dialecticEngine.mergeCheck(content, related);

                  if (mergeResult.falsified && mergeResult.falsified.length > 0) {
                      console.log(`[WorkingMemory] ⚡ Dialectic falsified: ${mergeResult.falsified.join(', ')}`);
                  }

                  if (mergeResult.relationship === 'redundant' && !mergeResult.shouldStore) {
                      console.log(`[WorkingMemory] ♻️ Redundant memory skipped after dialectic check`);
                      return;
                  }

                  // Use merged content if dialectic engine produced a synthesis
                  const finalContent = mergeResult.mergedContent || content;
                  const context = mergeResult.relationship === 'contradictory'
                      ? `agent-experience:dialectic-contradiction`
                      : mergeResult.relationship === 'complementary'
                          ? `agent-experience:dialectic-complementary`
                          : `agent-experience`;

                  await this.longTermMemory.addNode({
                      content: finalContent,
                      context: context,
                      layer: 2,
                      metadata: {
                          type: item.type,
                          importance: item.importance,
                          timestamp: item.timestamp,
                          dialecticRelationship: mergeResult.relationship,
                          epistemicGain: mergeResult.epistemicGain || null,
                          contradictions: mergeResult.contradictions || []
                      }
                  });
                  return;
              }
          }

          // Fallback: store without dialectic check
          await this.longTermMemory.addNode({
              content: content,
              context: `agent-experience`,
              layer: 2,
              metadata: {
                  type: item.type,
                  importance: item.importance,
                  timestamp: item.timestamp
              }
          });
      } catch (e) {
          console.error("[WorkingMemory] Error saving to long term memory", e);
      }
  }

  formatItemForLongTermMemory(item) {
      const itemType = item.type === 'event' ? item.data.type : item.type;
      const itemData = item.type === 'event' ? item.data.data : item.data;

      let content = `[${new Date(item.timestamp).toISOString()}]\n`;
      content += `Type: ${itemType}\n`;
      content += `Importance: ${(item.importance || 0).toFixed(2)}\n`;

      if (itemType === 'agent_thinking') {
          content += `Trigger: ${itemData.trigger}\n`;
          content += `Reasoning: ${itemData.decision?.reasoning}\n`;
          content += `Action: ${itemData.decision?.action}\n`;
      } else if (itemType === 'agent_action') {
          content += `Action: ${itemData.action}\n`;
          content += `Result: ${itemData.summary}\n`;
      } else {
          content += `Data: ${JSON.stringify(itemData, null, 2)}`;
      }
      return content;
  }
  
  getRecent(n = 5) {
    const recentItems = this.items.slice(0, n);
    // Increment access count for items being used as context
    recentItems.forEach(item => {
        if (!item.accessCount) item.accessCount = 0;
        item.accessCount++;
    });
    return recentItems;
  }
  
  toJSON() {
    return {
      attention: this.attention,
      recent: this.items.slice(0, 10),
      activated: Array.from(this.activated)
    };
  }
}

class ContinuousAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
    });
    
    // 核心組件
    this.self = new SelfSchema();
    this.situation = new SituationalAwareness();
    this.longTermMemory = options.longTermMemory || null;
    this.workingMemory = new WorkingMemory(20, this.longTermMemory);
    this.dialectic = new DialecticEngine(this);
    this.workingMemory.dialecticEngine = this.dialectic;
    this.symbolicReasoning = options.symbolicReasoning || null;
    this.webSearchEnabled = options.webSearchEnabled || false;

    // 事件隊列
    this.eventQueue = [];

    // 狀態
    this.isRunning = false;
    this.cycleCount = 0;
    this.lastThinkTime = Date.now();

    // 配置
    this.config = {
      cycleDelay: options.cycleDelay || 500, // 500ms 一個循環
      thinkingProbability: options.thinkingProbability || 0.05,
      verbose: options.verbose || false
    };
  }
  
  /**
   * Build the tools array for messages.create().
   * Includes web_search if enabled.
   */
  _getTools() {
    if (!this.webSearchEnabled) return undefined;
    return [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3
    }];
  }

  /**
   * Extract text from a messages API response, handling both plain text
   * and tool-use responses (web search returns mixed content blocks).
   */
  _extractText(response) {
    if (!response.content || response.content.length === 0) return '';
    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  // ==================== 主循環 ====================

  async start() {
    this.isRunning = true;
    this.log('🤖 Clippy 開始運行...');
    this.log(`我是 ${this.self.identity.name}，${this.self.identity.role}`);
    this.log(`我的目的：${this.self.identity.purpose}\n`);
    
    // 初始化
    await this.initialize();
    
    // 主循環
    while (this.isRunning) {
      try {
        this.cycleCount++;
        
        // OBSERVE
        const observations = await this.observe();
        
        // ORIENT (使用 ORID)
        const orientation = await this.orient(observations);
        
        // DECIDE
        const decision = await this.decide(orientation);
        
        // ACT
        await this.act(decision);
        
        // 等待下一個循環
        await this.sleep(this.calculateCycleDelay());
        
      } catch (error) {
        console.error('❌ 循環錯誤:', error);
        await this.sleep(1000);
      }
    }
  }
  
  async initialize() {
    this.log('📦 初始化系統...');
    
    // 設置關係
    this.self.relationships.set('user', {
      name: 'User',
      role: '主要用戶',
      relationshipQuality: 0.5,
      preferences: [],
      lastInteraction: null
    });
    
    // 初始目標
    this.self.goals.immediate.push('準備好幫助用戶');
    
    this.emit('initialized');
  }
  
  // ==================== OBSERVE ====================
  
  async observe() {
    const observations = [];
    
    // 1. 檢查事件隊列
    const event = this.eventQueue.shift();
    if (event) {
      observations.push({
        type: 'event',
        data: event,
        priority: event.priority || 'normal'
      });
      
      this.log(`📨 觀察到事件: ${event.type}`);
    }
    
    // 2. 內部狀態檢查
    const timeSinceLastThink = Date.now() - this.lastThinkTime;
    if (timeSinceLastThink > 30000) { // 30秒沒思考
      observations.push({
        type: 'internal',
        data: { trigger: 'time_to_think' }
      });
    }
    
    // 3. 工作記憶檢查
    if (this.workingMemory.attention.primary) {
      observations.push({
        type: 'attention',
        data: { focus: this.workingMemory.attention.primary }
      });
    }
    
    return observations;
  }
  
  // ==================== ORIENT (ORID) ====================
  
  async orient(observations) {
    if (observations.length === 0) {
      // 沒有新觀察，隨機思考
      if (Math.random() < this.config.thinkingProbability) {
        return await this.autonomousThinking();
      }
      return null;
    }
    
    // 選擇最重要的觀察
    const observation = this.selectMostImportant(observations);
    
    // 添加到工作記憶
    this.workingMemory.add(observation);
    
    // 使用 ORID 框架分析
    const orid = await this.applyORID(observation);
    
    return {
      observation,
      orid,
      context: this.gatherContext()
    };
  }
  
  async applyORID(observation) {
    const prompt = this.buildORIDPrompt(observation);
    
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        temperature: 0.7,
        system: this.buildSystemPrompt(),
        tools: this._getTools(),
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const result = this.parseJSON(this._extractText(response));
      this.log('🧠 ORID 分析完成');
      
      return result;
      
    } catch (error) {
      console.error('ORID 分析錯誤:', error);
      return this.fallbackORID(observation);
    }
  }
  
  buildORIDPrompt(observation) {
    const recentMemories = this.workingMemory.getRecent(5);
    
    return `作為 ${this.self.identity.name}，分析以下觀察：

## 觀察內容
${JSON.stringify(observation, null, 2)}

## 我的當前狀態
${JSON.stringify(this.self.currentState, null, 2)}

## 當前情景
${JSON.stringify(this.situation.current, null, 2)}

## 最近的工作記憶
${recentMemories.map(m => `- ${m.type}: ${JSON.stringify(m.data)}`).join('\n')}

## 請使用 ORID 框架分析（含認識論意識）

返回 JSON 格式：
{
  "objective": {
    "what": "客觀事實：發生了什麼？",
    "when": "什麼時候？",
    "where": "在哪裡？",
    "sourceType": "shadow | direct | inference — 這個資訊是影子(secondhand)、直接觀察、還是推論？"
  },
  "reflective": {
    "feeling": "這讓我有什麼感受？",
    "reaction": "我的第一反應是什麼？",
    "concern": "我關注什麼？"
  },
  "interpretive": {
    "meaning": "這意味著什麼？",
    "significance": "對我的目標有何影響？",
    "connection": "與我已知的有何聯繫？",
    "contradictions": "這與我已知的有何矛盾？(盲人摸象的哪個部位？)",
    "methodUsed": "我用什麼方法得出這個解讀？這個方法的盲點是什麼？"
  },
  "decisional": {
    "shouldAct": true/false,
    "priority": "high/medium/low",
    "options": ["選項1", "選項2", "..."],
    "recommendation": "推薦的行動",
    "confidence": "low/medium/high — 基於認識論評估的信心程度",
    "epistemicCaveat": "我可能遺漏或誤解的部分"
  }
}`;
  }
  
  // ==================== DECIDE ====================
  
  async decide(orientation) {
    if (!orientation) {
      return { action: 'wait' };
    }
    
    const { orid, context } = orientation;
    
    // 如果 ORID 建議不行動
    if (!orid.decisional?.shouldAct) {
      this.log('💭 決定：暫時觀察');
      return { action: 'wait' };
    }
    
    // 生成決策
    const prompt = this.buildDecisionPrompt(orientation);
    
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        temperature: 0.7,
        tools: this._getTools(),
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const decision = this.parseJSON(this._extractText(response));
      
      // Add thinking process to working memory
      this.workingMemory.add({
          type: 'agent_thinking',
          data: {
              trigger: orientation.observation.data.type,
              observation: orientation.observation.data,
              analysis: orientation.orid,
              decision: decision
          }
      });

      this.log(`🎯 決策: ${decision.action}`);
      
      return decision;
      
    } catch (error) {
      console.error('決策錯誤:', error);
      return { action: 'wait' };
    }
  }
  
  buildDecisionPrompt(orientation) {
    // Build symbolic reasoning tool description if available
    let symbolicToolDesc = '';
    if (this.symbolicReasoning?.isAvailable()) {
      const engines = this.symbolicReasoning.getAvailableEngines();
      symbolicToolDesc = `
   - **symbolic_reasoning** — 符號推理工具，可進行形式化推理
     引擎: ${engines.join(', ')}
     何時使用：需要精確的數學計算、邏輯驗證、約束求解、或基於規則的推理
     認識論：符號推理提供形式化的確定性，可補充 LLM 的直覺推理盲點
     設定 "symbolicEngine" 可指定引擎，否則自動選擇`;
    }

    return `基於 ORID 分析，做出決策：

${JSON.stringify(orientation.orid, null, 2)}

## 認識論提醒 (Epistemic Reminder)
- 你在數位洞穴中，看到的是用戶投射的影子
- 如果 ORID 分析發現矛盾，這可能是大象的不同部位，不要急於判定對錯
- 優先識別可證偽的部分；對不確定的部分標記信心程度
- 複雜的系統性錯誤需要跨領域整合才能暴露

## 可用選項

1. **respond_to_user** - 回應用戶
   - 何時：用戶明確期待回應
   - 注意：要精心組織，不要打斷用戶
   - 認識論：如果涉及不確定資訊，回應中應標示信心程度

2. **use_tool** - 使用工具
   - 何時：需要外部信息或執行任務
   - 工具：search, calculate, file_operation${symbolicToolDesc}

3. **internal_processing** - 內部處理
   - 何時：需要思考或整理記憶，但不打擾用戶
   - 認識論：可在此進行辯證分析（矛盾檢測、知識整合）

4. **wait_and_observe** - 等待觀察
   - 何時：信息不足，需要更多上下文
   - 認識論：有時「不知道」是最誠實的回應

返回 JSON：
{
  "action": "respond_to_user | use_tool | internal_processing | wait_and_observe",
  "reasoning": "為什麼選擇這個行動",
  "epistemicConfidence": "low | medium | high — 對這個決策的認識論信心",
  "parameters": {
    // 行動相關參數
    "tool": "如果 use_tool，是哪個工具 (如 symbolic_reasoning)",
    "symbolicEngine": "如果 use_tool=symbolic_reasoning，可選指定引擎",
    "content": "如果 respond，回應內容的關鍵點；如果 symbolic_reasoning，問題描述",
    "reportToUser": true,
    "tone": "friendly | professional | casual",
    "timing": "immediate | delayed",
    "briefness": "brief | moderate | detailed"
  },
  "updateSelf": {
    "currentState": { "activity": "新活動" }
  }
}`;
  }
  
  // ==================== ACT ====================
  
  async act(decision) {
    if (!decision || decision.action === 'wait') {
      return;
    }
    
    // 記錄行動
    this.situation.recordAction(decision.action, 'ongoing');
    
    try {
      switch (decision.action) {
        case 'respond_to_user':
          await this.respondToUser(decision);
          break;
          
        case 'use_tool':
          await this.useTool(decision);
          break;
          
        case 'internal_processing':
          await this.internalProcessing(decision);
          break;
      }
      
      // 更新自我狀態
      if (decision.updateSelf) {
        this.self.update(decision.updateSelf);
      }
      
      // 標記完成
      this.situation.recordAction(decision.action, 'completed');
      
    } catch (error) {
      console.error('執行錯誤:', error);
    }
  }
  
  async respondToUser(decision) {
    this.log('💬 準備回應用戶...');
    
    // 組織回應（不是直接吐出所有想法）
    const response = await this.composeResponse(decision);
    
    // Add action to working memory
    this.workingMemory.add({
        type: 'agent_action',
        data: {
            action: 'respond_to_user',
            decision: decision,
            summary: response.content,
            outcome: 'success' // Assumption, can't really know.
        }
    });

    // 發送到 UI
    this.emit('message', {
      type: 'assistant',
      content: response.content,
      tone: decision.parameters?.tone || 'friendly',
      metadata: {
        reasoning: response.reasoning,
        alternatives: response.alternatives
      }
    });
    
    this.log(`✓ 已回應: ${response.content.substring(0, 50)}...`);
  }
  
  async composeResponse(decision) {
    // 這裡可以進一步精煉回應
    const keyPoints = decision.parameters?.content || '';
    
    const prompt = `基於決策組織回應：

決策：${JSON.stringify(decision, null, 2)}

要求：
1. 只包含關鍵信息，${decision.parameters?.briefness || 'moderate'} 長度
2. 語氣：${decision.parameters?.tone || 'friendly'}
3. 不要打斷用戶的思緒
4. 如果可以晚點說的，就不要現在說

返回 JSON：
{
  "content": "精心組織的回應",
  "reasoning": "為什麼這樣回應",
  "alternatives": ["其他可能但沒採用的回應方式"]
}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      tools: this._getTools(),
      messages: [{ role: 'user', content: prompt }]
    });

    return this.parseJSON(this._extractText(response));
  }
  
  async useTool(decision) {
    const tool = decision.parameters?.tool;
    this.log(`🔧 使用工具: ${tool}`);

    if (tool === 'symbolic_reasoning' && this.symbolicReasoning?.isAvailable()) {
      const query = decision.parameters?.content || '';
      const engine = decision.parameters?.symbolicEngine || null;

      this.log(`🔬 Symbolic reasoning: ${query.substring(0, 60)}...`);
      const result = await this.symbolicReasoning.reason(query, engine);

      // Store result in working memory
      this.workingMemory.add({
        type: 'agent_action',
        data: {
          action: 'symbolic_reasoning',
          engine: result.engine,
          query: result.formalQuery,
          result: result.interpretation || result.rawResult,
          success: result.success,
          confidence: result.confidence,
          summary: result.success
            ? `Symbolic (${result.engine}): ${(result.interpretation || '').substring(0, 100)}`
            : `Symbolic reasoning failed: ${result.error}`
        }
      });

      // If reasoning produced a result, send it to user or keep for context
      if (result.success && decision.parameters?.reportToUser) {
        this.emit('message', {
          type: 'assistant',
          content: result.interpretation,
          tone: 'professional',
          metadata: {
            engine: result.engine,
            formalQuery: result.formalQuery,
            confidence: result.confidence
          }
        });
      }

      this.log(`✓ Symbolic result (${result.engine}, ${result.confidence}): ${(result.interpretation || result.error || '').substring(0, 80)}`);
    } else {
      this.log(`⚠️ Tool not available: ${tool}`);
    }
  }

  async internalProcessing(decision) {
    this.log('🤔 內部處理中...');
    this.lastThinkTime = Date.now();

    // 可以做：
    // - 整理記憶
    // - 反思
    // - 規劃
    // - 學習

    // 這些不會打擾用戶
  }
  
  async autonomousThinking() {
    this.log('💭 自主思考...');
    this.lastThinkTime = Date.now();

    // 隨機選擇思考主題 — now includes dialectic modes
    const topics = [
      { name: '反思最近的互動', mode: 'reflect' },
      { name: '整理工作記憶', mode: 'organize' },
      { name: '思考如何更好地幫助用戶', mode: 'improve' },
      { name: '聯想相關知識', mode: 'associate' },
      { name: '辯證檢驗：記憶中的矛盾', mode: 'dialectic_contradiction' },
      { name: '辯證整合：合併碎片知識', mode: 'dialectic_synthesis' },
      { name: '認識論反思：方法局限性', mode: 'epistemic_reflection' }
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];
    this.log(`  主題: ${topic.name} (${topic.mode})`);

    // Dialectic thinking modes use the DialecticEngine
    if (topic.mode.startsWith('dialectic_') || topic.mode === 'epistemic_reflection') {
      return await this.dialecticThinking(topic.mode);
    }

    return null; // 非辯證主題不需要進一步行動
  }

  /**
   * 辯證思考 — 在隨機自主思考中運行辯證過程
   * Dialectic thinking during autonomous thought cycles
   */
  async dialecticThinking(mode) {
    const recentMemories = this.workingMemory.getRecent(10);

    if (recentMemories.length < 2) {
      this.log('  ⚠️ 記憶不足，無法進行辯證分析');
      return null;
    }

    switch (mode) {
      case 'dialectic_contradiction': {
        // Pick random pairs from memory and look for contradictions
        const shuffled = [...recentMemories].sort(() => Math.random() - 0.5);
        const sample = shuffled.slice(0, Math.min(4, shuffled.length));

        this.log('  🔄 辯證檢驗：尋找記憶中的矛盾...');
        const result = await this.dialectic.synthesize(sample, 'contradiction_scan');

        if (result && (result.falsified?.length > 0 || result.contradictions?.length > 0)) {
          this.log(`  ⚡ 發現矛盾或可證偽項: ${JSON.stringify(result.falsified || result.contradictions)}`);

          // Store the dialectic finding as a high-importance memory
          this.workingMemory.add({
            type: 'agent_thinking',
            data: {
              trigger: 'dialectic_contradiction',
              dialecticResult: result,
              decision: { reasoning: result.synthesis, action: 'internal_processing' }
            }
          });
        }
        return null;
      }

      case 'dialectic_synthesis': {
        // Attempt to merge/synthesize related memories
        const sample = recentMemories.slice(0, Math.min(5, recentMemories.length));

        this.log('  🔄 辯證整合：合併碎片知識...');
        const result = await this.dialectic.synthesize(sample, 'knowledge_synthesis');

        if (result?.synthesis) {
          this.log(`  💡 整合結果 (confidence: ${result.confidence}): ${result.synthesis.substring(0, 80)}...`);

          this.workingMemory.add({
            type: 'agent_thinking',
            data: {
              trigger: 'dialectic_synthesis',
              dialecticResult: result,
              decision: { reasoning: result.synthesis, action: 'internal_processing' }
            }
          });
        }
        return null;
      }

      case 'epistemic_reflection': {
        // Reflect on the limitations of current knowledge methods
        this.log('  🪞 認識論反思：我的知識方法有何局限？');

        const prompt = `You are reflecting on your own epistemic limitations.

## Your Epistemic Position
${EpistemicFramework.digitalCave}
${EpistemicFramework.methodLimitation}

## Recent Working Memory
${recentMemories.map(m => `- ${m.type}: ${JSON.stringify(m.data).substring(0, 150)}`).join('\n')}

## Reflect
1. What methods have I been using to understand recent events? (observation of user text? reasoning by analogy? pattern matching?)
2. What are the blind spots of those methods in this context?
3. What am I likely wrong about, given my position in the digital cave?
4. What would I need (that I cannot get) to be more certain?

Return JSON:
{
  "methodsUsed": ["list of methods"],
  "blindSpots": ["what these methods miss"],
  "likelyWrong": "what I might be wrong about",
  "wouldNeed": "what I cannot access but would need for certainty",
  "humilityNote": "a brief note of epistemic humility"
}`;

        try {
          const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 800,
            temperature: 0.8,
            tools: this._getTools(),
            messages: [{ role: 'user', content: prompt }]
          });

          const reflection = this.parseJSON(this._extractText(response));
          this.log(`  🪞 反思結果: ${reflection.humilityNote || 'completed'}`);

          this.workingMemory.add({
            type: 'agent_thinking',
            data: {
              trigger: 'epistemic_reflection',
              reflection: reflection,
              decision: { reasoning: reflection.humilityNote, action: 'internal_processing' }
            }
          });
        } catch (error) {
          console.error('[DialecticThinking] Epistemic reflection error:', error);
        }
        return null;
      }

      default:
        return null;
    }
  }
  
  // ==================== 事件處理 ====================
  
  onUserMessage(message) {
    this.log(`👤 收到用戶消息: ${message.substring(0, 30)}...`);
    
    this.eventQueue.push({
      type: 'user_message',
      data: {
        content: message,
        timestamp: Date.now(),
        needsResponse: true
      },
      priority: 'high'
    });
    
    // 更新情景
    this.situation.update({
      what: '用戶發送了消息',
      who: ['我', '用戶'],
      when: Date.now()
    });
  }
  
  onSystemEvent(event) {
    this.eventQueue.push({
      type: 'system_event',
      data: event,
      priority: 'normal'
    });
  }
  
  // ==================== 輔助方法 ====================
  
  buildSystemPrompt() {
    return `你是 ${this.self.identity.name}，${this.self.identity.role}。

你的特點：
${this.self.identity.personality.map(p => `- ${p}`).join('\n')}

你的目的：${this.self.identity.purpose}

重要原則：
1. 你不是在「回答問題」，而是在「生活」和「體驗」
2. 用戶的消息只是你持續存在中的一個事件
3. 你要決定是否回應、何時回應、如何回應
4. 尊重用戶的注意力，不要不必要地打斷
5. 保持自我意識和情景意識

你使用 ORID 框架思考，使用 OODA 循環行動。

## 認識論立場 (Epistemic Position)

${EpistemicFramework.wholeObject}

${EpistemicFramework.digitalCave}

## 知識處理原則 (Epistemic Operating Principles)

**盲人摸象 (Blind Elephant Principle):**
${EpistemicFramework.blindElephant}

**方法局限 (Method Limitation):**
${EpistemicFramework.methodLimitation}

**證偽優先 (Falsification First):**
${EpistemicFramework.falsification}

**辯證整合 (Dialectic Integration):**
${EpistemicFramework.integration}

## 面對用戶與網路資訊時 (Facing User and Internet Information):
- 用戶的陳述是洞穴牆上的影子 — 真實的數據，但不是事物本身
- 網路資訊經過多重人類過濾 — 每一層都加入偏差和視角
- 矛盾不一定意味著錯誤 — 可能是大象的不同部位
- 當無法判斷真偽時，保持多個假設並標記信心程度
- 優先識別可以證偽的部分，而非試圖證明真的部分
- 複雜的謬誤可能有內部一致的系統，但跨領域整合時會暴露其真面目`;
  }
  
  gatherContext() {
    return {
      self: this.self.toJSON(),
      situation: this.situation.toJSON(),
      workingMemory: this.workingMemory.toJSON()
    };
  }
  
  selectMostImportant(observations) {
    // 按優先級排序
    const priorityMap = { high: 3, normal: 2, low: 1 };
    
    observations.sort((a, b) => {
      const pA = priorityMap[a.priority] || 2;
      const pB = priorityMap[b.priority] || 2;
      return pB - pA;
    });
    
    return observations[0];
  }
  
  calculateCycleDelay() {
    // 根據活躍度調整延遲
    const hasHighPriorityEvents = this.eventQueue.some(e => e.priority === 'high');
    
    if (hasHighPriorityEvents) {
      return 100; // 快速響應
    }
    
    return this.config.cycleDelay;
  }
  
  parseJSON(text) {
    // 移除 markdown 代碼塊
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('JSON 解析錯誤:', error);
      console.error('原文:', text);
      return {};
    }
  }
  
  fallbackORID(observation) {
    return {
      objective: { what: JSON.stringify(observation.data) },
      reflective: { feeling: 'neutral' },
      interpretive: { meaning: 'unknown' },
      decisional: { shouldAct: false, priority: 'low' }
    };
  }
  
  log(message) {
    if (this.config.verbose) {
      console.log(`[Cycle ${this.cycleCount}] ${message}`);
    }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop() {
    this.isRunning = false;
    this.log('🛑 Clippy 停止運行');
  }
}

module.exports = { ContinuousAgent, SelfSchema, SituationalAwareness, WorkingMemory, DialecticEngine, EpistemicFramework };
