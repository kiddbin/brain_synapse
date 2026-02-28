/**
 * @file brain_synapse/observer.js
 * @description 观察者模式实现 - 读写分离架构
 * @version 2.0.0
 * 
 * ==================== 功能说明 ====================
 * 
 * 本模块实现观察者模式，用于自动识别用户行为模式并创建"本能"(Instincts)。
 * 
 * 读写分离架构：
 * - 极速写：recordObservation() 只做同步追加到 observations.jsonl
 * - 重度算：performBatchAnalysis() 在 distill 时被调用，分析并生成 pinned 规则
 * 
 * 观察类型：
 * - user_correction: 用户纠正模式
 * - error_resolution: 错误解决模式
 * - workflow: 工作流模式
 * - tool_preference: 工具偏好模式
 */

const fs = require('fs');
const path = require('path');

class ObserverPattern {
    constructor() {
        this.workspaceRoot = path.resolve(__dirname, '../..');
        this.observationsFile = path.join(__dirname, 'observations.jsonl');
        this.instinctsDir = path.join(__dirname, 'instincts');
        
        this.WEIGHTS_FILE = path.join(__dirname, 'synapse_weights.json');
        this.LOCK_FILE = path.join(__dirname, '.observer.lock');
        
        if (!fs.existsSync(this.instinctsDir)) {
            fs.mkdirSync(this.instinctsDir, { recursive: true });
        }
        
        this.instincts = this.loadInstincts();
    }

    /**
     * 简单的文件锁机制（避免 JSON 并发写入损坏）
     */
    acquireLock(maxRetries = 5, delayMs = 50) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                if (!fs.existsSync(this.LOCK_FILE)) {
                    fs.writeFileSync(this.LOCK_FILE, Date.now().toString(), 'utf8');
                    return true;
                }
            } catch (e) {
                // 锁文件被占用，等待
            }
            if (i < maxRetries - 1) {
                const start = Date.now();
                while (Date.now() - start < delayMs) { /* busy wait */ }
            }
        }
        return false;
    }

    releaseLock() {
        try {
            if (fs.existsSync(this.LOCK_FILE)) {
                fs.unlinkSync(this.LOCK_FILE);
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * 极速写：只做同步追加到文件
     * @param {Object} observation - 观察数据
     */
    recordObservation(observation) {
        const timestamp = new Date().toISOString();
        const observationRecord = {
            ...observation,
            timestamp: timestamp,
            id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        const observationLine = JSON.stringify(observationRecord) + '\n';
        
        try {
            fs.appendFileSync(this.observationsFile, observationLine, 'utf8');
        } catch (error) {
            console.error(`[Observer] 记录观察失败: ${error.message}`);
        }
        
        return observationRecord.id;
    }

    /**
     * 获取观察记录数量
     */
    getObservationCount() {
        try {
            if (!fs.existsSync(this.observationsFile)) {
                return 0;
            }
            const content = fs.readFileSync(this.observationsFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            return lines.length;
        } catch (e) {
            return 0;
        }
    }

    /**
     * 重度算：在 distill 时被调用
     * 分析所有观察记录，生成 pinned 规则
     */
    performBatchAnalysis() {
        console.log('[Observer] 开始批量分析...');
        
        const count = this.getObservationCount();
        console.log(`[Observer] 发现 ${count} 条观察记录`);
        
        if (count < 5) {
            console.log(`[Observer] 观察记录不足（需要 5 条，当前 ${count} 条）`);
            return;
        }
        
        if (!fs.existsSync(this.observationsFile)) {
            return;
        }
        
        const content = fs.readFileSync(this.observationsFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        const observations = [];
        for (const line of lines) {
            try {
                observations.push(JSON.parse(line));
            } catch (e) {
                // ignore
            }
        }
        
        const typeCounts = {
            user_correction: {},
            error_resolution: {},
            workflow: {},
            tool_preference: {}
        };
        
        for (const obs of observations) {
            if (typeCounts[obs.type]) {
                const key = obs.data?.pattern || obs.data?.errorType || obs.data?.workflowHash || obs.data?.taskType || 'default';
                if (!typeCounts[obs.type][key]) {
                    typeCounts[obs.type][key] = [];
                }
                typeCounts[obs.type][key].push(obs);
            }
        }
        
        let instinctCreated = 0;
        
        for (const [type, patterns] of Object.entries(typeCounts)) {
            for (const [key, obsList] of Object.entries(patterns)) {
                if (obsList.length >= 3) {
                    if (this.generateInstinctFromAnalysis(type, key, obsList)) {
                        instinctCreated++;
                    }
                }
            }
        }
        
        if (instinctCreated > 0) {
            console.log(`[Observer] ✅ 创建了 ${instinctCreated} 个本能规则`);
            this.clearObservations();
        } else {
            console.log(`[Observer] 未检测到模式（需要 3+ 条相似观察）`);
        }
    }

    /**
     * 从分析结果生成本能
     */
    generateInstinctFromAnalysis(type, key, observations) {
        let instinct = null;
        
        switch (type) {
            case 'user_correction':
                instinct = {
                    id: `user-correct-${key.replace(/\W+/g, '-')}`,
                    trigger: `user correction pattern: ${key}`,
                    action: `auto-correct: ${key}`,
                    confidence: this.calculateConfidence(observations.length),
                    domain: 'user_preference',
                    source: 'batch-observation',
                    evidence: observations.map(o => o.id)
                };
                break;
            case 'error_resolution':
                instinct = {
                    id: `error-resolve-${key.replace(/\W+/g, '-')}`,
                    trigger: `error: ${key}`,
                    action: `auto-resolve: ${key}`,
                    confidence: this.calculateConfidence(observations.length),
                    domain: 'error_handling',
                    source: 'batch-observation',
                    evidence: observations.map(o => o.id)
                };
                break;
            case 'workflow':
                instinct = {
                    id: `workflow-${key.replace(/\W+/g, '-')}`,
                    trigger: `workflow: ${key}`,
                    action: `auto-execute: ${key}`,
                    confidence: this.calculateConfidence(observations.length),
                    domain: 'workflow',
                    source: 'batch-observation',
                    evidence: observations.map(o => o.id)
                };
                break;
            case 'tool_preference':
                instinct = {
                    id: `tool-pref-${key.replace(/\W+/g, '-')}`,
                    trigger: `task: ${key}`,
                    action: `use preferred tool for: ${key}`,
                    confidence: this.calculateConfidence(observations.length),
                    domain: 'tool_usage',
                    source: 'batch-observation',
                    evidence: observations.map(o => o.id)
                };
                break;
        }
        
        if (instinct) {
            return this.createOrUpdateInstinct(instinct);
        }
        return false;
    }

    calculateConfidence(observationCount) {
        if (observationCount <= 2) return 0.3;
        if (observationCount <= 5) return 0.5;
        if (observationCount <= 10) return 0.7;
        return 0.85;
    }

    /**
     * 创建或更新本能（写入 synapse_weights.json，带 pinned: true）
     */
    createOrUpdateInstinct(instinct) {
        if (!this.acquireLock()) {
            console.log(`[Observer] 无法获取锁，跳过本能创建: ${instinct.id}`);
            return false;
        }
        
        try {
            let weights = {};
            try {
                weights = JSON.parse(fs.readFileSync(this.WEIGHTS_FILE, 'utf8'));
            } catch (e) {
                weights = {};
            }
            
            const key = instinct.id.toLowerCase();
            
            weights[key] = {
                weight: 1.0,
                lastAccess: Date.now(),
                lastSeen: Date.now(),
                count: instinct.evidence ? instinct.evidence.length : 1,
                refs: instinct.evidence || [],
                pinned: true,
                rule: instinct.action,
                confidence: instinct.confidence,
                domain: instinct.domain,
                source: instinct.source,
                trigger: instinct.trigger
            };
            
            fs.writeFileSync(this.WEIGHTS_FILE, JSON.stringify(weights, null, 2), 'utf8');
            console.log(`[Observer] ✅ 创建了固定本能: ${instinct.id}`);
            return true;
        } catch (error) {
            console.error(`[Observer] 创建本能失败: ${error.message}`);
            return false;
        } finally {
            this.releaseLock();
        }
    }

    /**
     * 清空观察记录文件
     */
    clearObservations() {
        try {
            if (fs.existsSync(this.observationsFile)) {
                fs.unlinkSync(this.observationsFile);
            }
        } catch (e) {
            // ignore
        }
    }

    loadInstincts() {
        const instincts = {};
        if (fs.existsSync(this.instinctsDir)) {
            const files = fs.readdirSync(this.instinctsDir).filter(f => f.endsWith('.yaml'));
            for (const file of files) {
                const id = file.replace('.yaml', '');
                const content = fs.readFileSync(path.join(this.instinctsDir, file), 'utf8');
                instincts[id] = content;
            }
        }
        return instincts;
    }

    getAllInstincts() {
        return this.instincts;
    }

    getRelevantInstincts(context) {
        const relevant = [];
        const contextLower = context.toLowerCase();
        
        for (const [id, content] of Object.entries(this.instincts)) {
            if (content.toLowerCase().includes(contextLower)) {
                relevant.push({ id, content });
            }
        }
        
        return relevant;
    }

    performDeepAnalysis(analysisContext) {
        const analysisResult = {
            context: analysisContext,
            observedPainPoints: [],
            recommendations: []
        };
        
        if (analysisContext.includes('QMD') || analysisContext.includes('GitHub')) {
            analysisResult.observedPainPoints = [
                "依赖外部工具链（如QMD）导致系统脆弱性",
                "GitHub克隆失败可能与网络环境或认证问题相关",
                "缺乏自动化的错误恢复机制"
            ];
            
            analysisResult.recommendations = [
                "建立本地化的备份搜索机制，减少对外部工具的依赖",
                "实施更健壮的错误处理和重试策略",
                "创建标准化的开发环境配置流程"
            ];
        }
        
        return analysisResult;
    }
}

module.exports = ObserverPattern;
