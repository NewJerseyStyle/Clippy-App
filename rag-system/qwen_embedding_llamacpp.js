/**
 * Qwen3 Embedding - 使用 node-llama-cpp (v3+)
 *
 * 可完全 bundle 到 Electron，無需 Python
 * 支持 GGUF 量化模型
 *
 * Note: node-llama-cpp v3 is ESM-only, so we use dynamic import().
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

class QwenEmbedding {
  constructor(options = {}) {
    this.options = {
      modelPath: options.modelPath || this.getDefaultModelPath(),
      contextSize: options.contextSize || 2048,
      batchSize: options.batchSize || 512,
      threads: options.threads || 4,
      gpuLayers: options.gpuLayers || 0,  // 0 = CPU only, >0 = GPU 加速
      verbose: options.verbose || false,
      useOpenAI: options.useOpenAI || false,
      openaiApiKey: options.openaiApiKey || null,
      openaiApiBaseUrl: options.openaiApiBaseUrl || 'https://api.openai.com/v1',
    };

    // v3 instances (lazy-loaded via dynamic import)
    this._llama = null;
    this.model = null;
    this.context = null;
    this.isReady = false;
  }

  /**
   * 獲取默認模型路徑
   */
  getDefaultModelPath() {
    // 開發環境
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, 'models', 'qwen3-embedding-0.6B.Q4_K_M.gguf');
    }

    // 生產環境（Electron）
    if (process.resourcesPath) {
      return path.join(process.resourcesPath, 'models', 'qwen3-embedding-0.6B.Q4_K_M.gguf');
    }

    return path.join(__dirname, 'models', 'qwen3-embedding-0.6B.Q4_K_M.gguf');
  }

  /**
   * 確保模型目錄存在
   */
  async ensureModelDir() {
    const modelDir = path.dirname(this.options.modelPath);
    if (!fs.existsSync(modelDir)) {
      await fs.promises.mkdir(modelDir, { recursive: true });
    }
  }

  /**
   * 初始化模型
   */
  async initialize() {
    if (this.isReady) {
      console.log('⚠️  模型已初始化');
      return;
    }

    if (this.options.useOpenAI) {
      if (!this.options.openaiApiKey) {
        throw new Error('OpenAI API key is required when useOpenAI is true');
      }
      this.isReady = true;
      console.log('✅ OpenAI embedding is ready');
      return;
    }

    console.log('🔄 正在加載 Qwen3 embedding 模型...');
    console.log(`📁 模型路徑: ${this.options.modelPath}`);

    await this.ensureModelDir();

    // 檢查模型文件是否存在
    if (!fs.existsSync(this.options.modelPath)) {
      console.log(`模型文件不存在, 將從 Hugging Face 下載...`);
      const modelUrl = `https://huggingface.co/PeterAM4/Qwen3-Embedding-0.6B-GGUF/resolve/main/${path.basename(this.options.modelPath)}`;
      console.log(`URL: ${modelUrl}`);

      try {
        const response = await axios({
          method: 'get',
          url: modelUrl,
          responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];
        let downloadedLength = 0;
        const writer = fs.createWriteStream(this.options.modelPath);

        response.data.on('data', (chunk) => {
          downloadedLength += chunk.length;
          const percentage = ((downloadedLength / totalLength) * 100).toFixed(2);
          process.stdout.write(`\rDownloading model... ${percentage}%`);
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log('\n✅ 模型下載完成');

      } catch (error) {
        throw new Error(`模型下載失敗: ${error.message}`);
      }
    }

    const startTime = Date.now();

    try {
      // Dynamic import for ESM-only node-llama-cpp v3+
      const { getLlama } = await import('node-llama-cpp');

      // Initialize llama runtime
      this._llama = await getLlama();

      // 加載模型
      this.model = await this._llama.loadModel({
        modelPath: this.options.modelPath,
        gpuLayers: this.options.gpuLayers,
      });

      // 創建 embedding 上下文
      this.context = await this.model.createEmbeddingContext({
        contextSize: this.options.contextSize,
        batchSize: this.options.batchSize,
        threads: this.options.threads,
      });

      this.isReady = true;
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`✅ 模型加載完成 (耗時: ${loadTime}s)`);
      console.log(`🎛️  GPU 層數: ${this.options.gpuLayers}`);
      console.log(`🧵 線程數: ${this.options.threads}`);

      // 獲取模型信息
      const info = this.getModelInfo();
      console.log(`📊 Embedding 維度: ${info.embeddingLength}`);

    } catch (error) {
      console.error('❌ 模型加載失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取單個文本的 embedding
   */
  async getEmbedding(text) {
    if (!this.isReady) {
      throw new Error('模型未初始化，請先調用 initialize()');
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
        console.error('❌ OpenAI Embedding 生成失敗:', error);
        throw error;
      }
    }

    try {
      // node-llama-cpp v3: getEmbeddingFor returns { vector: number[] }
      const result = await this.context.getEmbeddingFor(text);
      const embeddingArray = Array.from(result.vector);
      return this.normalize(embeddingArray);

    } catch (error) {
      console.error('❌ Embedding 生成失敗:', error);
      throw error;
    }
  }

  /**
   * 批量獲取 embeddings
   */
  async getEmbeddingBatch(texts) {
    if (!this.isReady) {
      throw new Error('模型未初始化');
    }

    const embeddings = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const embedding = await this.getEmbedding(texts[i]);
        embeddings.push(embedding);

        if (this.options.verbose && (i + 1) % 10 === 0) {
          console.log(`📊 已處理 ${i + 1}/${texts.length} 個文本`);
        }
      } catch (error) {
        console.error(`❌ 處理第 ${i + 1} 個文本時出錯:`, error);
        embeddings.push(null);
      }
    }

    return embeddings;
  }

  /**
   * 歸一化向量（L2 normalization）
   */
  normalize(vector) {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) {
      console.warn('⚠️  向量範數為 0，返回原始向量');
      return vector;
    }

    return vector.map(v => v / norm);
  }

  /**
   * 計算餘弦相似度
   */
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('向量維度不匹配');
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    return dotProduct;  // 已歸一化，點積即為餘弦相似度
  }

  /**
   * 獲取模型信息
   */
  getModelInfo() {
    if (this.options.useOpenAI) {
      return {
        embeddingLength: 1536,  // text-embedding-ada-002 default
        contextSize: this.options.contextSize,
        modelPath: 'OpenAI API'
      };
    }

    if (!this.model) {
      return null;
    }

    return {
      // v3: embeddingVectorSize; fallback to 384 for older compat
      embeddingLength: this.model.embeddingVectorSize || 384,
      contextSize: this.options.contextSize,
      modelPath: this.options.modelPath
    };
  }

  /**
   * 釋放資源
   */
  async dispose() {
    console.log('🔄 正在釋放模型資源...');

    if (this.context) {
      await this.context.dispose();
      this.context = null;
    }

    if (this.model) {
      await this.model.dispose();
      this.model = null;
    }

    this._llama = null;
    this.isReady = false;
    console.log('✅ 資源已釋放');
  }

  /**
   * 測試模型
   */
  async test() {
    console.log('\n🧪 開始測試...\n');

    const testTexts = [
      '人工智能是計算機科學的一個分支',
      '機器學習是實現人工智能的主要方法',
      '今天天氣很好，陽光明媚'
    ];

    console.log('📝 測試文本:');
    testTexts.forEach((text, i) => {
      console.log(`  ${i + 1}. ${text}`);
    });

    console.log('\n🔄 生成 embeddings...');
    const embeddings = await this.getEmbeddingBatch(testTexts);

    console.log('\n📊 結果:');
    console.log(`  Embedding 維度: ${embeddings[0].length}`);
    console.log(`  前 5 個值: [${embeddings[0].slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    console.log('\n🔍 相似度計算:');
    const sim_ai_ml = this.cosineSimilarity(embeddings[0], embeddings[1]);
    const sim_ai_weather = this.cosineSimilarity(embeddings[0], embeddings[2]);

    console.log(`  "人工智能" vs "機器學習": ${(sim_ai_ml * 100).toFixed(2)}%`);
    console.log(`  "人工智能" vs "天氣": ${(sim_ai_weather * 100).toFixed(2)}%`);

    if (sim_ai_ml > sim_ai_weather) {
      console.log('\n✅ 測試通過：相關文本的相似度更高');
    } else {
      console.log('\n⚠️  測試異常：相似度結果不符合預期');
    }
  }
}

// ==================== 使用示例 ====================

async function example() {
  const embedder = new QwenEmbedding({
    gpuLayers: 0,
    threads: 4,
    verbose: true
  });

  try {
    await embedder.initialize();
    await embedder.test();

    console.log('\n💡 實際使用示例:');
    const text = '這是一個關於深度學習的文本';
    const embedding = await embedder.getEmbedding(text);
    console.log(`文本: "${text}"`);
    console.log(`Embedding 維度: ${embedding.length}`);

  } catch (error) {
    console.error('錯誤:', error);
  } finally {
    await embedder.dispose();
  }
}

// ==================== 導出 ====================

module.exports = {
  QwenEmbedding,
};

// 如果直接運行
if (require.main === module) {
  example().catch(console.error);
}
