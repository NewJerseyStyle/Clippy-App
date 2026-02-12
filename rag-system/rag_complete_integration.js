/**
 * 完整集成：多層 RAG + LanceDB + Qwen Embedding
 * 
 * 這個文件展示如何將所有組件整合在一起
 */

const lancedb = require('@lancedb/lancedb');
const { QwenEmbedding } = require('./qwen_embedding_llamacpp');
const path = require('path');
const fs = require('fs').promises;

class HierarchicalRAGComplete {
  constructor(options = {}) {
    this.options = {
      dataDir: options.dataDir || './rag_data',
      modelPath: options.modelPath || './models/qwen3-embedding-0.6B.Q4_K_M.gguf',
      maxLayers: options.maxLayers || 10,
      maxChildren: options.maxChildren || 10,
      maxTokensPerItem: options.maxTokensPerItem || 512,
      gpuLayers: options.gpuLayers || 0,
      threads: options.threads || 4,
      verbose: options.verbose || false
    };

    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isReady = false;

    // 內存緩存
    this.nodeCache = new Map();
    this.maxCacheSize = 1000;
  }

  /**
   * 初始化整個系統
   */
  async initialize() {
    console.log('🚀 初始化多層 RAG 系統...\n');

    // 1. 創建數據目錄
    await this.ensureDataDir();

    // 2. 初始化 embedding 模型
    console.log('📦 步驟 1/3: 初始化 Embedding 模型');
    this.embedder = new QwenEmbedding({
      modelPath: this.options.modelPath,
      gpuLayers: this.options.gpuLayers,
      threads: this.options.threads,
      verbose: this.options.verbose
    });
    await this.embedder.initialize();

    // 3. 連接向量數據庫
    console.log('\n📦 步驟 2/3: 連接向量數據庫');
    this.db = await lancedb.connect(this.options.dataDir);
    
    try {
      this.table = await this.db.openTable('memories');
      console.log('✅ 打開現有記憶表');
    } catch {
      console.log('📝 創建新記憶表');
      await this.createTable();
    }

    // 4. 創建根節點（如果需要）
    console.log('\n📦 步驟 3/3: 檢查根節點');
    await this.ensureRootNode();

    this.isReady = true;
    console.log('\n✅ 系統初始化完成！\n');
    
    // 打印統計
    await this.printStats();
  }

  /**
   * 確保數據目錄存在
   */
  async ensureDataDir() {
    try {
      await fs.mkdir(this.options.dataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 創建記憶表
   */
  async createTable() {
    const embeddingDim = this.embedder.getModelInfo().embeddingLength;
    
    this.table = await this.db.createTable('memories', [
      {
        id: 'root',
        layer: 0,
        vector: new Array(embeddingDim).fill(0),
        content: '知識根節點 - 所有知識的起點',
        context: '系統根節點',
        parent_id: null,
        children_ids: '[]',
        created_at: Date.now(),
        last_accessed: Date.now(),
        access_count: 0
      }
    ]);
  }

  /**
   * 確保根節點存在
   */
  async ensureRootNode() {
    try {
      const root = await this.getNode('root');
      if (!root) {
        console.log('創建根節點...');
        await this.createRootNode();
      } else {
        console.log('✅ 根節點已存在');
      }
    } catch {
      console.log('創建根節點...');
      await this.createRootNode();
    }
  }

  /**
   * 創建根節點
   */
  async createRootNode() {
    const embeddingDim = this.embedder.getModelInfo().embeddingLength;
    const rootEmbedding = await this.embedder.getEmbedding('知識根節點');
    
    await this.table.add([{
      id: 'root',
      layer: 0,
      vector: rootEmbedding,
      content: '知識根節點 - 所有知識的起點',
      context: '系統根節點',
      parent_id: null,
      children_ids: '[]',
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 0
    }]);
    
    console.log('✅ 根節點已創建');
  }

  /**
   * 添加記憶節點
   */
  async addNode({ content, context, layer, parentId = null }) {
    if (!this.isReady) {
      throw new Error('系統未初始化');
    }

    // 驗證
    if (layer < 0 || layer >= this.options.maxLayers) {
      throw new Error(`Layer must be 0-${this.options.maxLayers - 1}`);
    }

    // 驗證父節點
    if (parentId) {
      const parent = await this.getNode(parentId);
      if (!parent) {
        throw new Error(`Parent node ${parentId} not found`);
      }

      if (parent.layer !== layer - 1) {
        throw new Error(`Parent must be at layer ${layer - 1}, got ${parent.layer}`);
      }

      const childrenIds = JSON.parse(parent.children_ids || '[]');
      if (childrenIds.length >= this.options.maxChildren) {
        throw new Error(`Parent already has ${this.options.maxChildren} children`);
      }
    }

    // 生成 ID 和 embedding
    const nodeId = `node_${layer}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.options.verbose) {
      console.log(`🔄 生成 embedding: ${content.substring(0, 30)}...`);
    }
    
    const embedding = await this.embedder.getEmbedding(content);

    // 截斷內容
    const truncatedContent = this.truncateText(content, this.options.maxTokensPerItem);
    const truncatedContext = this.truncateText(context, 256);

    // 創建節點
    const node = {
      id: nodeId,
      layer: layer,
      vector: embedding,
      content: truncatedContent,
      context: truncatedContext,
      parent_id: parentId,
      children_ids: '[]',
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1
    };

    // 添加到數據庫
    await this.table.add([node]);

    // 更新父節點
    if (parentId) {
      await this.addChildToParent(parentId, nodeId);
    }

    // 加入緩存
    this.cacheNode(node);

    if (this.options.verbose) {
      console.log(`✅ 已添加節點 ${nodeId} 到層 ${layer}`);
    }

    return node;
  }

  /**
   * 更新父節點的子節點列表
   */
  async addChildToParent(parentId, childId) {
    const parent = await this.getNode(parentId);
    if (parent) {
      const childrenIds = JSON.parse(parent.children_ids || '[]');
      if (!childrenIds.includes(childId)) {
        childrenIds.push(childId);
        
        await this.table.add([{
          ...parent,
          children_ids: JSON.stringify(childrenIds),
          last_accessed: Date.now()
        }]);

        // 更新緩存
        this.cacheNode({
          ...parent,
          children_ids: JSON.stringify(childrenIds)
        });
      }
    }
  }

  /**
   * 獲取節點
   */
  async getNode(nodeId) {
    // 先查緩存
    if (this.nodeCache.has(nodeId)) {
      return this.nodeCache.get(nodeId);
    }

    // 從數據庫查詢
    const results = await this.table
      .query()
      .where(`id = '${nodeId}'`)
      .limit(1)
      .toArray();
    
    if (results.length > 0) {
      this.cacheNode(results[0]);
      return results[0];
    }
    
    return null;
  }

  /**
   * 在層內搜索
   */
  async searchInLayer(query, layer, topK = 10, parentId = null) {
    if (!this.isReady) {
      throw new Error('系統未初始化');
    }

    // 生成查詢 embedding
    const queryEmbedding = await this.embedder.getEmbedding(query);

    // 構建查詢
    let whereClause = `layer = ${layer}`;
    if (parentId) {
      whereClause += ` AND parent_id = '${parentId}'`;
    }

    const results = await this.table
      .vectorSearch(queryEmbedding)
      .where(whereClause)
      .limit(topK)
      .toArray();

    // 更新訪問統計
    for (const result of results) {
      await this.updateAccessStats(result.id);
    }

    return results;
  }

  /**
   * 分層遍歷搜索
   */
  async traverseSearch(query, maxDepth = 3) {
    if (!this.isReady) {
      throw new Error('系統未初始化');
    }

    console.log(`🔍 遍歷搜索: "${query}" (最大深度: ${maxDepth})`);

    const allResults = [];
    let currentLayer = 0;
    let currentParent = null;

    while (currentLayer < Math.min(maxDepth, this.options.maxLayers)) {
      console.log(`  📊 搜索層 ${currentLayer}...`);

      const layerResults = await this.searchInLayer(
        query,
        currentLayer,
        3,
        currentParent
      );

      if (layerResults.length === 0) {
        console.log(`  ⚠️  層 ${currentLayer} 無結果，停止搜索`);
        break;
      }

      // 記錄結果
      for (const result of layerResults) {
        allResults.push({
          ...result,
          depth: currentLayer,
          similarity: this.calculateSimilarity(result)
        });
      }

      console.log(`  ✓ 找到 ${layerResults.length} 個結果`);

      // 選擇最相關的作為下一層父節點
      currentParent = layerResults[0].id;
      currentLayer++;
    }

    console.log(`✅ 搜索完成，共找到 ${allResults.length} 個結果`);
    return allResults;
  }

  /**
   * 計算相似度（簡化版，實際由 LanceDB 計算）
   */
  calculateSimilarity(result) {
    // LanceDB 返回的 _distance 需要轉換為相似度
    // 這裡簡化處理
    return result._distance ? 1 - result._distance : 0.5;
  }

  /**
   * 更新訪問統計
   */
  async updateAccessStats(nodeId) {
    const node = await this.getNode(nodeId);
    if (node) {
      await this.table.add([{
        ...node,
        last_accessed: Date.now(),
        access_count: (node.access_count || 0) + 1
      }]);
    }
  }

  /**
   * 緩存節點
   */
  cacheNode(node) {
    // LRU 緩存
    if (this.nodeCache.size >= this.maxCacheSize) {
      const firstKey = this.nodeCache.keys().next().value;
      this.nodeCache.delete(firstKey);
    }
    this.nodeCache.set(node.id, node);
  }

  /**
   * 截斷文本
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 獲取統計信息
   */
  async getStats() {
    const stats = {
      totalNodes: 0,
      layers: {},
      treeDepth: 0
    };

    for (let layer = 0; layer < this.options.maxLayers; layer++) {
      const layerNodes = await this.table
        .query()
        .where(`layer = ${layer}`)
        .limit(100000)
        .toArray();

      const count = layerNodes.length;
      const theoreticalMax = layer === 0 ? 1 : Math.pow(10, layer);

      stats.layers[layer] = {
        count,
        theoreticalMax,
        capacityUsed: (count / theoreticalMax) * 100
      };

      stats.totalNodes += count;

      if (count > 0) {
        stats.treeDepth = layer + 1;
      }
    }

    return stats;
  }

  /**
   * 打印統計
   */
  async printStats() {
    const stats = await this.getStats();

    console.log('\n' + '='.repeat(70));
    console.log('📊 記憶樹統計');
    console.log('='.repeat(70));
    console.log(`總節點數: ${stats.totalNodes.toLocaleString()}`);
    console.log(`樹深度: ${stats.treeDepth}`);
    console.log(`模型: ${path.basename(this.options.modelPath)}`);
    console.log(`Embedding 維度: ${this.embedder.getModelInfo().embeddingLength}`);
    console.log('\n各層分佈:');

    for (let layer = 0; layer < stats.treeDepth; layer++) {
      const layerStats = stats.layers[layer];
      const count = layerStats.count;
      const max = layerStats.theoreticalMax;

      const barLength = 50;
      const filled = Math.min(Math.floor((count / Math.max(max, count)) * barLength), barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

      console.log(`層 ${layer}: [${bar}] ${count.toLocaleString()}/${max.toLocaleString()} 節點`);
    }

    console.log('='.repeat(70) + '\n');
  }

  /**
   * 清理資源
   */
  async dispose() {
    console.log('🔄 正在清理資源...');

    if (this.embedder) {
      await this.embedder.dispose();
    }

    this.nodeCache.clear();
    this.isReady = false;

    console.log('✅ 資源已清理');
  }
}

// ==================== 使用示例 ====================

async function demo() {
  const rag = new HierarchicalRAGComplete({
    dataDir: './rag_data',
    modelPath: './models/qwen3-embedding-0.6B.Q4_K_M.gguf',
    gpuLayers: 0,
    threads: 4,
    verbose: true
  });

  try {
    // 初始化
    await rag.initialize();

    // 添加一些測試節點
    console.log('\n📝 添加測試節點...\n');

    const ai = await rag.addNode({
      content: '人工智能是計算機科學的一個分支，致力於創建能夠執行通常需要人類智能的任務的系統',
      context: '討論 AI 基礎概念時使用',
      layer: 1,
      parentId: 'root'
    });

    const ml = await rag.addNode({
      content: '機器學習是實現人工智能的主要方法，通過數據和經驗來改進算法的性能',
      context: '討論 AI 技術實現時使用',
      layer: 2,
      parentId: ai.id
    });

    await rag.addNode({
      content: '深度學習使用多層神經網絡來處理複雜的數據模式，是機器學習的一個子領域',
      context: '討論現代 AI 技術時使用',
      layer: 3,
      parentId: ml.id
    });

    // 搜索測試
    console.log('\n🔍 搜索測試...\n');

    const results = await rag.traverseSearch('神經網絡和深度學習', 4);
    
    console.log('\n搜索結果:');
    results.forEach((result, i) => {
      console.log(`\n${i + 1}. [層 ${result.depth}] 相似度: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`   ${result.content.substring(0, 60)}...`);
    });

    // 打印最終統計
    await rag.printStats();

  } catch (error) {
    console.error('❌ 錯誤:', error);
  } finally {
    await rag.dispose();
  }
}

// ==================== 導出 ====================

module.exports = { HierarchicalRAGComplete };

// 直接運行
if (require.main === module) {
  demo().catch(console.error);
}
