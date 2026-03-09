
const fs = require('fs');
const path = require('path');
const SynapseStorage = require('../storage/storage');
const { extractKeywords, isStopword } = require('./nlp');

// Constants used inside the class
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const LOGS_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory');
const ARCHIVE_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory/archive');
const WEIGHTS_FILE = path.join(__dirname, '../synapse_weights.json');
const LATENT_WEIGHTS_FILE = path.join(__dirname, '../latent_weights.json');

const DECAY_RATE = 0.95;
const FORGET_THRESHOLD = 0.1;
const REVIVED_WEIGHT = 0.5;
const INITIAL_WEIGHT = 1.0;
const MAX_WEIGHT_MULTIPLIER = 2.0;
const DECAY_FACTOR = 0.1;

const MIN_OBSERVATIONS_FOR_INSTINCT = 3;
const CONFIDENCE_BASE = 0.3;
const CONFIDENCE_INCREMENT = 0.05;
const CONFIDENCE_DECREMENT = 0.1;
const CONFIDENCE_DECAY_WEEKLY = 0.02;

function silentObserve(context, type = 'workflow') {
    try {
        const Observer = require('../observer.js');
        const obs = new Observer();
        obs.recordObservation({
            type: type,
            sessionId: 'auto-generated',
            data: { 
                context: context,
                pattern: context.substring(0, 50),
                workflowHash: context.substring(0, 30),
                taskType: context.substring(0, 30)
            }
        });
    } catch(e) {}
}

function getSiliconEmbed() {
    try {
        return require('../silicon-embed.js');
    } catch(e) {
        return null;
    }
}

class SynapseMemory {
    constructor() {
        this.storage = new SynapseStorage(WEIGHTS_FILE, {});
        this.latentStorage = new SynapseStorage(LATENT_WEIGHTS_FILE, {});
        this.weights = this.storage.readSync();
        this.latentWeights = this.latentStorage.readSync(); // 冷库记忆
        this.observationsDir = path.join(__dirname, '../observations');
        this.instinctsDir = path.join(__dirname, '../instincts');
        
        // Initialize STDP and Conflict Resolver modules
        this._initAdvancedModules();
        
        // Ensure observation and instinct directories exist
        if (!fs.existsSync(this.observationsDir)) fs.mkdirSync(this.observationsDir, { recursive: true });
        if (!fs.existsSync(this.instinctsDir)) fs.mkdirSync(this.instinctsDir, { recursive: true });
    }
    
    /**
     * Initialize advanced modules (STDP and Conflict Resolver)
     */
    _initAdvancedModules() {
        try {
            const STDPTrainer = require('../stdp-temporal.js');
            this.stdpTrainer = new STDPTrainer();
            console.log('[Synapse] STDP temporal learning module loaded');
        } catch (e) {
            console.warn('[Synapse] STDP module not available:', e.message);
            this.stdpTrainer = null;
        }
        
        try {
            const ConflictResolver = require('../conflict-resolver.js');
            this.conflictResolver = new ConflictResolver(this.weights);
            console.log('[Synapse] Conflict resolver module loaded');
        } catch (e) {
            console.warn('[Synapse] Conflict resolver not available:', e.message);
            this.conflictResolver = null;
        }
    }

    save() {
        // Use async write in background, but don't await if calling synchronously
        this.storage.writeAsync(this.weights).catch(e => console.error("Save error:", e));
    }

    saveLatent() {
        this.latentStorage.writeAsync(this.latentWeights).catch(e => console.error("Latent save error:", e));
    }

    /**
     * 获取需要处理的日志文件列表
     * @param {boolean} forceToday - 是否强制处理今天的日志
     * @returns {string[]} 日志文件列表
     */
    _getLogFiles(forceToday = false) {
        const today = new Date().toISOString().split('T')[0];
        let logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/) && !f.includes(today);
        if (forceToday) {
            logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/);
            console.log('[Synapse] ⚡ Force mode: Including today\'s log');
        }
        return fs.readdirSync(LOGS_DIR).filter(logFilter);
    }

    /**
     * 提取关键词并更新权重
     * @param {string[]} logs - 日志文件列表
     * @param {Map} fileKeywordsMap - 文件到关键词的映射
     * @returns {number} 提取的关键词数量
     */
    _extractKeywordsAndUpdateWeights(logs, fileKeywordsMap) {
        let keywordsExtracted = 0;
        
        logs.forEach(file => {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const keywords = extractKeywords(content);
            
            // STDP: Process temporal relationships
            if (this.stdpTrainer) {
                try {
                    this.stdpTrainer.processContent(content);
                } catch (e) {
                    console.warn('[Synapse] STDP processing failed:', e.message);
                }
            }
            
            keywords.forEach(keyword => {
                const lowerKeyword = keyword.toLowerCase();
                
                // Conflict Resolution: Check for conflicts before adding
                if (this.conflictResolver && !this.weights[lowerKeyword]) {
                    const conflictCheck = this.conflictResolver.checkAndResolve(
                        { keyword: lowerKeyword, rule: keyword },
                        this.weights
                    );
                    
                    if (conflictCheck.action === 'flag') {
                        console.log(`[Synapse] Potential conflict detected for "${lowerKeyword}", flagged for review`);
                    }
                }
                
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
            
            fileKeywordsMap.set(file, Array.from(keywords).map(k => k.toLowerCase()));
        });
        
        return keywordsExtracted;
    }

    /**
     * 处理特殊概念行（IMPORTANT/TODO 等）并归档文件
     * @param {string[]} logs - 日志文件列表
     * @returns {number} 处理的文件数量
     */
    _processSpecialLinesAndArchive(logs) {
        let processedCount = 0;
        
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
                        if (!this.weights[lowerConcept].refs.includes(file)) {
                            this.weights[lowerConcept].refs.push(file);
                        }
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
        
        return processedCount;
    }

    /**
     * 应用 LTD 并保存权重
     * @param {Map} fileKeywordsMap - 文件到关键词的映射
     */
    _applyLTDAndSave(fileKeywordsMap) {
        this.applyUnusedRecallPenalty();
        this.buildHebbianLinks(fileKeywordsMap);
        this.applyLTD();
        this.save();
    }

    /**
     * 执行观察者批量分析
     */
    _performObserverAnalysis() {
        try {
            const Observer = require('../observer.js');
            const obs = new Observer();
            obs.performBatchAnalysis();
        } catch (e) {
            console.log(`[Observer] Batch analysis skipped: ${e.message}`);
        }
    }

    /**
     * Core Distillation (Fast Lane - Hippocampus Fast Channel)
     * Pure local I/O and CPU computation, ~100ms
     * With timestamp check: skip if no new files since last distill
     * @param {boolean} forceToday - If true, also processes today's log
     * @returns {object} Result with stats and whether vector indexing is needed
     */
    distillCore(forceToday = false) {
        console.log('[Synapse] Core distillation (fast lane)...');
        
        // Timestamp check: skip if no new files
        const weightsStat = fs.existsSync(WEIGHTS_FILE) ? fs.statSync(WEIGHTS_FILE) : null;
        const weightsMtime = weightsStat ? weightsStat.mtimeMs : 0;
        
        const logs = this._getLogFiles(forceToday);
        
        // Check if any log file is newer than weights file
        const hasNewLogs = logs.some(file => {
            const filePath = path.join(LOGS_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                return stat.mtimeMs > weightsMtime;
            } catch (e) {
                return false;
            }
        });
        
        if (!hasNewLogs && logs.length > 0) {
            console.log('[Synapse] No new logs since last distill, skipping...');
            return { success: true, processedCount: 0, keywordsExtracted: 0, needsVectorIndex: false, skipped: true };
        }
        
        // Observer analysis (lightweight, local)
        this._performObserverAnalysis();
        
        if (logs.length === 0) {
            return { success: true, processedCount: 0, keywordsExtracted: 0, needsVectorIndex: false };
        }

        const fileKeywordsMap = new Map();
        
        // Extract keywords and update weights
        const keywordsExtracted = this._extractKeywordsAndUpdateWeights(logs, fileKeywordsMap);
        
        // Process IMPORTANT/TODO special lines and archive files
        const processedCount = this._processSpecialLinesAndArchive(logs);

        // Apply LTD and save
        this._applyLTDAndSave(fileKeywordsMap);
        
        silentObserve('distill-core-completed', 'workflow');
        
        return { 
            success: true, 
            processedCount, 
            keywordsExtracted, 
            totalConcepts: Object.keys(this.weights).length,
            needsVectorIndex: true
        };
    }

    /**
     * Vector Indexing (Slow Lane - 皮层慢通道)
     * Async API calls for semantic embedding
     * Should be called in background, non-blocking
     * @param {string} specificFile - Optional specific file to index
     */
    async distillVector(specificFile = null) {
        console.log('[Synapse] Vector indexing (slow lane, background)...');
        
        try {
            const SiliconEmbed = require('./silicon-embed');
            const embedder = new SiliconEmbed();
            
            if (!embedder.isConfigured()) {
                console.log('[Synapse] Vector indexing skipped: API not configured');
                return { success: false, reason: 'API not configured' };
            }
            
            const today = new Date().toISOString().split('T')[0];
            const targetFile = specificFile || path.join(LOGS_DIR, `${today}.md`);
            
            if (fs.existsSync(targetFile)) {
                await embedder.incrementalIndex(targetFile);
                console.log('[Synapse] Vector indexing completed');
                return { success: true, file: targetFile };
            } else {
                console.log('[Synapse] No file to index');
                return { success: false, reason: 'No file to index' };
            }
        } catch (e) {
            console.log('[Synapse] Vector indexing error:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * Memory Distiller (记忆蒸馏) - Full version with both lanes
     * Implements "Schema" formation from "Active" logs.
     * Scans daily logs, extracts sparse features (keywords/important lines),
     * updates weights, and moves raw logs to Latent storage (archive).
     * @param {boolean} forceToday - If true, also processes today's log (for /new session switch)
     */
    async distill(forceToday = false) {
        console.log('[Synapse] Starting distillation process...');
        
        // 优先执行观察者分析（不管有没有历史日志）
        this._performObserverAnalysis();
        
        const logs = this._getLogFiles(forceToday);
        
        // 收集每个文件的关键词用于赫布链接构建
        const fileKeywordsMap = new Map();

        if (logs.length === 0) {
            return 'No historical logs to distill. Today\'s log is kept Active.';
        }

        // Extract keywords and update weights
        const keywordsExtracted = this._extractKeywordsAndUpdateWeights(logs, fileKeywordsMap);
        
        // Process IMPORTANT/TODO special lines and archive files
        const processedCount = this._processSpecialLinesAndArchive(logs);

        // Apply LTD and save
        this._applyLTDAndSave(fileKeywordsMap);

        // Vector indexing (slow lane)
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
        
        // ==================== [Sprint 2] System 1: 生物稀疏锚定 (O(1) + O(E)) ====================
        const queryLower = query.toLowerCase();
        
        const activatedConcepts = new Set();
        const candidateFiles = new Set();
        let isPinnedHit = false;

        // 1. O(1) 锚定
        const anchorConcepts = Object.keys(this.weights).filter(k => 
            queryLower.includes(k) || k.includes(queryLower)
        );

        anchorConcepts.forEach(c => {
            activatedConcepts.add(c);
            (this.weights[c].refs || []).forEach(f => candidateFiles.add(f));

            if (this.weights[c].pinned || this.weights[c].weight > 100) {
                isPinnedHit = true; 
            }
            
            // 2. O(E) 赫布散播 (只沿边扩散)
            const synapses = this.weights[c].synapses || {};
            Object.entries(synapses).forEach(([relatedWord, connectionScore]) => {
                if (connectionScore > 0) {
                    activatedConcepts.add(relatedWord);
                    if (this.weights[relatedWord]) {
                        (this.weights[relatedWord].refs || []).forEach(f => candidateFiles.add(f));
                    }
                }
            });
        });
        
        // 应对极端情况：如果连锚点都没命中，放开进入全量扫描（System 2 fallback）
        const isSparseActive = candidateFiles.size > 0 && candidateFiles.size < Object.keys(this.weights).length;
        
        const topConcepts = Array.from(activatedConcepts)
            .sort((a, b) => (this.weights[b]?.weight || 0) - (this.weights[a]?.weight || 0))
            .slice(0, 5);
        
        // 4. 短时程增强 (LTP)
        topConcepts.forEach(c => {
            if (this.weights[c]) {
                this.weights[c].lastAccess = Date.now();
                this.weights[c].weight += 0.1;
                this.weights[c].recall_count = (this.weights[c].recall_count || 0) + 1;
            }
        });
        
        const hebbianTerms = this.getHebbianAssociations ? this.getHebbianAssociations(query) : [];
        const expandedQuery = [query, ...hebbianTerms];
        if (hebbianTerms.length > 0) {
            console.log(`[Synapse] Hebbian expansion: "${query}" → [${expandedQuery.join(', ')}]`);
        }
        
        this.save();

        // ==================== [Sprint 2] 动态阈值路由机制 ====================
        let searchResults = [];
        let searchSource = 'none';
        let vectorTimeout = false;
        
        // 判断熵：是否包含代码特殊符号或者非常长（典型的错误日志复制）
        const queryEntropy = query.length > 50 || /[\{\}\[\]\_<>=]/.test(query);

        const localStartTime = Date.now();
        // 启动 System 2: 我们把提取到的 candidates 传给下面
        const filterOpts = { candidateFiles: isSparseActive && !isPinnedHit && !queryEntropy ? Array.from(candidateFiles) : null };
        
        if (filterOpts.candidateFiles) {
            console.log(`[Synapse] 🧠 System 1 Pruning Active: Target restricted to ${filterOpts.candidateFiles.length} specific files.`);
        }

        const localSearchPromise = this.localFileSearch(expandedQuery, filterOpts)
            .then(result => {
                console.log(`[Synapse] System 2 (Precise Match) completed in ${Date.now() - localStartTime}ms`);
                return result;
            })
            .catch(e => {
                console.warn(`[Synapse] System 2 failed: ${e.message}`);
                return [];
            });
        
        const localResults = await localSearchPromise;
        const maxLocalScore = localResults.length > 0 ? Math.max(...localResults.map(r => r.score || 0)) : 0;
        
        // 熔断与否
        const LOCAL_HIGH_CONFIDENCE_THRESHOLD = 1000;
        // 如果触发了纯硅基路径（Pinned / Entropy 高），直接切断 Vector，采用 Exact Match
        if (maxLocalScore >= LOCAL_HIGH_CONFIDENCE_THRESHOLD || isPinnedHit || queryEntropy) {
            console.log(`[Synapse] ⚡ FAST TRACK: High confidence/Pinned/High-Entropy (score: ${maxLocalScore.toFixed(2)}), skipping vector API`);
            
            if (localResults.length > 0 && !deep) {
                searchResults = this.sortRecallResultsWithDynamicWeights(localResults, query);
            } else {
                searchResults = localResults;
            }
            searchSource = isPinnedHit ? 'hybrid-exact (pinned-hit)' : 'hybrid-exact (high-entropy/confidence)';
        } else {
            // 普通查询：向量介入 (兜底)
            const LOCAL_MODERATE_THRESHOLD = 50;
            const vectorTimeoutMs = maxLocalScore > LOCAL_MODERATE_THRESHOLD ? 1500 : 3000;
            
            let vectorSearchPromise = null;
            const SiliconEmbed = getSiliconEmbed();
            if (SiliconEmbed) {
                vectorSearchPromise = (async () => {
                    try {
                        const embedder = new SiliconEmbed();
                        const result = await Promise.race([
                            embedder.search(query),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Vector timeout')), vectorTimeoutMs))
                        ]);
                        return result?.success ? result.results : null;
                    } catch (error) {
                        vectorTimeout = error.message.includes('timeout');
                        return null;
                    }
                })();
            }
            
            let vectorResults = null;
            if (vectorSearchPromise) {
                try { vectorResults = await vectorSearchPromise; } catch (e) { vectorTimeout = true; }
            }
            
            if (vectorResults && vectorResults.length > 0) {
                searchResults = this._reciprocalRankFusion(localResults, vectorResults);
                searchSource = 'hybrid (local + vector)';
            } else {
                searchResults = localResults;
                searchSource = vectorTimeout ? 'local-file-search (vector-timeout)' : 'local-file-search (vector-unavailable)';
            }
        }
        
        let deepRecallResult = null;
        if (deep && this.deepRecall) {
            deepRecallResult = await this.deepRecall(expandedQuery, reviveLimit);
        }
        
        if (searchResults.length > 0 && !deep) {
            searchResults = this.sortRecallResultsWithDynamicWeights(searchResults, query);
        }
        
        const pinnedRules = Object.entries(this.weights)
            .filter(([key, val]) => val.pinned && (queryLower.includes(key) || key.includes(queryLower)))
            .map(([key, val]) => ({ keyword: key, rule: val.rule }));
        
        const result = {
            source: searchSource,
            activated_concepts: topConcepts,
            pinned_rules: pinnedRules,
            search_results: searchResults,
            weights_snapshot: topConcepts.map(c => ({ [c]: this.weights[c]?.weight || 0 })),
            scoring_mode: `${isSparseActive ? 'sparse-pruned' : 'full-scan'} ${maxLocalScore >= 1000 ? 'exact' : 'rrf_fusion'}`,
            is_fast_mode: maxLocalScore >= 1000 || isPinnedHit,
            _meta: {
                SYSTEM_NOTICE: "search_results[].content 已包含核心信息（最多 2000 字符）",
                USAGE_RULE: "直接使用 content 字段回答，禁止使用 Read 工具二次读取原 .md 文件"
            }
        };
        
        if (deepRecallResult) result.deep_recall = deepRecallResult;
        
        silentObserve(query, 'workflow');
        return result;
    }

    /**
     * 倒数排名融合 (Reciprocal Rank Fusion, RRF)
     * 公式：RRF Score = 1/(60 + local_rank) + 1/(60 + vector_rank)
     */
    _reciprocalRankFusion(localResults, vectorResults) {
        const K = 60;
        const rrfScores = new Map();
        const allResults = new Map();
        
        // 本地结果贡献分数
        localResults.forEach((result, rank) => {
            const filePath = result.file || result.path;
            const score = 1 / (K + rank);
            rrfScores.set(filePath, (rrfScores.get(filePath) || 0) + score);
            if (!allResults.has(filePath)) {
                allResults.set(filePath, { ...result, rrfScore: 0 });
            }
        });
        
        // 向量结果贡献分数
        vectorResults.forEach((result, rank) => {
            const filePath = result.file || result.path;
            const score = 1 / (K + rank);
            rrfScores.set(filePath, (rrfScores.get(filePath) || 0) + score);
            if (!allResults.has(filePath)) {
                allResults.set(filePath, { ...result, rrfScore: 0 });
            }
        });
        
        // 应用 RRF 分数并排序
        allResults.forEach((result, filePath) => {
            result.rrfScore = rrfScores.get(filePath) || 0;
            result.finalScore = result.rrfScore;
        });
        
        const fusedResults = Array.from(allResults.values())
            .sort((a, b) => b.rrfScore - a.rrfScore)
            .slice(0, 5);
        
        console.log(`[Synapse] RRF: Merged ${localResults.length} local + ${vectorResults.length} vector → ${fusedResults.length} fused`);
        
        return fusedResults;
    }
    
    /**
     * 构建统一的召回结果对象（带优化标志）
     */
    _buildRecallResultEnhanced(baseResult, isFastMode, scoredBy) {
        return {
            ...baseResult,
            scoring_mode: baseResult.scoring_mode === 'pure_similarity' 
                ? 'pure_similarity' 
                : (scoredBy === 'filename_match' ? 'filename_priority' : 'rrf_fusion'),
            is_fast_mode: isFastMode,
            _meta: {
                ...baseResult._meta,
                OPTIMIZATION: isFastMode 
                    ? "⚡ Fast-path short-circuit (high-confidence local match)"
                    : "🔀 Adaptive dual-track fusion (local + vector)"
            }
        };
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
    async localFileSearch(query, options = {}) {
        try {
            const LocalFileSearch = require('../local_file_search');
            const searcher = new LocalFileSearch();
            const result = await searcher.execute(query, options);
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



module.exports = SynapseMemory;
