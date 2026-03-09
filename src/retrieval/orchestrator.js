/**
 * @file brain_synapse/src/retrieval/orchestrator.js
 * @description 双轨检索编排器 - Layer 3 核心
 * @version 2.0.0
 * 
 * 编排策略：
 * 1. 并行/串行执行 Track A 和 Track B
 * 2. 结果融合（Reciprocal Rank Fusion）
 * 3. 生成 trace_log（可解释性）
 */

const TrackAIntuitive = require('./track_a_intuitive');
const TrackBDeliberative = require('./track_b_deliberative');

class RecallOrchestrator {
    /**
     * 创建编排器
     * @param {SynapseBackend} backend - 存储后端
     */
    constructor(backend) {
        this.backend = backend;
        this.trackA = new TrackAIntuitive(backend);
        this.trackB = new TrackBDeliberative(backend);
        this.traceLog = [];
    }

    /**
     * 执行检索（主接口）
     * @param {string} query - 查询
     * @param {Object} context - 上下文
     * @returns {Promise<RecallResult>} 检索结果
     */
    async recall(query, context = {}) {
        const startTime = Date.now();
        this.traceLog = [];
        
        this._log('info', `Recall started: "${query}"`, { context });
        
        const {
            mode = 'serial', // 'parallel' | 'serial' - 默认使用串行模式（Track A → Track B）
            topK = 10,
            trackAOptions = {},
            trackBOptions = {},
            enableTrackA = true,
            enableTrackB = true,
            perfLog = null
        } = context;
        
        let trackAResults = [];
        let trackBResults = [];
        
        // 执行策略
        if (mode === 'parallel') {
            [trackAResults, trackBResults] = await Promise.all([
                enableTrackA ? this.trackA.recall(query, trackAOptions) : [],
                enableTrackB ? this.trackB.validate([], trackBOptions) : []
            ]);
        } else { // serial
            // 先执行 Track A
            if (enableTrackA) {
                const trackAStart = Date.now();
                trackAResults = await this.trackA.recall(query, trackAOptions);
                const trackAMs = Date.now() - trackAStart;
                
                if (perfLog) {
                    perfLog.track_a_ms = trackAMs;
                    perfLog.anchor_ms = this.trackA.lastAnchorMs || 0;
                    perfLog.hebbian_ms = this.trackA.lastHebbianMs || 0;
                }
                
                this._log('info', `Track A returned ${trackAResults.length} candidates in ${trackAMs}ms`);
            }
            
            // 传递给 Track B 验证
            if (enableTrackB) {
                const trackBStart = Date.now();
                trackBResults = await this.trackB.validate(trackAResults, trackBOptions);
                const trackBMs = Date.now() - trackBStart;
                
                if (perfLog) {
                    perfLog.track_b_ms = trackBMs;
                }
                
                this._log('info', `Track B validated to ${trackBResults.length} results in ${trackBMs}ms`);
            }
        }
        
        // 结果融合
        let finalResults;
        if (mode === 'serial' && enableTrackB) {
            finalResults = trackBResults;
        } else {
            finalResults = this._reciprocalRankFusion(trackAResults, trackBResults);
        }
        
        // 截取 topK
        finalResults = finalResults.slice(0, topK);
        
        // 生成结果
        const result = new RecallResult({
            results: finalResults,
            query,
            traceLog: [...this.traceLog],
            latency: Date.now() - startTime,
            trackACount: trackAResults.length,
            trackBCount: trackBResults.length
        });
        
        this._log('info', `Recall completed in ${result.latency}ms`, {
            finalCount: result.results.length
        });
        
        return result;
    }

    /**
     * 倒数排名融合（Reciprocal Rank Fusion）
     * @private
     * @param {Array<Object>} resultsA - Track A 结果
     * @param {Array<Object>} resultsB - Track B 结果
     * @returns {Array<Object>} 融合后的结果
     */
    _reciprocalRankFusion(resultsA, resultsB) {
        const scoreMap = new Map();
        
        // Track A 分数
        resultsA.forEach((result, rank) => {
            const id = result.memory.id;
            const score = 1.0 / (rank + 1);
            scoreMap.set(id, {
                ...result,
                fusedScore: (scoreMap.get(id)?.fusedScore || 0) + score * 0.5
            });
        });
        
        // Track B 分数（权重更高）
        resultsB.forEach((result, rank) => {
            const id = result.memory.id;
            const score = 1.0 / (rank + 1);
            scoreMap.set(id, {
                ...result,
                fusedScore: (scoreMap.get(id)?.fusedScore || 0) + score * 0.7
            });
        });
        
        // 转换为数组并排序
        return Array.from(scoreMap.values())
            .sort((a, b) => b.fusedScore - a.fusedScore);
    }

    /**
     * 日志记录
     * @private
     * @param {string} level - 日志级别
     * @param {string} message - 消息
     * @param {Object} data - 数据
     */
    _log(level, message, data = {}) {
        this.traceLog.push({
            timestamp: Date.now(),
            level,
            message,
            data
        });
    }

    /**
     * 直接查询（绕过 Track A）
     * @param {Object} query - 查询条件
     * @returns {Promise<RecallResult>}
     */
    async directQuery(query) {
        const startTime = Date.now();
        this.traceLog = [];
        
        this._log('info', `Direct query started`, { query });
        
        const results = await this.trackB.directQuery(query);
        
        const result = new RecallResult({
            results,
            query: JSON.stringify(query),
            traceLog: [...this.traceLog],
            latency: Date.now() - startTime,
            trackACount: 0,
            trackBCount: results.length
        });
        
        return result;
    }

    /**
     * 获取 Track B 实例（用于高级操作）
     * @returns {TrackBDeliberative}
     */
    getTrackB() {
        return this.trackB;
    }

    /**
     * 获取 Track A 实例（用于高级操作）
     * @returns {TrackAIntuitive}
     */
    getTrackA() {
        return this.trackA;
    }
}

/**
 * 检索结果类
 */
class RecallResult {
    constructor(data) {
        this.results = data.results || [];
        this.query = data.query;
        this.traceLog = data.traceLog || [];
        this.latency = data.latency || 0;
        this.trackACount = data.trackACount || 0;
        this.trackBCount = data.trackBCount || 0;
        this.confidence = this._calculateConfidence();
    }

    /**
     * 计算置信度
     * @private
     * @returns {number}
     */
    _calculateConfidence() {
        if (this.results.length === 0) return 0;
        
        const topScore = this.results[0].fusedScore || this.results[0].score || 0;
        const resultCount = this.results.length;
        
        // 置信度 = 最高分 * log(结果数)
        return Math.min(1.0, topScore * Math.log(resultCount + 1));
    }

    /**
     * 获取最佳结果
     * @returns {Object|null}
     */
    getBest() {
        return this.results[0] || null;
    }

    /**
     * 获取所有记忆
     * @returns {Array<Object>}
     */
    getMemories() {
        return this.results.map(r => r.memory);
    }

    /**
     * 转换为 JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            results: this.results.map(r => ({
                memory: r.memory,
                score: r.fusedScore || r.score,
                source: r.source
            })),
            query: this.query,
            traceLog: this.traceLog,
            latency: this.latency,
            trackACount: this.trackACount,
            trackBCount: this.trackBCount,
            confidence: this.confidence
        };
    }

    /**
     * 打印追踪日志
     */
    printTrace() {
        console.log('=== Recall Trace Log ===');
        this.traceLog.forEach(entry => {
            console.log(`[${entry.level}] ${entry.message}`);
            if (entry.data) {
                console.log('  Data:', JSON.stringify(entry.data, null, 2));
            }
        });
        console.log('========================');
    }
}

module.exports = RecallOrchestrator;
