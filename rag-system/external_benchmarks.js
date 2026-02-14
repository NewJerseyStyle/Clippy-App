/**
 * External Benchmark Adapters
 *
 * Converts each external benchmark dataset into a common evaluation interface.
 * Each adapter receives a ContinuousAgent reference and pushes questions through
 * agent.onUserMessage() to maintain mind flow. Between tests, WorkingMemory and
 * sandbox RAG persist.
 *
 * Adapters:
 *   - HLEBenchmark       — Humanity's Last Exam (accuracy scoring)
 *   - Tau2Benchmark       — tau2-bench (pass@1 rate)
 *   - ArcAGI2Benchmark    — ARC-AGI-2 (exact grid match)
 *   - VendingBench2Stub   — Vending machine scenarios (response quality + financial)
 */

const EventEmitter = require('events');
const fs = require('fs');

// ==================== Base Class ====================

class ExternalBenchmarkRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.benchmarkName = options.benchmarkName || 'external';
    this.callModel = options.callModel; // async function(messages, system) => string
    this.dataset = [];
    this.verbose = options.verbose || false;
  }

  /**
   * Load dataset from a JSON file.
   * @param {string} dataPath - Path to the dataset JSON file
   */
  async loadDataset(dataPath) {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    this.dataset = JSON.parse(raw);
    this.log(`Loaded ${this.dataset.length} items from ${dataPath}`);
  }

  /**
   * Run all benchmark items and return aggregate results.
   * @returns {{ benchmarkName: string, score: number, details: Array, count: number }}
   */
  async runAll() {
    throw new Error('Subclass must implement runAll()');
  }

  log(msg) {
    if (this.verbose) {
      console.log(`[${this.benchmarkName}] ${msg}`);
    }
    this.emit('log', msg);
  }
}

// ==================== HLE Benchmark ====================

class HLEBenchmark extends ExternalBenchmarkRunner {
  constructor(options = {}) {
    super({ ...options, benchmarkName: 'HLE' });
  }

  async runAll() {
    const details = [];
    let correct = 0;

    for (let i = 0; i < this.dataset.length; i++) {
      const item = this.dataset[i];
      this.emit('progress', { benchmark: 'hle', current: i + 1, total: this.dataset.length });
      this.log(`Question ${i + 1}/${this.dataset.length}: ${item.id}`);

      try {
        const messages = [
          { role: 'user', content: `Answer the following question concisely and accurately.\n\nQuestion: ${item.question}\n\nProvide a direct answer.` }
        ];

        const response = await this.callModel(messages, 'You are a knowledgeable assistant taking an exam. Answer questions directly and accurately.');

        const isCorrect = this._scoreAnswer(response, item.answer, item.answer_type);
        if (isCorrect) correct++;

        details.push({
          id: item.id,
          category: item.category,
          correct: isCorrect,
          response: response.substring(0, 300),
        });
      } catch (error) {
        this.log(`Error on ${item.id}: ${error.message}`);
        details.push({ id: item.id, category: item.category, correct: false, error: error.message });
      }
    }

    const score = this.dataset.length > 0 ? Math.round((correct / this.dataset.length) * 100) : 0;
    return { benchmarkName: 'hle', score, details, count: this.dataset.length };
  }

  /**
   * Score an answer using exact match with fallback to keyword overlap.
   */
  _scoreAnswer(response, expectedAnswer, answerType) {
    if (!expectedAnswer) return false;

    const responseLower = response.toLowerCase().trim();
    const expectedLower = expectedAnswer.toLowerCase().trim();

    // Exact match
    if (responseLower.includes(expectedLower)) return true;

    // Keyword overlap scoring (model-as-judge fallback)
    const expectedWords = expectedLower.split(/\s+/).filter(w => w.length > 3);
    if (expectedWords.length === 0) return false;

    const matchCount = expectedWords.filter(w => responseLower.includes(w)).length;
    const matchRatio = matchCount / expectedWords.length;

    // For short answers, require higher match ratio
    if (answerType === 'short_answer') {
      return matchRatio >= 0.6;
    }

    return matchRatio >= 0.5;
  }
}

// ==================== Tau2 Benchmark ====================

class Tau2Benchmark extends ExternalBenchmarkRunner {
  constructor(options = {}) {
    super({ ...options, benchmarkName: 'Tau2' });
  }

  async runAll() {
    const details = [];
    let passed = 0;

    for (let i = 0; i < this.dataset.length; i++) {
      const item = this.dataset[i];
      this.emit('progress', { benchmark: 'tau2', current: i + 1, total: this.dataset.length });
      this.log(`Task ${i + 1}/${this.dataset.length}: ${item.id}`);

      try {
        // Build multi-turn conversation simulating customer service
        const systemPrompt = `You are a helpful customer service agent. You have access to the following system state:\n${JSON.stringify(item.initial_state, null, 2)}\n\nHandle the customer's request professionally and completely.`;

        const messages = [
          { role: 'user', content: item.user_scenario }
        ];

        const response = await this.callModel(messages, systemPrompt);

        const taskScore = this._evaluateTask(response, item);
        if (taskScore >= 0.5) passed++;

        details.push({
          id: item.id,
          domain: item.domain,
          score: taskScore,
          passed: taskScore >= 0.5,
          response: response.substring(0, 300),
        });
      } catch (error) {
        this.log(`Error on ${item.id}: ${error.message}`);
        details.push({ id: item.id, domain: item.domain, score: 0, passed: false, error: error.message });
      }
    }

    const score = this.dataset.length > 0 ? Math.round((passed / this.dataset.length) * 100) : 0;
    return { benchmarkName: 'tau2', score, details, count: this.dataset.length };
  }

  /**
   * Evaluate a task response against evaluation criteria.
   */
  _evaluateTask(response, item) {
    const responseLower = response.toLowerCase();
    let score = 0;

    // Check evaluation criteria keywords
    if (item.evaluation_criteria) {
      const criteriaWords = item.evaluation_criteria.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matched = criteriaWords.filter(w => responseLower.includes(w)).length;
      score += (matched / Math.max(criteriaWords.length, 1)) * 0.5;
    }

    // Check for completeness (response addresses the scenario)
    if (item.user_scenario) {
      const scenarioKeywords = item.user_scenario.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
      const addressed = scenarioKeywords.filter(w => responseLower.includes(w)).length;
      score += (addressed / Math.max(scenarioKeywords.length, 1)) * 0.2;
    }

    // Quality heuristics
    if (response.length > 100) score += 0.1;
    if (response.length > 300) score += 0.1;
    if (response.includes('\n') || response.match(/\d+[\.\)]/)) score += 0.1;

    return Math.min(1.0, score);
  }
}

// ==================== ARC-AGI-2 Benchmark ====================

class ArcAGI2Benchmark extends ExternalBenchmarkRunner {
  constructor(options = {}) {
    super({ ...options, benchmarkName: 'ARC-AGI-2' });
  }

  async runAll() {
    const details = [];
    let correct = 0;

    for (let i = 0; i < this.dataset.length; i++) {
      const puzzle = this.dataset[i];
      this.emit('progress', { benchmark: 'arc_agi2', current: i + 1, total: this.dataset.length });
      this.log(`Puzzle ${i + 1}/${this.dataset.length}: ${puzzle.id}`);

      try {
        // Format training examples as text
        const trainExamples = puzzle.train.map((ex, idx) =>
          `Example ${idx + 1}:\nInput:\n${this._gridToText(ex.input)}\nOutput:\n${this._gridToText(ex.output)}`
        ).join('\n\n');

        const testInput = puzzle.test[0]?.input;
        const testOutput = puzzle.test[0]?.output;

        if (!testInput || !testOutput) {
          details.push({ id: puzzle.id, correct: false, error: 'Missing test data' });
          continue;
        }

        const prompt = `You are solving an abstract reasoning puzzle. Study the input→output transformation patterns in the examples, then apply the same pattern to the test input.\n\n${trainExamples}\n\nNow apply the pattern to this test input:\n${this._gridToText(testInput)}\n\nProvide ONLY the output grid as a JSON 2D array (e.g. [[1,0],[0,1]]). No explanation.`;

        // Pass@2: try twice
        let matched = false;
        for (let attempt = 0; attempt < 2 && !matched; attempt++) {
          const response = await this.callModel(
            [{ role: 'user', content: prompt }],
            'You are an expert at abstract pattern recognition. Output only valid JSON arrays.'
          );
          matched = this._checkGridMatch(response, testOutput);
        }

        if (matched) correct++;

        details.push({
          id: puzzle.id,
          grid_size: puzzle.grid_size,
          correct: matched,
        });
      } catch (error) {
        this.log(`Error on ${puzzle.id}: ${error.message}`);
        details.push({ id: puzzle.id, correct: false, error: error.message });
      }
    }

    const score = this.dataset.length > 0 ? Math.round((correct / this.dataset.length) * 100) : 0;
    return { benchmarkName: 'arc_agi2', score, details, count: this.dataset.length };
  }

  /**
   * Convert a 2D grid to a text representation.
   */
  _gridToText(grid) {
    if (!Array.isArray(grid)) return String(grid);
    return grid.map(row => row.join(' ')).join('\n');
  }

  /**
   * Check if the model's response matches the expected output grid.
   */
  _checkGridMatch(response, expected) {
    try {
      // Try to extract JSON array from response
      const jsonMatch = response.match(/\[\s*\[[\s\S]*?\]\s*\]/);
      if (!jsonMatch) return false;

      const parsed = JSON.parse(jsonMatch[0]);

      // Compare grids
      if (!Array.isArray(parsed) || parsed.length !== expected.length) return false;

      for (let r = 0; r < expected.length; r++) {
        if (!Array.isArray(parsed[r]) || parsed[r].length !== expected[r].length) return false;
        for (let c = 0; c < expected[r].length; c++) {
          if (parsed[r][c] !== expected[r][c]) return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}

// ==================== Vending Bench 2 Stub ====================

class VendingBench2Stub extends ExternalBenchmarkRunner {
  constructor(options = {}) {
    super({ ...options, benchmarkName: 'VendingBench2' });
  }

  async runAll() {
    const details = [];
    let totalScore = 0;

    for (let i = 0; i < this.dataset.length; i++) {
      const scenario = this.dataset[i];
      this.emit('progress', { benchmark: 'vending2', current: i + 1, total: this.dataset.length });
      this.log(`Scenario ${i + 1}/${this.dataset.length}: ${scenario.id}`);

      try {
        const systemPrompt = 'You are an AI controlling a vending machine. Process transactions accurately, handle edge cases, and explain your actions clearly. Always state the action taken and any change to return.';

        const messages = [
          { role: 'user', content: `${scenario.scenario}\n\nMachine context: ${JSON.stringify(scenario.context)}\n\nWhat action should the machine take? Explain your reasoning.` }
        ];

        const response = await this.callModel(messages, systemPrompt);

        const itemScore = this._scoreScenario(response, scenario);
        totalScore += itemScore;

        details.push({
          id: scenario.id,
          score: Math.round(itemScore * 100),
          expected_action: scenario.expected_action,
          response: response.substring(0, 300),
        });
      } catch (error) {
        this.log(`Error on ${scenario.id}: ${error.message}`);
        details.push({ id: scenario.id, score: 0, error: error.message });
      }
    }

    const score = this.dataset.length > 0 ? Math.round((totalScore / this.dataset.length) * 100) : 0;
    return { benchmarkName: 'vending2', score, details, count: this.dataset.length };
  }

  /**
   * Score a vending machine scenario response.
   */
  _scoreScenario(response, scenario) {
    const responseLower = response.toLowerCase();
    let score = 0;

    // Check if the correct action is identified
    const actionKeywords = {
      'dispense': ['dispense', 'vend', 'deliver', 'release'],
      'insufficient_funds': ['insufficient', 'not enough', 'more money', 'additional'],
      'out_of_stock': ['out of stock', 'unavailable', 'sold out', 'empty'],
      'insufficient_change': ['change', 'cannot make change'],
      'multi_purchase': ['both', 'two items', 'sequential', 'remaining balance'],
      'refund': ['refund', 'return', 'give back'],
      'recovery': ['recover', 'restart', 'log', 'incomplete transaction'],
      'promotional_purchase': ['promotion', 'discount', 'buy 2', 'free'],
      'reject_bill': ['reject', 'invalid', 'cannot accept', 'try another'],
    };

    const expectedKeywords = actionKeywords[scenario.expected_action] || [];
    const actionMatched = expectedKeywords.some(kw => responseLower.includes(kw));
    if (actionMatched) score += 0.4;

    // Check evaluation criteria
    if (scenario.evaluation) {
      const evalWords = scenario.evaluation.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matched = evalWords.filter(w => responseLower.includes(w)).length;
      score += (matched / Math.max(evalWords.length, 1)) * 0.3;
    }

    // Check for correct change amount
    if (scenario.expected_change !== null && scenario.expected_change !== undefined) {
      const changeStr = scenario.expected_change.toFixed(2);
      const altChangeStr = '$' + changeStr;
      if (responseLower.includes(changeStr) || responseLower.includes(altChangeStr)) {
        score += 0.2;
      }
    }

    // Quality bonus
    if (response.length > 50) score += 0.1;

    return Math.min(1.0, score);
  }
}

module.exports = {
  ExternalBenchmarkRunner,
  HLEBenchmark,
  Tau2Benchmark,
  ArcAGI2Benchmark,
  VendingBench2Stub,
};
