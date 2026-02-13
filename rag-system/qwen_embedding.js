/**
 * Qwen3 Embedding - using @huggingface/transformers (ONNX Runtime)
 *
 * No native compilation required. Pre-built binaries, works on all platforms.
 * Model: onnx-community/Qwen3-Embedding-0.6B-ONNX
 */

const axios = require('axios');

class QwenEmbedding {
  constructor(options = {}) {
    this.options = {
      modelId: options.modelId || 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dtype: options.dtype || 'q4',  // 'fp32', 'fp16', 'q8', 'q4'
      verbose: options.verbose || false,
      useOpenAI: options.useOpenAI || false,
      openaiApiKey: options.openaiApiKey || null,
      openaiApiBaseUrl: options.openaiApiBaseUrl || 'https://api.openai.com/v1',
    };

    this.extractor = null;
    this.embeddingDim = null;
    this.isReady = false;
  }

  async initialize() {
    if (this.isReady) {
      console.log('[QwenEmbedding] Already initialized');
      return;
    }

    if (this.options.useOpenAI) {
      if (!this.options.openaiApiKey) {
        throw new Error('OpenAI API key is required when useOpenAI is true');
      }
      this.isReady = true;
      console.log('[QwenEmbedding] OpenAI embedding ready');
      return;
    }

    console.log('[QwenEmbedding] Loading model (ONNX)...');
    console.log(`  Model: ${this.options.modelId}`);
    console.log(`  Quantization: ${this.options.dtype}`);

    const startTime = Date.now();

    try {
      const { pipeline } = await import('@huggingface/transformers');

      this.extractor = await pipeline('feature-extraction', this.options.modelId, {
        dtype: this.options.dtype,
      });

      // Probe embedding dimension with a test input
      const test = await this.extractor('test', { pooling: 'mean', normalize: true });
      this.embeddingDim = test.dims[test.dims.length - 1];

      this.isReady = true;
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`[QwenEmbedding] Model loaded (${loadTime}s)`);
      console.log(`  Embedding dimensions: ${this.embeddingDim}`);

    } catch (error) {
      console.error('[QwenEmbedding] Model loading failed:', error);
      throw error;
    }
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text) {
    if (!this.isReady) {
      throw new Error('Model not initialized, call initialize() first');
    }

    if (this.options.useOpenAI) {
      try {
        const response = await axios.post(`${this.options.openaiApiBaseUrl}/embeddings`, {
          input: text,
          model: 'text-embedding-ada-002',
        }, {
          headers: {
            'Authorization': `Bearer ${this.options.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        return response.data.data[0].embedding;
      } catch (error) {
        console.error('[QwenEmbedding] OpenAI embedding failed:', error);
        throw error;
      }
    }

    try {
      const output = await this.extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('[QwenEmbedding] Embedding failed:', error);
      throw error;
    }
  }

  /**
   * Batch embeddings
   */
  async getEmbeddingBatch(texts) {
    if (!this.isReady) {
      throw new Error('Model not initialized');
    }

    const embeddings = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const embedding = await this.getEmbedding(texts[i]);
        embeddings.push(embedding);

        if (this.options.verbose && (i + 1) % 10 === 0) {
          console.log(`[QwenEmbedding] Processed ${i + 1}/${texts.length}`);
        }
      } catch (error) {
        console.error(`[QwenEmbedding] Error on text ${i + 1}:`, error);
        embeddings.push(null);
      }
    }

    return embeddings;
  }

  /**
   * Cosine similarity (vectors are already normalized)
   */
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimension mismatch');
    }
    return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  }

  /**
   * Model info
   */
  getModelInfo() {
    if (this.options.useOpenAI) {
      return {
        embeddingLength: 1536,
        modelId: 'OpenAI API'
      };
    }

    return {
      embeddingLength: this.embeddingDim || 1024,
      modelId: this.options.modelId,
      dtype: this.options.dtype
    };
  }

  /**
   * Release resources
   */
  async dispose() {
    console.log('[QwenEmbedding] Disposing...');
    this.extractor = null;
    this.isReady = false;
    console.log('[QwenEmbedding] Disposed');
  }

  /**
   * Test the model
   */
  async test() {
    console.log('\n[QwenEmbedding] Running test...\n');

    const testTexts = [
      'Artificial intelligence is a branch of computer science',
      'Machine learning is the main method to achieve AI',
      'The weather is nice today, sunny and bright'
    ];

    console.log('Test texts:');
    testTexts.forEach((text, i) => {
      console.log(`  ${i + 1}. ${text}`);
    });

    console.log('\nGenerating embeddings...');
    const embeddings = await this.getEmbeddingBatch(testTexts);

    console.log('\nResults:');
    console.log(`  Dimensions: ${embeddings[0].length}`);
    console.log(`  First 5 values: [${embeddings[0].slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    console.log('\nSimilarity:');
    const sim_ai_ml = this.cosineSimilarity(embeddings[0], embeddings[1]);
    const sim_ai_weather = this.cosineSimilarity(embeddings[0], embeddings[2]);

    console.log(`  "AI" vs "ML": ${(sim_ai_ml * 100).toFixed(2)}%`);
    console.log(`  "AI" vs "Weather": ${(sim_ai_weather * 100).toFixed(2)}%`);

    if (sim_ai_ml > sim_ai_weather) {
      console.log('\nTest passed: related texts have higher similarity');
    } else {
      console.log('\nTest unexpected: similarity results do not match expectations');
    }
  }
}

module.exports = { QwenEmbedding };

if (require.main === module) {
  (async () => {
    const embedder = new QwenEmbedding({ verbose: true });
    try {
      await embedder.initialize();
      await embedder.test();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      await embedder.dispose();
    }
  })();
}
