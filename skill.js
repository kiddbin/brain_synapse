/**
 * @file brain_synapse/skill.js
 * @description 数字突触 (Digital Synapse) 记忆核心实现
 * @author Foundry (on behalf of Antigravity)
 * @version 1.1.0
 * 
 * 基于《人脑记忆机制深度研究报告》构建：
 * 1. 稀疏编码 (Sparse Coding): 仅提取高权重特征，忽略冗余信息。
 * 2. 分级存储 (Hierarchical Storage): Active -> Schema -> Latent。
 * 3. 长时程抑制 (LTD - Long-Term Depression): 主动遗忘低频突触。
 * 4. 联想检索 (Spreading Activation): 激活扩散机制。
 * 5. 观察者模式 (Observer Pattern): 主动识别会话模式和行为规律。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let NlpManager;
let NlpUtilZh;
try {
    NlpManager = require('node-nlp').NlpManager;
    NlpUtilZh = require('@nlpjs/lang-zh');
} catch (e) {
    console.warn('[Synapse] node-nlp not available, using fallback keyword extraction');
}

// --- Silicon Embed Integration ---
let SiliconEmbed;
try {
    SiliconEmbed = require('./silicon-embed');
    console.log('[Synapse] SiliconEmbed loaded successfully');
} catch (e) {
    console.warn('[Synapse] SiliconEmbed not available:', e.message);
}

// --- Configuration ---
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory'); // OpenClaw's active memory
const ARCHIVE_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory/archive'); // Latent storage
const WEIGHTS_FILE = path.join(__dirname, 'synapse_weights.json');
const LATENT_WEIGHTS_FILE = path.join(__dirname, 'latent_weights.json'); // 冷库：低权重记忆归档
const INSTINCTS_DIR = path.join(__dirname, 'instincts'); // Observer instincts storage

// LTD Parameters
const DECAY_RATE = 0.90; // 每次遗忘周期的衰减率
const FORGET_THRESHOLD = 0.2; // 低于此权重则移入冷库（不再删除）
const REVIVED_WEIGHT = 0.5; // 从冷库复苏后的初始权重
const INITIAL_WEIGHT = 1.0;

const VALID_POS_TAGS = ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW'];
const MIN_WORD_LENGTH = 2;
const MAX_WEIGHT_MULTIPLIER = 2.0;
const DECAY_FACTOR = 0.1;

const CHINESE_STOPWORDS = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', 
    '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '里', '什么',
    '可以', '觉得', '应该', '可能', '因为', '所以', '但是', '如果', '只是', '还是', '或者', '而且',
    '然后', '已经', '这样', '那样', '怎么', '这个', '那个', '现在', '之前', '以后', '时候', '方法',
    '东西', '事情', '问题', '地方', '时间', '一下', '一点', '一些', '每次', '还有', '虽然', '不过'
]);

const ENGLISH_STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own',
    'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'any', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'if', 'else', 'then', 'there'
]);

function isStopword(word, isChinese) {
    if (isChinese) {
        return CHINESE_STOPWORDS.has(word) || word.length < 2;
    } else {
        return ENGLISH_STOPWORDS.has(word.toLowerCase());
    }
}

function calculateDynamicWeight(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const record = this.weights[lowerKeyword];
    
    if (!record || !record.count) {
        return 1.0;
    }
    
    const daysSinceLastSeen = Math.max(0, (Date.now() - (record.lastSeen || record.lastAccess)) / (1000 * 3600 * 24));
    const decay = 1 / (1 + DECAY_FACTOR * daysSinceLastSeen);
    const frequencyWeight = 1 + Math.log(record.count + 1) * decay;
    
    return Math.min(frequencyWeight, MAX_WEIGHT_MULTIPLIER);
}

function extractKeywords(text) {
    const keywords = new Set();
    const validPosTags = ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW'];
    
    if (NlpUtilZh && NlpUtilZh.ZhNotes) {
        try {
            const zhNotes = new NlpUtilZh.ZhNotes();
            const tokenized = zhNotes.tokenize(text);
            if (tokenized && Array.isArray(tokenized)) {
                tokenized.forEach(item => {
                    if (item && item.normalized && item.pos) {
                        const pos = item.pos.toLowerCase();
                        const word = item.normalized;
                        if (validPosTags.includes(pos) && word.length >= MIN_WORD_LENGTH) {
                            keywords.add(word.toLowerCase());
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('[Synapse] Chinese POS tagging failed:', e.message);
        }
    }
    
    if (NlpManager) {
        try {
            const nlpManager = new NlpManager({ languages: ['en', 'zh'] });
            const result = nlpManager.extractTags(text);
            if (result && Array.isArray(result)) {
                result.forEach(item => {
                    if (item && item.value && item.value.length >= MIN_WORD_LENGTH) {
                        keywords.add(item.value.toLowerCase());
                    }
                });
            }
        } catch (e) {
            console.warn('[Synapse] node-nlp extraction failed:', e.message);
        }
    }
    
    if (keywords.size === 0) {
        const chineseChars = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];
        
        chineseChars.forEach(word => {
            if (!isStopword(word, true)) {
                keywords.add(word.toLowerCase());
            }
        });
        englishWords.forEach(word => {
            if (!isStopword(word, false)) {
                keywords.add(word.toLowerCase());
            }
        });
    }
    
    return Array.from(keywords);
}

// Observer Parameters
const MIN_OBSERVATIONS_FOR_INSTINCT = 3; // 创建本能所需的最少观察次数
const CONFIDENCE_BASE = 0.3; // 基础置信度
const CONFIDENCE_INCREMENT = 0.05; // 每次确认观察增加的置信度
const CONFIDENCE_DECREMENT = 0.1; // 每次矛盾观察减少的置信度
const CONFIDENCE_DECAY_WEEKLY = 0.02; // 每周无观察的置信度衰减

// Ensure directories exist
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
if (!fs.existsSync(INSTINCTS_DIR)) fs.mkdirSync(INSTINCTS_DIR, { recursive: true });
if (!fs.existsSync(WEIGHTS_FILE)) fs.writeFileSync(WEIGHTS_FILE, '{}', 'utf8');
if (!fs.existsSync(LATENT_WEIGHTS_FILE)) fs.writeFileSync(LATENT_WEIGHTS_FILE, '{}', 'utf8');

// --- Silent Observer (Write-only, ultra fast) ---

function silentObserve(context, type = 'workflow') {
    try {
        const Observer = require('./observer.js');
        const obs = new Observer();
        
        const observation = {
            type: type,
            sessionId: 'auto-generated',
            data: { 
                context: context,
                pattern: context.substring(0, 50),
                workflowHash: context.substring(0, 30),
                taskType: context.substring(0, 30)
            }
        };
        
        obs.recordObservation(observation);
    } catch (e) {
        // 静默失败，不影响主流程
    }
}

// --- Core Classes ---

class SynapseMemory {
    constructor() {
        this.weights = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
        this.latentWeights = JSON.parse(fs.readFileSync(LATENT_WEIGHTS_FILE, 'utf8')); // 冷库记忆
        this.observationsDir = path.join(__dirname, 'observations');
        this.instinctsDir = path.join(__dirname, 'instincts');
        
        // Ensure observation and instinct directories exist
        if (!fs.existsSync(this.observationsDir)) fs.mkdirSync(this.observationsDir, { recursive: true });
        if (!fs.existsSync(this.instinctsDir)) fs.mkdirSync(this.instinctsDir, { recursive: true });
    }

    save() {
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(this.weights, null, 2), 'utf8');
    }

    saveLatent() {
        fs.writeFileSync(LATENT_WEIGHTS_FILE, JSON.stringify(this.latentWeights, null, 2), 'utf8');
    }

    /**
     * Memory Distiller (记忆蒸馏)
     * Implements "Schema" formation from "Active" logs.
     * Scans daily logs, extracts sparse features (keywords/important lines),
     * updates weights, and moves raw logs to Latent storage (archive).
     * @param {boolean} forceToday - If true, also processes today's log (for /new session switch)
     */
    async distill(forceToday = false) {
        console.log('[Synapse] Starting distillation process...');
        
        // 优先执行观察者分析（不管有没有历史日志）
        try {
            const Observer = require('./observer.js');
            const obs = new Observer();
            obs.performBatchAnalysis();
        } catch (e) {
            console.log(`[Observer] Batch analysis skipped: ${e.message}`);
        }
        
        const today = new Date().toISOString().split('T')[0];
        let logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/) && !f.includes(today);
        if (forceToday) {
            logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/);
            console.log('[Synapse] ⚡ Force mode: Including today\'s log');
        }
        const logs = fs.readdirSync(LOGS_DIR).filter(logFilter);
        let processedCount = 0;
        let keywordsExtracted = 0;
        
        // 收集每个文件的关键词用于赫布链接构建
        const fileKeywordsMap = new Map();

        if (logs.length === 0) {
            return 'No historical logs to distill. Today\'s log is kept Active.';
        }

        logs.forEach(file => {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const keywords = extractKeywords(content);
            keywords.forEach(keyword => {
                const lowerKeyword = keyword.toLowerCase();
                if (!this.weights[lowerKeyword]) {
                    this.weights[lowerKeyword] = { 
                        weight: 1.0, 
                        lastAccess: Date.now(), 
                        lastSeen: Date.now(),
                        firstSeen: Date.now(),
                        count: 1,
                        recall_count: 0,
                        refs: [file] 
                    };
                } else {
                    if (!this.weights[lowerKeyword].count) {
                        this.weights[lowerKeyword].count = 1;
                    } else {
                        this.weights[lowerKeyword].count += 1;
                    }
                    this.weights[lowerKeyword].lastSeen = Date.now();
                    this.weights[lowerKeyword].lastAccess = Date.now();
                    if (!this.weights[lowerKeyword].refs.includes(file)) {
                        this.weights[lowerKeyword].refs.push(file);
                    }
                }
                keywordsExtracted++;
            });
            
            // 收集该文件的关键词用于赫布链接
            fileKeywordsMap.set(file, Array.from(keywords).map(k => k.toLowerCase()));
        });
        
        // 处理 IMPORTANT/TODO 等特殊概念行
        logs.forEach(file => {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const lines = content.split('\n');
            lines.forEach(line => {
                if (line.match(/(IMPORTANT|TODO|DECISION|LESSON|REMEMBER|重要|决策|教训|记住)/i)) {
                    const concept = line.replace(/[-*#]/g, '').trim().substring(0, 50); 
                    const lowerConcept = concept.toLowerCase();
                    if (!this.weights[lowerConcept]) {
                        this.weights[lowerConcept] = { 
                            weight: 1.0, 
                            lastAccess: Date.now(),
                            lastSeen: Date.now(),
                            firstSeen: Date.now(),
                            count: 1,
                            recall_count: 0,
                            refs: [file] 
                        };
                    } else {
                        this.weights[lowerConcept].weight += 0.5;
                        this.weights[lowerConcept].lastAccess = Date.now();
                        this.weights[lowerConcept].lastSeen = Date.now();
                        this.weights[lowerConcept].count = (this.weights[lowerConcept].count || 0) + 1;
                        if (!this.weights[lowerConcept].refs.includes(file)) this.weights[lowerConcept].refs.push(file);
                    }
                }
            });

            const archivePath = path.join(ARCHIVE_DIR, file);
            try {
                fs.renameSync(filePath, archivePath);
                processedCount++;
            } catch (e) {
                console.error(`Failed to archive ${file}: ${e.message}`);
            }
        });

        // 应用"召回但未使用"的 LTD 惩罚
        this.applyUnusedRecallPenalty();

        // 构建赫布链接（零成本类脑联想）
        this.buildHebbianLinks(fileKeywordsMap);

        this.applyLTD();
        this.save();

        try {
            const SiliconEmbed = require('./silicon-embed');
            const embedder = new SiliconEmbed();
            if (embedder.isConfigured()) {
                const today = new Date().toISOString().split('T')[0];
                const todayFile = path.join(LOGS_DIR, `${today}.md`);
                if (fs.existsSync(todayFile)) {
                    console.log('[Synapse] 检测到今日记忆文件，触发增量向量索引...');
                    await embedder.incrementalIndex(todayFile);
                }
            }
        } catch (e) {
            console.log('[Synapse] 增量索引跳过:', e.message);
        }
        
        silentObserve('distill-completed', 'workflow');
        
        return `Distilled ${processedCount} logs. Extracted ${keywordsExtracted} keywords. Current concepts: ${Object.keys(this.weights).length}`;
    }

    /**
     * Spreading Activation Recall (联想检索)
     * 1. Search weights for the query (Direct Activation).
     * 2. If found, boost related concepts (Spreading).
     * 3. Parallel search: Vector (3s timeout) + Local fallback.
     * 4. If deep=true, also search latent storage (冷库).
     */
    async recall(query, options = {}) {
        const { deep = false, reviveLimit = 5 } = options;
        console.log(`[Synapse] Recalling: "${query}"${deep ? ' (deep mode)' : ''}`);
        
        // 1. Activate Weights
        const activatedConcepts = Object.keys(this.weights).filter(k => query.includes(k) || k.includes(query));
        
        // 2. Spreading Activation (Simulated)
        const topConcepts = activatedConcepts.sort((a, b) => this.weights[b].weight - this.weights[a].weight).slice(0, 5);
        
        // 4. 短时程增强 (LTP) + 追踪 recall 次数
        // 复习强化：只增加 weight，不重置 firstSeen（保护存活时钟）
        topConcepts.forEach(c => {
            this.weights[c].lastAccess = Date.now();
            this.weights[c].weight += 0.1;
            // 追踪被 recall 的次数（用于后续判断是否"召回但未使用"）
            this.weights[c].recall_count = (this.weights[c].recall_count || 0) + 1;
            // 注意：firstSeen 绝对不修改！它是计算 lifespan 的唯一锚点
        });
        
        // 5. 赫布扩散激活（零成本类脑联想）
        const hebbianTerms = this.getHebbianAssociations(query);
        const expandedQuery = [query, ...hebbianTerms];
        console.log(`[Synapse] Hebbian expansion: "${query}" → [${expandedQuery.join(', ')}]`);
        
        this.save();

        // 3. Parallel Search: Vector (3s timeout) + Local (fast)
        let searchResults = [];
        let searchSource = 'none';
        let vectorTimeout = false;
        
        // Start local search with expanded query (fast, always available)
        const localSearchPromise = this.localFileSearch(expandedQuery).catch(e => {
            console.warn(`[Synapse] Local search failed: ${e.message}`);
            return [];
        });
        
        // Start vector search with 3s timeout
        let vectorSearchPromise = null;
        if (SiliconEmbed) {
            vectorSearchPromise = (async () => {
                try {
                    const embedder = new SiliconEmbed();
                    const result = await Promise.race([
                        embedder.search(query),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Vector timeout')), 3000))
                    ]);
                    return result?.success ? result.results : null;
                } catch (error) {
                    vectorTimeout = error.message.includes('timeout');
                    console.warn(`[Synapse] Vector search: ${error.message}`);
                    return null;
                }
            })();
        }
        
        // Wait for vector search first (max 3s)
        let vectorResults = null;
        if (vectorSearchPromise) {
            try {
                vectorResults = await vectorSearchPromise;
            } catch (e) {
                vectorTimeout = true;
            }
        }
        
        // Use vector results if available, otherwise use local
        if (vectorResults && vectorResults.length > 0) {
            console.log('[Synapse] Using vector search results');
            searchResults = vectorResults;
            searchSource = 'silicon-embed';
        } else if (vectorTimeout) {
            console.log('[Synapse] Vector timeout, using local search (fast mode)');
            const localResults = await localSearchPromise;
            searchResults = localResults;
            searchSource = 'local-file-search';
        } else {
            console.log('[Synapse] Vector unavailable, using local search');
            const localResults = await localSearchPromise;
            searchResults = localResults;
            searchSource = 'local-file-search';
        }
        
        // 4. Deep recall (催眠检索) - only when explicitly requested
        let deepRecallResult = null;
        if (deep) {
            // deep recall 也支持赫布联想扩展
            deepRecallResult = await this.deepRecall(expandedQuery, reviveLimit);
        }
        
        if (searchResults.length > 0 && !deep) {
            searchResults = this.sortRecallResultsWithDynamicWeights(searchResults, query);
        }
        
        const pinnedRules = Object.entries(this.weights)
            .filter(([key, val]) => val.pinned && (query.toLowerCase().includes(key) || key.includes(query.toLowerCase())))
            .map(([key, val]) => ({ keyword: key, rule: val.rule }));
        
        const result = {
            source: searchSource,
            activated_concepts: topConcepts,
            pinned_rules: pinnedRules,
            search_results: searchResults,
            weights_snapshot: topConcepts.map(c => ({ [c]: this.weights[c].weight })),
            scoring_mode: deep ? 'pure_similarity' : 'semantic_x_frequency_x_decay',
            is_fast_mode: vectorTimeout
        };
        
        // Include deep recall results if available
        if (deepRecallResult) {
            result.deep_recall = deepRecallResult;
            result.source = `${searchSource} + deep_recall`;
        }
        
        silentObserve(query, 'workflow');
        
        return result;
    }
    
    calculateKeywordWeight(keyword) {
        const lowerKeyword = keyword.toLowerCase();
        const record = this.weights[lowerKeyword];
        
        if (!record) {
            return 1.0;
        }
        
        const lastSeenTime = record.lastSeen || record.lastAccess;
        const daysSinceLastSeen = Math.max(0, (Date.now() - lastSeenTime) / (1000 * 3600 * 24));
        const decay = 1 / (1 + DECAY_FACTOR * daysSinceLastSeen);
        
        let frequencyWeight;
        if (record.count !== undefined) {
            frequencyWeight = 1 + Math.log(record.count + 1) * decay;
        } else if (record.weight !== undefined) {
            const oldPremium = Math.max(0, record.weight - 1);
            frequencyWeight = 1 + oldPremium * decay;
        } else {
            frequencyWeight = 1.0;
        }
        
        frequencyWeight = Math.min(frequencyWeight, MAX_WEIGHT_MULTIPLIER);
        
        return frequencyWeight;
    }
    
    sortRecallResultsWithDynamicWeights(results, query) {
        const queryKeywords = extractKeywords(query);
        
        results.forEach(result => {
            const content = (result.content || result.text || result.title || '').toLowerCase();
            const title = (result.title || '').toLowerCase();
            
            let matchedKeywordWeight = 1.0;
            queryKeywords.forEach(qk => {
                const dynamicWeight = this.calculateKeywordWeight(qk);
                if (content.includes(qk) || title.includes(qk)) {
                    if (dynamicWeight > matchedKeywordWeight) {
                        matchedKeywordWeight = dynamicWeight;
                    }
                }
            });
            
            result.dynamicWeight = matchedKeywordWeight;
            result.finalScore = (result.similarity || 0.5) * matchedKeywordWeight;
        });
        
        results.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
        
        return results;
    }
    
    /**
     * Check if QMD is available and working
     * @returns {boolean} Whether QMD is available
     */
    isQMDAvailable() {
        try {
            // Use child_process to check if qmd command exists
            const { execSync } = require('child_process');
            execSync('qmd status', { 
                timeout: 1000,
                stdio: 'ignore'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Perform QMD search
     * @param {string} query - Search query
     * @returns {Promise<Object>} QMD search results
     */
    async qmdSearch(query) {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            exec(`qmd search "${query}" -n 5 --json`, { timeout: 2000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                try {
                    const results = JSON.parse(stdout);
                    resolve({ results: results });
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
    }
    
    /**
     * Perform local file search as fallback
     * @param {string} query - Search query
     * @returns {Promise<Array>} Local search results
     */
    async localFileSearch(query) {
        try {
            const LocalFileSearch = require('./local_file_search');
            const searcher = new LocalFileSearch();
            const result = await searcher.execute(query);
            return result.results || [];
        } catch (error) {
            console.error(`[Synapse] Local file search failed: ${error.message}`);
            return [];
        }
    }

    /**
     * 零成本赫布链接构建 (Hebbian Linkage)
     * 
     * 基于 Hebbian Learning 原理："共现即关联"（Cells that fire together, wire together）
     * 当多个关键词在同一文件中共现时，建立它们之间的关联权重。
     * 
     * @param {Map} fileKeywordsMap - 文件名到关键词数组的映射
     */
    buildHebbianLinks(fileKeywordsMap) {
        if (!fileKeywordsMap || fileKeywordsMap.size === 0) {
            return;
        }
        
        let linkCount = 0;
        
        // 遍历每个文件的关键词列表
        for (const [file, keywords] of fileKeywordsMap) {
            if (!keywords || keywords.length < 2) continue;
            
            // 对该文件内的所有关键词对建立双向链接
            for (let i = 0; i < keywords.length; i++) {
                for (let j = i + 1; j < keywords.length; j++) {
                    const wordA = keywords[i];
                    const wordB = keywords[j];
                    
                    if (wordA === wordB) continue;
                    
                    // 初始化 synapses 字段（如果不存在）
                    if (!this.weights[wordA]) {
                        this.weights[wordA] = { weight: 0.5, synapses: {} };
                    }
                    if (!this.weights[wordB]) {
                        this.weights[wordB] = { weight: 0.5, synapses: {} };
                    }
                    if (!this.weights[wordA].synapses) {
                        this.weights[wordA].synapses = {};
                    }
                    if (!this.weights[wordB].synapses) {
                        this.weights[wordB].synapses = {};
                    }
                    
                    // 增加共现权重
                    this.weights[wordA].synapses[wordB] = (this.weights[wordA].synapses[wordB] || 0) + 1;
                    this.weights[wordB].synapses[wordA] = (this.weights[wordB].synapses[wordA] || 0) + 1;
                    
                    linkCount++;
                }
            }
        }
        
        if (linkCount > 0) {
            console.log(`[Synapse] Hebbian links built: ${linkCount} connections created`);
        }
    }

    /**
     * "召回但未使用"惩罚 (Predictive LTD)
     * 
     * 逻辑：如果一个概念被频繁 recall（recall_count 高），
     * 但在 distill 时其 count 没有相应增加（说明 AI 提取了但觉得没用，没有付诸实践），
     * 则触发 LTD 惩罚。
     */
    applyUnusedRecallPenalty() {
        let penalized = 0;
        const PENALTY_RATE = 0.1;
        const RECALL_THRESHOLD = 3; // 至少被 recall 3 次才触发检查
        
        Object.keys(this.weights).forEach(key => {
            const concept = this.weights[key];
            if (concept.pinned) return;
            if (!concept.recall_count || concept.recall_count < RECALL_THRESHOLD) return;
            
            // 如果 recall_count >= 3，但 count 没有显著增加，说明"召回但未使用"
            // 计算预期的 count 增长：如果每次 recall 都使用了，count 应该 >= recall_count * 0.5
            const expectedMinCount = concept.recall_count * 0.5;
            const actualCount = concept.count || 0;
            
            if (actualCount < expectedMinCount) {
                // 触发 LTD 惩罚
                const penalty = PENALTY_RATE * concept.recall_count;
                concept.weight -= penalty;
                console.log(`[Synapse] Predictive LTD: "${key}" recall=${concept.recall_count} count=${actualCount} penalty=${penalty.toFixed(3)}`);
                penalized++;
            }
            
            // 清零 recall_count，开始新一轮追踪
            concept.recall_count = 0;
        });
        
        if (penalized > 0) {
            console.log(`[Synapse] Predictive LTD: penalized ${penalized} unused concepts`);
        }
    }

    /**
     * 扩散激活召回 (Spreading Activation)
     * 
     * 基于赫布链接，获取与查询词关联的所有高权重关联词
     * @param {string} query - 查询关键词
     * @param {number} topN - 返回前 N 个关联词
     * @returns {string[]} 关联词数组
     */
    getHebbianAssociations(query, topN = 3) {
        const associations = [];
        const lowerQuery = query.toLowerCase();
        
        // 初始化 synapses（兼容旧数据）
        if (this.weights[lowerQuery] && !this.weights[lowerQuery].synapses) {
            this.weights[lowerQuery].synapses = {};
        }
        
        // 获取当前词的所有关联词
        const synapses = this.weights[lowerQuery]?.synapses || {};
        
        if (Object.keys(synapses).length > 0) {
            // 按权重排序，提取 Top N
            const sorted = Object.entries(synapses)
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN)
                .map(([word]) => word);
            
            associations.push(...sorted);
            console.log(`[Synapse] Hebbian associations found: ${sorted.join(', ')}`);
        }
        
        return associations;
    }

    /**
     * Long-Term Depression (LTD - 主动遗忘)
     * Decays weights of inactive memories. Moves those below threshold to latent storage (NOT delete).
     * This implements "冷热分离" architecture - memories are never truly lost.
     */
    applyLTD() {
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        let archived = 0;

        Object.keys(this.weights).forEach(key => {
            if (this.weights[key].pinned) {
                return;
            }
            
            const daysSinceAccess = (now - this.weights[key].lastAccess) / ONE_DAY;
            
            this.weights[key].weight *= DECAY_RATE;

            if (this.weights[key].weight < FORGET_THRESHOLD) {
                this.latentWeights[key] = {
                    ...this.weights[key],
                    archivedAt: now,
                    originalWeight: this.weights[key].weight
                };
                delete this.weights[key];
                archived++;
            }
        });
        
        if (archived > 0) {
            this.saveLatent();
            console.log(`[Synapse] LTD Applied. Archived ${archived} weak synapses to latent storage.`);
        } else {
            console.log(`[Synapse] LTD Applied. No synapses archived.`);
        }
    }
    
    /**
     * Deep Recall (深度回忆/催眠检索)
     * Searches latent storage for forgotten memories and revives them.
     * This is the "催眠" mechanism to recover low-weight memories.
     * 
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of memories to revive (default: 5)
     * @returns {Object} Revived memories and search results
     */
    async deepRecall(queryOrArray, limit = 5) {
        // 支持数组查询（赫布联想扩展）
        const queries = Array.isArray(queryOrArray) ? queryOrArray : [queryOrArray];
        const mainQuery = queries.join(' + ');
        console.log(`[Synapse] Deep recall (催眠检索): "${mainQuery}"`);
        
        const revived = [];
        const latentKeys = Object.keys(this.latentWeights);
        
        // Search in latent storage - 支持多查询
        const matchedKeys = latentKeys.filter(k => {
            const keyLower = k.toLowerCase();
            return queries.some(q => {
                const queryLower = q.toLowerCase();
                return keyLower.includes(queryLower) || queryLower.includes(keyLower);
            });
        });
        
        // Sort by original weight (higher = more relevant)
        matchedKeys.sort((a, b) => {
            const weightA = this.latentWeights[a].originalWeight || this.latentWeights[a].weight || 0;
            const weightB = this.latentWeights[b].originalWeight || this.latentWeights[b].weight || 0;
            return weightB - weightA;
        });
        
        // Revive top matches
        const toRevive = matchedKeys.slice(0, limit);
        
        toRevive.forEach(key => {
            const memory = this.latentWeights[key];
            
            // Move back to active weights with revived weight
            this.weights[key] = {
                weight: REVIVED_WEIGHT,
                lastAccess: Date.now(),
                refs: memory.refs || [],
                revivedFrom: 'latent',
                revivedAt: Date.now()
            };
            
            // Remove from latent storage
            delete this.latentWeights[key];
            
            revived.push({
                concept: key,
                originalWeight: memory.originalWeight || memory.weight,
                revivedWeight: REVIVED_WEIGHT,
                refs: memory.refs || []
            });
        });
        
        // Save changes
        if (revived.length > 0) {
            this.save();
            this.saveLatent();
            console.log(`[Synapse] Revived ${revived.length} memories from latent storage.`);
        }
        
        // Also search in archive files for context
        let archiveContext = [];
        try {
            const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md'));
            for (const file of archiveFiles.slice(0, 10)) { // Limit to 10 files for performance
                const content = fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8');
                if (content.toLowerCase().includes(query.toLowerCase())) {
                    const lines = content.split('\n').filter(line => 
                        line.toLowerCase().includes(query.toLowerCase())
                    ).slice(0, 3);
                    archiveContext.push({
                        file: file,
                        matches: lines
                    });
                }
            }
        } catch (e) {
            console.warn(`[Synapse] Archive search failed: ${e.message}`);
        }
        
        return {
            source: 'deep_recall',
            query: query,
            revived_count: revived.length,
            revived_memories: revived,
            archive_context: archiveContext,
            remaining_latent: Object.keys(this.latentWeights).length
        };
    }
    
    /**
     * Get latent storage statistics
     * @returns {Object} Statistics about latent memories
     */
    getLatentStats() {
        const latentKeys = Object.keys(this.latentWeights);
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        let oldestMemory = null;
        let newestArchive = null;
        let totalAge = 0;
        
        latentKeys.forEach(key => {
            const memory = this.latentWeights[key];
            if (memory.archivedAt) {
                const age = (now - memory.archivedAt) / ONE_DAY;
                totalAge += age;
                
                if (!oldestMemory || memory.archivedAt < oldestMemory.archivedAt) {
                    oldestMemory = { key, archivedAt: memory.archivedAt, age };
                }
                if (!newestArchive || memory.archivedAt > newestArchive.archivedAt) {
                    newestArchive = { key, archivedAt: memory.archivedAt, age };
                }
            }
        });
        
        return {
            total_latent: latentKeys.length,
            oldest_archive: oldestMemory,
            newest_archive: newestArchive,
            average_age_days: latentKeys.length > 0 ? (totalAge / latentKeys.length).toFixed(1) : 0
        };
    }
    
    /**
     * Observer Pattern Integration (观察者模式集成)
     * Analyzes session patterns and creates instincts based on observed behaviors.
     * This function should be called after significant session activity.
     * 
     * @param {Array} sessionHistory - Array of recent session messages and tool calls
     * @returns {Object} Analysis results with detected patterns and created instincts
     */
    observe(sessionHistory) {
        console.log('[Synapse] Starting observer analysis...');
        
        // Load existing instincts
        const existingInstincts = {};
        try {
            const instinctFiles = fs.readdirSync(this.instinctsDir);
            instinctFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    const instinct = JSON.parse(fs.readFileSync(path.join(this.instinctsDir, file), 'utf8'));
                    existingInstincts[instinct.id] = instinct;
                }
            });
        } catch (e) {
            console.error(`[Synapse] Error loading existing instincts: ${e.message}`);
        }
        
        // Pattern detection logic
        const patterns = {
            userCorrections: [],
            errorResolutions: [],
            repeatedWorkflows: [],
            toolPreferences: []
        };
        
        // Analyze session history for patterns
        this.detectUserCorrections(sessionHistory, patterns);
        this.detectErrorResolutions(sessionHistory, patterns);
        this.detectRepeatedWorkflows(sessionHistory, patterns);
        this.detectToolPreferences(sessionHistory, patterns);
        
        // Create or update instincts based on patterns
        const newInstincts = this.createInstinctsFromPatterns(patterns, existingInstincts);
        
        // Save new instincts
        newInstincts.forEach(instinct => {
            const fileName = `${instinct.id}.json`;
            fs.writeFileSync(path.join(this.instinctsDir, fileName), JSON.stringify(instinct, null, 2), 'utf8');
        });
        
        return {
            source: "brain_synapse_observer",
            patterns_detected: patterns,
            instincts_created: newInstincts.length,
            total_instincts: Object.keys(existingInstincts).length + newInstincts.length
        };
    }
    
    /**
     * Detect user corrections in session history
     */
    detectUserCorrections(sessionHistory, patterns) {
        // Look for patterns like "No, use X instead of Y" or "Actually, I meant..."
        for (let i = 1; i < sessionHistory.length; i++) {
            const current = sessionHistory[i];
            const previous = sessionHistory[i - 1];
            
            if (current.role === 'user' && previous.role === 'assistant') {
                const userMessage = current.content[0]?.text?.toLowerCase() || '';
                if (userMessage.includes('no,') || userMessage.includes('actually') || 
                    userMessage.includes('不是') || userMessage.includes('实际上')) {
                    patterns.userCorrections.push({
                        timestamp: current.timestamp,
                        correction: userMessage,
                        context: previous.content[0]?.text || ''
                    });
                }
            }
        }
    }
    
    /**
     * Detect error resolutions in session history
     */
    detectErrorResolutions(sessionHistory, patterns) {
        // Look for error messages followed by successful operations
        for (let i = 0; i < sessionHistory.length - 1; i++) {
            const current = sessionHistory[i];
            const next = sessionHistory[i + 1];
            
            // Check if current message contains an error
            const currentContent = current.content[0]?.text || '';
            if (currentContent.includes('error') || currentContent.includes('failed') || 
                currentContent.includes('错误') || currentContent.includes('失败')) {
                // Check if next message shows a resolution
                const nextContent = next.content[0]?.text || '';
                if (nextContent.includes('success') || nextContent.includes('completed') || 
                    nextContent.includes('成功') || nextContent.includes('完成')) {
                    patterns.errorResolutions.push({
                        timestamp: next.timestamp,
                        error: currentContent,
                        resolution: nextContent
                    });
                }
            }
        }
    }
    
    /**
     * Detect repeated workflows in session history
     */
    detectRepeatedWorkflows(sessionHistory, patterns) {
        // Look for sequences of similar tool calls
        const toolSequences = [];
        let currentSequence = [];
        
        sessionHistory.forEach(msg => {
            if (msg.content && Array.isArray(msg.content)) {
                msg.content.forEach(item => {
                    if (item.type === 'toolCall') {
                        if (currentSequence.length > 0 && 
                            Math.abs(msg.timestamp - currentSequence[currentSequence.length - 1].timestamp) > 300000) {
                            // More than 5 minutes gap, start new sequence
                            if (currentSequence.length > 1) {
                                toolSequences.push([...currentSequence]);
                            }
                            currentSequence = [];
                        }
                        currentSequence.push({
                            tool: item.name,
                            arguments: item.arguments,
                            timestamp: msg.timestamp
                        });
                    }
                });
            }
        });
        
        if (currentSequence.length > 1) {
            toolSequences.push(currentSequence);
        }
        
        // Find repeated sequences
        const sequenceMap = new Map();
        toolSequences.forEach(seq => {
            const key = seq.map(s => s.tool).join('->');
            if (!sequenceMap.has(key)) {
                sequenceMap.set(key, []);
            }
            sequenceMap.get(key).push(seq);
        });
        
        sequenceMap.forEach((sequences, key) => {
            if (sequences.length >= 2) {
                patterns.repeatedWorkflows.push({
                    workflow: key,
                    occurrences: sequences.length,
                    sequences: sequences
                });
            }
        });
    }
    
    /**
     * Detect tool preferences in session history
     */
    detectToolPreferences(sessionHistory, patterns) {
        const toolUsage = new Map();
        
        sessionHistory.forEach(msg => {
            if (msg.content && Array.isArray(msg.content)) {
                msg.content.forEach(item => {
                    if (item.type === 'toolCall') {
                        const tool = item.name;
                        toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1);
                    }
                });
            }
        });
        
        // Find tools used consistently
        toolUsage.forEach((count, tool) => {
            if (count >= 3) {
                patterns.toolPreferences.push({
                    tool: tool,
                    usageCount: count
                });
            }
        });
    }
    
    /**
     * Create instincts from detected patterns
     */
    createInstinctsFromPatterns(patterns, existingInstincts) {
        const newInstincts = [];
        const now = Date.now();
        
        // Create instincts from user corrections
        patterns.userCorrections.forEach((correction, index) => {
            const id = `user-correction-${Date.now()}-${index}`;
            if (!existingInstincts[id]) {
                newInstincts.push({
                    id: id,
                    trigger: "when user provides correction",
                    action: "Note the correction pattern for future reference",
                    confidence: CONFIDENCE_BASE,
                    domain: "user_interaction",
                    source: "session-observation",
                    evidence: [correction],
                    lastObserved: now
                });
            }
        });
        
        // Create instincts from error resolutions
        patterns.errorResolutions.forEach((resolution, index) => {
            const id = `error-resolution-${Date.now()}-${index}`;
            if (!existingInstincts[id]) {
                newInstincts.push({
                    id: id,
                    trigger: "when encountering similar errors",
                    action: "Apply the observed resolution strategy",
                    confidence: CONFIDENCE_BASE,
                    domain: "error_handling",
                    source: "session-observation",
                    evidence: [resolution],
                    lastObserved: now
                });
            }
        });
        
        // Create instincts from repeated workflows
        patterns.repeatedWorkflows.forEach((workflow, index) => {
            const id = `workflow-${workflow.workflow.replace(/[^a-zA-Z0-9]/g, '-')}`;
            let instinct = existingInstincts[id];
            
            if (!instinct) {
                instinct = {
                    id: id,
                    trigger: `when performing ${workflow.workflow}`,
                    action: `Follow the observed workflow: ${workflow.workflow}`,
                    confidence: Math.min(0.85, CONFIDENCE_BASE + (workflow.occurrences - 1) * CONFIDENCE_INCREMENT),
                    domain: "workflow",
                    source: "session-observation",
                    evidence: workflow.sequences,
                    lastObserved: now
                };
                newInstincts.push(instinct);
            } else {
                // Update existing instinct
                instinct.confidence = Math.min(0.85, instinct.confidence + CONFIDENCE_INCREMENT);
                instinct.lastObserved = now;
                // Add new evidence if not already present
                workflow.sequences.forEach(seq => {
                    if (!instinct.evidence.some(e => JSON.stringify(e) === JSON.stringify(seq))) {
                        instinct.evidence.push(seq);
                    }
                });
                // Save updated instinct
                const fileName = `${id}.json`;
                fs.writeFileSync(path.join(this.instinctsDir, fileName), JSON.stringify(instinct, null, 2), 'utf8');
            }
        });
        
        // Create instincts from tool preferences
        patterns.toolPreferences.forEach((preference, index) => {
            const id = `tool-preference-${preference.tool}`;
            let instinct = existingInstincts[id];
            
            if (!instinct) {
                instinct = {
                    id: id,
                    trigger: `when needing ${preference.tool} functionality`,
                    action: `Prefer using ${preference.tool} tool`,
                    confidence: Math.min(0.85, CONFIDENCE_BASE + (preference.usageCount - 3) * CONFIDENCE_INCREMENT),
                    domain: "tool_selection",
                    source: "session-observation",
                    evidence: [{ tool: preference.tool, count: preference.usageCount }],
                    lastObserved: now
                };
                newInstincts.push(instinct);
            } else {
                // Update existing instinct
                instinct.confidence = Math.min(0.85, instinct.confidence + CONFIDENCE_INCREMENT);
                instinct.lastObserved = now;
                // Update evidence
                instinct.evidence[0].count = preference.usageCount;
                // Save updated instinct
                const fileName = `${id}.json`;
                fs.writeFileSync(path.join(this.instinctsDir, fileName), JSON.stringify(instinct, null, 2), 'utf8');
            }
        });
        
        return newInstincts;
    }
}

// --- CLI Interface for OpenClaw ---

const [,, command, ...args] = process.argv;
const memory = new SynapseMemory();

// Main async function to handle async recall
async function main() {
    switch (command) {
        case 'distill':
            const forceDistill = args.includes('--force') || args.includes('-f');
            const distillResult = await memory.distill(forceDistill);
            console.log(distillResult);
            break;
        case 'recall':
            const recallArgs = args.join(' ');
            const isDeep = recallArgs.includes('--deep') || recallArgs.includes('-d');
            const query = recallArgs.replace(/--deep|-d/g, '').trim();
            const result = await memory.recall(query, { deep: isDeep });
            console.log(JSON.stringify(result, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'deep-recall':
            const deepQuery = args.join(' ');
            const deepResult = await memory.deepRecall(deepQuery);
            console.log(JSON.stringify(deepResult, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'latent-stats':
            const stats = memory.getLatentStats();
            console.log(JSON.stringify(stats, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'forget':
            memory.applyLTD();
            memory.save();
            console.log('Manual LTD cycle completed.');
            break;
        case 'pin-exp':
            const pinArgs = args.join(' ');
            const pinColonIndex = pinArgs.indexOf(':');
            if (pinColonIndex === -1) {
                console.error('Usage: pin-exp <keyword>:<rule>');
                console.error('Example: pin-exp browser_fill:遇到fill报错必须用type替代');
                process.exit(1);
            }
            const pinKeyword = pinArgs.substring(0, pinColonIndex).trim();
            const pinRule = pinArgs.substring(pinColonIndex + 1).trim();
            if (!pinKeyword || !pinRule) {
                console.error('Keyword and rule are required');
                process.exit(1);
            }
            const pinLower = pinKeyword.toLowerCase();
            if (!memory.weights[pinLower]) {
                memory.weights[pinLower] = {
                    weight: 1.0,
                    lastAccess: Date.now(),
                    lastSeen: Date.now(),
                    count: 1,
                    refs: [],
                    pinned: true,
                    rule: pinRule
                };
            } else {
                memory.weights[pinLower].pinned = true;
                memory.weights[pinLower].rule = pinRule;
                memory.weights[pinLower].weight = Math.max(memory.weights[pinLower].weight, 1.0);
                memory.weights[pinLower].lastAccess = Date.now();
            }
            memory.save();
            console.log(`Pinned experience saved: "${pinKeyword}" -> "${pinRule}"`);
            setTimeout(() => process.exit(0), 10);
            break;
        case 'get-pinned':
            const pinnedRules = Object.entries(memory.weights)
                .filter(([_, val]) => val.pinned)
                .map(([key, val]) => ({
                    keyword: key,
                    rule: val.rule || '(no rule specified)',
                    weight: val.weight
                }));
            console.log(JSON.stringify(pinnedRules, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'get-top-concepts':
            const topN = parseInt(args[0]) || 5;
            const allWeights = memory.weights;
            const sorted = Object.entries(allWeights)
                .sort((a, b) => b[1].weight - a[1].weight)
                .slice(0, topN)
                .map(([key, val]) => ({ 
                    concept: key, 
                    weight: val.weight, 
                    count: val.count || Math.round(val.weight),
                    lastSeen: val.lastSeen ? new Date(val.lastSeen).toISOString().split('T')[0] : (val.lastAccess ? new Date(val.lastAccess).toISOString().split('T')[0] : 'unknown')
                }));
            console.log(JSON.stringify(sorted, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'observe':
            // Read session history from stdin or file
            let sessionHistory = [];
            try {
                if (args.length > 0) {
                    const historyFile = args[0];
                    if (fs.existsSync(historyFile)) {
                        sessionHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                    }
                } else {
                    // Try to read from stdin
                    const stdin = fs.readFileSync(0, 'utf8');
                    if (stdin.trim()) {
                        sessionHistory = JSON.parse(stdin);
                    }
                }
            } catch (e) {
                console.error(`[Synapse] Error reading session history: ${e.message}`);
                process.exit(1);
            }
            
            if (sessionHistory.length === 0) {
                console.log('No session history provided for observation.');
                process.exit(1);
            }
            
            console.log(JSON.stringify(memory.observe(sessionHistory), null, 2));
            break;
        default:
            console.log(`Brain Synapse CLI - 数字突触记忆系统

Usage: node skill.js <command> [options]

Commands:
  distill              蒸馏记忆（将日志转为权重）
  recall <query>       联想检索
    --deep, -d         深度检索（包含冷库）
  deep-recall <query>  催眠检索（从冷库恢复记忆）
  latent-stats         查看冷库统计
  forget               手动触发遗忘周期
  get-top-concepts [n] 获取权重最高的概念（默认5个）
  pin-exp <kw>:<rule>  固定经验规则（永不衰减）
  get-pinned           查看所有已固定的规则
  observe [file]       观察会话模式

Examples:
  node skill.js recall "浏览器"
  node skill.js recall "浏览器" --deep
  node skill.js deep-recall "很久以前的量化策略"
  node skill.js pin-exp "browser_fill:遇到fill报错必须用type替代"
  node skill.js get-pinned
  node skill.js latent-stats`);
    }
}

main().catch(e => {
    console.error(`[Synapse] Error: ${e.message}`);
    process.exit(1);
});
