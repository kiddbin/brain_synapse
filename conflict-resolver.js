/**
 * @file brain_synapse/conflict-resolver.js
 * @description 记忆冲突解决模块
 * @author Brain Synapse Team
 * @version 1.5.0
 * 
 * 处理新旧记忆之间的矛盾：
 * - 细化 (Refinement): 新记忆补充旧记忆的详细信息
 * - 更新 (Update): 时间戳新的记忆取代旧的
 * - 取代 (Supersession): 新版本完全替代旧版本
 * - 标记 (Flag): 不确定的冲突，待人工审核
 */

const fs = require('fs');
const path = require('path');

const CONFLICT_LOG_FILE = path.join(__dirname, 'conflict_log.json');

class ConflictResolver {
    constructor(weights) {
        this.weights = weights;
        this.conflictLog = this.loadConflictLog();
    }

    loadConflictLog() {
        if (fs.existsSync(CONFLICT_LOG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFLICT_LOG_FILE, 'utf8'));
        }
        return [];
    }

    saveConflictLog() {
        fs.writeFileSync(CONFLICT_LOG_FILE, JSON.stringify(this.conflictLog, null, 2), 'utf8');
    }

    /**
     * 计算两个概念的语义相似度
     * 基于关键词重叠和共现
     */
    calculateSemanticSimilarity(conceptA, conceptB) {
        const keywordsA = new Set(this.extractKeywords(conceptA));
        const keywordsB = new Set(this.extractKeywords(conceptB));
        
        const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
        const union = new Set([...keywordsA, ...keywordsB]);
        
        return intersection.size / union.size;
    }

    extractKeywords(text) {
        const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];
        return [...chineseWords, ...englishWords].map(w => w.toLowerCase());
    }

    /**
     * 检测是否为细化关系
     * 新记忆包含旧记忆的所有关键词 + 额外细节
     */
    isRefinement(newFact, oldFact) {
        const newKeywords = new Set(this.extractKeywords(newFact.rule || newFact));
        const oldKeywords = new Set(this.extractKeywords(oldFact.rule || oldFact));
        
        // 旧记忆的所有关键词都应该在新记忆中
        for (const kw of oldKeywords) {
            if (!newKeywords.has(kw)) return false;
        }
        
        // 新记忆应该有额外的关键词（细化）
        return newKeywords.size > oldKeywords.size;
    }

    /**
     * 检测是否为更新关系
     * 同一主题，时间戳新
     */
    isUpdate(newFact, oldFact) {
        const similarity = this.calculateSemanticSimilarity(
            newFact.keyword || newFact,
            oldFact.keyword || oldFact
        );
        
        // 相似度高（>0.7）但不是细化
        return similarity > 0.7 && !this.isRefinement(newFact, oldFact);
    }

    /**
     * 检测是否为取代关系
     * 明确的新版本标记（如 v2, 新版, 更新等）
     */
    isSupersession(newFact, oldFact) {
        const newText = (newFact.rule || newFact).toLowerCase();
        const supersessionMarkers = [
            'v2', 'v3', '新版', '新版本', '更新', 'upgrade',
            '替换', '取代', '废弃', 'deprecated', '改为'
        ];
        
        return supersessionMarkers.some(marker => newText.includes(marker));
    }

    /**
     * 检测结论是否相反
     */
    hasOppositeConclusion(newFact, oldFact) {
        const newText = (newFact.rule || newFact).toLowerCase();
        const oldText = (oldFact.rule || oldFact).toLowerCase();
        
        // 反义词对
        const opposites = [
            ['必须', '禁止'],
            ['使用', '不使用'],
            ['开启', '关闭'],
            ['增加', '减少'],
            ['是', '不是'],
            ['可以', '不可以'],
            ['true', 'false'],
            ['enable', 'disable']
        ];
        
        return opposites.some(([pos, neg]) => 
            (newText.includes(pos) && oldText.includes(neg)) ||
            (newText.includes(neg) && oldText.includes(pos))
        );
    }

    /**
     * 查找潜在冲突的记忆
     */
    findConflicts(newFact, existingFacts, similarityThreshold = 0.6) {
        const conflicts = [];
        
        for (const oldFact of existingFacts) {
            const similarity = this.calculateSemanticSimilarity(
                newFact.keyword || newFact,
                oldFact.keyword || oldFact
            );
            
            if (similarity >= similarityThreshold) {
                const isOpposite = this.hasOppositeConclusion(newFact, oldFact);
                conflicts.push({
                    existing: oldFact,
                    similarity,
                    isOpposite,
                    relationship: this.classifyRelationship(newFact, oldFact)
                });
            }
        }
        
        return conflicts.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * 分类新旧记忆的关系
     */
    classifyRelationship(newFact, oldFact) {
        if (this.isRefinement(newFact, oldFact)) return 'refinement';
        if (this.isSupersession(newFact, oldFact)) return 'supersession';
        if (this.isUpdate(newFact, oldFact)) return 'update';
        return 'uncertain';
    }

    /**
     * 解决冲突
     * @returns {Object} 解决结果
     */
    resolveConflict(newFact, conflicts) {
        if (conflicts.length === 0) {
            return { action: 'create', reason: 'no_conflict' };
        }
        
        const topConflict = conflicts[0];
        const oldFact = topConflict.existing;
        
        let result;
        
        switch (topConflict.relationship) {
            case 'refinement':
                result = {
                    action: 'refine',
                    oldFact,
                    newFact,
                    merged: this.mergeFacts(oldFact, newFact),
                    reason: 'new_fact_refines_old'
                };
                break;
                
            case 'supersession':
                result = {
                    action: 'supersede',
                    oldFact,
                    newFact,
                    reason: 'explicit_version_upgrade'
                };
                break;
                
            case 'update':
                // 比较时间戳
                const newTime = newFact.lastAccess || newFact.firstSeen || Date.now();
                const oldTime = oldFact.lastAccess || oldFact.firstSeen || 0;
                
                if (newTime > oldTime) {
                    result = {
                        action: 'update',
                        oldFact,
                        newFact,
                        reason: 'newer_timestamp'
                    };
                } else {
                    result = {
                        action: 'keep_old',
                        oldFact,
                        newFact,
                        reason: 'existing_is_newer'
                    };
                }
                break;
                
            default:
                // 不确定，标记待审核
                result = {
                    action: 'flag',
                    oldFact,
                    newFact,
                    conflicts,
                    reason: 'uncertain_relationship'
                };
        }
        
        // 记录冲突日志
        this.conflictLog.push({
            timestamp: Date.now(),
            newFact: newFact.keyword || newFact,
            oldFact: oldFact.keyword || oldFact,
            action: result.action,
            reason: result.reason
        });
        
        // 只保留最近 100 条日志
        if (this.conflictLog.length > 100) {
            this.conflictLog = this.conflictLog.slice(-100);
        }
        
        this.saveConflictLog();
        
        return result;
    }

    /**
     * 合并两个记忆（细化场景）
     */
    mergeFacts(oldFact, newFact) {
        const merged = { ...oldFact };
        
        // 保留旧的元数据
        merged.firstSeen = oldFact.firstSeen;
        merged.count = (oldFact.count || 0) + (newFact.count || 1);
        
        // 使用新的规则（因为新的是细化版）
        if (newFact.rule) {
            merged.rule = newFact.rule;
        }
        
        // 更新时间戳
        merged.lastAccess = Date.now();
        merged.lastSeen = Date.now();
        
        // 提升权重（因为是细化）
        merged.weight = Math.max(oldFact.weight || 1, newFact.weight || 1) + 0.2;
        
        return merged;
    }

    /**
     * 检查并解决新记忆的冲突
     * @param {Object} newFact - 新记忆
     * @param {Object} weights - 所有现有记忆
     * @returns {Object} 解决结果
     */
    checkAndResolve(newFact, weights) {
        const existingFacts = Object.entries(weights).map(([keyword, data]) => ({
            keyword,
            ...data
        }));
        
        const conflicts = this.findConflicts(newFact, existingFacts);
        return this.resolveConflict(newFact, conflicts);
    }

    /**
     * 获取冲突日志
     */
    getConflictLog(limit = 20) {
        return this.conflictLog.slice(-limit);
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const stats = {
            totalConflicts: this.conflictLog.length,
            byAction: {}
        };
        
        this.conflictLog.forEach(entry => {
            stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
        });
        
        return stats;
    }
}

module.exports = ConflictResolver;
