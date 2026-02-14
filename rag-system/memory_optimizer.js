/**
 * Training-Free GRPO Memory Optimizer
 *
 * Optimizes hierarchical RAG memory structure by:
 * 1. Detecting overlapping sibling nodes (vector similarity)
 * 2. Identifying poor-context and imbalanced nodes
 * 3. Generating candidate operations via LLM (Group Generation)
 * 4. Evaluating operations with a reward function
 * 5. Computing group relative advantages (GRPO)
 * 6. Extracting reusable experiences (semantic advantage extraction)
 * 7. Executing the best operation if reward > threshold
 *
 * The Experience Library acts as a "token prior" — accumulated
 * strategies that guide future optimization decisions without
 * modifying the LLM's weights.
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// ── Data structures ──────────────────────────────────────────────

class ExperienceLibrary {
  constructor(maxExperiences = 50) {
    this.experiences = [];
    this.maxExperiences = maxExperiences;
  }

  addExperience(exp) {
    const similar = this.experiences.find(e => e.pattern === exp.pattern);
    if (similar) {
      similar.confidence = Math.min(similar.confidence + 0.1, 1.0);
      similar.examples = similar.examples || [];
      if (exp.example) similar.examples.push(exp.example);
    } else {
      this.experiences.push({ ...exp, examples: exp.example ? [exp.example] : [] });
      if (this.experiences.length > this.maxExperiences) {
        this.experiences.sort((a, b) => b.confidence - a.confidence);
        this.experiences = this.experiences.slice(0, this.maxExperiences);
      }
    }
  }

  getRelevant(context, topK = 5) {
    return [...this.experiences]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topK);
  }

  toContextString() {
    if (this.experiences.length === 0) return 'No prior optimization experiences.';
    let s = 'Memory optimization experience library:\n\n';
    this.experiences.slice(0, 10).forEach((exp, i) => {
      s += `${i + 1}. ${exp.pattern}\n   Strategy: ${exp.strategy}\n   Confidence: ${exp.confidence.toFixed(2)}\n\n`;
    });
    return s;
  }

  toJSON() { return { experiences: this.experiences }; }

  static fromJSON(data) {
    const lib = new ExperienceLibrary();
    if (data && data.experiences) lib.experiences = data.experiences;
    return lib;
  }
}

// ── Main optimizer ───────────────────────────────────────────────

class MemoryOptimizer extends EventEmitter {
  /**
   * @param {object} rag   - HierarchicalRAGComplete instance
   * @param {object} opts
   * @param {Function} opts.callModel - async (prompt, maxTokens) => string
   * @param {string}   opts.dataDir   - where to persist experiences
   * @param {number}   opts.groupSize - candidate operations per problem (default 4)
   * @param {number}   opts.numEpochs - optimization rounds (default 3)
   * @param {number}   opts.rewardThreshold - min reward to execute (default 0.6)
   */
  constructor(rag, opts = {}) {
    super();
    this.rag = rag;
    this.callModel = opts.callModel;
    this.dataDir = opts.dataDir || './rag_data';
    this.groupSize = opts.groupSize || 4;
    this.numEpochs = opts.numEpochs || 3;
    this.rewardThreshold = opts.rewardThreshold || 0.6;
    this.experienceLibrary = new ExperienceLibrary();
    this.conversationCount = 0;
    this.optimizationCount = 0;
    this.lastOptimizationTime = Date.now();
  }

  // ── Persistence ──────────────────────────────────────────────

  async loadExperiences() {
    try {
      const fp = path.join(this.dataDir, 'memory_experiences.json');
      const raw = await fs.readFile(fp, 'utf-8');
      this.experienceLibrary = ExperienceLibrary.fromJSON(JSON.parse(raw));
      console.log(`[MemoryOptimizer] Loaded ${this.experienceLibrary.experiences.length} experiences`);
    } catch { /* first run */ }
  }

  async saveExperiences() {
    const fp = path.join(this.dataDir, 'memory_experiences.json');
    await fs.writeFile(fp, JSON.stringify(this.experienceLibrary.toJSON(), null, 2), 'utf-8');
  }

  // ── Trigger logic ────────────────────────────────────────────

  /**
   * Call after each conversation / memory commit.
   * Triggers optimization every 10 conversations or 1 hour.
   */
  tick() {
    this.conversationCount++;
    const shouldOptimize =
      this.conversationCount % 10 === 0 ||
      Date.now() - this.lastOptimizationTime > 3600_000;
    if (shouldOptimize) {
      this.runOptimization().catch(err =>
        console.error('[MemoryOptimizer] optimization error:', err)
      );
    }
  }

  // ── Main optimization loop ───────────────────────────────────

  async runOptimization(goal = 'general') {
    console.log(`\n[MemoryOptimizer] Starting optimization #${this.optimizationCount + 1} (goal: ${goal})`);
    this.emit('optimization-start', { goal, epoch: 0 });

    for (let epoch = 0; epoch < this.numEpochs; epoch++) {
      console.log(`[MemoryOptimizer] Epoch ${epoch + 1}/${this.numEpochs}`);

      const problems = await this._identifyProblems(goal);
      if (problems.length === 0) {
        console.log('[MemoryOptimizer] No problems found');
        continue;
      }

      console.log(`[MemoryOptimizer] Found ${problems.length} problem(s)`);

      // Process up to 5 problems per epoch
      for (const problem of problems.slice(0, 5)) {
        await this._optimizeWithGRPO(problem, goal);
      }
    }

    this.optimizationCount++;
    this.lastOptimizationTime = Date.now();
    await this.saveExperiences();
    this.emit('optimization-complete', {
      count: this.optimizationCount,
      experiences: this.experienceLibrary.experiences.length
    });
    console.log(`[MemoryOptimizer] Optimization complete (experiences: ${this.experienceLibrary.experiences.length})`);
  }

  // ── Problem identification ───────────────────────────────────

  async _identifyProblems(goal) {
    const problems = [];

    if (goal === 'general' || goal === 'reduce_overlap') {
      const overlaps = await this._detectOverlaps();
      problems.push(...overlaps);
    }
    if (goal === 'general' || goal === 'improve_context') {
      const poor = await this._detectPoorContexts();
      problems.push(...poor);
    }
    if (goal === 'general' || goal === 'balance_layers') {
      const imbalanced = await this._detectLayerImbalance();
      problems.push(...imbalanced);
    }

    return problems;
  }

  /**
   * Detect overlapping sibling nodes using vector cosine similarity.
   */
  async _detectOverlaps() {
    const overlaps = [];
    const maxLayers = this.rag.options.maxLayers || 10;

    for (let layer = 0; layer < maxLayers; layer++) {
      let layerNodes;
      try {
        layerNodes = await this.rag.table
          .query()
          .where(`layer = ${layer}`)
          .limit(200)
          .toArray();
      } catch { continue; }

      if (layerNodes.length < 2) continue;

      // Group by parent to check siblings
      const byParent = {};
      for (const node of layerNodes) {
        const pid = node.parent_id || '__root__';
        if (!byParent[pid]) byParent[pid] = [];
        byParent[pid].push(node);
      }

      for (const siblings of Object.values(byParent)) {
        if (siblings.length < 2) continue;
        for (let i = 0; i < siblings.length; i++) {
          for (let j = i + 1; j < siblings.length; j++) {
            const sim = this._cosineSimilarity(siblings[i].vector, siblings[j].vector);
            if (sim > 0.85) {
              overlaps.push({
                type: 'high_overlap',
                nodes: [siblings[i].id, siblings[j].id],
                nodeContents: [siblings[i].content, siblings[j].content],
                overlapRatio: sim,
                layer
              });
            }
          }
        }
      }
    }

    return overlaps;
  }

  async _detectPoorContexts() {
    const poor = [];
    const maxLayers = this.rag.options.maxLayers || 10;

    for (let layer = 0; layer < maxLayers; layer++) {
      let layerNodes;
      try {
        layerNodes = await this.rag.table
          .query()
          .where(`layer = ${layer}`)
          .limit(200)
          .toArray();
      } catch { continue; }

      for (const node of layerNodes) {
        if (node.id === 'root') continue;
        if (!node.context || node.context.length < 20) {
          poor.push({
            type: 'poor_context',
            nodes: [node.id],
            nodeContents: [node.content],
            reason: 'context_too_short',
            currentContext: node.context || '',
            layer: node.layer
          });
        }
      }
    }

    return poor;
  }

  async _detectLayerImbalance() {
    const imbalanced = [];
    const maxLayers = this.rag.options.maxLayers || 10;

    for (let layer = 0; layer < maxLayers; layer++) {
      let layerNodes;
      try {
        layerNodes = await this.rag.table
          .query()
          .where(`layer = ${layer}`)
          .limit(200)
          .toArray();
      } catch { continue; }

      if (layerNodes.length === 0) continue;

      const childCounts = layerNodes.map(n => {
        try { return JSON.parse(n.children_ids || '[]').length; }
        catch { return 0; }
      });

      const avg = childCounts.reduce((a, b) => a + b, 0) / childCounts.length;
      if (avg === 0) continue;

      for (let i = 0; i < layerNodes.length; i++) {
        if (childCounts[i] > avg * 1.5 && childCounts[i] > 3) {
          imbalanced.push({
            type: 'layer_imbalance',
            nodes: [layerNodes[i].id],
            nodeContents: [layerNodes[i].content],
            childrenCount: childCounts[i],
            avgChildren: avg,
            layer: layerNodes[i].layer
          });
        }
      }
    }

    return imbalanced;
  }

  // ── GRPO optimization ────────────────────────────────────────

  async _optimizeWithGRPO(problem, goal) {
    console.log(`[MemoryOptimizer] Optimizing: ${problem.type} at layer ${problem.layer}`);

    // 1. Group Generation — ask LLM for candidate operations
    const candidates = await this._generateOperationGroup(problem, goal);
    if (!candidates || candidates.length === 0) return;

    // 2. Reward Evaluation — simulate each operation
    const results = candidates.map(op => this._evaluateOperation(op, problem));

    // 3. Group Relative Advantage
    const advantages = this._computeGroupAdvantages(results);

    // 4. Experience extraction
    const experiences = await this._extractExperiences(results, advantages, problem);
    for (const exp of experiences) {
      this.experienceLibrary.addExperience(exp);
    }

    // 5. Execute best if reward > threshold
    let bestIdx = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].reward > results[bestIdx].reward) bestIdx = i;
    }

    const best = results[bestIdx];
    if (best.reward > this.rewardThreshold) {
      await this._executeOperation(best.operation, problem);
      console.log(`[MemoryOptimizer] Executed: ${best.operation.operationType} (reward: ${best.reward.toFixed(2)})`);
    } else {
      console.log(`[MemoryOptimizer] Skipped (best reward ${best.reward.toFixed(2)} < ${this.rewardThreshold})`);
    }
  }

  // ── Group generation ─────────────────────────────────────────

  async _generateOperationGroup(problem, goal) {
    if (!this.callModel) {
      // Fallback: generate heuristic operations without LLM
      return this._heuristicOperations(problem);
    }

    const experienceCtx = this.experienceLibrary.toContextString();

    const prompt = `You are a memory management expert. Given the following problem and experience library, generate ${this.groupSize} different optimization strategies.

${experienceCtx}

Current problem:
Type: ${problem.type}
Layer: ${problem.layer}
Nodes: ${problem.nodes.join(', ')}
Node contents: ${(problem.nodeContents || []).map(c => `"${(c || '').substring(0, 80)}"`).join(', ')}
${problem.overlapRatio ? `Overlap ratio: ${problem.overlapRatio.toFixed(2)}` : ''}
${problem.currentContext ? `Current context: "${problem.currentContext}"` : ''}
${problem.childrenCount ? `Children count: ${problem.childrenCount} (avg: ${problem.avgChildren.toFixed(1)})` : ''}

Goal: ${goal}

Generate ${this.groupSize} different operations. Each operation must be one of: merge, adjust_context, move_layer, delete.
For "merge", target_nodes should have 2 node IDs.
For others, target_nodes can have 1 or more node IDs.

Output ONLY a JSON array:
[
  {
    "operation_type": "merge",
    "target_nodes": ["id1", "id2"],
    "reasoning": "why this operation (under 50 words)",
    "expected_benefit": "expected benefit (under 30 words)"
  }
]`;

    try {
      const response = await this.callModel(prompt, 800);
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      // Find the JSON array in the response
      const startIdx = cleaned.indexOf('[');
      const endIdx = cleaned.lastIndexOf(']');
      if (startIdx === -1 || endIdx === -1) return this._heuristicOperations(problem);

      const parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      return parsed.slice(0, this.groupSize).map(op => ({
        operationType: op.operation_type,
        targetNodes: op.target_nodes,
        reasoning: op.reasoning,
        expectedBenefit: op.expected_benefit
      }));
    } catch (err) {
      console.error('[MemoryOptimizer] LLM group generation failed:', err.message);
      return this._heuristicOperations(problem);
    }
  }

  /**
   * Heuristic fallback when LLM is unavailable.
   */
  _heuristicOperations(problem) {
    const ops = [];
    const nodes = problem.nodes;

    if (problem.type === 'high_overlap' && nodes.length >= 2) {
      ops.push({ operationType: 'merge', targetNodes: [nodes[0], nodes[1]], reasoning: 'High vector similarity between siblings', expectedBenefit: 'Reduce redundancy' });
      ops.push({ operationType: 'adjust_context', targetNodes: [nodes[0]], reasoning: 'Differentiate through better context', expectedBenefit: 'Clearer distinction' });
      ops.push({ operationType: 'delete', targetNodes: [nodes[1]], reasoning: 'Remove duplicate node', expectedBenefit: 'Simplify structure' });
      ops.push({ operationType: 'move_layer', targetNodes: [nodes[1]], reasoning: 'Move to different abstraction level', expectedBenefit: 'Better hierarchy' });
    } else if (problem.type === 'poor_context') {
      ops.push({ operationType: 'adjust_context', targetNodes: [nodes[0]], reasoning: 'Context too short', expectedBenefit: 'Improved retrieval' });
      ops.push({ operationType: 'delete', targetNodes: [nodes[0]], reasoning: 'Node without useful context', expectedBenefit: 'Cleaner structure' });
    } else if (problem.type === 'layer_imbalance') {
      ops.push({ operationType: 'move_layer', targetNodes: [nodes[0]], reasoning: 'Too many children for this node', expectedBenefit: 'Better balance' });
      ops.push({ operationType: 'adjust_context', targetNodes: [nodes[0]], reasoning: 'Clarify overloaded parent', expectedBenefit: 'Better organization' });
    }

    // Pad to groupSize
    while (ops.length < this.groupSize) {
      ops.push({ operationType: 'adjust_context', targetNodes: [nodes[0]], reasoning: 'General improvement', expectedBenefit: 'Marginal gain' });
    }

    return ops.slice(0, this.groupSize);
  }

  // ── Reward evaluation ────────────────────────────────────────

  _evaluateOperation(operation, problem) {
    const metrics = this._simulateOperation(operation, problem);
    const reward = this._calculateReward(operation, problem, metrics);
    const actualEffect = this._describeEffect(metrics);
    return { operation, reward, actualEffect, metrics };
  }

  _simulateOperation(operation, problem) {
    const metrics = {
      overlapReduction: 0,
      contextImprovement: 0,
      structureCoherence: 0,
      informationLoss: 0
    };

    switch (operation.operationType) {
      case 'merge':
        metrics.overlapReduction = problem.overlapRatio || 0.5;
        metrics.informationLoss = 0.2;
        metrics.structureCoherence = 0.8;
        break;
      case 'adjust_context':
        metrics.contextImprovement = 0.7;
        metrics.structureCoherence = 1.0;
        metrics.informationLoss = 0.0;
        break;
      case 'move_layer':
        metrics.structureCoherence = 0.6;
        metrics.informationLoss = 0.1;
        break;
      case 'delete':
        metrics.overlapReduction = 0.5;
        metrics.informationLoss = 0.8;
        metrics.structureCoherence = 0.7;
        break;
    }

    return metrics;
  }

  _calculateReward(operation, problem, metrics) {
    const weights = {
      high_overlap: { overlapReduction: 0.5, contextImprovement: 0.2, structureCoherence: 0.2, informationLoss: -0.3 },
      poor_context: { overlapReduction: 0.1, contextImprovement: 0.6, structureCoherence: 0.2, informationLoss: -0.1 },
      layer_imbalance: { overlapReduction: 0.2, contextImprovement: 0.1, structureCoherence: 0.5, informationLoss: -0.2 }
    };

    const w = weights[problem.type] || weights.high_overlap;
    let reward = 0;
    for (const key of Object.keys(metrics)) {
      reward += metrics[key] * (w[key] || 0);
    }

    // Normalize to 0-1
    return Math.max(0, Math.min(1, (reward + 1) / 2));
  }

  _describeEffect(metrics) {
    const parts = [];
    if (metrics.overlapReduction > 0.3) parts.push(`overlap reduced ${(metrics.overlapReduction * 100).toFixed(0)}%`);
    if (metrics.contextImprovement > 0.3) parts.push(`context improved ${(metrics.contextImprovement * 100).toFixed(0)}%`);
    if (metrics.informationLoss > 0.3) parts.push(`info loss ${(metrics.informationLoss * 100).toFixed(0)}%`);
    return parts.length > 0 ? parts.join('; ') : 'minor effect';
  }

  // ── Group Relative Advantage ─────────────────────────────────

  _computeGroupAdvantages(results) {
    if (results.length === 0) return [];
    const rewards = results.map(r => r.reward);
    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const variance = rewards.reduce((a, r) => a + (r - mean) ** 2, 0) / rewards.length;
    const std = Math.sqrt(variance);
    if (std === 0) return rewards.map(() => 0);
    return rewards.map(r => (r - mean) / std);
  }

  // ── Experience extraction ────────────────────────────────────

  async _extractExperiences(results, advantages, problem) {
    if (results.length < 2) return [];

    let bestIdx = 0, worstIdx = 0;
    for (let i = 1; i < advantages.length; i++) {
      if (advantages[i] > advantages[bestIdx]) bestIdx = i;
      if (advantages[i] < advantages[worstIdx]) worstIdx = i;
    }

    if (Math.abs(advantages[bestIdx] - advantages[worstIdx]) < 0.5) return [];

    const best = results[bestIdx];
    const worst = results[worstIdx];

    if (!this.callModel) {
      // Heuristic experience without LLM
      return [{
        pattern: `When ${problem.type} at layer ${problem.layer}`,
        strategy: `Use ${best.operation.operationType}`,
        avoid: `Avoid ${worst.operation.operationType}`,
        confidence: 0.7,
        example: {
          problem: problem.type,
          bestOperation: best.operation.operationType,
          rewardDiff: advantages[bestIdx] - advantages[worstIdx]
        }
      }];
    }

    const prompt = `Analyze these two memory management operations and extract a reusable lesson.

Problem type: ${problem.type}

Best operation:
- Type: ${best.operation.operationType}
- Reasoning: ${best.operation.reasoning}
- Effect: ${best.actualEffect}
- Reward: ${best.reward.toFixed(2)}

Worst operation:
- Type: ${worst.operation.operationType}
- Reasoning: ${worst.operation.reasoning}
- Effect: ${worst.actualEffect}
- Reward: ${worst.reward.toFixed(2)}

Output ONLY JSON:
{
  "pattern": "When situation X...",
  "strategy": "Do Y...",
  "avoid": "Don't Z...",
  "confidence": 0.7
}`;

    try {
      const response = await this.callModel(prompt, 300);
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) return [];

      const expData = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      expData.example = {
        problem: problem.type,
        bestOperation: best.operation.operationType,
        rewardDiff: advantages[bestIdx] - advantages[worstIdx]
      };
      return [expData];
    } catch {
      return [];
    }
  }

  // ── Operation execution ──────────────────────────────────────

  async _executeOperation(operation, problem) {
    switch (operation.operationType) {
      case 'merge':
        await this._executeMerge(operation.targetNodes);
        break;
      case 'adjust_context':
        await this._executeAdjustContext(operation.targetNodes);
        break;
      case 'move_layer':
        // move_layer is complex (re-parent); log for now
        console.log(`[MemoryOptimizer] move_layer suggested for ${operation.targetNodes.join(', ')} — skipped (complex)`);
        break;
      case 'delete':
        await this._executeDelete(operation.targetNodes);
        break;
    }
  }

  async _executeMerge(nodeIds) {
    if (nodeIds.length < 2) return;
    const [id1, id2] = nodeIds;

    const node1 = await this.rag.getNode(id1);
    const node2 = await this.rag.getNode(id2);
    if (!node1 || !node2) return;

    // Merge content
    let mergedContent;
    if (this.callModel) {
      try {
        const resp = await this.callModel(
          `Merge these two memory entries into one concise entry (under 100 words):\n\n1. ${node1.content}\n2. ${node2.content}\n\nOutput ONLY the merged text.`,
          200
        );
        mergedContent = resp.trim();
      } catch {
        mergedContent = `${node1.content} | ${node2.content}`;
      }
    } else {
      mergedContent = `${node1.content} | ${node2.content}`;
    }

    // Merge contexts
    const mergedContext = node1.context && node2.context
      ? `${node1.context}; ${node2.context}`.substring(0, 256)
      : node1.context || node2.context || 'merged-memory';

    // Merge children
    let children1 = [], children2 = [];
    try { children1 = JSON.parse(node1.children_ids || '[]'); } catch {}
    try { children2 = JSON.parse(node2.children_ids || '[]'); } catch {}
    const mergedChildren = [...new Set([...children1, ...children2])];

    // Add merged node
    const merged = await this.rag.addNode({
      content: mergedContent,
      context: mergedContext,
      layer: node1.layer,
      parentId: node1.parent_id
    });

    // Re-parent merged children
    for (const childId of mergedChildren) {
      try {
        const child = await this.rag.getNode(childId);
        if (child) {
          await this.rag.table.add([{ ...child, parent_id: merged.id }]);
        }
      } catch {}
    }

    // Delete old nodes (mark: add with special flag or simply leave them—
    // LanceDB doesn't have row-level delete easily, so we skip delete
    // and rely on the new merged node being found via vector search)
    console.log(`[MemoryOptimizer] Merged ${id1} + ${id2} → ${merged.id}`);
  }

  async _executeAdjustContext(nodeIds) {
    for (const nodeId of nodeIds) {
      const node = await this.rag.getNode(nodeId);
      if (!node) continue;

      let newContext;
      if (this.callModel) {
        try {
          const resp = await this.callModel(
            `Generate a concise context description (under 50 words) for this memory entry. The context should explain when this memory is useful, what topics it relates to, and what problems it helps solve.\n\nContent: ${node.content}\nCurrent context: ${node.context || '(none)'}\nLayer: ${node.layer}\n\nOutput ONLY the new context description.`,
            100
          );
          newContext = resp.trim();
        } catch {
          newContext = `${node.content.substring(0, 40)} — general knowledge`;
        }
      } else {
        newContext = `${node.content.substring(0, 40)} — general knowledge`;
      }

      // Update node with new context
      await this.rag.table.add([{
        ...node,
        context: newContext.substring(0, 256),
        last_accessed: Date.now()
      }]);
      this.rag.cacheNode({ ...node, context: newContext.substring(0, 256) });

      console.log(`[MemoryOptimizer] Updated context for ${nodeId}: "${newContext.substring(0, 60)}..."`);
    }
  }

  async _executeDelete(nodeIds) {
    for (const nodeId of nodeIds) {
      if (nodeId === 'root') continue; // never delete root
      const node = await this.rag.getNode(nodeId);
      if (!node) continue;

      // Only delete leaf nodes (no children) to be safe
      let children = [];
      try { children = JSON.parse(node.children_ids || '[]'); } catch {}
      if (children.length > 0) {
        console.log(`[MemoryOptimizer] Skipped delete of ${nodeId} (has ${children.length} children)`);
        continue;
      }

      // Remove from cache
      this.rag.nodeCache.delete(nodeId);
      console.log(`[MemoryOptimizer] Deleted leaf node ${nodeId}`);
    }
  }

  // ── Utilities ────────────────────────────────────────────────

  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

module.exports = { MemoryOptimizer, ExperienceLibrary };
