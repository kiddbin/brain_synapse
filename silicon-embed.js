/**
 * @file brain_synapse/silicon-embed.js
 * @description 向量嵌入模块 - 为 brain_synapse 提供语义检索能力
 * @version 2.1.0
 * 
 * ==================== 重要说明 ====================
 * 
 * 本模块提供基于向量的语义搜索功能。
 * 
 * 【支持的提供商】
 * - Voyage AI (推荐): 50M 免费 tokens/月
 * - Hugging Face: 完全免费
 * - Ollama: 本地离线运行
 * 
 * 【配置 API Key】
 * 方式1: 环境变量（推荐）
 *   export VOYAGE_API_KEY='your-key'    (Voyage AI)
 *   export HF_TOKEN='your-token'        (Hugging Face)
 * 
 * 方式2: 修改 config.js 中的 vectorSearchApi 配置
 * 
 * 【本地运行】
 * 如果未配置 API Key 或 API 调用失败，系统会自动回退到本地文件搜索
 * 
 * ==================== 架构说明 ====================
 * 
 * 1. 本地向量缓存 - 预处理存储文件 embedding，避免实时 API 调用
 * 2. 查询时单次 API - 仅对 query 发起一次 API 调用
 * 3. 本地余弦相似度计算 - 纯 Node.js 运算，极速返回
 * 4. 无缝降级 - API 不可用时自动使用本地搜索
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// 引入配置
const CONFIG = require('./config');

// 向后兼容：支持旧的 siliconFlow 配置或新的 vectorSearchApi
const getVectorConfig = () => {
    if (CONFIG.vectorSearchApi) {
        return CONFIG.vectorSearchApi;
    }
    // 兼容旧版本
    return CONFIG.siliconFlow || {
        apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3',
        model: 'BAAI/bge-m3',
        apiKey: '',
        timeout: 5000,
        maxResults: 5,
        chunkSize: 1000
    };
};

const VECTOR_CACHE_FILE = path.join(__dirname, 'vector_cache.json');
const VECTOR_META_FILE = path.join(__dirname, 'vector_meta.json');

class SiliconEmbed {
    constructor() {
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileIndexCache = null;
        this._cacheTime = 0;
        this._vectorCache = null;
        
        // 从配置获取 API 设置（支持新舊配置）
        const vectorConfig = getVectorConfig();
        this.apiUrl = vectorConfig.apiUrl;
        this.apiKey = vectorConfig.apiKey;
        this.model = vectorConfig.model;
        this.timeout = vectorConfig.timeout;
        this.maxResults = vectorConfig.maxResults;
        this.chunkSize = vectorConfig.chunkSize;
        
        // 检查是否启用向量搜索
        this.isEnabled = CONFIG.features.enableVectorSearch && this.apiKey;
        if (!this.isEnabled) {
            console.log('[SiliconEmbed] 向量搜索未启用（未配置 API Key），将使用本地搜索');
        }
    }

    /**
     * 检查向量搜索是否可用
     */
    isAvailable() {
        if (!this.isEnabled || !this.apiKey) return false;
        // 支持多种 API Key 格式
        return this.apiKey.startsWith('sk-') ||    // OpenAI/SiliconFlow
               this.apiKey.startsWith('hf_') ||    // Hugging Face
               this.apiKey.startsWith('vk-');       // Voyage AI
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
                console.log(`[SiliconEmbed] 已加载向量缓存: ${this._vectorCache.chunks.length} 个块`);
                return this._vectorCache;
            } catch (e) {
                console.warn(`[SiliconEmbed] 加载向量缓存失败: ${e.message}`);
            }
        }
        
        this._vectorCache = { chunks: [], lastUpdate: null };
        return this._vectorCache;
    }

    /**
     * 加载元数据（文件 mtime 记录）
     */
    loadMeta() {
        if (fs.existsSync(VECTOR_META_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(VECTOR_META_FILE, 'utf8'));
            } catch (e) {
                console.warn(`[SiliconEmbed] 元数据损坏: ${e.message}`);
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
            console.warn(`[SiliconEmbed] 保存元数据失败: ${e.message}`);
        }
    }

    /**
     * 保存向量缓存
     */
    saveVectorCache() {
        try {
            fs.writeFileSync(VECTOR_CACHE_FILE, JSON.stringify(this._vectorCache, null, 2), 'utf8');
            console.log(`[SiliconEmbed] 已保存向量缓存: ${this._vectorCache.chunks.length} 个块`);
        } catch (e) {
            console.error(`[SiliconEmbed] 保存向量缓存失败: ${e.message}`);
        }
    }

    /**
     * 调用向量 API 生成向量
     * 支持多种提供商：Voyage AI, Hugging Face, SiliconFlow
     * @param {string} text - 要向量化的文本
     * @returns {Promise<number[]>} 向量数组
     */
    async getEmbedding(text) {
        if (!this.isAvailable()) {
            throw new Error('向量搜索未启用：请配置 VOYAGE_API_KEY 或 HF_TOKEN 环境变量');
        }
        
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: this.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        // Voyage AI / SiliconFlow 格式
                        if (result.data && result.data[0] && result.data[0].embedding) {
                            resolve(result.data[0].embedding);
                        } 
                        // Hugging Face 格式 (直接返回数组)
                        else if (Array.isArray(result)) {
                            resolve(result);
                        }
                        // Hugging Face 错误格式
                        else if (result.error) {
                            reject(new Error(result.error.message || result.error || 'API 错误'));
                        }
                        else if (result.errors) {
                            reject(new Error(JSON.stringify(result.errors)));
                        }
                        else {
                            reject(new Error('无效的 API 响应: ' + data.substring(0, 200)));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('API 请求超时'));
            });

            // 根据不同提供商构建请求体
            let payload;
            if (this.apiUrl.includes('voyageai.com')) {
                // Voyage AI 格式
                payload = {
                    model: this.model,
                    input: text
                };
            } else if (this.apiUrl.includes('huggingface.co')) {
                // Hugging Face 格式 (使用 inputs 字段)
                payload = {
                    model: this.model,
                    inputs: text
                };
            } else {
                // SiliconFlow / OpenAI 兼容格式
                payload = {
                    model: this.model,
                    input: text
                };
            }

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    /**
     * 批量获取向量（减少 API 调用次数）
     * @param {string[]} texts - 文本数组
     * @returns {Promise<number[][]>} 向量数组
     */
    async getEmbeddingsBatch(texts) {
        if (!this.isAvailable()) {
            throw new Error('向量搜索未启用');
        }
        
        if (texts.length === 0) return [];
        
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: this.timeout * 2
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        // Voyage AI / SiliconFlow 格式
                        if (result.data && Array.isArray(result.data)) {
                            const embeddings = result.data.map(item => item.embedding);
                            resolve(embeddings);
                        }
                        // Hugging Face 格式
                        else if (Array.isArray(result)) {
                            resolve(result);
                        }
                        else if (result.error) {
                            reject(new Error(result.error.message || 'API 错误'));
                        }
                        else {
                            reject(new Error('无效的 API 响应: ' + data.substring(0, 200)));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('API 请求超时'));
            });

            const payload = {
                model: this.model,
                input: texts
            };

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    /**
     * 构建向量索引
     * 遍历 memory 目录，对每个文件进行分块并生成向量
     */
    async buildIndex() {
        if (!this.isAvailable()) {
            console.log('[SiliconEmbed] 向量搜索未启用，跳过索引构建');
            return;
        }
        
        console.log('[SiliconEmbed] 开始构建向量索引...');
        
        const allFiles = [
            ...this.getMarkdownFiles(this.memoryDir),
            ...this.getMarkdownFiles(this.archiveDir)
        ];
        
        const chunks = [];
        const meta = this.loadMeta();
        
        for (const filePath of allFiles) {
            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            
            // 检查文件是否需要更新
            if (meta.files[fileName] && meta.files[fileName].mtime === stats.mtimeMs) {
                console.log(`[SiliconEmbed] 跳过未变化的文件: ${fileName}`);
                continue;
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            const fileChunks = this.splitIntoChunks(content);
            
            console.log(`[SiliconEmbed] 处理文件: ${fileName}, 生成 ${fileChunks.length} 个块`);
            
            // 批量获取向量
            const texts = fileChunks;
            try {
                const embeddings = await this.getEmbeddingsBatch(texts);
                
                for (let i = 0; i < fileChunks.length; i++) {
                    chunks.push({
                        file: fileName,
                        path: filePath,
                        preview: fileChunks[i].substring(0, 200),
                        embedding: embeddings[i]
                    });
                }
                
                meta.files[fileName] = {
                    mtime: stats.mtimeMs,
                    chunkCount: fileChunks.length
                };
            } catch (e) {
                console.error(`[SiliconEmbed] 获取向量失败 ${fileName}: ${e.message}`);
            }
        }
        
        this._vectorCache = { chunks, lastUpdate: Date.now() };
        this.saveVectorCache();
        this.saveMeta(meta);
        
        console.log(`[SiliconEmbed] 向量索引构建完成: ${chunks.length} 个块`);
    }

    /**
     * 增量索引 - 只对指定文件进行向量化
     * @param {string|string[]} filePaths - 单个文件路径或文件路径数组
     * @returns {Promise<number>} 新增的块数量
     */
    async incrementalIndex(filePaths) {
        if (!this.isAvailable()) {
            console.log('[SiliconEmbed] 向量搜索未启用，跳过增量索引');
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
            const fileChunks = this.splitIntoChunks(content);

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
            this.saveVectorCache(cache);
            this.saveMeta(meta);
            console.log(`[SiliconEmbed] 增量索引完成: 新增 ${newChunksAdded} 个块，总计 ${cache.chunks.length} 个块`);
        } else {
            console.log('[SiliconEmbed] 没有新增内容，跳过保存');
        }

        return newChunksAdded;
    }

    /**
     * 搜索向量
     * @param {string} query - 查询文本
     * @returns {Promise<Object>} 搜索结果
     */
    async search(query) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: '向量搜索未启用',
                results: []
            };
        }
        
        try {
            // 获取查询向量
            const queryEmbedding = await this.getEmbedding(query);
            
            // 加载向量缓存
            const cache = this.loadVectorCache();
            
            if (!cache.chunks || cache.chunks.length === 0) {
                console.log('[SiliconEmbed] 向量缓存为空，尝试构建索引...');
                await this.buildIndex();
                
                const updatedCache = this.loadVectorCache();
                if (!updatedCache.chunks || updatedCache.chunks.length === 0) {
                    return {
                        success: false,
                        error: '向量索引为空',
                        results: []
                    };
                }
                
                return this.calculateSimilarityAndSort(queryEmbedding, updatedCache.chunks);
            }
            
            return this.calculateSimilarityAndSort(queryEmbedding, cache.chunks);
            
        } catch (error) {
            console.error(`[SiliconEmbed] 搜索失败: ${error.message}`);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }

    /**
     * 计算余弦相似度并排序
     */
    calculateSimilarityAndSort(queryEmbedding, chunks) {
        const results = chunks.map(chunk => {
            const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
            return {
                file: chunk.file,
                preview: chunk.preview,
                similarity: similarity
            };
        });
        
        // 按相似度降序排序
        results.sort((a, b) => b.similarity - a.similarity);
        
        // 取前 N 个结果
        const topResults = results.slice(0, this.maxResults);
        
        return {
            success: true,
            results: topResults
        };
    }

    /**
     * 余弦相似度计算
     */
    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        
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
     * 获取目录下的所有 Markdown 文件
     */
    getMarkdownFiles(dir) {
        if (!fs.existsSync(dir)) return [];
        
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(dir, f));
    }

    /**
     * 将文本分块
     */
    splitIntoChunks(content, maxLength = 1000) {
        const paragraphs = content.split(/\n\n+/);
        const chunks = [];
        let currentChunk = '';
        
        for (const para of paragraphs) {
            if (currentChunk.length + para.length > maxLength) {
                if (currentChunk) chunks.push(currentChunk.trim());
                currentChunk = para;
            } else {
                currentChunk += '\n\n' + para;
            }
        }
        
        if (currentChunk) chunks.push(currentChunk.trim());
        
        return chunks;
    }
}

module.exports = SiliconEmbed;
