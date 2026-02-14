/**
 * HuggingFace Space Leaderboard Client
 *
 * Interacts with the Gradio-based leaderboard at:
 *   https://huggingface.co/spaces/npc0/clippy-irobot-bench
 *
 * Operations:
 *   - Check if a model exists on the leaderboard
 *   - Download benchmark dataset (if available)
 *   - Upload benchmark results
 *   - Get leaderboard rankings
 */

const SPACE_BASE_URL = 'https://npc0-clippy-irobot-bench.hf.space';
const DATASET_REPO = 'npc0/clippy-irobot-bench-dataset';

class LeaderboardClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || SPACE_BASE_URL;
    this.verbose = options.verbose || false;
  }

  /**
   * Check if a model has been benchmarked on the leaderboard.
   * @param {string} modelName - The model identifier
   * @returns {object} { found, record } or { found: false }
   */
  async checkModel(modelName) {
    try {
      const data = await this._gradioCall('check_model', [modelName]);
      // Gradio returns the data from the function
      if (data && data.found) {
        return {
          found: true,
          record: data.record
        };
      }
      return { found: false };
    } catch (error) {
      this.log(`Leaderboard check failed: ${error.message}`);
      // If the space is not available, return not found (non-blocking)
      return { found: false, error: error.message };
    }
  }

  /**
   * Get the full leaderboard.
   * @returns {Array} Sorted array of model records
   */
  async getLeaderboard() {
    try {
      const data = await this._gradioCall('get_leaderboard', []);
      return data || [];
    } catch (error) {
      this.log(`Failed to get leaderboard: ${error.message}`);
      return [];
    }
  }

  /**
   * Upload benchmark results to the leaderboard.
   * Results are averaged with existing records for the same model.
   * @param {object} results - Full benchmark results from IRobotBenchmark
   * @returns {object} { success, message }
   */
  async uploadResults(results) {
    try {
      const submission = {
        model: results.model,
        overall: results.overall,
        categories: {},
        timestamp: results.timestamp,
        version: '2.0',
        // External benchmark scores
        external: {},
        externalOverall: results.externalOverall || 0,
        combinedOverall: results.combinedOverall || results.overall,
        mindFlow: results.mindFlow || false,
      };

      // Flatten category scores
      for (const [cat, data] of Object.entries(results.categories)) {
        submission.categories[cat] = data.score;
      }

      // Flatten external benchmark scores
      if (results.external) {
        for (const [bench, data] of Object.entries(results.external)) {
          submission.external[bench] = data.score || 0;
        }
      }

      const data = await this._gradioCall('submit_result', [JSON.stringify(submission)]);
      return { success: true, message: data?.message || 'Results submitted' };
    } catch (error) {
      this.log(`Upload failed: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Download benchmark dataset from HuggingFace.
   * Returns null if not available (benchmark will use built-in tests).
   * @returns {object|null} Dataset object keyed by category, or null
   */
  async downloadDataset() {
    try {
      // Try to fetch dataset from HuggingFace Hub API
      const url = `https://huggingface.co/api/datasets/${DATASET_REPO}`;
      const response = await fetch(url);

      if (!response.ok) {
        this.log('Benchmark dataset not available on HuggingFace, using built-in tests');
        return null;
      }

      // Try to download the actual dataset file
      const dataUrl = `https://huggingface.co/datasets/${DATASET_REPO}/resolve/main/benchmark_tests.json`;
      const dataResponse = await fetch(dataUrl);

      if (!dataResponse.ok) {
        this.log('Dataset file not found, using built-in tests');
        return null;
      }

      const dataset = await dataResponse.json();
      this.log(`Downloaded dataset: ${Object.keys(dataset).length} categories`);
      return dataset;
    } catch (error) {
      this.log(`Dataset download failed: ${error.message}, using built-in tests`);
      return null;
    }
  }

  // ==================== Gradio API ====================

  /**
   * Call a Gradio endpoint function.
   * Uses the Gradio HTTP API (predict endpoint).
   */
  async _gradioCall(fnName, args) {
    const url = `${this.baseUrl}/api/${fnName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: args })
    });

    if (!response.ok) {
      throw new Error(`Gradio API error: ${response.status}`);
    }

    const result = await response.json();
    // Gradio wraps results in { data: [...] }
    return result.data?.[0] ?? result.data ?? result;
  }

  log(message) {
    if (this.verbose) {
      console.log(`[Leaderboard] ${message}`);
    }
  }
}

/**
 * Build the model recommendation message shown to users.
 */
function buildModelWarning(modelName, leaderboardResult, recommendedModels) {
  const lines = [];

  if (leaderboardResult.found) {
    const record = leaderboardResult.record;
    lines.push(`Model "${modelName}" found on leaderboard.`);
    lines.push(`Overall score: ${record.overall}/100`);

    if (record.overall < 50) {
      lines.push('');
      lines.push('WARNING: This model scored below 50/100. It may produce nonsensical results in i, Robot mode.');
      lines.push('Consider using a more capable model:');
      for (const m of recommendedModels.filter(m => m.tier === 'recommended')) {
        lines.push(`  - ${m.name}`);
      }
    }
  } else {
    lines.push(`Model "${modelName}" not found on leaderboard.`);
    lines.push('This model has not been benchmarked for i, Robot mode.');
    lines.push('');
    lines.push('For best results, we recommend these models:');
    for (const m of recommendedModels.filter(m => m.tier === 'recommended')) {
      lines.push(`  - ${m.name}`);
    }
    lines.push('');
    lines.push('You can run the benchmark to test this model\'s capability.');
    lines.push('Results will be uploaded to the community leaderboard.');
  }

  return lines.join('\n');
}

module.exports = { LeaderboardClient, buildModelWarning, SPACE_BASE_URL };
