/**
 * @file brain_synapse/src/retrieval/semantic_fallback.js
 * @description Semantic Fallback 模块 - 为 Track A 提供语义检索能力
 * @version 2.2.0
 * 
 * 设计原则：
 * 1. lexical/entity/topology recall 先跑
 * 2. 只有低置信 query 才触发 semantic fallback
 * 3. file/path/line/identifier 类型 query 禁止语义放水
 * 4. semantic result 只能作为候选扩展，不能直接决定 final result
 * 5. Track B 保持 hard validation 边界
 * 6. semantic 结果标记 hitType='semantic'，便于排序区分
 */

const path = require('path');

// 尝试加载 SiliconEmbed
let SiliconEmbed = null;
try {
    SiliconEmbed = require('../../silicon-embed');
} catch (e) {
    console.warn('[SemanticFallback] SiliconEmbed not available:', e.message);
}

class SemanticFallback {
    /**
     * 创建 Semantic Fallback 实例
     * @param {Object} options - 配置选项
     */
    constructor(options = {}) {
        this.options = {
            // 低置信度阈值
            minResultCount: options.minResultCount || 3,
            minTopScore: options.minTopScore || 0.5,
            
            // 语义结果降权因子
            semanticScoreFactor: options.semanticScoreFactor || 0.2,
            
            // 最大语义结果数
            maxSemanticResults: options.maxSemanticResults || 5,
            
            // 是否启用
            enabled: options.enabled !== false
        };
        
        this.embedder = null;
        this._initialized = false;
    }

    /**
     * 初始化语义嵌入器
     * @returns {Promise<boolean>}
     */
    async initialize() {
        if (this._initialized) return this.embedder !== null;
        
        if (!SiliconEmbed) {
            console.log('[SemanticFallback] SiliconEmbed module not available');
            this._initialized = true;
            return false;
        }
        
        try {
            this.embedder = new SiliconEmbed();
            
            if (!this.embedder.isConfigured()) {
                console.log('[SemanticFallback] SiliconEmbed not configured');
                this.embedder = null;
                this._initialized = true;
                return false;
            }
            
            // 检查向量缓存状态
            const status = this.embedder.getCacheStatus();
            if (status.chunks === 0) {
                console.log('[SemanticFallback] Vector cache is empty, semantic search disabled');
                this.embedder = null;
                this._initialized = true;
                return false;
            }
            
            console.log(`[SemanticFallback] Initialized with ${status.chunks} chunks in cache`);
            this._initialized = true;
            return true;
            
        } catch (e) {
            console.error('[SemanticFallback] Initialization failed:', e.message);
            this.embedder = null;
            this._initialized = true;
            return false;
        }
    }

    /**
     * 检测是否应该触发 Semantic Fallback
     * @param {string} query - 查询
     * @param {Array<Object>} lexicalResults - 字面匹配结果
     * @param {Object} context - 上下文信息
     * @returns {{shouldFallback: boolean, reason: string}}
     */
    shouldTriggerFallback(query, lexicalResults, context = {}) {
        // P2: 默认关闭高成本 Semantic Fallback（除非 deep 模式）
        const disableFallback = process.env.BRAIN_SYNAPSE_DISABLE_SEMANTIC_FALLBACK === '1' || context.disableSemanticFallback === true;
        
        if (disableFallback) {
            return { shouldFallback: false, reason: 'semantic_fallback_disabled' };
        }
        
        if (!this.options.enabled) {
            return { shouldFallback: false, reason: 'disabled' };
        }
        
        if (this.isNoiseQuery(query)) {
            return { shouldFallback: false, reason: 'noise_query' };
        }
        
        if (this.isFilePathQuery(query)) {
            return { shouldFallback: false, reason: 'file_path_query' };
        }
        
        const anchorCount = context.anchorCount || 0;
        if (anchorCount === 0) {
            return { shouldFallback: false, reason: 'no_anchors_abstention' };
        }
        
        const resultCount = lexicalResults.length;
        const topScore = resultCount > 0 ? lexicalResults[0].score : 0;
        
        const SUFFICIENT_RESULTS = 10;
        const SUFFICIENT_SCORE = 0.3;
        
        if (resultCount >= SUFFICIENT_RESULTS && topScore >= SUFFICIENT_SCORE) {
            return { shouldFallback: false, reason: 'sufficient_results_count' };
        }
        
        if (resultCount >= this.options.minResultCount && topScore >= this.options.minTopScore) {
            return { shouldFallback: false, reason: 'sufficient_lexical_results' };
        }
        
        if (!this.embedder) {
            return { shouldFallback: false, reason: 'embedder_not_available' };
        }
        
        return { 
            shouldFallback: true, 
            reason: `low_confidence(results=${resultCount}, topScore=${topScore.toFixed(2)})` 
        };
    }

    /**
     * 检测是否是噪音查询
     * @param {string} query - 查询
     * @returns {boolean}
     */
    isNoiseQuery(query) {
        const trimmed = query.trim();
        
        const noisePatterns = [
            /^[a-z0-9]{10,}$/i,
            /^[a-z]+[0-9]+[a-z]+[0-9]+[a-z]*$/i,
            /^(xyz|abc|foo|bar|baz|qux)[0-9]*[a-z]*$/i,
            /^[0-9a-f]{12,}$/i,
            /^(qwerty|asdfgh|zxcvbn)[0-9]*$/i
        ];
        
        for (const pattern of noisePatterns) {
            if (pattern.test(trimmed)) {
                if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(trimmed)) {
                    return false;
                }
                return true;
            }
        }
        
        const lowerQuery = trimmed.toLowerCase();
        const noiseKeywords = ['不存在', '无结果', 'null', 'undefined', 'none', 'empty', '找不到', '没有'];
        for (const keyword of noiseKeywords) {
            if (lowerQuery.includes(keyword)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 检测是否是 file/path/line/identifier 类型查询
     * @param {string} query - 查询
     * @returns {boolean}
     */
    isFilePathQuery(query) {
        // 文件扩展名模式
        if (/\.[a-z]{1,4}$/i.test(query)) return true;
        
        // 路径分隔符
        if (/[\/\\]/.test(query)) return true;
        
        // 行号模式
        if (/[:\s]L?\d+$/i.test(query)) return true;
        if (/line\s*\d+/i.test(query)) return true;
        
        // 完整文件路径模式
        if (/^[a-zA-Z]:\\|^\/|^~\//.test(query)) return true;
        
        // 代码标识符模式（驼峰命名）
        if (/^[a-z]+[A-Z][a-zA-Z]*$/.test(query)) return true;
        if (/^[A-Z][a-zA-Z]+$/.test(query)) return true;
        
        // 函数/方法调用模式
        if (/\w+\(\)/.test(query)) return true;
        if (/\w+\.\w+/.test(query)) return true;
        
        return false;
    }

    /**
     * 执行语义搜索
     * @param {string} query - 查询
     * @returns {Promise<Array<Object>>}
     */
    async search(query) {
        if (!this.embedder) {
            return [];
        }
        
        try {
            const result = await this.embedder.search(query);
            
            if (!result.success) {
                console.warn('[SemanticFallback] Search failed:', result.error);
                return [];
            }
            
            // 转换为 Track A 兼容格式
            const semanticResults = result.results.map((r, index) => ({
                memory: {
                    id: `semantic_${r.file}_${index}`,
                    memory_type: 'semantic_result',
                    content: {
                        keyword: r.file,
                        rule: r.preview,
                        source: 'silicon_embed'
                    },
                    provenance: {
                        file_reference: r.path,
                        source_type: 'semantic_search'
                    }
                },
                score: (r.finalScore || r.similarity) * this.options.semanticScoreFactor,
                source: 'semantic_fallback',
                hitType: 'semantic',
                trace: {
                    similarity: r.similarity,
                    lexicalBonus: r.lexicalBonus,
                    originalFile: r.file
                }
            }));
            
            console.log(`[SemanticFallback] Found ${semanticResults.length} semantic results for "${query}"`);
            return semanticResults.slice(0, this.options.maxSemanticResults);
            
        } catch (e) {
            console.error('[SemanticFallback] Search error:', e.message);
            return [];
        }
    }

    /**
     * 合并字面匹配结果和语义结果
     * @param {Array<Object>} lexicalResults - 字面匹配结果
     * @param {Array<Object>} semanticResults - 语义结果
     * @returns {Array<Object>}
     */
    mergeResults(lexicalResults, semanticResults) {
        if (semanticResults.length === 0) {
            return lexicalResults;
        }
        
        const existingIds = new Set(lexicalResults.map(r => r.memory.id));
        
        const uniqueSemantic = semanticResults.filter(r => !existingIds.has(r.memory.id));
        
        const merged = [...lexicalResults, ...uniqueSemantic];
        merged.sort((a, b) => b.score - a.score);
        
        return merged;
    }

    /**
     * 获取状态信息
     * @returns {Object}
     */
    getStatus() {
        return {
            initialized: this._initialized,
            available: this.embedder !== null,
            enabled: this.options.enabled,
            config: this.options
        };
    }
}

module.exports = SemanticFallback;
