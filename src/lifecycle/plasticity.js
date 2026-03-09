/**
 * @file brain_synapse/src/lifecycle/plasticity.js
 * @description 突触可塑性模块 - 整合 STDP + LTD/LTP
 * @version 2.0.0
 * 
 * 基于生物学原理：
 * - STDP (Spike-Timing-Dependent Plasticity)
 * - LTP (Long-Term Potentiation) - 增强
 * - LTD (Long-Term Depression) - 抑制
 */

class SynapticPlasticity {
    /**
     * 创建可塑性管理器
     * @param {SynapseBackend} backend - 存储后端
     */
    constructor(backend) {
        this.backend = backend;
        this.temporalWeights = {}; // 时序权重
        this.stdpWindowMs = 5000;  // STDP 时间窗口
        this.stdPMaxStrength = 1.0;
        this.decayRate = 0.98;
    }

    /**
     * 从文本中提取带时间戳的关键词
     * @param {string} content - 文本内容
     * @param {number} baseTimestamp - 基础时间戳
     * @returns {Array<Object>}
     */
    extractTemporalKeywords(content, baseTimestamp = Date.now()) {
        const lines = content.split('\n');
        const keywords = [];
        
        lines.forEach((line, lineIndex) => {
            const chineseWords = line.match(/[\u4e00-\u9fa5]{2,}/g) || [];
            const englishWords = line.match(/[a-zA-Z]{3,}/g) || [];
            
            [...chineseWords, ...englishWords].forEach(word => {
                keywords.push({
                    keyword: word.toLowerCase(),
                    position: lineIndex,
                    timestamp: baseTimestamp + (lineIndex * 100)
                });
            });
        });
        
        return keywords;
    }

    /**
     * 应用 STDP 学习规则
     * @param {Array<Object>} keywords - 带时间戳的关键词
     * @returns {number} 更新的连接数
     */
    applySTDP(keywords) {
        let updates = 0;
        
        for (let i = 0; i < keywords.length; i++) {
            for (let j = i + 1; j < keywords.length; j++) {
                const pre = keywords[i];
                const post = keywords[j];
                
                if (pre.keyword === post.keyword) continue;
                
                const timeDiff = post.timestamp - pre.timestamp;
                
                if (timeDiff > this.stdpWindowMs) break;
                
                // STDP 权重计算：先→后 = 正权重（预测关系）
                const strength = this.stdPMaxStrength * Math.exp(-timeDiff / 1000);
                
                if (!this.temporalWeights[pre.keyword]) {
                    this.temporalWeights[pre.keyword] = {};
                }
                
                const currentWeight = this.temporalWeights[pre.keyword][post.keyword] || 0;
                this.temporalWeights[pre.keyword][post.keyword] = 
                    Math.min(this.stdPMaxStrength, currentWeight + strength * 0.1);
                
                updates++;
            }
        }
        
        if (updates > 0) {
            console.log(`[Plasticity] STDP: ${updates} temporal connections updated`);
        }
        
        return updates;
    }

    /**
     * 应用时序衰减
     * @returns {number} 衰减的连接数
     */
    applyTemporalDecay() {
        let decayed = 0;
        
        Object.keys(this.temporalWeights).forEach(source => {
            Object.keys(this.temporalWeights[source]).forEach(target => {
                this.temporalWeights[source][target] *= this.decayRate;
                
                if (this.temporalWeights[source][target] < 0.01) {
                    delete this.temporalWeights[source][target];
                    decayed++;
                }
            });
            
            if (Object.keys(this.temporalWeights[source]).length === 0) {
                delete this.temporalWeights[source];
            }
        });
        
        if (decayed > 0) {
            console.log(`[Plasticity] Decayed ${decayed} weak temporal connections`);
        }
        
        return decayed;
    }

    /**
     * 获取时序预测
     * @param {string} keyword - 关键词
     * @param {number} topN - 返回前 N 个
     * @returns {Array<Object>}
     */
    getTemporalPredictions(keyword, topN = 3) {
        const predictions = this.temporalWeights[keyword.toLowerCase()];
        if (!predictions) return [];
        
        return Object.entries(predictions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([kw, weight]) => ({
                keyword: kw,
                probability: weight
            }));
    }

    /**
     * 检测因果链条
     * @param {string} startKeyword - 起始关键词
     * @param {number} maxDepth - 最大深度
     * @returns {Array<string>} 因果链
     */
    detectCausalChain(startKeyword, maxDepth = 3) {
        const chain = [startKeyword];
        let current = startKeyword.toLowerCase();
        
        for (let i = 0; i < maxDepth; i++) {
            const predictions = this.getTemporalPredictions(current, 1);
            if (predictions.length === 0) break;
            
            const next = predictions[0];
            if (next.probability < 0.3) break;
            
            chain.push(next.keyword);
            current = next.keyword;
        }
        
        return chain;
    }

    /**
     * LTP - 长时程增强（访问后增强）
     * @param {string} memoryId - 记忆 ID
     * @param {number} delta - 增强量
     */
    async applyLTP(memoryId, delta = 0.1) {
        const memory = await this.backend.get(memoryId);
        if (!memory) return;
        
        memory.weight = Math.min((memory.weight || 1.0) + delta, 10.0);
        memory.recency = 1.0; // 重置近因性
        memory.access_count = (memory.access_count || 0) + 1;
        
        await this.backend.update(memory);
        console.log(`[Plasticity] LTP applied to ${memoryId}: weight=${memory.weight}`);
    }

    /**
     * LTD - 长时程抑制（时间衰减）
     * @param {number} inactiveDays - 不活跃天数阈值
     * @returns {number} 抑制的记忆数
     */
    async applyLTD(inactiveDays = 30) {
        const memories = await this.backend.getAll();
        const now = Date.now();
        const threshold = inactiveDays * 24 * 60 * 60 * 1000;
        
        let suppressed = 0;
        
        for (const memory of memories) {
            const lastAccess = memory.updated_at || memory.created_at || 0;
            const daysInactive = (now - lastAccess) / (1000 * 60 * 60 * 24);
            
            if (daysInactive > inactiveDays) {
                // 衰减权重
                memory.weight = (memory.weight || 1.0) * 0.95;
                memory.recency = (memory.recency || 1.0) * 0.9;
                
                if (memory.weight < 0.1 && !memory.pinned) {
                    // 可以移入冷库
                    console.log(`[Plasticity] LTD: ${memory.id} candidate for latent storage`);
                }
                
                suppressed++;
            }
        }
        
        if (suppressed > 0) {
            console.log(`[Plasticity] LTD applied to ${suppressed} memories`);
        }
        
        return suppressed;
    }

    /**
     * 处理文件内容
     * @param {string} content - 文件内容
     * @returns {number} 更新的连接数
     */
    processContent(content) {
        const keywords = this.extractTemporalKeywords(content);
        const updates = this.applySTDP(keywords);
        return updates;
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        const sources = Object.keys(this.temporalWeights).length;
        let connections = 0;
        
        Object.values(this.temporalWeights).forEach(targets => {
            connections += Object.keys(targets).length;
        });
        
        return {
            temporalSources: sources,
            temporalConnections: connections,
            avgConnectionsPerSource: sources > 0 ? (connections / sources).toFixed(2) : 0
        };
    }
}

module.exports = SynapticPlasticity;
