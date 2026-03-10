/**
 * @file brain_synapse/src/retrieval/track_a_intuitive.js
 * @description Track A: 直觉检索引擎 - 快速稀疏召回 + Semantic Fallback + hitType 标记
 * @version 2.3.0
 * 
 * 基于生物学原理：
 * - 稀疏编码：仅激活高权重概念
 * - 赫布扩散：沿突触连接传播激活
 * - 使用 IndexManager 实现 O(1) 查找
 * - Semantic Fallback: 低置信查询触发语义扩展
 * - hitType 标记: exact/entity/file/anchor/spread/semantic
 * 
 * 性能特征：
 * - 锚定: O(T) where T = number of query tokens
 * - 扩散: O(E) where E = number of edges in subgraph
 */

const SemanticFallback = require('./semantic_fallback');
const { expandQuery, getSynonyms } = require('./synonyms');

class TrackAIntuitive {
    /**
     * 创建直觉检索引擎
     * @param {SynapseBackend} backend - 存储后端
     */
    constructor(backend) {
        this.backend = backend;
        this.hebbianWeights = {};
        this.semanticFallback = new SemanticFallback();
        this._semanticInitialized = false;
    }

    /**
     * 初始化 Semantic Fallback
     * @private
     */
    async _ensureSemanticInitialized() {
        if (this._semanticInitialized) return;
        await this.semanticFallback.initialize();
        this._semanticInitialized = true;
    }

    /**
     * 从记忆中提取文本内容
     * @private
     * @param {Object} memory - 记忆对象
     * @returns {string}
     */
    _getTextContent(memory) {
        const texts = [];
        if (memory.content) {
            if (typeof memory.content === 'object') {
                texts.push(...Object.values(memory.content).filter(v => typeof v === 'string'));
            } else if (typeof memory.content === 'string') {
                texts.push(memory.content);
            }
        }
        if (memory.provenance && memory.provenance.file_reference) {
            texts.push(memory.provenance.file_reference);
        }
        texts.push(memory.id);
        if (memory.linked_entities) {
            texts.push(...memory.linked_entities);
        }
        return texts.join(' ');
    }

    /**
     * 提取查询 Token（支持英文词干提取 + 中文二元组）
     * @private
     * @param {string} text - 文本
     * @returns {Array<string>}
     */
    _extractTokens(text) {
        const textLower = text.toLowerCase();
        
        // 英文：提取单词 + 词干归一化（Layer 1: 词法归一化）
        const englishWords = textLower.match(/[a-z0-9]+/g) || [];
        let stemmedWords = [];
        try {
            const stemmer = require('stemmer');
            stemmedWords = englishWords.map(w => stemmer(w));
        } catch (e) {
            // stemmer 未安装时降级处理
            stemmedWords = englishWords;
        }
        
        // 中文：保持原有逻辑（汉字 + 二元组）
        const hanzi = textLower.match(/[\u4e00-\u9fa5]/g) || [];
        const bigrams = [];
        for (let i = 0; i < hanzi.length - 1; i++) {
            bigrams.push(hanzi[i] + hanzi[i+1]);
        }
        
        // 合并：原词 + 词干（提高召回率）
        return [...new Set([...englishWords, ...stemmedWords, ...hanzi, ...bigrams])];
    }

    /**
     * 锚定检索 - 使用 IndexManager O(T) 查找 + 同义词扩展（Layer 2）
     * @param {string} query - 查询
     * @returns {Array<string>} 锚定概念列表
     */
    anchorConcepts(query) {
        const anchorStart = Date.now();
        const queryTokens = this._extractTokens(query);
        const queryLower = query.toLowerCase();
        
        // Layer 2: 同义词扩展
        const expandedTokens = expandQuery(queryTokens);
        
        const anchorSet = new Set();
        const indexManager = this.backend.indexManager;
        
        if (!indexManager || !indexManager._isBuilt) {
            const fallbackResult = this._anchorConceptsFallback(query);
            this.lastAnchorMs = Date.now() - anchorStart;
            console.log(`[TrackA] ⚠️  IndexManager not built, using fallback scan in ${this.lastAnchorMs}ms`);
            return fallbackResult;
        }
        
        // 原始 Token 匹配
        for (const token of queryTokens) {
            const matchedIds = indexManager.getMemoriesByToken(token);
            matchedIds.forEach(id => anchorSet.add(id));
        }
        
        // 同义词扩展匹配（权重衰减，在排序时处理）
        const synonymTokens = expandedTokens.filter(t => !queryTokens.includes(t));
        for (const token of synonymTokens) {
            const matchedIds = indexManager.getMemoriesByToken(token);
            matchedIds.forEach(id => anchorSet.add(id));
        }
        
        const fullQueryMatches = indexManager.getMemoriesByToken(queryLower);
        fullQueryMatches.forEach(id => anchorSet.add(id));
        
        this.lastAnchorMs = Date.now() - anchorStart;
        console.log(`[TrackA] ✓ Anchor retrieval: ${anchorSet.size} concepts (with synonyms) in ${this.lastAnchorMs}ms`);
        return Array.from(anchorSet);
    }

    /**
     * 锚定检索 - Fallback（无索引时使用）
     * @private
     * @param {string} query - 查询
     * @returns {Array<string>}
     */
    _anchorConceptsFallback(query) {
        const queryTokens = this._extractTokens(query);
        const queryLower = query.toLowerCase();
        const memories = this.backend.data.memories;
        
        const anchors = [];
        
        Object.keys(memories).forEach(id => {
            const memory = memories[id];
            const memoryText = this._getTextContent(memory).toLowerCase();
            
            if (memoryText.includes(queryLower) || queryLower.includes(memoryText)) {
                anchors.push(id);
                return;
            }
            
            let matchCount = 0;
            for (const token of queryTokens) {
                if (memoryText.includes(token)) {
                    matchCount++;
                }
            }
            
            if (queryTokens.length > 0 && (matchCount / queryTokens.length) >= 0.5) {
                anchors.push(id);
            }
        });
        
        return anchors;
    }

    /**
     * 赫布扩散激活 - 使用 IndexManager 邻接表 O(E)
     * @param {Array<string>} anchorIds - 锚点 ID 列表
     * @param {number} maxDepth - 最大扩散深度
     * @param {Object} options - 扩散选项
     * @returns {Set<string>} 激活的概念集合
     */
    hebbianSpread(anchorIds, maxDepth = 1, options = {}) {
        const hebbianStart = Date.now();
        const {
            minAnchors = 2,
            maxSpreadRatio = 3.0,
            minWeightThreshold = 0.3
        } = options;
        
        const activated = new Set(anchorIds);
        const frontier = new Set(anchorIds);
        
        const indexManager = this.backend.indexManager;
        
        if (!indexManager || !indexManager._isBuilt) {
            const fallbackResult = this._hebbianSpreadFallback(anchorIds, maxDepth, options);
            this.lastHebbianMs = Date.now() - hebbianStart;
            console.log(`[TrackA] ⚠️  IndexManager not built, Hebbian fallback in ${this.lastHebbianMs}ms`);
            return fallbackResult;
        }
        
        if (anchorIds.length < minAnchors) {
            console.log(`[TrackA] Abstention: only ${anchorIds.length} anchors (min: ${minAnchors})`);
            this.lastHebbianMs = Date.now() - hebbianStart;
            return activated;
        }
        
        const maxActivated = Math.floor(anchorIds.length * maxSpreadRatio);
        
        for (let depth = 0; depth < maxDepth && frontier.size > 0; depth++) {
            const nextFrontier = new Set();
            
            frontier.forEach(id => {
                if (activated.size >= maxActivated) {
                    return;
                }
                
                const edges = indexManager.getGraphEdges(id);
                
                edges.forEach(targetId => {
                    if (!activated.has(targetId) && activated.size < maxActivated) {
                        const memory = this.backend.data.memories[targetId];
                        if (memory && (memory.weight || 1.0) >= minWeightThreshold) {
                            activated.add(targetId);
                            nextFrontier.add(targetId);
                        }
                    }
                });
            });
            
            frontier.clear();
            nextFrontier.forEach(id => frontier.add(id));
        }
        
        this.lastHebbianMs = Date.now() - hebbianStart;
        console.log(`[TrackA] ✓ Hebbian spread: ${activated.size} activated in ${this.lastHebbianMs}ms`);
        return activated;
    }

    /**
     * 赫布扩散 - Fallback（无索引时使用）
     * @private
     */
    _hebbianSpreadFallback(anchorIds, maxDepth, options = {}) {
        const {
            minAnchors = 2,
            maxSpreadRatio = 3.0
        } = options;
        
        const activated = new Set(anchorIds);
        const frontier = new Set(anchorIds);
        
        if (anchorIds.length < minAnchors) {
            return activated;
        }
        
        const maxActivated = Math.floor(anchorIds.length * maxSpreadRatio);
        
        for (let depth = 0; depth < maxDepth && frontier.size > 0; depth++) {
            const nextFrontier = new Set();
            
            if (activated.size >= maxActivated) break;
            
            frontier.forEach(id => {
                const memory = this.backend.data.memories[id];
                if (!memory) return;
                
                const keyword = memory.content.keyword || id;
                const connections = this.hebbianWeights[keyword] || {};
                
                Object.entries(connections).forEach(([entity, weight]) => {
                    if (weight > 0.3 && activated.size < maxActivated) {
                        Object.keys(this.backend.data.memories).forEach(otherId => {
                            const otherMemory = this.backend.data.memories[otherId];
                            const otherKeyword = (otherMemory.content && otherMemory.content.keyword) ? otherMemory.content.keyword : otherId;
                            
                            const isTarget = otherKeyword === entity || 
                                             (otherMemory.linked_entities && otherMemory.linked_entities.includes(entity));
                                             
                            if (isTarget && !activated.has(otherId)) {
                                activated.add(otherId);
                                nextFrontier.add(otherId);
                            }
                        });
                    }
                });
            });
            
            frontier.clear();
            nextFrontier.forEach(id => frontier.add(id));
        }
        
        return activated;
    }

    /**
     * 执行直觉检索
     * @param {string} query - 查询
     * @param {Object} options - 选项
     * @returns {Promise<Array<Object>>} 检索结果
     */
    async recall(query, options = {}) {
        const {
            topK = 20,
            spreadDepth = 1,
            minWeight = 0.3,
            enableSemanticFallback = true,
            minAnchors = 2,
            maxSpreadRatio = 3.0,
            abstentionThreshold = 0.1
        } = options;
        
        console.log(`[TrackA] Intuitive recall: "${query}"`);
        
        const anchors = this.anchorConcepts(query);
        console.log(`[TrackA] Found ${anchors.length} anchor concepts`);
        
        const anchorSet = new Set(anchors);
        
        const activated = this.hebbianSpread(anchors, spreadDepth, {
            minAnchors,
            maxSpreadRatio,
            minWeightThreshold: minWeight
        });
        console.log(`[TrackA] Activated ${activated.size} concepts via Hebbian spread`);
        
        let results = Array.from(activated)
            .map(id => {
                const memory = this.backend.data.memories[id];
                if (!memory) return null;
                
                let activationScore = this._calculateActivationScore(memory, query);
                
                if (activationScore < minWeight) {
                    return null;
                }
                
                const hitType = this._determineHitType(memory, query, anchorSet.has(id));
                
                return {
                    memory,
                    score: activationScore,
                    source: 'track_a_intuitive',
                    hitType
                };
            })
            .filter(r => r !== null)
            .sort((a, b) => b.score - a.score);
        
        if (enableSemanticFallback) {
            await this._ensureSemanticInitialized();
            
            const fallbackCheck = this.semanticFallback.shouldTriggerFallback(query, results, {
                anchorCount: anchors.length
            });
            
            if (fallbackCheck.shouldFallback) {
                console.log(`[TrackA] Triggering Semantic Fallback: ${fallbackCheck.reason}`);
                
                const semanticResults = await this.semanticFallback.search(query);
                
                if (semanticResults.length > 0) {
                    results = this.semanticFallback.mergeResults(results, semanticResults);
                    console.log(`[TrackA] Merged ${semanticResults.length} semantic results, total: ${results.length}`);
                }
            } else {
                console.log(`[TrackA] Semantic Fallback skipped: ${fallbackCheck.reason}`);
            }
        }
        
        const avgScore = results.length > 0 
            ? results.reduce((sum, r) => sum + r.score, 0) / results.length 
            : 0;
        
        if (results.length > 0 && avgScore < abstentionThreshold) {
            console.log(`[TrackA] Low confidence abstention: avgScore=${avgScore.toFixed(2)} < ${abstentionThreshold}`);
            results = [];
        }
        
        results = results.slice(0, topK);
        
        console.log(`[TrackA] Returning ${results.length} results`);
        return results;
    }

    /**
     * 计算激活分数（支持同义词权重衰减）
     * @private
     * @param {Object} memory - 记忆
     * @param {string} query - 查询
     * @returns {number} 激活分数
     */
    _calculateActivationScore(memory, query) {
        const memoryText = this._getTextContent(memory).toLowerCase();
        const queryLower = query.toLowerCase();
        const queryTokens = this._extractTokens(query);
        const expandedTokens = expandQuery(queryTokens);
        
        // 识别哪些是同义词（需要权重衰减）
        const synonymTokens = expandedTokens.filter(t => !queryTokens.includes(t));
        
        let score = 0;
        if (memoryText.includes(queryLower)) {
            score = 1.0;
        } else {
            let originalMatchCount = 0;
            let synonymMatchCount = 0;
            
            for (const token of queryTokens) {
                if (memoryText.includes(token)) originalMatchCount++;
            }
            
            // 同义词匹配（权重衰减）
            for (const token of synonymTokens) {
                if (memoryText.includes(token)) synonymMatchCount++;
            }
            
            // 原始词匹配权重 1.0，同义词匹配权重 0.7
            const originalScore = queryTokens.length > 0 
                ? (originalMatchCount / queryTokens.length) * 0.8 
                : 0;
            const synonymScore = synonymTokens.length > 0 
                ? (synonymMatchCount / synonymTokens.length) * 0.8 * 0.7 
                : 0;
            
            score = originalScore + synonymScore;
            
            if (score === 0 && (originalMatchCount > 0 || synonymMatchCount > 0)) {
                score = 0.3;
            }
        }
        
        score *= (memory.weight || 1.0);
        score *= (memory.recency || 1.0);
        score *= (memory.salience || 0.5);
        
        return score;
    }

    /**
     * 判断命中类型
     * @private
     * @param {Object} memory - 记忆
     * @param {string} query - 查询
     * @param {boolean} isAnchor - 是否为锚点命中
     * @returns {string} hitType: 'exact' | 'entity' | 'file' | 'spread' | 'semantic'
     */
    _determineHitType(memory, query, isAnchor) {
        const queryLower = query.toLowerCase();
        const queryTokens = this._extractTokens(query);
        const memoryText = this._getTextContent(memory).toLowerCase();
        
        if (isAnchor) {
            if (memoryText.includes(queryLower) || queryLower.includes(memoryText)) {
                return 'exact';
            }
            
            const keyword = (memory.content && memory.content.keyword) ? 
                            memory.content.keyword.toLowerCase() : null;
            if (keyword) {
                if (queryLower === keyword || queryLower.includes(keyword) && keyword.length >= 2) {
                    return 'exact';
                }
                const mainQueryToken = queryTokens.find(t => t.length >= 2);
                if (mainQueryToken && keyword === mainQueryToken) {
                    return 'exact';
                }
            }
            
            if (memory.provenance && memory.provenance.file_reference) {
                const fileRef = memory.provenance.file_reference.toLowerCase();
                const fileName = fileRef.split('/').pop().split(':')[0];
                if (queryLower.includes(fileName) || fileName.includes(queryLower)) {
                    return 'file';
                }
                for (const token of queryTokens) {
                    if (token.length >= 3 && fileRef.includes(token)) {
                        return 'file';
                    }
                }
            }
            
            if (memory.linked_entities && memory.linked_entities.length > 0) {
                for (const entity of memory.linked_entities) {
                    const entityLower = entity.toLowerCase();
                    if (queryLower.includes(entityLower) && entityLower.length >= 3) {
                        return 'entity';
                    }
                }
            }
            
            return 'anchor';
        }
        
        return 'spread';
    }

    /**
     * 初始化赫布权重（用于兼容旧逻辑）
     * @param {Array<Object>} memories - 记忆列表
     */
    initializeHebbianWeights(memories) {
        this.hebbianWeights = {};
        
        memories.forEach(memory => {
            const entities = memory.linked_entities || [];
            const keyword = memory.content.keyword || memory.id;
            
            if (!this.hebbianWeights[keyword]) {
                this.hebbianWeights[keyword] = {};
            }
            
            entities.forEach(entity => {
                if (!this.hebbianWeights[keyword][entity]) {
                    this.hebbianWeights[keyword][entity] = 0.1;
                }
                this.hebbianWeights[keyword][entity] += 0.01;
            });
        });
    }

    /**
     * 更新赫布权重（学习）
     * @param {string} conceptA - 概念 A
     * @param {string} conceptB - 概念 B
     * @param {number} delta - 权重变化
     */
    updateHebbianWeight(conceptA, conceptB, delta = 0.01) {
        if (!this.hebbianWeights[conceptA]) {
            this.hebbianWeights[conceptA] = {};
        }
        
        if (!this.hebbianWeights[conceptA][conceptB]) {
            this.hebbianWeights[conceptA][conceptB] = 0;
        }
        
        this.hebbianWeights[conceptA][conceptB] += delta;
        this.hebbianWeights[conceptA][conceptB] = Math.min(
            this.hebbianWeights[conceptA][conceptB],
            1.0
        );
    }

    /**
     * 获取 Semantic Fallback 状态
     * @returns {Object}
     */
    getSemanticFallbackStatus() {
        return this.semanticFallback.getStatus();
    }
}

module.exports = TrackAIntuitive;
