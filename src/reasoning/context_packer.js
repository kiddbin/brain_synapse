/**
 * @file brain_synapse/src/reasoning/context_packer.js
 * @description Layer 4: Context Packer - 将 recall 结果打包为 agent-ready bundle
 * @version 2.1.0
 * 
 * 核心功能：
 * 1. Memory Bundle 组装
 * 2. Token 预算打包
 * 3. Stale/Conflict-aware Packaging
 * 4. Coding-Agent 场景模板
 * 5. Trace of Bundle Composition
 */

class ContextPacker {
    /**
     * 创建 Context Packer
     * @param {Object} options - 配置选项
     */
    constructor(options = {}) {
        this.options = {
            // Token 预算
            maxTokens: options.maxTokens || 4000,
            
            // 记忆数量限制
            maxMemories: options.maxMemories || 20,
            
            // 是否包含冲突说明
            includeConflicts: options.includeConflicts !== false,
            
            // 是否包含过期警告
            includeStaleWarnings: options.includeStaleWarnings !== false,
            
            // 是否包含组装追踪
            includeComposition: options.includeComposition !== false
        };
    }

    /**
     * 打包 RecallResult 为 MemoryBundle
     * @param {Object} recallResult - RecallResult 对象
     * @param {Object} context - 上下文（可覆盖实例配置）
     * @returns {Object} MemoryBundle
     */
    pack(recallResult, context = {}) {
        const startTime = Date.now();
        
        const effectiveOptions = {
            ...this.options,
            maxTokens: context.maxTokens ?? this.options.maxTokens,
            maxMemories: context.maxMemories ?? this.options.maxMemories
        };
        
        // 1. 提取原始记忆
        const rawMemories = recallResult.getMemories ? recallResult.getMemories() : 
                           (recallResult.results || []).map(r => r.memory);
        
        // 2. 过滤和排序
        const filteredMemories = this._filterAndSort(rawMemories, context, effectiveOptions);
        
        // 3. 检测冲突和过期
        const conflicts = this._detectConflicts(filteredMemories);
        const staleWarnings = this._detectStale(filteredMemories);
        
        // 4. Token 预算打包
        const packedMemories = this._packWithTokenBudget(filteredMemories, conflicts, staleWarnings, effectiveOptions);
        
        // 5. 生成摘要
        const summary = this._generateSummary(packedMemories, conflicts, staleWarnings);
        
        // 6. 构建 Bundle
        const bundle = {
            summary,
            memories: packedMemories,
            conflicts: this.options.includeConflicts ? conflicts : [],
            staleWarnings: this.options.includeStaleWarnings ? staleWarnings : [],
            tokenCount: this._estimateTokens(packedMemories, conflicts, staleWarnings),
            composition: this.options.includeComposition ? {
                source: 'recall',
                query: recallResult.query,
                originalCount: rawMemories.length,
                packedCount: packedMemories.length,
                excludedCount: rawMemories.length - packedMemories.length,
                maxTokens: effectiveOptions.maxTokens,
                filters: context.filters || [],
                packerVersion: '2.2.0',
                timestamp: Date.now(),
                latency: Date.now() - startTime
            } : null
        };
        
        console.log(`[ContextPacker] Packed ${rawMemories.length} -> ${packedMemories.length} memories, ${bundle.tokenCount} tokens (budget: ${effectiveOptions.maxTokens})`);
        
        return bundle;
    }

    /**
     * 过滤和排序记忆
     * @private
     * @param {Array<Object>} memories - 记忆列表
     * @param {Object} context - 上下文
     * @param {Object} options - 有效配置
     * @returns {Array<Object>}
     */
    _filterAndSort(memories, context, options = this.options) {
        let filtered = [...memories];
        
        // 过滤掉被取代的记忆
        filtered = filtered.filter(m => !m.superseded_by);
        
        // 过滤掉失效的记忆
        filtered = filtered.filter(m => {
            if (m.timestamp_valid_to && m.timestamp_valid_to < Date.now()) {
                return false;
            }
            return true;
        });
        
        // 排序：置信度 > 权重 > 近因性
        filtered.sort((a, b) => {
            const confDiff = (b.confidence || 0.5) - (a.confidence || 0.5);
            if (Math.abs(confDiff) > 0.1) return confDiff;
            
            const weightDiff = (b.weight || 1.0) - (a.weight || 1.0);
            if (Math.abs(weightDiff) > 0.1) return weightDiff;
            
            return (b.recency || 0.5) - (a.recency || 0.5);
        });
        
        return filtered.slice(0, options.maxMemories);
    }

    /**
     * 检测冲突
     * @private
     * @param {Array<Object>} memories - 记忆列表
     * @returns {Array<Object>}
     */
    _detectConflicts(memories) {
        const conflicts = [];
        const grouped = {};
        
        // 按关键词分组
        memories.forEach(m => {
            const keyword = m.content?.keyword || m.id;
            if (!grouped[keyword]) {
                grouped[keyword] = [];
            }
            grouped[keyword].push(m);
        });
        
        // 检测冲突
        Object.entries(grouped).forEach(([keyword, group]) => {
            if (group.length > 1) {
                // 检查是否有矛盾
                const rules = group.map(m => m.content?.rule || '').filter(r => r);
                const hasContradiction = this._checkContradiction(rules);
                
                if (hasContradiction) {
                    conflicts.push({
                        keyword,
                        memories: group.map(m => ({
                            id: m.id,
                            rule: m.content?.rule,
                            timestamp: m.timestamp_valid_from || m.created_at
                        })),
                        type: 'contradiction',
                        recommendation: '使用最新的记忆'
                    });
                }
            }
        });
        
        return conflicts;
    }

    /**
     * 检查矛盾
     * @private
     * @param {Array<string>} rules - 规则列表
     * @returns {boolean}
     */
    _checkContradiction(rules) {
        const opposites = [
            ['必须', '禁止'],
            ['使用', '不使用'],
            ['开启', '关闭'],
            ['增加', '减少'],
            ['true', 'false'],
            ['是', '否']
        ];
        
        for (const [pos, neg] of opposites) {
            const hasPos = rules.some(r => r.includes(pos));
            const hasNeg = rules.some(r => r.includes(neg));
            if (hasPos && hasNeg) return true;
        }
        
        return false;
    }

    /**
     * 检测过期
     * @private
     * @param {Array<Object>} memories - 记忆列表
     * @returns {Array<Object>}
     */
    _detectStale(memories) {
        const staleWarnings = [];
        const now = Date.now();
        const staleThreshold = 30 * 24 * 60 * 60 * 1000; // 30 天
        
        memories.forEach(m => {
            const lastUpdate = m.updated_at || m.created_at || 0;
            const daysSinceUpdate = (now - lastUpdate) / (24 * 60 * 60 * 1000);
            
            if (daysSinceUpdate > 30) {
                staleWarnings.push({
                    id: m.id,
                    keyword: m.content?.keyword,
                    daysSinceUpdate: Math.floor(daysSinceUpdate),
                    lastUpdate: new Date(lastUpdate).toISOString(),
                    warning: '此记忆可能已过期'
                });
            }
        });
        
        return staleWarnings;
    }

    /**
     * Token 预算打包
     * @private
     * @param {Array<Object>} memories - 记忆列表
     * @param {Array<Object>} conflicts - 冲突列表
     * @param {Array<Object>} staleWarnings - 过期警告
     * @param {Object} options - 有效配置
     * @returns {Array<Object>}
     */
    _packWithTokenBudget(memories, conflicts, staleWarnings, options = this.options) {
        const packed = [];
        const excluded = [];
        let currentTokens = 0;
        
        // 预留冲突和警告的 Token
        const conflictTokens = this._estimateArrayTokens(conflicts);
        const staleTokens = this._estimateArrayTokens(staleWarnings);
        const reservedTokens = conflictTokens + staleTokens + 200; // 200 for summary
        
        const availableTokens = options.maxTokens - reservedTokens;
        
        for (const memory of memories) {
            const memoryTokens = this._estimateMemoryTokens(memory);
            
            if (currentTokens + memoryTokens <= availableTokens) {
                packed.push(this._compactMemory(memory));
                currentTokens += memoryTokens;
            } else {
                excluded.push({
                    id: memory.id,
                    reason: 'token_budget_exceeded',
                    requiredTokens: memoryTokens,
                    remainingBudget: availableTokens - currentTokens
                });
            }
        }
        
        if (excluded.length > 0) {
            console.log(`[ContextPacker] Excluded ${excluded.length} memories due to token budget`);
        }
        
        return packed;
    }

    /**
     * 压缩记忆 - 根据不同 memory_type 提取关键字段
     * @private
     * @param {Object} memory - 记忆
     * @returns {Object}
     */
    _compactMemory(memory) {
        const compacted = {
            id: memory.id,
            type: memory.memory_type,
            file: memory.provenance?.file_reference,
            confidence: memory.confidence,
            timestamp: memory.timestamp_valid_from || memory.created_at
        };
        
        // 根据 memory_type 提取不同的 content 字段
        switch (memory.memory_type) {
            case 'failed_attempt':
                compacted.keyword = memory.content?.bug || memory.content?.keyword || memory.id;
                compacted.rule = memory.content?.error 
                    ? `尝试 "${memory.content?.attempted || '未知方案'}" 失败：${memory.content.error}`
                    : memory.content?.attempted || '失败尝试';
                compacted.attempted = memory.content?.attempted;
                compacted.error = memory.content?.error;
                compacted.bug = memory.content?.bug;
                break;
                
            case 'procedural':
                compacted.keyword = memory.content?.keyword || memory.content?.bug || memory.id;
                compacted.rule = memory.content?.solution || memory.content?.rule || memory.id;
                compacted.solution = memory.content?.solution;
                break;
                
            case 'episodic':
                compacted.keyword = memory.content?.keyword || memory.id;
                compacted.rule = memory.content?.rule || memory.content?.description || memory.id;
                break;
                
            case 'reflective':
                compacted.keyword = memory.content?.keyword || memory.id;
                compacted.rule = memory.content?.rule || memory.content?.reason || memory.id;
                break;
                
            case 'semantic':
            default:
                compacted.keyword = memory.content?.keyword || memory.id;
                compacted.rule = memory.content?.rule || memory.id;
                break;
        }
        
        return compacted;
    }

    /**
     * 估算 Memory Token 数
     * @private
     * @param {Object} memory - 记忆
     * @returns {number}
     */
    _estimateMemoryTokens(memory) {
        const text = JSON.stringify(this._compactMemory(memory));
        // 粗略估算：中文约 1.5 字符/token，英文约 4 字符/token
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars / 1.5 + otherChars / 4);
    }

    /**
     * 估算数组 Token 数
     * @private
     * @param {Array} arr - 数组
     * @returns {number}
     */
    _estimateArrayTokens(arr) {
        if (!arr || arr.length === 0) return 0;
        const text = JSON.stringify(arr);
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars / 1.5 + otherChars / 4);
    }

    /**
     * 估算总 Token 数
     * @private
     * @param {Array} memories - 记忆列表
     * @param {Array} conflicts - 冲突列表
     * @param {Array} staleWarnings - 过期警告
     * @returns {number}
     */
    _estimateTokens(memories, conflicts, staleWarnings) {
        return this._estimateArrayTokens(memories) + 
               this._estimateArrayTokens(conflicts) + 
               this._estimateArrayTokens(staleWarnings) + 
               200; // summary overhead
    }

    /**
     * 生成摘要
     * @private
     * @param {Array} memories - 记忆列表
     * @param {Array} conflicts - 冲突列表
     * @param {Array} staleWarnings - 过期警告
     * @returns {string}
     */
    _generateSummary(memories, conflicts, staleWarnings) {
        const parts = [];
        
        parts.push(`找到 ${memories.length} 条相关记忆`);
        
        if (conflicts.length > 0) {
            parts.push(`，${conflicts.length} 个潜在冲突`);
        }
        
        if (staleWarnings.length > 0) {
            parts.push(`，${staleWarnings.length} 条可能过期`);
        }
        
        // 提取主要关键词
        const keywords = [...new Set(
            memories
                .map(m => m.keyword)
                .filter(k => k)
                .slice(0, 5)
        )];
        
        if (keywords.length > 0) {
            parts.push(`。主要涉及：${keywords.join('、')}`);
        }
        
        return parts.join('');
    }

    /**
     * 生成 Agent Prompt
     * @param {Object} bundle - MemoryBundle
     * @param {string} template - 模板类型
     * @returns {string}
     */
    generatePrompt(bundle, template = 'default') {
        const templates = {
            default: this._defaultTemplate,
            coding_agent: this._codingAgentTemplate,
            bugfix: this._bugfixTemplate,
            config_query: this._configQueryTemplate
        };
        
        const generator = templates[template] || templates.default;
        return generator.call(this, bundle);
    }

    /**
     * 默认模板
     * @private
     */
    _defaultTemplate(bundle) {
        const lines = [];
        
        lines.push(`## 记忆检索结果\n`);
        lines.push(bundle.summary);
        lines.push('');
        
        if (bundle.memories.length > 0) {
            lines.push(`### 相关记忆\n`);
            bundle.memories.forEach((m, i) => {
                lines.push(`${i + 1}. **${m.keyword || m.id}**: ${m.rule || '(无内容)'}`);
                if (m.file) {
                    lines.push(`   - 文件: ${m.file}`);
                }
            });
            lines.push('');
        }
        
        if (bundle.conflicts.length > 0) {
            lines.push(`### ⚠️ 冲突警告\n`);
            bundle.conflicts.forEach(c => {
                lines.push(`- **${c.keyword}**: 存在 ${c.memories.length} 条矛盾记忆`);
            });
            lines.push('');
        }
        
        if (bundle.staleWarnings.length > 0) {
            lines.push(`### ⏰ 过期提醒\n`);
            bundle.staleWarnings.forEach(s => {
                lines.push(`- **${s.keyword}**: 已 ${s.daysSinceUpdate} 天未更新`);
            });
            lines.push('');
        }
        
        return lines.join('\n');
    }

    /**
     * Coding Agent 模板 - 为编码助手设计
     * @private
     */
    _codingAgentTemplate(bundle) {
        const lines = [];
        
        lines.push(`## Coding Agent 记忆上下文\n`);
        lines.push(`> ${bundle.summary}\n`);
        
        // 分类记忆
        const failedAttempts = bundle.memories.filter(m => m.type === 'failed_attempt');
        const solutions = bundle.memories.filter(m => m.type === 'procedural');
        const configs = bundle.memories.filter(m => 
            (m.keyword && (m.keyword.includes('配置') || m.keyword.includes('超时'))) ||
            (m.type === 'semantic' && m.rule && (m.rule.includes('配置') || m.rule.includes('超时')))
        );
        const others = bundle.memories.filter(m => 
            m.type !== 'failed_attempt' && 
            m.type !== 'procedural' && 
            !configs.includes(m)
        );
        
        if (failedAttempts.length > 0) {
            lines.push(`### ❌ 失败尝试（避免重复）\n`);
            failedAttempts.forEach(m => {
                if (m.bug && m.attempted) {
                    lines.push(`- **${m.bug}**: 尝试 "${m.attempted}" 失败`);
                    if (m.error) lines.push(`  - 错误: ${m.error}`);
                } else {
                    lines.push(`- **${m.keyword}**: ${m.rule}`);
                }
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (solutions.length > 0) {
            lines.push(`### ✅ 成功方案\n`);
            solutions.forEach(m => {
                lines.push(`- **${m.keyword}**: ${m.solution || m.rule}`);
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (configs.length > 0) {
            lines.push(`### ⚙️ 配置信息\n`);
            configs.forEach(m => {
                lines.push(`- **${m.keyword}**: ${m.rule}`);
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (others.length > 0) {
            lines.push(`### 📝 其他相关\n`);
            others.forEach(m => {
                lines.push(`- **${m.keyword}**: ${m.rule}`);
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (bundle.conflicts.length > 0) {
            lines.push(`### ⚠️ 注意：存在冲突\n`);
            bundle.conflicts.forEach(c => {
                lines.push(`- **${c.keyword}**: ${c.recommendation}`);
            });
            lines.push('');
        }
        
        return lines.join('\n');
    }

    /**
     * Bugfix 模板 - 专为调试场景设计
     * @private
     */
    _bugfixTemplate(bundle) {
        const lines = [];
        
        lines.push(`## Bugfix 记忆上下文\n`);
        
        const failedAttempts = bundle.memories.filter(m => m.type === 'failed_attempt');
        const solutions = bundle.memories.filter(m => m.type === 'procedural');
        const others = bundle.memories.filter(m => m.type !== 'failed_attempt' && m.type !== 'procedural');
        
        if (failedAttempts.length > 0) {
            lines.push(`### ❌ 已尝试但失败的方案（避免重复）\n`);
            failedAttempts.forEach(m => {
                if (m.bug && m.attempted) {
                    lines.push(`- **${m.bug}**: 尝试 "${m.attempted}" 失败`);
                    if (m.error) lines.push(`  - 错误: ${m.error}`);
                } else {
                    lines.push(`- ❌ ${m.keyword}: ${m.rule}`);
                }
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (solutions.length > 0) {
            lines.push(`### ✅ 已验证的成功方案\n`);
            solutions.forEach(m => {
                lines.push(`- **${m.keyword}**: ${m.solution || m.rule}`);
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        if (others.length > 0) {
            lines.push(`### 📝 相关信息\n`);
            others.forEach(m => {
                lines.push(`- **${m.keyword}**: ${m.rule}`);
                if (m.file) lines.push(`  - 位置: ${m.file}`);
            });
            lines.push('');
        }
        
        return lines.join('\n');
    }

    /**
     * 配置查询模板
     * @private
     */
    _configQueryTemplate(bundle) {
        const lines = [];
        
        lines.push(`## 配置查询结果\n`);
        
        bundle.memories.forEach(m => {
            lines.push(`- **${m.keyword}**: ${m.rule}`);
            if (m.timestamp) {
                const date = new Date(m.timestamp);
                lines.push(`  - 生效时间: ${date.toLocaleDateString()}`);
            }
        });
        
        if (bundle.staleWarnings.length > 0) {
            lines.push(`\n### ⚠️ 以下配置可能已过期\n`);
            bundle.staleWarnings.forEach(s => {
                lines.push(`- ${s.keyword}: 已 ${s.daysSinceUpdate} 天未更新`);
            });
        }
        
        return lines.join('\n');
    }
}

module.exports = ContextPacker;
