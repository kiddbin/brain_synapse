/**
 * @file brain_synapse/stdp-temporal.js
 * @description STDP (脉冲时序依赖可塑性) 时序学习模块
 * @author Brain Synapse Team
 * @version 1.5.0
 * 
 * 基于人脑 STDP 机制：
 * - 突触前神经元在突触后神经元之前放电 → LTP (增强)
 * - 突触前神经元在突触后神经元之后放电 → LTD (抑制)
 * - 时间差越小，权重变化越大
 */

const fs = require('fs');
const path = require('path');

const TEMPORAL_WEIGHTS_FILE = path.join(__dirname, 'temporal_weights.json');

// STDP 参数
const STDP_WINDOW_MS = 5000; // 时间窗口：5秒内出现的词对视为相关
const STDP_MAX_STRENGTH = 1.0; // 最大时序权重
const STDP_DECAY_RATE = 0.98; // 时序权重衰减率

class STDPTrainer {
    constructor() {
        this.temporalWeights = this.loadTemporalWeights();
    }

    loadTemporalWeights() {
        if (fs.existsSync(TEMPORAL_WEIGHTS_FILE)) {
            return JSON.parse(fs.readFileSync(TEMPORAL_WEIGHTS_FILE, 'utf8'));
        }
        return {};
    }

    saveTemporalWeights() {
        fs.writeFileSync(TEMPORAL_WEIGHTS_FILE, JSON.stringify(this.temporalWeights, null, 2), 'utf8');
    }

    /**
     * 从文本中提取带时间戳的关键词
     * @param {string} content - 文本内容
     * @param {number} baseTimestamp - 基础时间戳
     * @returns {Array<{keyword: string, position: number, timestamp: number}>}
     */
    extractTemporalKeywords(content, baseTimestamp = Date.now()) {
        const lines = content.split('\n');
        const keywords = [];
        
        lines.forEach((line, lineIndex) => {
            // 提取中文关键词
            const chineseWords = line.match(/[\u4e00-\u9fa5]{2,}/g) || [];
            // 提取英文关键词
            const englishWords = line.match(/[a-zA-Z]{3,}/g) || [];
            
            [...chineseWords, ...englishWords].forEach(word => {
                keywords.push({
                    keyword: word.toLowerCase(),
                    position: lineIndex,
                    timestamp: baseTimestamp + (lineIndex * 100) // 每行间隔100ms
                });
            });
        });
        
        return keywords;
    }

    /**
     * 应用 STDP 学习规则
     * @param {Array} keywords - 带时间戳的关键词列表
     */
    applySTDP(keywords) {
        let updates = 0;
        
        for (let i = 0; i < keywords.length; i++) {
            for (let j = i + 1; j < keywords.length; j++) {
                const pre = keywords[i];  // 先出现的词（突触前）
                const post = keywords[j]; // 后出现的词（突触后）
                
                if (pre.keyword === post.keyword) continue;
                
                // 计算时间差
                const timeDiff = post.timestamp - pre.timestamp;
                
                // 只在时间窗口内计算
                if (timeDiff > STDP_WINDOW_MS) break;
                
                // STDP 权重计算
                // 先→后 = 正权重（预测关系）
                const strength = STDP_MAX_STRENGTH * Math.exp(-timeDiff / 1000);
                
                // 初始化时序权重结构
                if (!this.temporalWeights[pre.keyword]) {
                    this.temporalWeights[pre.keyword] = {};
                }
                
                // 更新时序权重：pre 预测 post 的概率
                const currentWeight = this.temporalWeights[pre.keyword][post.keyword] || 0;
                this.temporalWeights[pre.keyword][post.keyword] = 
                    Math.min(STDP_MAX_STRENGTH, currentWeight + strength * 0.1);
                
                updates++;
            }
        }
        
        if (updates > 0) {
            console.log(`[STDP] Applied learning: ${updates} temporal connections updated`);
        }
        
        return updates;
    }

    /**
     * 应用时序衰减
     */
    applyTemporalDecay() {
        let decayed = 0;
        
        Object.keys(this.temporalWeights).forEach(source => {
            Object.keys(this.temporalWeights[source]).forEach(target => {
                this.temporalWeights[source][target] *= STDP_DECAY_RATE;
                
                // 删除过弱的连接
                if (this.temporalWeights[source][target] < 0.01) {
                    delete this.temporalWeights[source][target];
                    decayed++;
                }
            });
            
            // 清理空对象
            if (Object.keys(this.temporalWeights[source]).length === 0) {
                delete this.temporalWeights[source];
            }
        });
        
        if (decayed > 0) {
            console.log(`[STDP] Decayed ${decayed} weak temporal connections`);
        }
    }

    /**
     * 获取时序预测
     * @param {string} keyword - 当前关键词
     * @param {number} topN - 返回前N个预测
     * @returns {Array<{keyword: string, probability: number}>}
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
            if (next.probability < 0.3) break; // 阈值过滤
            
            chain.push(next.keyword);
            current = next.keyword;
        }
        
        return chain;
    }

    /**
     * 处理文件内容，提取时序关系
     * @param {string} content - 文件内容
     * @returns {number} 更新的连接数
     */
    processContent(content) {
        const keywords = this.extractTemporalKeywords(content);
        const updates = this.applySTDP(keywords);
        this.saveTemporalWeights();
        return updates;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const sources = Object.keys(this.temporalWeights).length;
        let connections = 0;
        
        Object.values(this.temporalWeights).forEach(targets => {
            connections += Object.keys(targets).length;
        });
        
        return {
            sourceNodes: sources,
            totalConnections: connections,
            averageConnectionsPerNode: sources > 0 ? (connections / sources).toFixed(2) : 0
        };
    }
}

module.exports = STDPTrainer;
