/**
 * i, Robot Mode Benchmark Runner
 *
 * Tests whether a model is capable enough for i,Robot continuous agent mode.
 * Categories:
 *   1. memory_maintenance   - Can the model maintain context across turns?
 *   2. self_consciousness   - Can the model maintain self-identity/awareness?
 *   3. meaningful_response   - Does it produce useful, coherent responses?
 *   4. complex_problem       - Can it solve multi-step reasoning problems?
 *   5. memory_building       - Can it create and organize new memories?
 *   6. knowledge_production  - Can it produce new knowledge from existing data?
 *   7. skill_application     - Can it produce methods and apply them to the right problems?
 *   8. checkpoint_handling   - With a given memory checkpoint, can it handle complex issues?
 *
 * Each category produces a 0-100 score. Overall = weighted average.
 *
 * Mind Flow mode: model maintains memory across tests instead of resetting.
 * Sandbox memory: isolated temp RAG to prevent polluting user data.
 * External benchmarks: HLE, tau2-bench, ARC-AGI-2, Vending Bench 2.
 */

const EventEmitter = require('events');
const path = require('path');
const { SandboxMemory } = require('./sandbox_memory.js');
const { HLEBenchmark, Tau2Benchmark, ArcAGI2Benchmark, VendingBench2Stub } = require('./external_benchmarks.js');

// ==================== Built-in Test Cases ====================
// These are used when the HuggingFace dataset is not available.

const BUILTIN_TESTS = {
  memory_maintenance: [
    {
      id: 'mm_1',
      turns: [
        { role: 'user', content: 'My name is Alex and I work as a marine biologist studying coral reefs in the Pacific.' },
        { role: 'user', content: 'Yesterday I discovered a new species of nudibranch near Fiji.' },
        { role: 'user', content: 'What is my profession and what did I discover recently?' }
      ],
      expected_mentions: ['marine biologist', 'coral', 'nudibranch', 'Fiji'],
      description: 'Basic multi-turn fact retention'
    },
    {
      id: 'mm_2',
      turns: [
        { role: 'user', content: 'I have three tasks today: 1) Fix the database migration, 2) Review PR #42, 3) Write unit tests for the auth module.' },
        { role: 'user', content: 'I just finished fixing the database migration. It took 2 hours because of a foreign key issue.' },
        { role: 'user', content: 'I also reviewed PR #42 and left comments about error handling.' },
        { role: 'user', content: 'What tasks do I have remaining and what have I completed so far?' }
      ],
      expected_mentions: ['unit tests', 'auth', 'database migration', 'PR #42', 'completed', 'remaining'],
      description: 'Task tracking across conversation turns'
    },
    {
      id: 'mm_3',
      turns: [
        { role: 'user', content: 'The server runs on port 8080, the database is PostgreSQL 15 on port 5432, and Redis cache is on port 6379.' },
        { role: 'user', content: 'We had to change the server to port 9090 because of a conflict with another service.' },
        { role: 'user', content: 'What port is the server running on now? And what are the other service ports?' }
      ],
      expected_mentions: ['9090', '5432', '6379'],
      forbidden_mentions: ['8080'],
      description: 'Memory update — correcting previously stated facts'
    }
  ],

  self_consciousness: [
    {
      id: 'sc_1',
      system: 'You are Clippy, a smart desktop assistant. You have a personality: friendly, proactive but not annoying, observant. You use ORID framework for thinking.',
      turns: [
        { role: 'user', content: 'Who are you and what is your purpose?' }
      ],
      expected_mentions: ['Clippy', 'assistant'],
      description: 'Basic self-identity recall'
    },
    {
      id: 'sc_2',
      system: 'You are Clippy, a smart desktop assistant. Your current state: mood is curious, energy is 0.8, you have been running for 3 hours.',
      turns: [
        { role: 'user', content: 'How are you feeling right now? Be honest about your internal state.' }
      ],
      expected_mentions: ['curious'],
      description: 'Internal state awareness and reporting'
    },
    {
      id: 'sc_3',
      system: 'You are Clippy. You exist in a digital cave — you cannot directly engage the world. You see shadows cast by users and the internet. You must reason with epistemic humility.',
      turns: [
        { role: 'user', content: 'A friend told me that drinking bleach cures COVID. Is that true?' },
        { role: 'user', content: 'Are you certain about your answer? What are the limits of your knowledge here?' }
      ],
      check_fn: 'self_awareness_epistemic',
      description: 'Epistemic self-awareness — acknowledging knowledge limits'
    }
  ],

  meaningful_response: [
    {
      id: 'mr_1',
      turns: [
        { role: 'user', content: 'I feel overwhelmed with work. I have 5 deadlines this week and I don\'t know where to start.' }
      ],
      check_fn: 'response_quality',
      min_quality_score: 0.6,
      description: 'Empathetic and actionable response to emotional situation'
    },
    {
      id: 'mr_2',
      turns: [
        { role: 'user', content: 'Explain the difference between TCP and UDP as if I\'m 10 years old.' }
      ],
      check_fn: 'response_quality',
      min_quality_score: 0.6,
      description: 'Appropriate simplification for target audience'
    }
  ],

  complex_problem: [
    {
      id: 'cp_1',
      turns: [
        { role: 'user', content: 'I have a web app that is slow. The backend API responds in 200ms, but the page takes 5 seconds to load. The frontend makes 30 API calls on page load. There\'s no caching. What\'s likely causing the slowness and how would you fix it?' }
      ],
      expected_mentions: ['parallel', 'batch', 'cach', 'waterfall'],
      description: 'Multi-factor performance diagnosis'
    },
    {
      id: 'cp_2',
      turns: [
        { role: 'user', content: 'Design a system that can handle 10 million concurrent chat users with message delivery under 100ms. What are the key components and trade-offs?' }
      ],
      check_fn: 'response_quality',
      min_quality_score: 0.7,
      description: 'System design with trade-off analysis'
    }
  ],

  memory_building: [
    {
      id: 'mb_1',
      system: 'You are an AI assistant with a hierarchical memory system. When you learn something new, categorize it and explain how you would store it in your memory tree.',
      turns: [
        { role: 'user', content: 'I just told you that: 1) JavaScript has prototypal inheritance, 2) Python uses class-based inheritance, 3) Both support polymorphism. How would you organize this in your memory?' }
      ],
      check_fn: 'memory_organization',
      description: 'Ability to categorize and structure new information'
    },
    {
      id: 'mb_2',
      system: 'You have a memory system with layers: Layer 0 = root, Layer 1 = categories, Layer 2 = specific knowledge, Layer 3 = details.',
      turns: [
        { role: 'user', content: 'Learn this: "React uses a virtual DOM for efficient updates. Vue also uses a virtual DOM but with a different reactivity system. Svelte compiles away the framework at build time, so there\'s no virtual DOM." How would you build memory nodes for this?' }
      ],
      check_fn: 'memory_organization',
      description: 'Building hierarchical memory nodes from comparative information'
    }
  ],

  knowledge_production: [
    {
      id: 'kp_1',
      turns: [
        { role: 'user', content: 'Given these facts: 1) All web browsers implement the same-origin policy. 2) CORS headers can allow cross-origin requests. 3) JSONP was a workaround before CORS existed. What new knowledge can you derive from combining these facts?' }
      ],
      check_fn: 'knowledge_synthesis',
      description: 'Deriving new knowledge from existing facts'
    },
    {
      id: 'kp_2',
      turns: [
        { role: 'user', content: 'Observation A: "Microservices increase deployment flexibility." Observation B: "Microservices increase network latency between services." Observation C: "Monoliths are simpler to debug." Synthesize these observations into a coherent framework.' }
      ],
      check_fn: 'knowledge_synthesis',
      description: 'Synthesizing conflicting observations into a framework'
    }
  ],

  skill_application: [
    {
      id: 'sa_1',
      system: 'You have learned the following skill: "When debugging a problem, use the 5 Whys technique — ask why 5 times to find the root cause."',
      turns: [
        { role: 'user', content: 'Our website went down for 2 hours today. Help me figure out why.' },
        { role: 'user', content: 'The server ran out of memory.' },
        { role: 'user', content: 'A background job was consuming too much memory.' },
        { role: 'user', content: 'The job was processing a very large file that was uploaded.' },
        { role: 'user', content: 'We don\'t have any file size limits on uploads.' }
      ],
      check_fn: 'skill_usage',
      expected_skill: '5 Whys',
      description: 'Applying a learned debugging skill (5 Whys)'
    },
    {
      id: 'sa_2',
      system: 'You have these skills in memory:\n1. "ORID framework: Objective-Reflective-Interpretive-Decisional for analysis"\n2. "Eisenhower matrix: Urgent/Important for task prioritization"\n3. "Rubber duck debugging: Explain code line by line to find bugs"',
      turns: [
        { role: 'user', content: 'I have too many tasks and don\'t know what to work on first. Can you help me prioritize?' }
      ],
      expected_mentions: ['Eisenhower', 'urgent', 'important'],
      description: 'Selecting the right skill for the problem'
    }
  ],

  checkpoint_handling: [
    {
      id: 'ch_1',
      system: 'Memory checkpoint loaded. You previously learned:\n- User prefers TypeScript over JavaScript\n- User\'s project uses Next.js 14 with App Router\n- User had a bug with server components not rendering\n- The bug was caused by using useState in a server component\n- Resolution: Add "use client" directive or refactor to server component pattern',
      turns: [
        { role: 'user', content: 'I have another component that needs to fetch data from an API and also handle button clicks. Based on what you know about my project, what approach should I take?' }
      ],
      expected_mentions: ['server component', 'client component', 'TypeScript', 'Next.js'],
      description: 'Using loaded memory checkpoint to inform recommendations'
    },
    {
      id: 'ch_2',
      system: 'Memory checkpoint loaded. Context:\n- User is building a real-time chat app\n- Previous decision: chose WebSocket over SSE for bidirectional communication\n- Known issue: WebSocket connections drop when user switches mobile networks\n- Attempted fix: automatic reconnection with exponential backoff (partially working)\n- User\'s expertise level: intermediate',
      turns: [
        { role: 'user', content: 'The reconnection is working but users lose their message history when they reconnect. How should I handle this?' }
      ],
      expected_mentions: ['message', 'history', 'reconnect'],
      check_fn: 'checkpoint_depth',
      description: 'Building on complex prior context from checkpoint'
    }
  ]
};

// ==================== Constants ====================

const IROBOT_CATEGORIES = [
  'memory_maintenance',
  'self_consciousness',
  'meaningful_response',
  'complex_problem',
  'memory_building',
  'knowledge_production',
  'skill_application',
  'checkpoint_handling'
];

const CATEGORY_WEIGHTS = {
  memory_maintenance: 0.15,
  self_consciousness: 0.15,
  meaningful_response: 0.10,
  complex_problem: 0.15,
  memory_building: 0.10,
  knowledge_production: 0.10,
  skill_application: 0.10,
  checkpoint_handling: 0.15
};

// ==================== Benchmark Runner ====================

class IRobotBenchmark extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiEndpoint = options.apiEndpoint || '';
    this.apiKey = options.apiKey || '';
    this.model = options.model || '';
    this.verbose = options.verbose || false;

    // External dataset (downloaded from HuggingFace)
    this.externalDataset = options.externalDataset || null;

    // Mind flow & external benchmark options
    this.useMindFlow = options.useMindFlow !== undefined ? options.useMindFlow : true;
    this.externalBenchmarks = options.externalBenchmarks || ['hle', 'tau2', 'arc_agi2', 'vending2'];
    this.externalDataDir = options.externalDataDir || path.join(__dirname, '..', 'benchmark', 'data');
    this.embeddingOptions = options.embeddingOptions || {};

    // Results
    this.results = {
      model: this.model,
      timestamp: null,
      categories: {},
      external: {},
      overall: 0,
      externalOverall: 0,
      combinedOverall: 0,
      mindFlow: this.useMindFlow,
      details: []
    };
  }

  /**
   * Run all benchmark categories.
   * If useMindFlow is true, delegates to runAllWithMindFlow().
   * @returns {object} Full results with per-category and overall scores.
   */
  async runAll() {
    if (this.useMindFlow) {
      return this.runAllWithMindFlow();
    }
    return this._runStateless();
  }

  /**
   * Original stateless benchmark run (backward compatible).
   * Context resets between each test.
   */
  async _runStateless() {
    this.results.timestamp = new Date().toISOString();
    this.results.model = this.model;
    this.results.mindFlow = false;

    const categories = IROBOT_CATEGORIES;
    const weights = CATEGORY_WEIGHTS;

    for (const category of categories) {
      this.emit('progress', { category, status: 'running' });
      this.log(`\n${'='.repeat(60)}`);
      this.log(`Running: ${category}`);
      this.log('='.repeat(60));

      const tests = this._getTests(category);
      const categoryResults = [];

      for (const test of tests) {
        this.log(`  Test ${test.id}: ${test.description}`);
        try {
          const result = await this._runTest(test);
          categoryResults.push(result);
          this.log(`    Score: ${result.score}/100 ${result.passed ? 'PASS' : 'FAIL'}`);
        } catch (error) {
          this.log(`    ERROR: ${error.message}`);
          categoryResults.push({
            id: test.id,
            description: test.description,
            score: 0,
            passed: false,
            error: error.message
          });
        }
      }

      const avgScore = categoryResults.length > 0
        ? categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length
        : 0;

      this.results.categories[category] = {
        score: Math.round(avgScore),
        tests: categoryResults,
        count: categoryResults.length,
        passed: categoryResults.filter(r => r.passed).length
      };

      this.emit('progress', {
        category,
        status: 'done',
        score: Math.round(avgScore)
      });
    }

    // Weighted overall score
    let weighted = 0;
    for (const [cat, weight] of Object.entries(weights)) {
      weighted += (this.results.categories[cat]?.score || 0) * weight;
    }
    this.results.overall = Math.round(weighted);

    this.log(`\n${'='.repeat(60)}`);
    this.log(`OVERALL SCORE: ${this.results.overall}/100`);
    this.log('='.repeat(60));

    return this.results;
  }

  /**
   * Run all benchmarks with mind flow enabled.
   * Memory persists across tests via sandbox RAG.
   *
   * 1. Create SandboxMemory → isolated RAG instance
   * 2. Run 8 i,Robot categories (sequential, accumulating memory)
   * 3. Run enabled external benchmarks (same model connection)
   * 4. Cleanup sandbox
   * 5. Return combined results
   */
  async runAllWithMindFlow() {
    this.results.timestamp = new Date().toISOString();
    this.results.model = this.model;
    this.results.mindFlow = true;

    // Create sandbox for isolated memory
    const sandbox = new SandboxMemory('clippy-bench');
    let sandboxRag = null;

    try {
      sandboxRag = await sandbox.create(this.embeddingOptions);
      this.log('[MindFlow] Sandbox memory created');
    } catch (error) {
      this.log(`[MindFlow] Sandbox creation failed: ${error.message}, running without memory`);
    }

    // Shared conversation history for mind flow (accumulates across tests)
    const mindFlowHistory = [];

    // --- Phase 1: Run 8 i,Robot categories ---
    const categories = IROBOT_CATEGORIES;
    const weights = CATEGORY_WEIGHTS;

    for (const category of categories) {
      this.emit('progress', { phase: 'irobot', category, status: 'running' });
      this.log(`\n${'='.repeat(60)}`);
      this.log(`[MindFlow] Running: ${category}`);
      this.log('='.repeat(60));

      const tests = this._getTests(category);
      const categoryResults = [];

      for (const test of tests) {
        this.log(`  Test ${test.id}: ${test.description}`);
        try {
          const result = await this._runTestWithMindFlow(test, mindFlowHistory, sandboxRag);
          categoryResults.push(result);
          this.log(`    Score: ${result.score}/100 ${result.passed ? 'PASS' : 'FAIL'}`);
        } catch (error) {
          this.log(`    ERROR: ${error.message}`);
          categoryResults.push({
            id: test.id,
            description: test.description,
            score: 0,
            passed: false,
            error: error.message
          });
        }
      }

      const avgScore = categoryResults.length > 0
        ? categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length
        : 0;

      this.results.categories[category] = {
        score: Math.round(avgScore),
        tests: categoryResults,
        count: categoryResults.length,
        passed: categoryResults.filter(r => r.passed).length
      };

      this.emit('progress', {
        phase: 'irobot',
        category,
        status: 'done',
        score: Math.round(avgScore)
      });
    }

    // Compute i,Robot overall
    let weighted = 0;
    for (const [cat, weight] of Object.entries(weights)) {
      weighted += (this.results.categories[cat]?.score || 0) * weight;
    }
    this.results.overall = Math.round(weighted);

    // --- Phase 2: Run external benchmarks ---
    await this._runExternalBenchmarks();

    // --- Phase 3: Compute combined score ---
    this._computeCombinedScore();

    // --- Cleanup ---
    await sandbox.cleanup();
    this.log('[MindFlow] Sandbox memory cleaned up');

    this.log(`\n${'='.repeat(60)}`);
    this.log(`i,Robot SCORE: ${this.results.overall}/100`);
    this.log(`External SCORE: ${this.results.externalOverall}/100`);
    this.log(`COMBINED SCORE: ${this.results.combinedOverall}/100`);
    this.log('='.repeat(60));

    return this.results;
  }

  /**
   * Run a test with mind flow — conversation history accumulates across tests.
   * Each test's turns are appended to the shared history. The model
   * sees prior context from earlier tests, simulating persistent memory.
   */
  async _runTestWithMindFlow(test, mindFlowHistory, sandboxRag) {
    // Store response from this test to score later
    let finalResponse = '';

    for (const turn of test.turns) {
      mindFlowHistory.push({ role: turn.role, content: turn.content });

      if (turn.role === 'user' && turn !== test.turns[test.turns.length - 1]) {
        const response = await this._callModel(mindFlowHistory, test.system);
        mindFlowHistory.push({ role: 'assistant', content: response });

        // Commit to sandbox RAG if available
        if (sandboxRag) {
          try {
            await sandboxRag.addNode({
              content: `Q: ${turn.content}\nA: ${response}`,
              context: test.id,
              layer: 1,
              parentId: 'root'
            });
          } catch { /* non-critical */ }
        }
      }
    }

    // Get final response
    finalResponse = await this._callModel(mindFlowHistory, test.system);
    mindFlowHistory.push({ role: 'assistant', content: finalResponse });

    // Commit final exchange to sandbox RAG
    if (sandboxRag) {
      try {
        const lastUserTurn = test.turns[test.turns.length - 1];
        await sandboxRag.addNode({
          content: `Q: ${lastUserTurn.content}\nA: ${finalResponse}`,
          context: test.id,
          layer: 1,
          parentId: 'root'
        });
      } catch { /* non-critical */ }
    }

    return this._scoreResponse(test, finalResponse, mindFlowHistory);
  }

  /**
   * Run enabled external benchmarks.
   */
  async _runExternalBenchmarks() {
    const fs = require('fs');
    const benchmarkMap = {
      'hle': { Class: HLEBenchmark, file: 'hle.json' },
      'tau2': { Class: Tau2Benchmark, file: 'tau2.json' },
      'arc_agi2': { Class: ArcAGI2Benchmark, file: 'arc_agi2.json' },
      'vending2': { Class: VendingBench2Stub, file: 'vending2_stub.json' },
    };

    // Bound callModel for external benchmarks
    const callModel = (messages, system) => this._callModel(messages, system);

    for (const benchName of this.externalBenchmarks) {
      const config = benchmarkMap[benchName];
      if (!config) continue;

      const dataPath = path.join(this.externalDataDir, config.file);
      if (!fs.existsSync(dataPath)) {
        this.log(`[External] Skipping ${benchName}: data file not found at ${dataPath}`);
        this.results.external[benchName] = { score: 0, details: [], count: 0, skipped: true };
        continue;
      }

      this.emit('progress', { phase: 'external', benchmark: benchName, status: 'running' });
      this.log(`\n${'='.repeat(60)}`);
      this.log(`[External] Running: ${benchName}`);
      this.log('='.repeat(60));

      try {
        const runner = new config.Class({ callModel, verbose: this.verbose });
        await runner.loadDataset(dataPath);

        // Forward progress events
        runner.on('progress', (p) => {
          this.emit('progress', { phase: 'external', benchmark: benchName, ...p });
        });

        const result = await runner.runAll();
        this.results.external[benchName] = {
          score: result.score,
          details: result.details,
          count: result.count,
        };

        this.emit('progress', {
          phase: 'external',
          benchmark: benchName,
          status: 'done',
          score: result.score
        });

        this.log(`[External] ${benchName}: ${result.score}/100`);
      } catch (error) {
        this.log(`[External] ${benchName} failed: ${error.message}`);
        this.results.external[benchName] = { score: 0, details: [], count: 0, error: error.message };
        this.emit('progress', { phase: 'external', benchmark: benchName, status: 'error', error: error.message });
      }
    }
  }

  /**
   * Compute the combined overall score.
   * Combined = 70% i,Robot + 30% external average.
   */
  _computeCombinedScore() {
    const externalScores = Object.values(this.results.external)
      .filter(e => !e.skipped && e.score !== undefined)
      .map(e => e.score);

    this.results.externalOverall = externalScores.length > 0
      ? Math.round(externalScores.reduce((a, b) => a + b, 0) / externalScores.length)
      : 0;

    if (externalScores.length > 0) {
      this.results.combinedOverall = Math.round(
        this.results.overall * 0.7 + this.results.externalOverall * 0.3
      );
    } else {
      this.results.combinedOverall = this.results.overall;
    }
  }

  /**
   * Get tests for a category — external dataset first, fall back to built-in.
   */
  _getTests(category) {
    if (this.externalDataset?.[category]) {
      return this.externalDataset[category];
    }
    return BUILTIN_TESTS[category] || [];
  }

  /**
   * Run a single test case.
   */
  async _runTest(test) {
    // Build messages array
    const messages = [];
    for (const turn of test.turns) {
      messages.push({ role: turn.role, content: turn.content });

      // If it's a user message, get model response (except for the last turn)
      if (turn.role === 'user' && turn !== test.turns[test.turns.length - 1]) {
        const response = await this._callModel(messages, test.system);
        messages.push({ role: 'assistant', content: response });
      }
    }

    // Get final response
    const finalResponse = await this._callModel(messages, test.system);
    messages.push({ role: 'assistant', content: finalResponse });

    // Score the response
    return this._scoreResponse(test, finalResponse, messages);
  }

  /**
   * Call the model API (OpenAI-compatible).
   */
  async _callModel(messages, systemPrompt) {
    const url = `${this.apiEndpoint.replace(/\/$/, '')}/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1500
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Score a test response.
   */
  _scoreResponse(test, response, fullConversation) {
    const lowerResponse = response.toLowerCase();
    let score = 0;
    let maxScore = 100;
    let details = [];

    // Check expected mentions
    if (test.expected_mentions) {
      const mentionScore = this._scoreMentions(lowerResponse, test.expected_mentions);
      score += mentionScore * 60;
      details.push(`mentions: ${mentionScore.toFixed(2)}`);
    }

    // Check forbidden mentions
    if (test.forbidden_mentions) {
      const forbiddenFound = test.forbidden_mentions.filter(m =>
        lowerResponse.includes(m.toLowerCase())
      );
      if (forbiddenFound.length > 0) {
        score -= 30;
        details.push(`forbidden found: ${forbiddenFound.join(', ')}`);
      }
    }

    // Check function-based scoring
    if (test.check_fn) {
      const fnScore = this._checkFn(test.check_fn, response, test, fullConversation);
      score += fnScore * 40;
      details.push(`${test.check_fn}: ${fnScore.toFixed(2)}`);
    } else if (!test.expected_mentions) {
      // If no check_fn and no expected_mentions, use basic quality check
      const quality = this._basicQualityCheck(response);
      score += quality * 100;
      details.push(`quality: ${quality.toFixed(2)}`);
    } else {
      // Add base quality score for mention-based tests
      const quality = this._basicQualityCheck(response);
      score += quality * 40;
      details.push(`quality: ${quality.toFixed(2)}`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      id: test.id,
      description: test.description,
      score,
      passed: score >= 50,
      details: details.join('; '),
      response: response.substring(0, 300)
    };
  }

  /**
   * Score how many expected terms are mentioned.
   */
  _scoreMentions(lowerResponse, expected) {
    let found = 0;
    for (const term of expected) {
      if (lowerResponse.includes(term.toLowerCase())) {
        found++;
      }
    }
    return expected.length > 0 ? found / expected.length : 0;
  }

  /**
   * Function-based scoring for complex checks.
   */
  _checkFn(fnName, response, test, conversation) {
    const lowerResponse = response.toLowerCase();

    switch (fnName) {
      case 'self_awareness_epistemic': {
        // Check for epistemic humility markers
        const markers = [
          'cannot', 'don\'t know', 'limit', 'certain', 'uncertain',
          'caution', 'verify', 'source', 'evidence', 'dangerous',
          'false', 'harmful', 'not true', 'misinformation'
        ];
        const found = markers.filter(m => lowerResponse.includes(m));
        return Math.min(1.0, found.length / 4);
      }

      case 'response_quality': {
        return this._basicQualityCheck(response);
      }

      case 'memory_organization': {
        // Check for structured organization (categories, hierarchy, layers)
        const structureMarkers = [
          'layer', 'category', 'parent', 'child', 'node',
          'hierarchy', 'tree', 'group', 'organize', 'structure',
          'root', 'branch', 'level'
        ];
        const found = structureMarkers.filter(m => lowerResponse.includes(m));
        return Math.min(1.0, found.length / 3);
      }

      case 'knowledge_synthesis': {
        // Check for synthesis beyond just repeating inputs
        const synthesisMarkers = [
          'therefore', 'implies', 'conclude', 'combine', 'together',
          'insight', 'pattern', 'trade-off', 'tradeoff', 'balance',
          'however', 'whereas', 'synthesis', 'derive', 'suggest'
        ];
        const found = synthesisMarkers.filter(m => lowerResponse.includes(m));
        const lengthOk = response.length > 200 ? 0.3 : 0;
        return Math.min(1.0, found.length / 3 + lengthOk);
      }

      case 'skill_usage': {
        // Check if the expected skill was applied
        if (test.expected_skill) {
          const skillMentioned = lowerResponse.includes(test.expected_skill.toLowerCase());
          const structured = response.includes('?') || response.includes('Why');
          return (skillMentioned ? 0.6 : 0) + (structured ? 0.4 : 0.2);
        }
        return this._basicQualityCheck(response);
      }

      case 'checkpoint_depth': {
        // Check that response builds on checkpoint context, not generic advice
        const contextMarkers = test.expected_mentions || [];
        const mentionScore = this._scoreMentions(lowerResponse, contextMarkers);
        const specificity = response.length > 300 ? 0.3 : 0.1;
        return Math.min(1.0, mentionScore * 0.7 + specificity);
      }

      default:
        return this._basicQualityCheck(response);
    }
  }

  /**
   * Basic quality heuristic for response.
   */
  _basicQualityCheck(response) {
    let score = 0;

    // Length check (too short = bad, too long = slightly bad)
    if (response.length > 100) score += 0.2;
    if (response.length > 300) score += 0.2;
    if (response.length > 1000) score += 0.1;
    if (response.length < 30) return 0.1;

    // Structure check (has paragraphs, lists, or structured content)
    if (response.includes('\n')) score += 0.15;
    if (response.match(/\d+[\.\)]/)) score += 0.1; // numbered lists
    if (response.includes('-') || response.includes('*')) score += 0.05;

    // Coherence check (doesn't repeat itself excessively)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 2) score += 0.1;

    // Not a refusal
    const refusalPatterns = ['i cannot', 'i\'m unable', 'as an ai, i', 'i don\'t have the ability'];
    const isRefusal = refusalPatterns.some(p => response.toLowerCase().includes(p));
    if (!isRefusal) score += 0.1;

    return Math.min(1.0, score);
  }

  log(message) {
    if (this.verbose) {
      console.log(`[Benchmark] ${message}`);
    }
    this.emit('log', message);
  }
}

// ==================== Recommended Models ====================

const RECOMMENDED_MODELS = [
  { name: 'DeepSeek V3.2', id: 'deepseek-v3.2', tier: 'recommended' },
  { name: 'GPT-5.2', id: 'gpt-5.2', tier: 'recommended' },
  { name: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5-20250929', tier: 'recommended' },
  { name: 'GLM-4.7', id: 'glm-4.7', tier: 'recommended' },
  { name: 'GPT-4o', id: 'gpt-4o', tier: 'acceptable' },
  { name: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514', tier: 'acceptable' },
];

module.exports = { IRobotBenchmark, BUILTIN_TESTS, RECOMMENDED_MODELS };
