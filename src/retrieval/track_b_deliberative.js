/**
 * @file brain_synapse/src/retrieval/track_b_deliberative.js
 * @description Track B: 精确验证引擎 - 时间有效性 + 冲突消解 + relevance-first 排序
 * @version 2.1.0
 * 
 * 核心能力：
 * - 时间有效性验证（timestamp_valid_from/to）
 * - 冲突消解（superseded_by 关系）
 * - 精确实体匹配
 * - file_reference 锚点查询
 * - relevance-first + hitType-aware 排序
 */

class TrackBDeliberative {
    /**
     * 创建精确验证引擎
     * @param {SynapseBackend} backend - 存储后端
     */
    constructor(backend) {
        this.backend = backend;
        this.conflictLog = [];
    }

    /**
     * 执行精确验证
     * @param {Array<Object>} candidates - 候选记忆列表（来自 Track A）
     * @param {Object} context - 验证上下文
     * @returns {Promise<Array<Object>>} 验证后的结果
     */
    async validate(candidates, context = {}) {
        const {
            currentTime = Date.now(),
            validateTemporalValidity = true,
            resolveConflicts = true,
            fileReference = null
        } = context;
        
        console.log(`[TrackB] Deliberative validation: ${candidates.length} candidates`);
        
        let validated = [...candidates];
        
        // 1. 时间有效性验证
        if (validateTemporalValidity) {
            validated = this._filterByTemporalValidity(validated, currentTime);
            console.log(`[TrackB] After temporal filter: ${validated.length} valid`);
        }
        
        // 2. 冲突消解
        if (resolveConflicts) {
            validated = this._resolveConflicts(validated);
            console.log(`[TrackB] After conflict resolution: ${validated.length} remaining`);
        }
        
        // 3. file_reference 过滤（如果指定）
        if (fileReference) {
            validated = this._filterByFileReference(validated, fileReference);
            console.log(`[TrackB] After file filter: ${validated.length} matching ${fileReference}`);
        }
        
        // 4. 精确排序
        validated = this._preciseSort(validated, context);
        
        return validated;
    }

    /**
     * 时间有效性过滤
     * @private
     * @param {Array<Object>} candidates - 候选列表
     * @param {number} currentTime - 当前时间
     * @returns {Array<Object>} 过滤后的列表
     */
    _filterByTemporalValidity(candidates, currentTime) {
        return candidates.filter(result => {
            const memory = result.memory;
            
            // 检查是否被取代
            if (memory.superseded_by) {
                result.validation_trace = 'superseded_by: ' + memory.superseded_by;
                return false;
            }
            
            // 检查时间有效性
            if (memory.timestamp_valid_to && memory.timestamp_valid_to < currentTime) {
                result.validation_trace = `expired: valid_to=${new Date(memory.timestamp_valid_to).toISOString()}`;
                return false;
            }
            
            if (memory.timestamp_valid_from && memory.timestamp_valid_from > currentTime) {
                result.validation_trace = `not_yet_valid: valid_from=${new Date(memory.timestamp_valid_from).toISOString()}`;
                return false;
            }
            
            result.validation_trace = 'temporal_valid';
            return true;
        });
    }

    /**
     * 冲突消解
     * @private
     * @param {Array<Object>} candidates - 候选列表
     * @returns {Array<Object>} 消解后的列表
     */
    _resolveConflicts(candidates) {
        // 按 ID 分组，找出冲突的记忆
        const grouped = {};
        
        candidates.forEach(result => {
            const memory = result.memory;
            const keyword = memory.content.keyword || memory.id;
            
            if (!grouped[keyword]) {
                grouped[keyword] = [];
            }
            grouped[keyword].push(result);
        });
        
        // 每组只保留最新的
        const resolved = [];
        
        Object.values(grouped).forEach(group => {
            if (group.length === 1) {
                resolved.push(group[0]);
            } else {
                // 排序：优先未失效的，然后按时间
                group.sort((a, b) => {
                    const memA = a.memory;
                    const memB = b.memory;
                    
                    // 优先选择未被取代的
                    if (memA.superseded_by && !memB.superseded_by) return 1;
                    if (!memA.superseded_by && memB.superseded_by) return -1;
                    
                    // 按创建时间排序（新的优先）
                    return (memB.created_at || 0) - (memA.created_at || 0);
                });
                
                // 只保留最好的
                resolved.push(group[0]);
                
                // 记录冲突日志
                if (group.length > 1) {
                    this.conflictLog.push({
                        timestamp: Date.now(),
                        keyword: group[0].memory.content.keyword,
                        candidates: group.length,
                        winner: group[0].memory.id
                    });
                }
            }
        });
        
        return resolved;
    }

    /**
     * 按 file_reference 过滤
     * @private
     * @param {Array<Object>} candidates - 候选列表
     * @param {string} fileReference - 文件引用
     * @returns {Array<Object>} 过滤后的列表
     */
    _filterByFileReference(candidates, fileReference) {
        return candidates.filter(result => {
            const memory = result.memory;
            
            if (!memory.provenance || !memory.provenance.file_reference) {
                return false;
            }
            
            return memory.provenance.file_reference.includes(fileReference);
        });
    }

    /**
     * 精确排序 - hitType-first with relevance override
     * 
     * 排序策略：
     * 1. 保持 hitType 优先级框架
     * 2. 增加翻盘机制：当 score 差异显著时，允许低优先级但高相关结果超越高优先级但低相关结果
     * 3. metadata 作为二级排序因子
     * 
     * @private
     * @param {Array<Object>} candidates - 候选列表
     * @param {Object} context - 上下文
     * @returns {Array<Object>} 排序后的列表
     */
    _preciseSort(candidates, context) {
        const hitTypePriority = {
            'exact': 5,
            'entity': 4,
            'file': 4,
            'anchor': 3,
            'spread': 2,
            'semantic': 1
        };
        
        const OVERRIDE_THRESHOLD = parseFloat(process.env.OVERRIDE_THRESHOLD) || 0.3;
        
        if (!context) context = {};
        if (!context.overrideStats) context.overrideStats = { triggered: 0, improved: 0, degraded: 0 };
        
        if (process.env.DEBUG_OVERRIDE === 'true' && candidates.length > 0) {
            console.log('[DEBUG] Candidates before sort:');
            candidates.slice(0, 5).forEach((c, i) => {
                console.log(`  [${i}] ${c.hitType} (priority=${hitTypePriority[c.hitType] || 2}), score=${(c.score || 0).toFixed(3)}`);
            });
        }
        
        return candidates.sort((a, b) => {
            const hitTypeA = a.hitType || 'spread';
            const hitTypeB = b.hitType || 'spread';
            const priorityA = hitTypePriority[hitTypeA] || 2;
            const priorityB = hitTypePriority[hitTypeB] || 2;
            
            const scoreA = a.score || 0;
            const scoreB = b.score || 0;
            
            if (priorityA !== priorityB) {
                const scoreDiff = Math.abs(scoreA - scoreB);
                let overrideTriggered = false;
                
                if (scoreA > scoreB + OVERRIDE_THRESHOLD && priorityA < priorityB) {
                    overrideTriggered = true;
                    if (process.env.DEBUG_OVERRIDE === 'true') {
                        console.log(`[DEBUG] Override: ${hitTypeA}(${scoreA.toFixed(3)}) > ${hitTypeB}(${scoreB.toFixed(3)}) + ${OVERRIDE_THRESHOLD}`);
                    }
                } else if (scoreB > scoreA + OVERRIDE_THRESHOLD && priorityB < priorityA) {
                    overrideTriggered = true;
                    if (process.env.DEBUG_OVERRIDE === 'true') {
                        console.log(`[DEBUG] Override: ${hitTypeB}(${scoreB.toFixed(3)}) > ${hitTypeA}(${scoreA.toFixed(3)}) + ${OVERRIDE_THRESHOLD}`);
                    }
                }
                
                if (overrideTriggered) {
                    context.overrideStats.triggered++;
                    return scoreB - scoreA;
                } else {
                    return priorityB - priorityA;
                }
            }
            
            if (Math.abs(scoreA - scoreB) > 0.05) {
                return scoreB - scoreA;
            }
            
            const memA = a.memory;
            const memB = b.memory;
            
            const confDiff = (memB.confidence || 0.5) - (memA.confidence || 0.5);
            if (Math.abs(confDiff) > 0.1) return confDiff;
            
            const recencyDiff = (memB.recency || 0.5) - (memA.recency || 0.5);
            if (Math.abs(recencyDiff) > 0.1) return recencyDiff;
            
            return (memB.access_count || 0) - (memA.access_count || 0);
        });
    }

    /**
     * 直接查询（不经过 Track A）
     * 
     * ⚠️ 注意：此方法为辅助 API，非主链路
     * - 主链路：recall() -> Track A -> Track B.validate()
     * - 此方法：直接查询，用于特殊场景（如按类型/实体/文件精确查询）
     * 
     * 性能说明：
     * - 优先使用 IndexManager 索引（O(1) 查找）
     * - 仅在索引不可用或需要全量扫描时才使用 getAll()
     * 
     * @param {Object} query - 查询条件
     * @returns {Promise<Array<Object>>}
     */
    async directQuery(query) {
        const {
            fileReference,
            memoryType,
            entity,
            timeRange
        } = query;
        
        const indexManager = this.backend.indexManager;
        const useIndex = indexManager && indexManager._isBuilt;
        let results = [];
        let queryTrace = {
            method: useIndex ? 'index' : 'full_scan',
            filters: [],
            indexHits: 0
        };
        
        // 策略：优先使用索引，避免全表扫描
        if (useIndex) {
            // 1. 文件引用查询 -> 使用 fileIndex
            if (fileReference) {
                const fileIds = indexManager.getMemoriesByFile(fileReference);
                queryTrace.filters.push({ type: 'file', value: fileReference, hits: fileIds.size });
                queryTrace.indexHits += fileIds.size;
                
                const memories = await this.backend.getAll();
                results = memories.filter(m => fileIds.has(m.id));
            }
            // 2. 实体查询 -> 使用 entityIndex
            else if (entity) {
                const entityIds = indexManager.getMemoriesByEntity(entity);
                queryTrace.filters.push({ type: 'entity', value: entity, hits: entityIds.size });
                queryTrace.indexHits += entityIds.size;
                
                const memories = await this.backend.getAll();
                results = memories.filter(m => entityIds.has(m.id));
            }
            // 3. 其他情况 -> 降级到全表扫描
            else {
                queryTrace.method = 'full_scan';
                results = await this.backend.getAll();
            }
        } else {
            // 索引不可用 -> 全表扫描
            queryTrace.method = 'full_scan_fallback';
            results = await this.backend.getAll();
        }
        
        // 按类型过滤
        if (memoryType) {
            const before = results.length;
            results = results.filter(m => m.memory_type === memoryType);
            queryTrace.filters.push({ type: 'memoryType', value: memoryType, hits: results.length, filtered: before - results.length });
        }
        
        // 按时间范围过滤
        if (timeRange) {
            const { startTime, endTime } = timeRange;
            const before = results.length;
            results = results.filter(m => {
                const validFrom = m.timestamp_valid_from || m.created_at || 0;
                const validTo = m.timestamp_valid_to || Infinity;
                return validFrom <= endTime && validTo >= startTime;
            });
            queryTrace.filters.push({ type: 'timeRange', hits: results.length, filtered: before - results.length });
        }
        
        console.log(`[TrackB] directQuery: method=${queryTrace.method}, results=${results.length}, trace=${JSON.stringify(queryTrace)}`);
        
        // 包装为结果格式
        return results.map(memory => ({
            memory,
            score: 1.0,
            source: 'track_b_direct',
            queryTrace
        }));
    }

    /**
     * 获取冲突日志
     * @returns {Array<Object>}
     */
    getConflictLog() {
        return this.conflictLog;
    }

    /**
     * 清除冲突日志
     */
    clearConflictLog() {
        this.conflictLog = [];
    }
}

module.exports = TrackBDeliberative;
