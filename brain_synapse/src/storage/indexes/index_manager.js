/**
 * @file brain_synapse/src/storage/indexes/index_manager.js
 * @description Layer 1 -> Layer 3 Index Cache 管理器
 * @version 2.1.0
 * 
 * 管理所有内存索引，避免全表扫描：
 * - tokenInvertedIndex: Token -> Set<MemoryID>
 * - entityIndex: Entity -> Set<MemoryID>
 * - fileIndex: FilePath -> Set<MemoryID>
 * - adjacencyList: MemoryID -> Set<MemoryID> (Hebbian Spread 专用)
 * - temporalIndex: Array<{id, valid_from, valid_to}> (按时间排序，二分查找用)
 */

class IndexManager {
    constructor() {
        this.tokenInvertedIndex = new Map();
        this.entityIndex = new Map();
        this.fileIndex = new Map();
        this.adjacencyList = new Map();
        this.temporalIndex = []; // {id, from, to} []
        
        // 双向替换链索引 (Supersedes / Superseded_by)
        this.supersedesChain = new Map(); 
        
        this._isBuilt = false;
    }

    /**
     * 重建所有索引 (O(N) 仅在启动时或大规模重载时调用)
     * @param {Array<Object>} memories - 全量记忆数组
     */
    buildAll(memories) {
        this.clear();
        
        memories.forEach(mem => {
            this._addMemoryToIndexes(mem);
        });
        
        // 专门处理图聚合索引 (Hebbian Spread 需要的 Adjacency List)
        this._buildAdjacencyList(memories);
        
        // 排序 Temporal Index 方便未来二分搜索
        this._sortTemporalIndex();
        
        this._isBuilt = true;
    }

    /**
     * 清理所有索引
     */
    clear() {
        this.tokenInvertedIndex.clear();
        this.entityIndex.clear();
        this.fileIndex.clear();
        this.adjacencyList.clear();
        this.supersedesChain.clear();
        this.temporalIndex = [];
        this._isBuilt = false;
    }

    /**
     * 新增单条记忆时，增量维护索引
     * @param {Object} mem - 新增记忆
     */
    addMemory(mem) {
        this._addMemoryToIndexes(mem);
        this._updateAdjacencyListFor(mem);
        
        // 增量插入时，暂时使用 O(N) 插入排序保持有序，或者推迟排序
        this.temporalIndex.push({
            id: mem.id,
            from: mem.timestamp_valid_from || mem.created_at || 0,
            to: mem.timestamp_valid_to || Infinity
        });
        this._sortTemporalIndex(); // 可以优化为二分插入
    }

    /**
     * 内部抽取：建立单个 Memory 的 Token / Entity / File 倒排
     */
    _addMemoryToIndexes(mem) {
        // 1. File / Path Index
        if (mem.provenance && mem.provenance.file_reference) {
            this._addToInverted(this.fileIndex, mem.provenance.file_reference, mem.id);
        }
        
        // 2. Entity Index
        if (mem.linked_entities && Array.isArray(mem.linked_entities)) {
            mem.linked_entities.forEach(entity => {
                this._addToInverted(this.entityIndex, entity, mem.id);
            });
        }
        
        // 3. Token Inverted Index (中文 Bigram / 英文词)
        const tokens = this._extractTokensForIndex(mem);
        tokens.forEach(tk => {
            this._addToInverted(this.tokenInvertedIndex, tk, mem.id);
        });
        
        // 4. Supersedes Chain
        if (mem.supersedes) {
            this.supersedesChain.set(mem.supersedes, mem.id);
        }
        
        // 5. Build Temporal Base Array
        if (!this._isBuilt) {
            this.temporalIndex.push({
                id: mem.id,
                from: mem.timestamp_valid_from || mem.created_at || 0,
                to: mem.timestamp_valid_to || Infinity
            });
        }
    }

    /**
     * 获取邻接表关系图
     */
    _buildAdjacencyList(memories) {
        // Hebbian Spread 需要知道：从一个 Keyword 出发可以到达哪些同 Entity 的其他 Memory
        // 索引结构：Memory.id -> Set<Target_Memory.id>
        // O(N^2) 建图开销，但在 Query 时为 O(1)
        
        const entityToMemories = new Map();
        
        // First pass: group by entity
        memories.forEach(mem => {
            if (mem.linked_entities) {
                mem.linked_entities.forEach(entity => {
                    this._addToInverted(entityToMemories, entity, mem.id);
                });
            }
            // Memory 本身的 Keyword 也算是一种实体表征
            const keyword = (mem.content && mem.content.keyword) ? mem.content.keyword : null;
            if (keyword) {
                 this._addToInverted(entityToMemories, keyword, mem.id);
            }
        });
        
        // Second pass: build graph edge
        memories.forEach(mem => {
            const edges = new Set();
            this.adjacencyList.set(mem.id, edges);
            
            const keyword = (mem.content && mem.content.keyword) ? mem.content.keyword : null;
            
            // 该记忆自身代表的 Keyword 所连接的所有兄弟节点
            if (keyword && entityToMemories.has(keyword)) {
                entityToMemories.get(keyword).forEach(targetId => {
                    if (targetId !== mem.id) edges.add(targetId);
                });
            }
            
            // 该记忆所关联的其他实体，挂载的兄弟节点
            if (mem.linked_entities) {
                mem.linked_entities.forEach(entity => {
                    if (entityToMemories.has(entity)) {
                         entityToMemories.get(entity).forEach(targetId => {
                            if (targetId !== mem.id) edges.add(targetId);
                         });
                    }
                });
            }
        });
    }

    /**
     * 针对增量数据的邻接表维护
     */
    _updateAdjacencyListFor(mem) {
        // ...简化版的 O(N) 局部修补，或者依赖全量重建
        const edges = new Set();
        this.adjacencyList.set(mem.id, edges);
        
        const entities = [];
        if (mem.content && mem.content.keyword) entities.push(mem.content.keyword);
        if (mem.linked_entities) entities.push(...mem.linked_entities);
        
        entities.forEach(entity => {
            if (this.entityIndex.has(entity)) {
                this.entityIndex.get(entity).forEach(targetId => {
                     if (targetId !== mem.id) {
                         edges.add(targetId);
                         // 反向边
                         if (this.adjacencyList.has(targetId)) {
                             this.adjacencyList.get(targetId).add(mem.id);
                         }
                     }
                });
            }
        });
    }

    _sortTemporalIndex() {
        // 先按从大到小排序 Valid_From，方便查找
        this.temporalIndex.sort((a, b) => b.from - a.from);
    }

    _extractTokensForIndex(memory) {
        const parts = [];
        if (memory.content) {
            if (typeof memory.content === 'object') {
                parts.push(...Object.values(memory.content).filter(v => typeof v === 'string'));
            } else {
                parts.push(memory.content);
            }
        }
        
        // 关键修复：也索引文件路径
        if (memory.provenance && memory.provenance.file_reference) {
            parts.push(memory.provenance.file_reference);
        }
        
        // 索引 linked_entities
        if (memory.linked_entities && Array.isArray(memory.linked_entities)) {
            parts.push(...memory.linked_entities);
        }
        
        const text = parts.join(' ').toLowerCase();
        
        const words = text.match(/[a-z0-9]+/g) || [];
        const hanzi = text.match(/[\u4e00-\u9fa5]/g) || [];
        const bigrams = [];
        for (let i = 0; i < hanzi.length - 1; i++) {
            bigrams.push(hanzi[i] + hanzi[i+1]);
        }
        
        return [...new Set([...words, ...hanzi, ...bigrams])];
    }

    _addToInverted(map, key, val) {
        if (!key) return;
        const normalizedKey = String(key).toLowerCase();
        if (!map.has(normalizedKey)) {
            map.set(normalizedKey, new Set());
        }
        map.get(normalizedKey).add(val);
    }
    
    // --- 快速查询接口 (O(1)) ---
    
    getMemoriesByToken(token) {
        return this.tokenInvertedIndex.get(token.toLowerCase()) || new Set();
    }
    
    getMemoriesByEntity(entity) {
        return this.entityIndex.get(entity.toLowerCase()) || new Set();
    }
    
    getMemoriesByFile(fileRef) {
        // File 可能是子串查询，这里依然提供 fallback 匹配，真正的长路径可以用倒排
        const result = new Set();
        const refLower = fileRef.toLowerCase();
        for (const [key, memSet] of this.fileIndex.entries()) {
             if (key.includes(refLower)) {
                 memSet.forEach(id => result.add(id));
             }
        }
        return result;
    }
    
    getGraphEdges(memoryId) {
        return this.adjacencyList.get(memoryId) || new Set();
    }
    
    getSupersededBy(memoryId) {
        return this.supersedesChain.get(memoryId) || null;
    }
}

module.exports = IndexManager;
