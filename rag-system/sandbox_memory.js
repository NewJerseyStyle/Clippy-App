/**
 * Sandbox Memory Manager
 *
 * Creates isolated RAG instances for benchmarks so that benchmark data
 * never pollutes the user's real memory (./rag_data).
 *
 * Uses os.tmpdir() for isolation. Each sandbox gets a unique timestamped
 * directory that is cleaned up after the benchmark completes.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { HierarchicalRAGComplete } = require('./rag_complete_integration.js');

class SandboxMemory {
  /**
   * @param {string} prefix - Directory name prefix for the temp sandbox
   */
  constructor(prefix = 'clippy-bench') {
    this.prefix = prefix;
    this.sandboxDir = null;
    this.rag = null;
  }

  /**
   * Create a new isolated RAG instance in a temporary directory.
   *
   * @param {object} ragOptions - Options forwarded to HierarchicalRAGComplete
   *   (embeddingProvider, openaiApiKey, etc.)
   * @returns {HierarchicalRAGComplete} Fully initialized RAG instance
   */
  async create(ragOptions = {}) {
    // Generate unique temp directory
    const timestamp = Date.now();
    const dirName = `${this.prefix}-${timestamp}`;
    this.sandboxDir = path.join(os.tmpdir(), dirName);

    // Create the directory
    if (!fs.existsSync(this.sandboxDir)) {
      fs.mkdirSync(this.sandboxDir, { recursive: true });
    }

    console.log(`[SandboxMemory] Created sandbox at: ${this.sandboxDir}`);

    // Create isolated RAG instance pointing to the sandbox directory
    this.rag = new HierarchicalRAGComplete({
      ...ragOptions,
      dataDir: this.sandboxDir,
    });

    await this.rag.initialize();
    console.log('[SandboxMemory] RAG initialized in sandbox');

    return this.rag;
  }

  /**
   * Get the current sandbox RAG instance.
   * @returns {HierarchicalRAGComplete|null}
   */
  getRag() {
    return this.rag;
  }

  /**
   * Get the sandbox directory path.
   * @returns {string|null}
   */
  getDir() {
    return this.sandboxDir;
  }

  /**
   * Dispose of the RAG instance and remove the temporary directory.
   */
  async cleanup() {
    // Dispose the RAG instance first
    if (this.rag) {
      try {
        await this.rag.dispose();
        console.log('[SandboxMemory] RAG disposed');
      } catch (error) {
        console.error('[SandboxMemory] Error disposing RAG:', error.message);
      }
      this.rag = null;
    }

    // Remove the temporary directory
    if (this.sandboxDir && fs.existsSync(this.sandboxDir)) {
      try {
        fs.rmSync(this.sandboxDir, { recursive: true, force: true });
        console.log(`[SandboxMemory] Cleaned up sandbox: ${this.sandboxDir}`);
      } catch (error) {
        console.error(`[SandboxMemory] Error cleaning up sandbox: ${error.message}`);
      }
      this.sandboxDir = null;
    }
  }
}

module.exports = { SandboxMemory };
