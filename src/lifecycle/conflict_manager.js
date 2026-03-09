/**
 * @file brain_synapse/src/lifecycle/conflict_manager.js
 * @description 冲突管理模块 - 整合原 conflict-resolver.js
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

class ConflictManager {
    /**
     * 创建冲突管理器
     * @param {SynapseBackend} backend - 存储后端
     */
    constructor(backend) {
        this.backend = backend;
        this.conflictLog = [];
    }

    /**
     * 计算语义相似度
     * @param {string} textA - 文本 A
     * @param {string} textB - 文本 B
     * @returns {number} 相似度 (0-1)
     */
    calculateSemanticSimilarity(textA, textB) {
        const keywordsA = this._extractKeywords(textA);
        const keywordsB = this._extractKeywords(textB);
        
        const intersection = keywordsA.filter(k => keywordsB.includes(k));
        const union = [...new Set([...keywordsA, ...keywordsB])];
        
        return intersection.length / union.length;
    }

    /**
     * 提取关键词
     * @private
     * @param {string} text - 文本
     * @returns {Array<string>}
     */
    _extractKeywords(text) {
        const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];
        return [...chineseWords, ...englishWords].map(w => w.toLowerCase());
    }

    /**
     * 检测细化关系
     * @param {Object} newMemory - 新记忆
     * @param {Object} oldMemory - 旧记忆
     * @returns {boolean}
     */
    isRefinement(newMemory, oldMemory) {
        const newKeywords = new Set(this._extractKeywords(JSON.stringify(newMemory.content)));
        const oldKeywords = new Set(this._extractKeywords(JSON.stringify(oldMemory.content)));
        
        // 旧记忆的所有关键词都应该在新记忆中
        for (const kw of oldKeywords) {
            if (!newKeywords.has(kw)) return false;
        }
        
        // 新记忆应该有额外的关键词
        return newKeywords.size > oldKeywords.size;
    }

    /**
     * 检测更新关系
     * @param {Object} newMemory - 新记忆
     * @param {Object} oldMemory - 旧记忆
     * @returns {boolean}
     */
    isUpdate(newMemory, oldMemory) {
        const similarity = this.calculateSemanticSimilarity(
            JSON.stringify(newMemory.content),
            JSON.stringify(oldMemory.content)
        );
        
        return similarity > 0.7 && !this.isRefinement(newMemory, oldMemory);
    }

    /**
     * 检测取代关系
     * @param {Object} newMemory - 新记忆
     * @param {Object} oldMemory - 旧记忆
     * @returns {boolean}
     */
    isSupersession(newMemory, oldMemory) {
        const newText = JSON.stringify(newMemory.content).toLowerCase();
        const markers = ['v2', 'v3', '新版', '替换', '更新', 'upgrade', 'replace'];
        
        return markers.some(marker => newText.includes(marker));
    }

    /**
     * 分类关系
     * @param {Object} newMemory - 新记忆
     * @param {Object} oldMemory - 旧记忆
     * @returns {'refinement'|'update'|'supersession'|'uncertain'}
     */
    classifyRelationship(newMemory, oldMemory) {
        if (this.isRefinement(newMemory, oldMemory)) return 'refinement';
        if (this.isSupersession(newMemory, oldMemory)) return 'supersession';
        if (this.isUpdate(newMemory, oldMemory)) return 'update';
        return 'uncertain';
    }

    /**
     * 查找潜在冲突
     * @param {Object} newMemory - 新记忆
     * @param {Array<Object>} existingMemories - 现有记忆
     * @param {number} similarityThreshold - 相似度阈值
     * @returns {Array<Object>} 冲突列表
     */
    findConflicts(newMemory, existingMemories, similarityThreshold = 0.6) {
        const conflicts = [];
        
        for (const oldMemory of existingMemories) {
            const similarity = this.calculateSemanticSimilarity(
                JSON.stringify(newMemory.content),
                JSON.stringify(oldMemory.content)
            );
            
            if (similarity >= similarityThreshold) {
                const isOpposite = this._hasOppositeConclusion(newMemory, oldMemory);
                
                conflicts.push({
                    existing: oldMemory,
                    similarity,
                    isOpposite,
                    relationship: this.classifyRelationship(newMemory, oldMemory)
                });
            }
        }
        
        return conflicts.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * 检测结论是否相反
     * @private
     * @param {Object} newMemory - 新记忆
     * @param {Object} oldMemory - 旧记忆
     * @returns {boolean}
     */
    _hasOppositeConclusion(newMemory, oldMemory) {
        const newText = JSON.stringify(newMemory.content).toLowerCase();
        const oldText = JSON.stringify(oldMemory.content).toLowerCase();
        
        const opposites = [
            ['必须', '禁止'],
            ['使用', '不使用'],
            ['开启', '关闭'],
            ['增加', '减少'],
            ['true', 'false']
        ];
        
        return opposites.some(([pos, neg]) =>
            (newText.includes(pos) && oldText.includes(neg)) ||
            (newText.includes(neg) && oldText.includes(pos))
        );
    }

    /**
     * 解决冲突
     * @param {Object} newMemory - 新记忆
     * @param {Array<Object>} conflicts - 冲突列表
     * @returns {Object} 解决结果
     */
    resolveConflict(newMemory, conflicts) {
        if (conflicts.length === 0) {
            return { action: 'create', reason: 'no_conflict' };
        }
        
        const topConflict = conflicts[0];
        const oldMemory = topConflict.existing;
        
        switch (topConflict.relationship) {
            case 'refinement':
                return {
                    action: 'refine',
                    oldMemory,
                    newMemory,
                    reason: 'new_memory_refines_old'
                };
                
            case 'supersession':
                return {
                    action: 'supersede',
                    oldMemory,
                    newMemory,
                    reason: 'explicit_version_upgrade'
                };
                
            case 'update':
                const newTime = newMemory.timestamp_valid_from || newMemory.created_at || Date.now();
                const oldTime = oldMemory.timestamp_valid_from || oldMemory.created_at || 0;
                
                if (newTime > oldTime) {
                    return {
                        action: 'supersede',
                        oldMemory,
                        newMemory,
                        reason: 'newer_timestamp'
                    };
                } else {
                    return {
                        action: 'keep',
                        oldMemory,
                        newMemory,
                        reason: 'older_timestamp'
                    };
                }
                
            default: // uncertain
                if (topConflict.isOpposite) {
                    return {
                        action: 'flag',
                        oldMemory,
                        newMemory,
                        reason: 'opposite_conclusion_uncertain'
                    };
                } else {
                    return {
                        action: 'coexist',
                        oldMemory,
                        newMemory,
                        reason: 'uncertain_but_not_opposite'
                    };
                }
        }
    }

    /**
     * 处理新记忆的冲突
     * @param {Object} newMemory - 新记忆
     * @returns {Promise<Object>} 处理结果
     */
    async handleNewMemory(newMemory) {
        const allMemories = await this.backend.getAll();
        const conflicts = this.findConflicts(newMemory, allMemories);
        const resolution = this.resolveConflict(newMemory, conflicts);
        
        // 记录冲突日志
        if (conflicts.length > 0) {
            this.conflictLog.push({
                timestamp: Date.now(),
                newMemoryId: newMemory.id,
                conflictsCount: conflicts.length,
                resolution: resolution.action
            });
        }
        
        return resolution;
    }

    /**
     * 获取冲突日志
     * @returns {Array<Object>}
     */
    getConflictLog() {
        return this.conflictLog;
    }
}

module.exports = ConflictManager;
