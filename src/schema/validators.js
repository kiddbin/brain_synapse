/**
 * @file brain_synapse/src/schema/validators.js
 * @description MemoryItem 验证器
 * @version 2.0.0
 */

const REQUIRED_FIELDS = ['id', 'memory_type', 'content', 'created_at'];
const VALID_MEMORY_TYPES = ['general', 'experience', 'episodic', 'semantic', 'procedural', 'failed_attempt', 'reflective'];

/**
 * 验证 MemoryItem
 * @param {Object} memory - 记忆项
 * @returns {{valid: boolean, errors: Array<string>}}
 */
function validateMemoryItem(memory) {
    const errors = [];
    
    // 必填字段检查
    REQUIRED_FIELDS.forEach(field => {
        if (!memory[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    });
    
    // memory_type 枚举验证
    if (memory.memory_type && !VALID_MEMORY_TYPES.includes(memory.memory_type)) {
        errors.push(`Invalid memory_type: ${memory.memory_type}. Must be one of: ${VALID_MEMORY_TYPES.join(', ')}`);
    }
    
    // 数值范围验证
    if (memory.confidence !== undefined && (memory.confidence < 0 || memory.confidence > 1)) {
        errors.push('confidence must be between 0 and 1');
    }
    
    if (memory.salience !== undefined && (memory.salience < 0 || memory.salience > 1)) {
        errors.push('salience must be between 0 and 1');
    }
    
    // 时间有效性验证
    if (memory.timestamp_valid_from && memory.timestamp_valid_to) {
        if (memory.timestamp_valid_to < memory.timestamp_valid_from) {
            errors.push('timestamp_valid_to must be >= timestamp_valid_from');
        }
    }
    
    // 冲突关系验证
    if (memory.supersedes && memory.superseded_by) {
        errors.push('memory cannot both supersede and be superseded');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 创建 MemoryItem 的默认值
 * @param {string} memoryType - 记忆类型
 * @returns {Object}
 */
function createDefault(memoryType = 'general') {
    return {
        memory_type: memoryType,
        content: {},
        timestamp_valid_from: Date.now(),
        timestamp_valid_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        confidence: 0.5,
        salience: 0.5,
        recency: 1.0,
        access_count: 0,
        linked_entities: [],
        supersedes: null,
        superseded_by: null,
        provenance: null,
        embedding_refs: [],
        symbolic_tags: [],
        pinned: false,
        weight: 1.0
    };
}

module.exports = {
    validateMemoryItem,
    REQUIRED_FIELDS,
    VALID_MEMORY_TYPES,
    createDefault
};
