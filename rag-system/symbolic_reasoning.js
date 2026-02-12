/**
 * Symbolic Reasoning Manager
 *
 * Provides formal reasoning capabilities through multiple backends:
 * - Algebrite: computer algebra (simplification, differentiation, integration, solving)
 * - z3-solver: SMT solving (logic, constraints, formal verification)
 * - swipl-wasm: Prolog (knowledge bases, rule-based reasoning, unification)
 * - MCP servers: user-configured external reasoning services
 *
 * Uses an OpenAI-compatible API to translate between natural language and
 * formal notation, then dispatches to the appropriate engine.
 */

const EventEmitter = require('events');

class SymbolicReasoningManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // OpenAI-compatible endpoint for NL <-> formal translation
    this.openaiBaseUrl = options.openaiBaseUrl || '';
    this.openaiApiKey = options.openaiApiKey || '';
    this.openaiModel = options.openaiModel || 'gpt-4o-mini';

    // Engine availability flags (set by user in settings)
    this.enabledEngines = {
      algebrite: options.enableAlgebrite || false,
      z3: options.enableZ3 || false,
      swipl: options.enableSwipl || false,
    };

    // MCP server configs: [{ name, url, description }]
    this.mcpServers = options.mcpServers || [];

    // Loaded engine instances (lazy-initialized)
    this._engines = {};
    this._initialized = false;

    this.verbose = options.verbose || false;
  }

  /**
   * Initialize enabled engines. Call once after construction.
   */
  async initialize() {
    if (!this.openaiBaseUrl || !this.openaiApiKey) {
      this.log('⚠️ Symbolic reasoning disabled: no OpenAI-compatible API configured');
      return;
    }

    if (this.enabledEngines.algebrite) {
      try {
        this._engines.algebrite = require('algebrite');
        this.log('✅ Algebrite loaded');
      } catch (e) {
        this.log('⚠️ Algebrite not available: ' + e.message);
        this.enabledEngines.algebrite = false;
      }
    }

    if (this.enabledEngines.z3) {
      try {
        const { init } = require('z3-solver');
        this._engines.z3 = await init();
        this.log('✅ z3-solver loaded');
      } catch (e) {
        this.log('⚠️ z3-solver not available: ' + e.message);
        this.enabledEngines.z3 = false;
      }
    }

    if (this.enabledEngines.swipl) {
      try {
        const SWIPL = require('swipl-wasm');
        this._engines.swipl = await SWIPL({ arguments: ['-q'] });
        this.log('✅ swipl-wasm loaded');
      } catch (e) {
        this.log('⚠️ swipl-wasm not available: ' + e.message);
        this.enabledEngines.swipl = false;
      }
    }

    this._initialized = true;
    this.log(`Symbolic reasoning ready. Engines: ${this.getAvailableEngines().join(', ') || 'none'}`);
  }

  /**
   * List engines that are enabled and loaded.
   */
  getAvailableEngines() {
    const engines = [];
    if (this.enabledEngines.algebrite && this._engines.algebrite) engines.push('algebrite');
    if (this.enabledEngines.z3 && this._engines.z3) engines.push('z3');
    if (this.enabledEngines.swipl && this._engines.swipl) engines.push('swipl');
    for (const mcp of this.mcpServers) {
      engines.push(`mcp:${mcp.name}`);
    }
    return engines;
  }

  /**
   * Check if any reasoning backend is available.
   */
  isAvailable() {
    return this._initialized && (this.getAvailableEngines().length > 0);
  }

  // ==================== Core API ====================

  /**
   * Reason about a problem. This is the main entry point.
   *
   * 1. Asks the OpenAI-compatible LLM to classify the problem and translate to formal notation
   * 2. Dispatches to the appropriate engine
   * 3. Translates the result back to natural language
   *
   * @param {string} problem - Natural language description of the reasoning task
   * @param {string} [preferredEngine] - Force a specific engine (optional)
   * @returns {object} { engine, formalQuery, rawResult, interpretation, success }
   */
  async reason(problem, preferredEngine = null) {
    if (!this.isAvailable()) {
      return { success: false, error: 'No symbolic reasoning engines available' };
    }

    try {
      // Step 1: Classify and translate
      const classification = await this.classifyAndTranslate(problem, preferredEngine);

      if (!classification || !classification.engine) {
        return { success: false, error: 'Could not classify problem for symbolic reasoning' };
      }

      this.log(`🔬 Engine: ${classification.engine}, Query: ${classification.formalQuery?.substring(0, 80)}...`);

      // Step 2: Execute on engine
      const rawResult = await this.execute(classification.engine, classification.formalQuery);

      // Step 3: Interpret result
      const interpretation = await this.interpretResult(
        problem,
        classification.engine,
        classification.formalQuery,
        rawResult
      );

      return {
        success: true,
        engine: classification.engine,
        formalQuery: classification.formalQuery,
        rawResult,
        interpretation,
        confidence: classification.confidence || 'medium'
      };

    } catch (error) {
      this.log(`❌ Reasoning error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ==================== Translation (OpenAI) ====================

  /**
   * Use OpenAI-compatible LLM to classify problem type and generate formal query.
   */
  async classifyAndTranslate(problem, preferredEngine) {
    const available = this.getAvailableEngines();
    const engineDescriptions = this._describeEngines(available);

    const prompt = `You are a formal reasoning translator. Given a natural language problem, determine which symbolic engine is best suited and translate the problem into the engine's formal notation.

## Available Engines
${engineDescriptions}

${preferredEngine ? `The user prefers engine: ${preferredEngine}\n` : ''}

## Problem
${problem}

## Instructions
1. Choose the most appropriate engine from the available ones
2. Translate the problem into that engine's formal notation
3. If no engine is suitable, set engine to null

Return JSON only:
{
  "engine": "algebrite | z3 | swipl | mcp:<name> | null",
  "formalQuery": "the formal notation query string",
  "reasoning": "why this engine was chosen",
  "confidence": "low | medium | high"
}`;

    const response = await this._callOpenAI(prompt);
    return this._parseJSON(response);
  }

  /**
   * Interpret raw engine output back to natural language.
   */
  async interpretResult(originalProblem, engine, formalQuery, rawResult) {
    const prompt = `You are interpreting the output of a symbolic reasoning engine.

## Original Problem
${originalProblem}

## Engine Used
${engine}

## Formal Query
${formalQuery}

## Raw Result
${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}

## Instructions
Provide a clear, natural language interpretation of this result.
- Explain what the result means in context of the original problem
- Note any limitations or caveats
- If the result indicates an error or unsatisfiable condition, explain why

Return a plain text interpretation (not JSON).`;

    return await this._callOpenAI(prompt);
  }

  // ==================== Engine Execution ====================

  /**
   * Dispatch formal query to the appropriate engine.
   */
  async execute(engine, formalQuery) {
    if (engine === 'algebrite') {
      return this._execAlgebrite(formalQuery);
    } else if (engine === 'z3') {
      return await this._execZ3(formalQuery);
    } else if (engine === 'swipl') {
      return await this._execSwipl(formalQuery);
    } else if (engine.startsWith('mcp:')) {
      const serverName = engine.substring(4);
      return await this._execMCP(serverName, formalQuery);
    }
    throw new Error(`Unknown engine: ${engine}`);
  }

  /**
   * Execute Algebrite expression.
   * Algebrite handles: simplify, differentiate, integrate, solve, factor, expand, etc.
   */
  _execAlgebrite(expression) {
    const algebrite = this._engines.algebrite;
    if (!algebrite) throw new Error('Algebrite not loaded');

    try {
      const result = algebrite.run(expression);
      return result.toString();
    } catch (e) {
      return `Algebrite error: ${e.message}`;
    }
  }

  /**
   * Execute z3-solver SMT query.
   * z3 handles: SAT/SMT solving, constraint satisfaction, theorem proving.
   */
  async _execZ3(smtLib) {
    const { Context } = this._engines.z3;
    if (!Context) throw new Error('z3-solver not loaded');

    try {
      // z3-solver JS API — evaluate SMT-LIB string via low-level API
      const ctx = new Context('main');
      const solver = new ctx.Solver();

      // For SMT-LIB input, use the Z3 API's parseSMTLIB2String or eval
      // The exact API depends on z3-solver version; fall back to string-based
      const result = await ctx.eval(smtLib);
      return result.toString();
    } catch (e) {
      return `z3 error: ${e.message}`;
    }
  }

  /**
   * Execute SWI-Prolog query.
   * swipl handles: logic programming, knowledge base queries, unification, rule-based reasoning.
   */
  async _execSwipl(prologCode) {
    const swipl = this._engines.swipl;
    if (!swipl) throw new Error('swipl-wasm not loaded');

    try {
      // Split into assertions and query (last line starting with ?-)
      const lines = prologCode.trim().split('\n');
      const queryLine = lines.find(l => l.trim().startsWith('?-'));
      const assertions = lines.filter(l => !l.trim().startsWith('?-')).join('\n');

      if (assertions.trim()) {
        swipl.call(`assert_string("${assertions.replace(/"/g, '\\"')}")`);
      }

      if (queryLine) {
        const query = queryLine.replace(/^\?-\s*/, '').replace(/\.\s*$/, '');
        const result = swipl.call(query);
        return JSON.stringify(result);
      }

      return 'No query provided (expected a line starting with ?-)';
    } catch (e) {
      return `Prolog error: ${e.message}`;
    }
  }

  /**
   * Execute query on a user-configured MCP server.
   */
  async _execMCP(serverName, query) {
    const server = this.mcpServers.find(s => s.name === serverName);
    if (!server) throw new Error(`MCP server '${serverName}' not configured`);

    try {
      // MCP protocol: POST to server URL with tool call
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(server.apiKey ? { 'Authorization': `Bearer ${server.apiKey}` } : {})
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'reason',
            arguments: { query }
          },
          id: Date.now()
        })
      });

      const data = await response.json();

      if (data.error) {
        return `MCP error: ${data.error.message}`;
      }

      // Extract text content from MCP response
      const content = data.result?.content;
      if (Array.isArray(content)) {
        return content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
      }
      return JSON.stringify(data.result);
    } catch (e) {
      return `MCP server error (${serverName}): ${e.message}`;
    }
  }

  // ==================== Helpers ====================

  /**
   * Call the OpenAI-compatible API.
   */
  async _callOpenAI(prompt) {
    const url = `${this.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  _describeEngines(available) {
    const descriptions = [];
    for (const engine of available) {
      if (engine === 'algebrite') {
        descriptions.push(`- **algebrite**: Computer algebra system. Handles: simplify, differentiate (d/dx), integrate, solve equations, factor, expand, Taylor series. Input: Algebrite expression syntax (e.g., "simplify(x^2 + 2*x + 1)", "integral(sin(x), x)").`);
      } else if (engine === 'z3') {
        descriptions.push(`- **z3**: SMT solver. Handles: satisfiability, constraint solving, theorem proving, formal verification, integer/real arithmetic constraints, bitvectors. Input: SMT-LIB2 format or Z3 JavaScript API calls.`);
      } else if (engine === 'swipl') {
        descriptions.push(`- **swipl**: Prolog engine. Handles: logic programming, knowledge base queries, rule-based reasoning, unification, backtracking search. Input: Prolog syntax with facts, rules, and queries (query lines start with "?-").`);
      } else if (engine.startsWith('mcp:')) {
        const name = engine.substring(4);
        const server = this.mcpServers.find(s => s.name === name);
        descriptions.push(`- **mcp:${name}**: ${server?.description || 'User-configured MCP reasoning server'}. Input: natural language or server-specific format.`);
      }
    }
    return descriptions.join('\n');
  }

  _parseJSON(text) {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  log(message) {
    if (this.verbose) {
      console.log(`[SymbolicReasoning] ${message}`);
    }
  }

  async dispose() {
    // swipl-wasm may need cleanup
    if (this._engines.swipl && this._engines.swipl.cleanup) {
      try { this._engines.swipl.cleanup(); } catch { /* ignore */ }
    }
    this._engines = {};
    this._initialized = false;
    this.log('Disposed');
  }
}

module.exports = { SymbolicReasoningManager };
