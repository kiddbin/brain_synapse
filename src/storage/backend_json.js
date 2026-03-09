/**
 * @file brain_synapse/src/storage/backend_json.js
 * @description JSON 存储后端 - Layer 1 基础存储
 * @version 2.0.0
 * 
 * 核心特性：
 * - 支持新 Schema 的 CRUD 操作
 * - 向后兼容旧 synapse_weights.json 格式
 * - 异步写入，原子操作
 * - 迁移工具支持
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const IndexManager = require('./indexes/index_manager');

class SynapseBackend {
    /**
     * 创建存储后端
     * @param {string} filePath - 文件路径
     * @param {Object} defaultData - 默认数据
     */
    constructor(filePath, defaultData = {}) {
        this.filePath = filePath;
        this.defaultData = defaultData;
        this.data = { memories: {}, latent: {}, metadata: {} };
        this.writeQueue = Promise.resolve();
        this.indexManager = new IndexManager();
        
        // 优化 1: 写入批处理 + 防抖
        this.pendingWrites = [];
        this.writeDebounceTimer = null;
        this.WRITE_DEBOUNCE_MS = 1000; // 1 秒内合并写入
        this.WRITE_BATCH_SIZE = 10; // 或累积 10 条触发
        
        // 优化 2: Temporal Index 延迟排序
        this.temporalIndexDirty = false;
        this.temporalSortTimer = null;
        this.TEMPORAL_SORT_DELAY_MS = 5000; // 5 秒后排序
        this.TEMPORAL_SORT_THRESHOLD = 10; // 或累积 10 条触发
        this.pendingTemporalInserts = 0;
    }

    /**
     * 加载数据
     * @returns {Promise<void>}
     */
    async load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                this.data = JSON.parse(raw);
                console.log(`[SynapseBackend] Loaded ${Object.keys(this.data.memories || {}).length} memories from ${this.filePath}`);
            } else {
                this.data = { ...this.defaultData, memories: {}, latent: {}, metadata: {} };
                await this.save();
            }
            // 建立系统级倒排索引，替代未来的遍历
            this.indexManager.buildAll(Object.values(this.data.memories));
            
        } catch (e) {
            console.error('[SynapseBackend] Load error:', e.message);
            this.data = { ...this.defaultData, memories: {}, latent: {}, metadata: {} };
            this.indexManager.clear();
        }
    }

    /**
     * 保存数据（异步队列 + 批处理）
     * @returns {Promise<void>}
     */
    async save() {
        const tmpFile = `${this.filePath}.tmp.${Date.now()}`;
        try {
            await fsPromises.writeFile(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
            await fsPromises.rename(tmpFile, this.filePath);
        } catch (e) {
            console.error('[SynapseBackend] Save error:', e.message);
            await fsPromises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        }
    }

    /**
     * 优化 1: 批处理写入（防抖）
     * @private
     */
    _scheduleBatchedSave() {
        // 清除之前的定时器
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }

        // 如果达到批次大小，立即写入
        if (this.pendingWrites.length >= this.WRITE_BATCH_SIZE) {
            this._flushPendingWrites();
            return;
        }

        // 否则防抖等待
        this.writeDebounceTimer = setTimeout(() => {
            this._flushPendingWrites();
        }, this.WRITE_DEBOUNCE_MS);
    }

    /**
     * 优化 1: 执行批处理写入
     * @private
     */
    _flushPendingWrites() {
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
            this.writeDebounceTimer = null;
        }

        if (this.pendingWrites.length === 0) return;

        // 合并所有待写入的修改
        this.writeQueue = this.writeQueue.then(async () => {
            try {
                await this.save();
                console.log(`[SynapseBackend] Batch saved ${this.pendingWrites.length} changes`);
            } catch (e) {
                console.error('[SynapseBackend] Batch save error:', e.message);
            } finally {
                this.pendingWrites = [];
            }
        });
    }

    /**
     * 优化 2: Temporal Index 延迟排序
     * @private
     */
    _scheduleTemporalSort() {
        this.pendingTemporalInserts++;
        this.temporalIndexDirty = true;

        // 清除之前的定时器
        if (this.temporalSortTimer) {
            clearTimeout(this.temporalSortTimer);
        }

        // 如果达到阈值，立即排序
        if (this.pendingTemporalInserts >= this.TEMPORAL_SORT_THRESHOLD) {
            this._flushTemporalSort();
            return;
        }

        // 否则延迟排序
        this.temporalSortTimer = setTimeout(() => {
            this._flushTemporalSort();
        }, this.TEMPORAL_SORT_DELAY_MS);
    }

    /**
     * 优化 2: 执行 Temporal Index 排序
     * @private
     */
    _flushTemporalSort() {
        if (this.temporalSortTimer) {
            clearTimeout(this.temporalSortTimer);
            this.temporalSortTimer = null;
        }

        if (this.temporalIndexDirty) {
            this.indexManager._sortTemporalIndex();
            this.temporalIndexDirty = false;
            this.pendingTemporalInserts = 0;
            console.log('[IndexManager] Temporal index sorted (delayed)');
        }
    }

    /**
     * 创建记忆（优化：异步返回 + 批处理写入）
     * @param {Object} memory - 记忆对象
     * @returns {Promise<Object>}
     */
    async create(memory) {
        const memoryData = memory.toJSON ? memory.toJSON() : memory;
        this.data.memories[memory.id] = memoryData;
        
        // 增量建立索引（不排序，延迟处理）
        this.indexManager._addMemoryToIndexes(memoryData);
        this.indexManager._updateAdjacencyListFor(memoryData);
        
        // 优化 2: 延迟排序 Temporal Index
        this._scheduleTemporalSort();
        
        // 优化 1: 批处理写入（不阻塞返回）
        this.pendingWrites.push(memory.id);
        this._scheduleBatchedSave();
        
        // 优化 3: 立即返回，不等待写盘
        console.log(`[SynapseBackend] Created memory: ${memory.id} (async save)`);
        return memory;
    }

    /**
     * 强制刷新所有待写入的数据（用于关键路径）
     * @returns {Promise<void>}
     */
    async flush() {
        if (this.writeDebounceTimer || this.pendingWrites.length > 0) {
            this._flushPendingWrites();
            await this.writeQueue;
        }
        if (this.temporalSortTimer || this.temporalIndexDirty) {
            this._flushTemporalSort();
        }
    }

    /**
     * 更新记忆（优化：批处理写入）
     * @param {Object} memory - 记忆对象
     * @returns {Promise<Object>}
     */
    async update(memory) {
        if (this.data.memories[memory.id]) {
            this.data.memories[memory.id] = memory.toJSON ? memory.toJSON() : memory;
            
            // 优化 1: 批处理写入
            this.pendingWrites.push(memory.id);
            this._scheduleBatchedSave();
            
            console.log(`[SynapseBackend] Updated memory: ${memory.id} (async save)`);
        }
        return memory;
    }

    /**
     * 删除记忆
     * @param {string} id - 记忆 ID
     * @returns {Promise<Object>}
     */
    async delete(id) {
        const deleted = this.data.memories[id];
        delete this.data.memories[id];
        await this.save();
        return deleted;
    }

    /**
     * 获取记忆
     * @param {string} id - 记忆 ID
     * @returns {Promise<Object|null>}
     */
    async get(id) {
        return this.data.memories[id] || null;
    }

    /**
     * 获取所有记忆
     * @returns {Promise<Array<Object>>}
     */
    async getAll() {
        return Object.values(this.data.memories);
    }

    /**
     * 查询记忆
     * @param {Function} predicate - 查询条件
     * @returns {Promise<Array<Object>>}
     */
    async query(predicate) {
        return Object.values(this.data.memories).filter(predicate);
    }

    /**
     * 按类型查询
     * @param {string} memoryType - 记忆类型
     * @returns {Promise<Array<Object>>}
     */
    async queryByType(memoryType) {
        return this.query(m => m.memory_type === memoryType);
    }

    /**
     * 按实体查询
     * @param {string} entity - 实体名称
     * @returns {Promise<Array<Object>>}
     */
    async queryByEntity(entity) {
        return this.query(m => m.linked_entities && m.linked_entities.includes(entity));
    }

    /**
     * 按时间范围查询
     * @param {number} startTime - 开始时间
     * @param {number} endTime - 结束时间
     * @returns {Promise<Array<Object>>}
     */
    async queryByTimeRange(startTime, endTime) {
        return this.query(m => {
            const validFrom = m.timestamp_valid_from || m.created_at || 0;
            const validTo = m.timestamp_valid_to || Infinity;
            return validFrom <= endTime && validTo >= startTime;
        });
    }

    /**
     * 取代操作（处理冲突）
     * @param {string} oldId - 旧记忆 ID
     * @param {Object} newMemory - 新记忆
     * @returns {Promise<void>}
     */
    async supersede(oldId, newMemory) {
        if (this.data.memories[oldId]) {
            this.data.memories[oldId].superseded_by = newMemory.id;
            newMemory.supersedes = oldId;
            await this.create(newMemory);
            await this.save();
        }
    }

    /**
     * 从旧格式迁移
     * @param {string} weightsFile - 旧权重文件路径
     * @param {string} latentWeightsFile - 冷库文件路径（可选）
     * @returns {Promise<number>} 迁移的记忆数量
     */
    async migrateFromLegacy(weightsFile, latentWeightsFile = null) {
        let count = 0;
        
        // 迁移主权重文件
        if (fs.existsSync(weightsFile)) {
            const legacy = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
            
            Object.entries(legacy).forEach(([keyword, data]) => {
                const memory = {
                    id: `legacy_${keyword.replace(/\s/g, '_')}_${Date.now()}`,
                    memory_type: 'experience',
                    content: { keyword, rule: keyword },
                    weight: data.weight || 1.0,
                    created_at: data.lastAccess || Date.now(),
                    updated_at: Date.now(),
                    timestamp_valid_from: data.lastAccess || Date.now(),
                    timestamp_valid_to: null,
                    confidence: 0.5,
                    salience: data.weight || 0.5,
                    recency: 1.0,
                    access_count: 0,
                    linked_entities: [],
                    supersedes: null,
                    superseded_by: null,
                    provenance: data.refs ? { files: data.refs } : null,
                    embedding_refs: [],
                    symbolic_tags: [],
                    pinned: data.pinned || false
                };
                
                this.data.memories[memory.id] = memory;
                count++;
            });
            
            console.log(`[SynapseBackend] Migrated ${count} memories from legacy weights file`);
        }
        
        // 迁移冷库文件
        if (latentWeightsFile && fs.existsSync(latentWeightsFile)) {
            const latent = JSON.parse(fs.readFileSync(latentWeightsFile, 'utf8'));
            
            Object.entries(latent).forEach(([keyword, data]) => {
                const memory = {
                    id: `latent_${keyword.replace(/\s/g, '_')}_${Date.now()}`,
                    memory_type: 'experience',
                    content: { keyword, rule: keyword },
                    weight: data.weight || 0.1,
                    created_at: data.lastAccess || Date.now(),
                    updated_at: Date.now(),
                    timestamp_valid_from: data.lastAccess || Date.now(),
                    timestamp_valid_to: null,
                    confidence: 0.3,
                    salience: data.weight || 0.1,
                    recency: 0.1,
                    access_count: 0,
                    linked_entities: [],
                    supersedes: null,
                    superseded_by: null,
                    provenance: data.refs ? { files: data.refs } : null,
                    embedding_refs: [],
                    symbolic_tags: [],
                    pinned: false
                };
                
                this.data.latent[memory.id] = memory;
                count++;
            });
            
            console.log(`[SynapseBackend] Migrated ${Object.keys(latent).length} memories from latent weights file`);
        }
        
        await this.save();
        return count;
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        const memories = Object.values(this.data.memories);
        const memoryTypes = {};
        
        memories.forEach(m => {
            const type = m.memory_type || 'unknown';
            memoryTypes[type] = (memoryTypes[type] || 0) + 1;
        });
        
        return {
            activeMemories: memories.length,
            latentMemories: Object.keys(this.data.latent || {}).length,
            memoryTypes,
            totalAccessCount: memories.reduce((sum, m) => sum + (m.access_count || 0), 0),
            metadata: this.data.metadata
        };
    }

    /**
     * 清除所有数据（测试用）
     * @returns {Promise<void>}
     */
    async clear() {
        this.data = { memories: {}, latent: {}, metadata: {} };
        await this.save();
    }
}

module.exports = SynapseBackend;
