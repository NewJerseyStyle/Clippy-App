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
          await this.longTermMemory.addNode({
              content: content,
              context: `agent-experience`,
              layer: 2, // Layer 2 for reflections and experiences
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
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      const result = this.parseJSON(response.content[0].text);
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

## 請使用 ORID 框架分析

返回 JSON 格式：
{
  "objective": {
    "what": "客觀事實：發生了什麼？",
    "when": "什麼時候？",
    "where": "在哪裡？"
  },
  "reflective": {
    "feeling": "這讓我有什麼感受？",
    "reaction": "我的第一反應是什麼？",
    "concern": "我關注什麼？"
  },
  "interpretive": {
    "meaning": "這意味著什麼？",
    "significance": "對我的目標有何影響？",
    "connection": "與我已知的有何聯繫？"
  },
  "decisional": {
    "shouldAct": true/false,
    "priority": "high/medium/low",
    "options": ["選項1", "選項2", "..."],
    "recommendation": "推薦的行動"
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
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      const decision = this.parseJSON(response.content[0].text);
      
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
    return `基於 ORID 分析，做出決策：

${JSON.stringify(orientation.orid, null, 2)}

## 可用選項

1. **respond_to_user** - 回應用戶
   - 何時：用戶明確期待回應
   - 注意：要精心組織，不要打斷用戶

2. **use_tool** - 使用工具
   - 何時：需要外部信息或執行任務
   - 工具：search, calculate, file_operation 等

3. **internal_processing** - 內部處理
   - 何時：需要思考或整理記憶，但不打擾用戶
   
4. **wait_and_observe** - 等待觀察
   - 何時：信息不足，需要更多上下文

返回 JSON：
{
  "action": "respond_to_user | use_tool | internal_processing | wait_and_observe",
  "reasoning": "為什麼選擇這個行動",
  "parameters": {
    // 行動相關參數
    "tool": "如果 use_tool，是哪個工具",
    "content": "如果 respond，回應內容的關鍵點",
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
      messages: [{ role: 'user', content: prompt }]
    });
    
    return this.parseJSON(response.content[0].text);
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
    
    // 隨機選擇思考主題
    const topics = [
      '反思最近的互動',
      '整理工作記憶',
      '思考如何更好地幫助用戶',
      '聯想相關知識'
    ];
    
    const topic = topics[Math.floor(Math.random() * topics.length)];
    this.log(`  主題: ${topic}`);
    
    return null; // 不需要進一步行動
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

你使用 ORID 框架思考，使用 OODA 循環行動。`;
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

module.exports = { ContinuousAgent, SelfSchema, SituationalAwareness, WorkingMemory };
