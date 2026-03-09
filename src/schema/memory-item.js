/**
 * @file brain_synapse/src/schema/memory-item.js
 * @description MemoryItem Schema 定义 - 核心记忆结构体
 * @version 2.0.0
 * 
 * 基于 5-Layer Memory OS 架构设计：
 * - 显式记忆类型区分
 * - 时间有效性控制
 * - 冲突关系管理
 * - 代码锚点溯源
 */

const crypto = require('crypto');

/**
 * @typedef {'general'|'experience'|'episodic'|'semantic'|'procedural'|'failed_attempt'} MemoryType
 */

/**
 * @class MemoryItem
 * @description 记忆项完整结构体
 */
class MemoryItem {
    /**
     * 创建记忆项
     * @param {Object} data - 记忆数据
     */
    constructor(data = {}) {
        // 核心标识
        this.id = data.id || this._generateId();
        this.memory_type = data.memory_type || 'general';
        
        // 内容区
        this.content = data.content || {};
        
        // 时间维度 - 关键特性
        this.timestamp_valid_from = data.timestamp_valid_from || Date.now();
        this.timestamp_valid_to = data.timestamp_valid_to || null; // null 表示当前有效
        this.created_at = data.created_at || Date.now();
        this.updated_at = data.updated_at || Date.now();
        
        // 生物学属性
        this.confidence = data.confidence || 0.5;
        this.salience = data.salience || 0.5;
        this.recency = data.recency || this._calculateRecency();
        this.access_count = data.access_count || 0;
        
        // 关系图谱
        this.linked_entities = data.linked_entities || [];
        this.supersedes = data.supersedes || null;
        this.superseded_by = data.superseded_by || null;
        
        // 溯源信息
        this.provenance = data.provenance || null;
        this.embedding_refs = data.embedding_refs || [];
        this.symbolic_tags = data.symbolic_tags || [];
        
        // 系统属性
        this.pinned = data.pinned || false;
        this.weight = data.weight || 1.0;
    }

    /**
     * 生成唯一 ID
     * @private
     * @returns {string}
     */
    _generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * 计算近因性
     * @private
     * @returns {number}
     */
    _calculateRecency() {
        const now = Date.now();
        const hoursSinceCreation = (now - this.created_at) / (1000 * 60 * 60);
        return Math.exp(-hoursSinceCreation / 24); // 24 小时半衰期
    }

    /**
     * 更新记忆
     * @param {Object} updates - 更新内容
     */
    update(updates) {
        Object.assign(this, updates);
        this.updated_at = Date.now();
        this.recency = this._calculateRecency();
    }

    /**
     * 增加访问计数
     */
    incrementAccess() {
        this.access_count++;
        this.updated_at = Date.now();
    }

    /**
     * 检查当前是否有效
     * @returns {boolean}
     */
    isValidNow() {
        if (this.superseded_by) return false;
        if (this.timestamp_valid_to && this.timestamp_valid_to < Date.now()) return false;
        return true;
    }

    /**
     * 转换为 JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            memory_type: this.memory_type,
            content: this.content,
            timestamp_valid_from: this.timestamp_valid_from,
            timestamp_valid_to: this.timestamp_valid_to,
            created_at: this.created_at,
            updated_at: this.updated_at,
            confidence: this.confidence,
            salience: this.salience,
            recency: this.recency,
            access_count: this.access_count,
            linked_entities: this.linked_entities,
            supersedes: this.supersedes,
            superseded_by: this.superseded_by,
            provenance: this.provenance,
            embedding_refs: this.embedding_refs,
            symbolic_tags: this.symbolic_tags,
            pinned: this.pinned,
            weight: this.weight
        };
    }
}

module.exports = MemoryItem;
