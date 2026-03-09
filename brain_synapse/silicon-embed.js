/**
 * @file brain_synapse/silicon-embed.js
 * @description 硅基流动向量嵌入模块 - 为 brain_synapse 提供语义检索能力
 * @version 2.0.0
 * 
 * 架构升级：
 * 1. 本地向量缓存 - 预处理存储文件 embedding，避免实时 API 调用
 * 2. 查询时单次 API - 仅对 query 发起一次 API 调用
 * 3. 本地余弦相似度计算 - 纯 Node.js 运算，极速返回
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const CONFIG = {
    apiUrl: 'https://api.siliconflow.cn/v1/embeddings',
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    model: 'BAAI/bge-m3',
    timeout: 5000,
    maxResults: 5,
    chunkSize: 1000
};

const VECTOR_CACHE_FILE = path.join(__dirname, 'vector_cache.json');
const VECTOR_META_FILE = path.join(__dirname, 'vector_meta.json');
const QUERY_CACHE_FILE = path.join(__dirname, 'vector_query_cache.json');

// [Optimization] 常用查询预热列表 - 启动时预加载
const WARMUP_QUERIES = ['browser', 'playwright', '报错', '测试', 'api', '错误', '失败', '成功'];

// [Optimization] 查询相似度阈值 - 用于查询去重
const QUERY_SIMILARITY_THRESHOLD = 0.95;

class SiliconEmbed {
    constructor() {
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileIndexCache = null;
        this._cacheTime = 0;
        this._vectorCache = null;
        // [Optimization] 查询缓存: query -> {embedding, timestamp}
        this._queryCache = this.loadQueryCache();
        // [Optimization] 预加载状态
        this._warmupComplete = false;
    }

    /**
     * 检查是否已配置 API
     */
    isConfigured() {
        return CONFIG.apiKey && CONFIG.apiKey.length > 0;
    }

    /**
     * 加载向量缓存
     * @returns {Object} 向量缓存 { chunks: [{id, file, preview, embedding}], lastUpdate }
     */
    loadVectorCache() {
        if (this._vectorCache) {
            return this._vectorCache;
        }
        
        if (fs.existsSync(VECTOR_CACHE_FILE)) {
            try {
                this._vectorCache = JSON.parse(fs.readFileSync(VECTOR_CACHE_FILE, 'utf8'));
                console.log(`[SiliconEmbed] Loaded vector cache: ${this._vectorCache.chunks.length} chunks`);
                return this._vectorCache;
            } catch (e) {
                console.warn(`[SiliconEmbed] Failed to load vector cache: ${e.message}`);
            }
        }
        
        this._vectorCache = { chunks: [], lastUpdate: null };
        return this._vectorCache;
    }

    /**
     * 加载查询缓存 (Query Cache)
     */
    loadQueryCache() {
        if (fs.existsSync(QUERY_CACHE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(QUERY_CACHE_FILE, 'utf8'));
                // Use Object.entries to reconstruct Map
                return new Map(Object.entries(data));
            } catch (e) {
                console.warn(`[SiliconEmbed] Failed to load query cache: ${e.message}`);
            }
        }
        return new Map();
    }

    /**
     * 保存查询缓存 (Query Cache)
     */
    saveQueryCache() {
        try {
            // Convert Map to Object internally
            const data = Object.fromEntries(this._queryCache);
            fs.writeFileSync(QUERY_CACHE_FILE, JSON.stringify(data), 'utf8');
        } catch (e) {
            console.warn(`[SiliconEmbed] Failed to save query cache: ${e.message}`);
        }
    }

    /**
     * 加载元数据（文件 mtime 记录）
     */
    loadMeta() {
        if (fs.existsSync(VECTOR_META_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(VECTOR_META_FILE, 'utf8'));
            } catch (e) {
                console.warn(`[SiliconEmbed] Meta corrupted: ${e.message}`);
            }
        }
        return { files: {} };
    }

    /**
     * 保存元数据
     */
    saveMeta(meta) {
        try {
            fs.writeFileSync(VECTOR_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[SiliconEmbed] Failed to save meta: ${e.message}`);
        }
    }

    /**
     * 保存向量缓存
     */
    saveVectorCache() {
        try {
            fs.writeFileSync(VECTOR_CACHE_FILE, JSON.stringify(this._vectorCache, null, 2), 'utf8');
            console.log(`[SiliconEmbed] Saved vector cache: ${this._vectorCache.chunks.length} chunks`);
        } catch (e) {
            console.error(`[SiliconEmbed] Failed to save vector cache: ${e.message}`);
        }
    }

    /**
     * 通用的 API 请求方法
     * @param {Object} payload - 请求载荷
     * @param {number} timeout - 超时时间（毫秒）
     * @param {Function} responseParser - 响应解析函数
     * @returns {Promise<any>} 解析后的响应数据
     */
    _makeApiRequest(payload, timeout, responseParser) {
        return new Promise((resolve, reject) => {
            const url = new URL(CONFIG.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.apiKey}`
                },
                timeout: timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const parsed = responseParser(result);
                        if (parsed.success) {
                            resolve(parsed.data);
                        } else {
                            reject(new Error(parsed.error || 'API error'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('API request timeout'));
            });

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    /**
     * 调用硅基流动 API 生成向量
     * @param {string} text - 要向量化的文本
     * @returns {Promise<number[]>} 向量数组
     */
    async getEmbedding(text) {
        const payload = {
            model: CONFIG.model,
            input: text
        };
        
        const responseParser = (result) => {
            if (result.data && result.data[0] && result.data[0].embedding) {
                return { success: true, data: result.data[0].embedding };
            } else if (result.error) {
                return { success: false, error: result.error.message || 'API error' };
            } else {
                return { success: false, error: 'Invalid API response' };
            }
        };
        
        return this._makeApiRequest(payload, CONFIG.timeout, responseParser);
    }

    /**
     * 批量获取向量（减少 API 调用次数）
     * @param {string[]} texts - 文本数组
     * @returns {Promise<number[][]>} 向量数组
     */
    async getEmbeddingsBatch(texts) {
        if (texts.length === 0) return [];
        
        const payload = {
            model: CONFIG.model,
            input: texts
        };
        
        const responseParser = (result) => {
            if (result.data && Array.isArray(result.data)) {
                const embeddings = result.data.map(item => item.embedding);
                return { success: true, data: embeddings };
            } else if (result.error) {
                return { success: false, error: result.error.message || 'API error' };
            } else {
                return { success: false, error: 'Invalid batch API response' };
            }
        };
        
        return this._makeApiRequest(payload, CONFIG.timeout * 2, responseParser);
    }

    /**
     * 计算余弦相似度
     * @param {number[]} a - 向量 A
     * @param {number[]} b - 向量 B
     * @returns {number} 相似度
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * 查询预处理 - 清洗路径符号，提取核心词汇
     * @param {string} query - 原始查询
     * @returns {string} 处理后的查询
     */
    preprocessQuery(query) {
        let processed = query;
        
        processed = processed.replace(/[a-zA-Z]:\\[\\\S]+/g, ' ');
        processed = processed.replace(/\/[\S]+\//g, ' ');
        
        processed = processed.replace(/[\d\-_:]+/g, ' ');
        
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }

    /**
     * 双轨混合打分 - 字面匹配奖励机制
     * @param {string} query - 原始查询
     * @param {Object} chunk - 缓存块
     * @returns {number} 词汇匹配奖励分数
     */
    computeLexicalBonus(query, chunk) {
        const LEXICAL_BONUS = 0.15;
        const MIN_KEYWORD_LENGTH = 2;
        
        const keywords = query.toLowerCase().match(/[a-z]{4,}|[^\s]{2,}/g) || [];
        
        if (keywords.length === 0) return 0;
        
        const chunkText = (chunk.preview + ' ' + chunk.file).toLowerCase();
        
        let matchCount = 0;
        for (const kw of keywords) {
            if (kw.length >= MIN_KEYWORD_LENGTH && chunkText.includes(kw)) {
                matchCount++;
            }
        }
        
        if (matchCount > 0) {
            return LEXICAL_BONUS * Math.min(matchCount, 3);
        }
        
        return 0;
    }

    /**
     * 加载 memory 目录中的所有文件
     * @returns {Array<{path: string, content: string}>} 文件列表
     */
    loadMemoryFiles() {
        const now = Date.now();
        
        if (this._fileIndexCache && (now - this._cacheTime) < 60000) {
            return this._fileIndexCache;
        }
        
        const files = [];
        const dirs = [this.memoryDir, this.archiveDir];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    const filePath = path.join(dir, entry.name);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const stats = fs.statSync(filePath);
                        files.push({
                            path: filePath,
                            name: entry.name,
                            content: content,
                            mtime: stats.mtimeMs,
                            isArchive: dir === this.archiveDir
                        });
                    } catch (e) {
                        console.warn(`[SiliconEmbed] Failed to read ${filePath}: ${e.message}`);
                    }
                }
            }
        }
        
        this._fileIndexCache = files;
        this._cacheTime = now;
        
        return files;
    }

    /**
     * 将文本分块
     * @param {string} content - 文档内容
     * @param {string} fileName - 文件名（可选）
     * @param {number} maxLength - 最大块长度
     * @returns {string[]} 段落数组
     */
    splitIntoChunks(content, fileName = '', maxLength = 1000) {
        const paragraphs = content.split(/\n\n+/);
        const chunks = [];
        let currentChunk = '';
        
        for (const para of paragraphs) {
            if (currentChunk.length + para.length > maxLength) {
                if (currentChunk) {
                    const chunkText = currentChunk.trim();
                    const prefix = fileName ? `[${fileName}] ` : '';
                    chunks.push(prefix + chunkText);
                }
                currentChunk = para;
            } else {
                currentChunk += '\n\n' + para;
            }
        }
        
        if (currentChunk) {
            const chunkText = currentChunk.trim();
            const prefix = fileName ? `[${fileName}] ` : '';
            chunks.push(prefix + chunkText);
        }
        
        return chunks;
    }

    /**
     * 构建向量索引（预处理）
     * @param {boolean} force - 是否强制重建
     */
    async buildIndex(force = false) {
        const startTime = Date.now();
        
        const cache = this.loadVectorCache();
        const files = this.loadMemoryFiles();
        const meta = this.loadMeta();
        
        const existingChunkMap = new Map();
        if (!force && cache.chunks && cache.chunks.length > 0) {
            for (const chunk of cache.chunks) {
                existingChunkMap.set(chunk.id, chunk);
            }
        }
        
        const newChunks = [];
        let apiCalls = 0;
        let changed = false;
        const processedFiles = {};
        
        for (const file of files) {
            const fileName = file.name;
            const currentMtime = file.mtime;
            const cachedMtime = meta.files[fileName];
            
            processedFiles[fileName] = currentMtime;
            
            if (!force && cachedMtime === currentMtime && existingChunkMap.size > 0) {
                for (let i = 0; i < 1000; i++) {
                    const chunkId = `${fileName}_${i}`;
                    if (existingChunkMap.has(chunkId)) {
                        newChunks.push(existingChunkMap.get(chunkId));
                    } else {
                        break;
                    }
                }
                continue;
            }
            
            changed = true;
            const chunks = this.splitIntoChunks(file.content, fileName);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkId = `${fileName}_${i}`;
                const preview = chunks[i].substring(0, 200);
                
                if (!force && existingChunkMap.has(chunkId)) {
                    const existing = existingChunkMap.get(chunkId);
                    if (existing.preview === preview) {
                        newChunks.push(existing);
                        continue;
                    }
                }
                
                newChunks.push({
                    id: chunkId,
                    file: fileName,
                    path: file.path,
                    preview: preview,
                    embedding: null,
                    mtime: currentMtime
                });
            }
        }
        
        meta.files = processedFiles;
        
        const chunksToEmbed = newChunks.filter(c => c.embedding === null);
        
        if (chunksToEmbed.length > 0) {
            console.log(`[SiliconEmbed] Need to embed ${chunksToEmbed.length} new chunks...`);
            
            const batchSize = 10;
            for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
                const batch = chunksToEmbed.slice(i, i + batchSize);
                const texts = batch.map(c => c.preview);
                
                try {
                    const embeddings = await this.getEmbeddingsBatch(texts);
                    for (let j = 0; j < batch.length; j++) {
                        batch[j].embedding = embeddings[j];
                    }
                    apiCalls++;
                    console.log(`[SiliconEmbed] Batch ${apiCalls}: ${i + batch.length}/${chunksToEmbed.length}`);
                } catch (e) {
                    console.error(`[SiliconEmbed] Batch embedding failed: ${e.message}`);
                }
            }
        }
        
        if (changed || chunksToEmbed.length > 0) {
            this._vectorCache = {
                chunks: newChunks,
                lastUpdate: Date.now()
            };
            
            this.saveVectorCache();
            this.saveMeta(meta);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`[SiliconEmbed] Index built in ${elapsed}ms, ${newChunks.length} chunks, ${apiCalls} API calls`);
        
        return { chunks: newChunks.length, apiCalls, elapsed };
    }

    /**
     * 增量索引 - 只对指定文件进行向量化
     * @param {string|string[]} filePaths - 单个文件路径或文件路径数组
     * @returns {Promise<number>} 新增的块数量
     */
    async incrementalIndex(filePaths) {
        if (!this.isConfigured()) {
            console.log('[SiliconEmbed] 向量搜索未配置，跳过增量索引');
            return 0;
        }

        if (!filePaths || (Array.isArray(filePaths) && filePaths.length === 0)) {
            console.log('[SiliconEmbed] 没有文件需要增量索引');
            return 0;
        }

        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        console.log(`[SiliconEmbed] 开始增量索引: ${files.length} 个文件`);

        const cache = this.loadVectorCache();
        const meta = this.loadMeta();

        if (!cache.chunks) {
            cache.chunks = [];
        }

        const existingChunkMap = new Map();
        cache.chunks.forEach(chunk => {
            const key = `${chunk.file}::${chunk.preview}`;
            existingChunkMap.set(key, true);
        });

        let newChunksAdded = 0;

        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                console.log(`[SiliconEmbed] 文件不存在: ${filePath}`);
                continue;
            }

            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');

            const fileChunks = this.splitIntoChunks(content, fileName);
            console.log(`[SiliconEmbed] 处理文件: ${fileName}, 生成 ${fileChunks.length} 个块`);

            const texts = fileChunks;

            try {
                const embeddings = await this.getEmbeddingsBatch(texts);

                for (let i = 0; i < fileChunks.length; i++) {
                    const chunk = {
                        file: fileName,
                        path: filePath,
                        preview: fileChunks[i].substring(0, 200),
                        embedding: embeddings[i]
                    };

                    const key = `${chunk.file}::${chunk.preview}`;
                    if (!existingChunkMap.has(key)) {
                        cache.chunks.push(chunk);
                        existingChunkMap.set(key, true);
                        newChunksAdded++;
                    }
                }

                meta.files[fileName] = {
                    mtime: stats.mtimeMs,
                    chunkCount: fileChunks.length
                };

            } catch (e) {
                console.error(`[SiliconEmbed] 增量索引获取向量失败 ${fileName}: ${e.message}`);
            }
        }

        if (newChunksAdded > 0) {
            cache.lastUpdate = Date.now();
            this._vectorCache = cache;
            this.saveVectorCache();
            this.saveMeta(meta);
            console.log(`[SiliconEmbed] 增量索引完成: 新增 ${newChunksAdded} 个块，总计 ${cache.chunks.length} 个块`);
        } else {
            console.log('[SiliconEmbed] 没有新增内容');
        }

        return newChunksAdded;
    }

    /**
     * [Optimization] 查找相似缓存查询
     * @param {string} query - 查询文本
     * @returns {Object|null} - 缓存的 embedding 或 null
     */
    findSimilarCachedQuery(query) {
        const processedQuery = this.preprocessQuery(query).toLowerCase();
        
        // 1. 精确匹配
        if (this._queryCache.has(processedQuery)) {
            const cached = this._queryCache.get(processedQuery);
            console.log(`[SiliconEmbed] Query cache HIT (exact): "${processedQuery.substring(0, 30)}..."`);
            return cached.embedding;
        }
        
        // 2. 相似匹配（简单子串匹配，避免复杂的向量相似度计算）
        for (const [cachedQuery, data] of this._queryCache) {
            // 互相包含视为相似
            if (processedQuery.includes(cachedQuery) || cachedQuery.includes(processedQuery)) {
                console.log(`[SiliconEmbed] Query cache HIT (similar): "${processedQuery.substring(0, 30)}..." ~ "${cachedQuery.substring(0, 30)}..."`);
                return data.embedding;
            }
        }
        
        return null;
    }

    /**
     * [Optimization] 缓存查询 embedding
     * @param {string} query - 查询文本
     * @param {number[]} embedding - 向量
     */
    cacheQueryEmbedding(query, embedding) {
        const processedQuery = this.preprocessQuery(query).toLowerCase();
        
        // LRU: 限制缓存大小
        if (this._queryCache.size >= 100) {
            const firstKey = this._queryCache.keys().next().value;
            this._queryCache.delete(firstKey);
        }
        
        this._queryCache.set(processedQuery, {
            embedding: embedding,
            timestamp: Date.now()
        });
        
        // Save to file on disk to persist across CLI calls
        this.saveQueryCache();
    }

    /**
     * [Optimization] 异步预热常用查询
     */
    async warmupQueries() {
        if (this._warmupComplete) return;
        
        console.log('[SiliconEmbed] Starting query warmup...');
        const startTime = Date.now();
        
        for (const query of WARMUP_QUERIES) {
            try {
                const embedding = await this.getEmbedding(query);
                this.cacheQueryEmbedding(query, embedding);
                console.log(`[SiliconEmbed] Warmup: "${query}" cached`);
            } catch (e) {
                console.warn(`[SiliconEmbed] Warmup failed for "${query}": ${e.message}`);
            }
        }
        
        this._warmupComplete = true;
        console.log(`[SiliconEmbed] Warmup completed in ${Date.now() - startTime}ms`);
    }

    /**
     * 执行向量检索（使用缓存）
     * @param {string} query - 查询文本
     * @returns {Promise<Object>} 检索结果
     */
    async search(query) {
        const startTime = Date.now();
        
        try {
            const processedQuery = this.preprocessQuery(query);
            console.log(`[SiliconEmbed] Generating embedding for query: "${processedQuery.substring(0, 30)}..."`);
            
            // [Optimization] 检查查询缓存
            let queryVector = this.findSimilarCachedQuery(query);
            let queryTime;
            
            if (queryVector) {
                // 缓存命中
                queryTime = Date.now() - startTime;
                console.log(`[SiliconEmbed] Query embedding (cached): ${queryTime}ms`);
            } else {
                // 缓存未命中，调用 API
                queryVector = await this.getEmbedding(processedQuery);
                queryTime = Date.now() - startTime;
                console.log(`[SiliconEmbed] Query embedding (API): ${queryTime}ms`);
                
                // 缓存结果
                this.cacheQueryEmbedding(query, queryVector);
            }
            
            const cache = this.loadVectorCache();
            
            if (cache.chunks.length === 0) {
                return {
                    success: false,
                    source: 'silicon-embed',
                    query: query,
                    error: 'Vector cache is empty. Run: node silicon-embed.js build-index',
                    results: [],
                    executionTime: Date.now() - startTime
                };
            }
            
            console.log(`[SiliconEmbed] Computing similarity with ${cache.chunks.length} chunks...`);
            
            const results = [];
            for (const chunk of cache.chunks) {
                if (!chunk.embedding) continue;
                
                const similarity = this.cosineSimilarity(queryVector, chunk.embedding);
                const lexicalBonus = this.computeLexicalBonus(query, chunk);
                const finalScore = similarity + lexicalBonus;
                
                results.push({
                    file: chunk.file,
                    path: chunk.path,
                    similarity: similarity,
                    lexicalBonus: lexicalBonus,
                    finalScore: finalScore,
                    preview: chunk.preview
                });
            }
            
            results.sort((a, b) => b.finalScore - a.finalScore);
            
            const topResults = results.slice(0, CONFIG.maxResults);
            
            const executionTime = Date.now() - startTime;
            console.log(`[SiliconEmbed] Search completed in ${executionTime}ms (query: ${queryTime}ms, similarity: ${executionTime - queryTime}ms)`);
            
            return {
                success: true,
                source: 'silicon-embed',
                query: query,
                results: topResults,
                executionTime: executionTime,
                totalChunks: cache.chunks.length
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`[SiliconEmbed] Search failed: ${error.message}`);
            
            return {
                success: false,
                source: 'silicon-embed',
                query: query,
                error: error.message,
                results: [],
                executionTime: executionTime
            };
        }
    }

    /**
     * 快速测试 API 是否可用
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        try {
            await this.getEmbedding('test');
            return true;
        } catch (error) {
            console.error(`[SiliconEmbed] Connection test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取向量缓存状态
     */
    getCacheStatus() {
        const cache = this.loadVectorCache();
        const meta = this.loadMeta();
        return {
            chunks: cache.chunks ? cache.chunks.length : 0,
            lastUpdate: cache.lastUpdate,
            trackedFiles: Object.keys(meta.files).length,
            queryCacheSize: this._queryCache.size,
            warmupComplete: this._warmupComplete,
            file: VECTOR_CACHE_FILE,
            meta: VECTOR_META_FILE
        };
    }

    /**
     * [Optimization] 清除查询缓存
     */
    clearQueryCache() {
        this._queryCache.clear();
        this.saveQueryCache();
        this._warmupComplete = false;
        console.log('[SiliconEmbed] Query cache cleared');
    }
}

// CLI 接口
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const embedder = new SiliconEmbed();
    
    if (command === 'test') {
        console.log('[SiliconEmbed] Testing connection...');
        embedder.testConnection().then(ok => {
            console.log(ok ? '[SiliconEmbed] Connection OK' : '[SiliconEmbed] Connection FAILED');
            process.exit(ok ? 0 : 1);
        });
    } else if (command === 'status') {
        console.log('[SiliconEmbed] Cache status:', JSON.stringify(embedder.getCacheStatus(), null, 2));
    } else if (command === 'build-index') {
        console.log('[SiliconEmbed] Building index...');
        const force = args.includes('--force') || args.includes('-f');
        embedder.buildIndex(force).then(result => {
            console.log('[SiliconEmbed] Build complete:', result);
            process.exit(0);
        }).catch(e => {
            console.error('[SiliconEmbed] Build failed:', e.message);
            process.exit(1);
        });
    } else if (command === 'search' && args[1]) {
        const query = args.slice(1).join(' ');
        embedder.search(query).then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        });
    } else if (command === 'warmup') {
        console.log('[SiliconEmbed] Running query warmup...');
        embedder.warmupQueries().then(() => {
            console.log('[SiliconEmbed] Warmup complete');
            process.exit(0);
        }).catch(e => {
            console.error('[SiliconEmbed] Warmup failed:', e.message);
            process.exit(1);
        });
    } else if (command === 'clear-query-cache') {
        embedder.clearQueryCache();
        process.exit(0);
    } else {
        console.log(`SiliconEmbed v2.0.0 - Vector Cache CLI

Usage: node silicon-embed.js <command> [options]

Commands:
  test            Test API connection
  status          Show vector cache status
  build-index     Build/update vector cache
    --force      Force rebuild from scratch
  search <query> Search with vector similarity
  warmup          Preload common queries into cache
  clear-query-cache  Clear the query embedding cache

Examples:
  node silicon-embed.js test
  node silicon-embed.js build-index
  node silicon-embed.js search "浏览器操作"
`);
    }
}

module.exports = SiliconEmbed;
