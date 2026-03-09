/**
 * @file brain_synapse/src/extensions/coding_agent.js
 * @description Coding Agent 扩展 - 文件锚点 + Failed-Attempt 记忆
 * @version 2.0.0
 * 
 * 杀手锏能力：
 * - File-level Memory Linking
 * - Failed-Attempt Memory 专用 API
 * - Bugfix 历史追溯
 */

const MemoryItem = require('../schema/memory-item');

class CodingAgentExtension {
    /**
     * 创建扩展
     * @param {BrainSynapseSDK} sdk - SDK 实例
     */
    constructor(sdk) {
        this.sdk = sdk;
    }

    /**
     * 记录 Failed Attempt
     * @param {Object} data - 失败尝试数据
     * @returns {Promise<MemoryItem>}
     */
    async rememberFailedAttempt(data) {
        const {
            fileReference,
            errorMessage,
            attemptedSolution,
            bugDescription,
            timestamp
        } = data;
        
        const memory = new MemoryItem({
            memory_type: 'failed_attempt',
            content: {
                type: 'failed_attempt',
                bug: bugDescription,
                attempted: attemptedSolution,
                error: errorMessage
            },
            timestamp_valid_from: timestamp || Date.now(),
            timestamp_valid_to: null, // 永远有效（直到问题解决）
            linked_entities: this._extractEntities(data),
            provenance: {
                source_type: 'failed_attempt',
                file_reference: fileReference,
                timestamp: timestamp || Date.now()
            },
            symbolic_tags: ['bug', 'failed', 'anti_pattern'],
            confidence: 0.9, // 高置信度（失败经验很重要）
            salience: 0.8
        });
        
        await this.sdk.getBackend().create(memory);
        console.log(`[CodingAgent] Recorded failed attempt: ${memory.id}`);
        
        return memory;
    }

    /**
     * 记录成功解决方案
     * @param {Object} data - 成功数据
     * @returns {Promise<MemoryItem>}
     */
    async rememberSuccess(data) {
        const {
            fileReference,
            solution,
            bugDescription,
            failedAttempts = [],
            timestamp
        } = data;
        
        const memory = new MemoryItem({
            memory_type: 'procedural',
            content: {
                type: 'solution',
                bug: bugDescription,
                solution: solution
            },
            timestamp_valid_from: timestamp || Date.now(),
            timestamp_valid_to: null,
            linked_entities: this._extractEntities(data),
            provenance: {
                source_type: 'success',
                file_reference: fileReference,
                timestamp: timestamp || Date.now()
            },
            symbolic_tags: ['bugfix', 'solution', 'verified'],
            confidence: 0.95,
            salience: 0.9
        });
        
        // 关联失败的尝试
        if (failedAttempts.length > 0) {
            memory.supersedes = failedAttempts;
        }
        
        await this.sdk.getBackend().create(memory);
        console.log(`[CodingAgent] Recorded success: ${memory.id}`);
        
        return memory;
    }

    /**
     * 查询文件相关的所有记忆
     * @param {string} filePath - 文件路径
     * @returns {Promise<Array<Object>>}
     */
    async recallForFile(filePath) {
        const result = await this.sdk.getOrchestrator().directQuery({
            fileReference: filePath
        });
        
        console.log(`[CodingAgent] Found ${result.results.length} memories for ${filePath}`);
        
        return result.getMemories();
    }

    /**
     * 查询 Bugfix 历史
     * @param {string} bugKeyword - Bug 关键词
     * @returns {Promise<Array<Object>>}
     */
    async queryBugfixHistory(bugKeyword) {
        const result = await this.sdk.recall(bugKeyword, {
            mode: 'serial',
            trackBOptions: {
                validateTemporalValidity: true,
                resolveConflicts: true
            }
        });
        
        // 过滤出 failed_attempt 和 procedural 类型
        const relevantMemories = result.getMemories().filter(m =>
            m.memory_type === 'failed_attempt' ||
            m.memory_type === 'procedural' ||
            m.symbolic_tags?.includes('bugfix')
        );
        
        console.log(`[CodingAgent] Found ${relevantMemories.length} bugfix-related memories`);
        
        return relevantMemories;
    }

    /**
     * 检查是否尝试过某个方案
     * @param {string} fileReference - 文件引用
     * @param {string} approach - 方案描述
     * @returns {Promise<Object|null>}
     */
    async checkIfAttempted(fileReference, approach) {
        const memories = await this.recallForFile(fileReference);
        
        const failedAttempt = memories.find(m =>
            m.memory_type === 'failed_attempt' &&
            m.content.attempted?.toLowerCase().includes(approach.toLowerCase())
        );
        
        if (failedAttempt) {
            console.log(`[CodingAgent] ⚠️ Approach already attempted: ${approach}`);
            return {
                attempted: true,
                memory: failedAttempt,
                error: failedAttempt.content.error
            };
        }
        
        return { attempted: false };
    }

    /**
     * 提取关联实体
     * @private
     * @param {Object} data - 数据
     * @returns {Array<string>}
     */
    _extractEntities(data) {
        const entities = [];
        
        if (data.fileReference) {
            // 提取文件名
            const fileName = data.fileReference.split('/').pop().split('\\').pop();
            entities.push(fileName);
        }
        
        if (data.bugDescription) {
            // 简单提取关键词
            const keywords = data.bugDescription.match(/\b\w+\b/g) || [];
            entities.push(...keywords.filter(k => k.length > 3));
        }
        
        return [...new Set(entities)];
    }

    /**
     * 生成 Bugfix 报告
     * @param {string} fileReference - 文件引用
     * @returns {Promise<Object>}
     */
    async generateBugfixReport(fileReference) {
        const memories = await this.recallForFile(fileReference);
        
        const failedAttempts = memories.filter(m => m.memory_type === 'failed_attempt');
        const solutions = memories.filter(m => m.memory_type === 'procedural' && m.symbolic_tags?.includes('solution'));
        
        return {
            fileReference,
            generatedAt: new Date().toISOString(),
            failedAttempts: failedAttempts.map(m => ({
                id: m.id,
                attempted: m.content.attempted,
                error: m.content.error,
                timestamp: new Date(m.created_at).toISOString()
            })),
            solutions: solutions.map(m => ({
                id: m.id,
                solution: m.content.solution,
                timestamp: new Date(m.created_at).toISOString()
            })),
            totalMemories: memories.length
        };
    }
}

module.exports = CodingAgentExtension;
