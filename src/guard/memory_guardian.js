/**
 * @file brain_synapse/src/guard/memory_guardian.js
 * @description 记忆守卫 - 系统级记忆验证机制
 * @version 1.0.0
 * 
 * 核心功能：
 * 1. 强制 recall 守卫 - 遇到长期记忆问题必须先查 brain_synapse
 * 2. 写入验证闭环 - 写入后必须回读验证成功才能说"已记住"
 * 3. 无证据禁止承诺 - 没有验证证据不能输出"已记住/已固化"
 * 4. 诊断日志 - 结构化日志证明系统走了记忆链路
 */

const fs = require('fs');
const path = require('path');

// 诊断日志文件
const DIAGNOSTIC_LOG_FILE = path.join(__dirname, '../../memory_guardian_log.json');

// 长期记忆问题关键词模式
const LONG_TERM_MEMORY_PATTERNS = [
    // 1. 直接询问记忆
    /记住.*吗/i,
    /还记得.*吗/i,
    /记得.*吗/i,
    /有印象.*吗/i,
    
    // 2. 询问过去约定/计划
    /.*计划.*是什么/i,
    /.*约定.*是什么/i,
    /.*协议.*是什么/i,
    /.*暗号.*是什么/i,
    /.*代号.*是什么/i,
    
    // 3. 询问历史承诺
    /上次.*说.*什么/i,
    /之前.*答应.*什么/i,
    /之前.*承诺.*什么/i,
    /之前.*约定.*什么/i,
    /我们.*约定.*什么/i,
    
    // 4. 询问用户偏好
    /喜欢.*什么/i,
    /偏好.*什么/i,
    /习惯.*什么/i,
    
    // 5. 要求记住
    /记住.*这句话/i,
    /记住.*这个/i,
    /记住.*以下/i,
    /保存.*这个/i,
    /保存.*记忆/i,
    
    // 6. 长期记忆相关
    /长期记忆/i,
    /历史记忆/i,
    /过去的.*记忆/i,
    
    // 7. 验证性询问
    /我说过.*什么/i,
    /我们.*过.*什么/i,
];

// 承诺性表述模式
const COMMITMENT_PATTERNS = [
    /已记住/i,
    /已固化/i,
    /已写入.*记忆/i,
    /下次.*会记得/i,
    /已经.*保存/i,
    /已经.*记住/i,
    /已经.*固化/i,
    /这个.*不会丢/i,
    /放心.*记得/i,
];

/**
 * 记忆守卫类
 */
class MemoryGuardian {
    constructor(options = {}) {
        this.options = {
            enableDiagnosticLog: true,
            logFilePath: DIAGNOSTIC_LOG_FILE,
            maxLogEntries: 1000,
            ...options
        };
        
        this.diagnosticLog = this._loadDiagnosticLog();
        this.lastRecallResult = null;
        this.lastWriteVerification = null;
    }
    
    /**
     * 判断是否为长期记忆问题
     * @param {string} query - 用户查询
     * @returns {boolean}
     */
    isLongTermMemoryQuestion(query) {
        const isMatch = LONG_TERM_MEMORY_PATTERNS.some(pattern => pattern.test(query));
        
        this._logDiagnostic({
            type: 'intent_classification',
            query,
            isLongTermMemoryQuestion: isMatch,
            timestamp: Date.now()
        });
        
        return isMatch;
    }
    
    /**
     * 检查是否包含承诺性表述
     * @param {string} response - 模型回复
     * @returns {boolean}
     */
    containsCommitmentStatement(response) {
        return COMMITMENT_PATTERNS.some(pattern => pattern.test(response));
    }
    
    /**
     * 验证是否有记忆证据
     * @param {Object} recallResult - recall 结果
     * @param {string} originalQuery - 原始查询（可选，用于更严格的匹配）
     * @returns {Object} 验证结果
     * 
     * 2026-03-09 优化：放松证据匹配逻辑，支持以下有效证据条件：
     * 1. 关键词直接命中（查询包含关键词）
     * 2. 查询词与 memory keyword 高相似（编辑距离或包含关系）
     * 3. 最近写入 + 查询词相关（时间窗口内）
     * 4. 命中结果中包含明确 rule/response 映射
     */
    verifyMemoryEvidence(recallResult, originalQuery = null) {
        if (!recallResult) {
            return {
                hasEvidence: false,
                reason: 'no_recall_result',
                message: '未执行记忆检索'
            };
        }
        
        const memories = recallResult.results || [];
        
        if (memories.length === 0) {
            return {
                hasEvidence: false,
                reason: 'no_memories_found',
                message: '未在已验证记忆中找到'
            };
        }
        
        // 检查是否有有效的记忆内容
        const validMemories = memories.filter(m => 
            m.memory && (
                m.memory.content || 
                m.memory.rule || 
                m.memory.keyword
            )
        );
        
        if (validMemories.length === 0) {
            return {
                hasEvidence: false,
                reason: 'no_valid_content',
                message: '记忆内容为空'
            };
        }
        
        // 如果提供了原始查询，进行智能匹配检查（优化后的放松逻辑）
        if (originalQuery) {
            const queryLower = originalQuery.toLowerCase();
            const queryKeywords = queryLower.split(/[\s,，.。!！?？:：]+/).filter(k => k.length >= 2);
            
            const hasEvidence = validMemories.some(m => {
                const memory = m.memory;
                const content = JSON.stringify(memory.content).toLowerCase();
                const keyword = (memory.content?.keyword || memory.keyword || '').toLowerCase();
                const rule = (memory.content?.rule || memory.rule || '').toLowerCase();
                
                // 条件 1：查询直接包含关键词（如"火星计划是什么"包含"火星计划"）
                if (keyword && queryLower.includes(keyword)) {
                    return true;
                }
                
                // 条件 2：关键词包含查询的核心词（如"火星计划"被"火星"查询命中）
                if (keyword && keyword.includes(queryLower.replace(/是什么|什么意思|怎么样/g, '').trim())) {
                    return true;
                }
                
                // 条件 3：高相似度匹配 - 查询关键词与记忆关键词有重叠
                const keywordParts = keyword.split(/[\s,，.。!！?？:：]+/).filter(k => k.length >= 2);
                const hasOverlap = queryKeywords.some(qk => 
                    keywordParts.some(kp => kp.includes(qk) || qk.includes(kp))
                );
                if (hasOverlap) {
                    return true;
                }
                
                // 条件 4：内容包含查询核心词
                const coreQuery = queryLower.replace(/是什么|什么意思|怎么样|吗|呢/g, '').trim();
                if (coreQuery.length >= 2 && (content.includes(coreQuery) || rule.includes(coreQuery))) {
                    return true;
                }
                
                // 条件 5：高置信度召回（Top 3 且分数 > 0.4）
                if (m.score > 0.4 && m.source === 'track_a_intuitive') {
                    return true;
                }
                
                return false;
            });
            
            if (!hasEvidence) {
                return {
                    hasEvidence: false,
                    reason: 'no_relaxed_match',
                    message: '未找到与查询相关的有效记忆证据',
                    partialEvidence: {
                        memoryCount: validMemories.length,
                        message: '找到相关记忆，但不匹配查询意图'
                    }
                };
            }
        }
        
        return {
            hasEvidence: true,
            reason: 'evidence_found',
            message: `找到 ${validMemories.length} 条已验证记忆`,
            evidence: {
                memoryCount: validMemories.length,
                topMemory: validMemories[0].memory,
                confidence: recallResult.confidence || 0
            }
        };
    }
    
    /**
     * 验证写入后回读
     * @param {string} writeQuery - 写入的关键词
     * @param {Object} recallResult - 回读结果
     * @param {Object} writtenData - 写入的数据
     * @returns {Object} 验证结果
     */
    verifyWriteBack(writeQuery, recallResult, writtenData) {
        const verification = {
            writeQuery,
            timestamp: Date.now(),
            success: false,
            reason: '',
            details: {}
        };
        
        if (!recallResult) {
            verification.reason = 'no_recall_executed';
            verification.details.message = '未执行回读验证';
            return verification;
        }
        
        const memories = recallResult.results || [];
        
        if (memories.length === 0) {
            verification.reason = 'no_memories_recalled';
            verification.details.message = '回读未命中任何记忆';
            return verification;
        }
        
        // 检查是否包含写入的内容
        const foundTarget = memories.some(m => {
            const memory = m.memory;
            if (!memory || !memory.content) return false;
            
            // 检查关键词匹配
            if (memory.content.keyword === writeQuery) {
                return true;
            }
            
            // 检查内容包含
            if (writtenData && JSON.stringify(memory.content).includes(JSON.stringify(writtenData))) {
                return true;
            }
            
            return false;
        });
        
        if (foundTarget) {
            verification.success = true;
            verification.reason = 'verification_passed';
            verification.details.message = '回读验证成功';
            verification.details.matchedMemories = memories.filter(m => 
                m.memory && m.memory.content && (
                    m.memory.content.keyword === writeQuery ||
                    JSON.stringify(m.memory.content).includes(JSON.stringify(writtenData || {}))
                )
            ).map(m => ({
                id: m.memory.id,
                keyword: m.memory.content.keyword,
                content: m.memory.content
            }));
        } else {
            verification.reason = 'target_not_found';
            verification.details.message = '回读未找到目标内容';
        }
        
        this.lastWriteVerification = verification;
        return verification;
    }
    
    /**
     * 生成守卫响应（当 recall 未命中时）
     * @param {string} query - 用户查询
     * @returns {string} 响应文本
     */
    generateGuardResponse(query) {
        const responses = [
            `关于"${query}"，我在已验证记忆中没有找到相关信息。这可能是因为我们还没有讨论过，或者我的记忆系统没有保存这个信息。`,
            `我检索了所有已验证的记忆，但没有找到关于"${query}"的记录。如果您之前提到过，可能需要重新告诉我一次。`,
            `根据我的已验证记忆，我没有关于"${query}"的信息。我的记忆系统显示这是未命中的查询。`
        ];
        
        // 随机选择一个响应
        return responses[Math.floor(Math.random() * responses.length)];
    }
    
    /**
     * 验证承诺表述是否合法
     * @param {string} response - 模型回复
     * @param {Object} evidence - 记忆证据
     * @returns {Object} 验证结果
     */
    validateCommitmentStatement(response, evidence) {
        const containsCommitment = this.containsCommitmentStatement(response);
        
        if (!containsCommitment) {
            return {
                valid: true,
                reason: 'no_commitment_statement'
            };
        }
        
        // 包含承诺表述，需要检查证据
        if (!evidence || !evidence.hasEvidence) {
            return {
                valid: false,
                reason: 'commitment_without_evidence',
                message: '承诺性表述缺乏记忆证据支持'
            };
        }
        
        return {
            valid: true,
            reason: 'commitment_with_evidence',
            evidence: evidence.evidence
        };
    }
    
    /**
     * 记录诊断日志
     * @param {Object} entry - 日志条目
     */
    _logDiagnostic(entry) {
        if (!this.options.enableDiagnosticLog) {
            return;
        }
        
        this.diagnosticLog.push(entry);
        
        // 限制日志大小
        if (this.diagnosticLog.length > this.options.maxLogEntries) {
            this.diagnosticLog = this.diagnosticLog.slice(-this.options.maxLogEntries);
        }
        
        // 异步保存
        this._saveDiagnosticLog();
    }
    
    /**
     * 加载诊断日志
     * @returns {Array}
     */
    _loadDiagnosticLog() {
        try {
            if (fs.existsSync(this.options.logFilePath)) {
                const raw = fs.readFileSync(this.options.logFilePath, 'utf8');
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn('[MemoryGuardian] Failed to load diagnostic log:', e.message);
        }
        return [];
    }
    
    /**
     * 保存诊断日志
     */
    _saveDiagnosticLog() {
        try {
            const tmpFile = `${this.options.logFilePath}.tmp.${Date.now()}`;
            fs.writeFileSync(tmpFile, JSON.stringify(this.diagnosticLog, null, 2), 'utf8');
            fs.renameSync(tmpFile, this.options.logFilePath);
        } catch (e) {
            console.warn('[MemoryGuardian] Failed to save diagnostic log:', e.message);
        }
    }
    
    /**
     * 获取诊断日志
     * @returns {Array}
     */
    getDiagnosticLog() {
        return this.diagnosticLog;
    }
    
    /**
     * 清除诊断日志
     */
    clearDiagnosticLog() {
        this.diagnosticLog = [];
        this._saveDiagnosticLog();
    }
    
    /**
     * 获取守卫状态
     * @returns {Object}
     */
    getStatus() {
        return {
            lastRecallResult: this.lastRecallResult ? {
                resultCount: this.lastRecallResult.results?.length || 0,
                confidence: this.lastRecallResult.confidence || 0
            } : null,
            lastWriteVerification: this.lastWriteVerification,
            diagnosticLogSize: this.diagnosticLog.length
        };
    }
}

module.exports = MemoryGuardian;
