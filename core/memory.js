/**
 * @file core/memory.js
 * @description Synapse Memory Core - Main memory management class
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const SynapseStorage = require('../storage/storage');
const { extractKeywords, isStopword } = require('./nlp');

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

function getVectorEmbed() {
    try {
        return require('../vector-embed.js');
    } catch(e) {
        return null;
    }
}

class SynapseMemory {
    constructor() {
        this.storage = new SynapseStorage(WEIGHTS_FILE, {});
        this.latentStorage = new SynapseStorage(LATENT_WEIGHTS_FILE, {});
        this.weights = this.storage.readSync();
        this.latentWeights = this.latentStorage.readSync();
        this.observationsDir = path.join(__dirname, '../observations');
        this.instinctsDir = path.join(__dirname, '../instincts');
        
        this._initAdvancedModules();
        
        if (!fs.existsSync(this.observationsDir)) fs.mkdirSync(this.observationsDir, { recursive: true });
        if (!fs.existsSync(this.instinctsDir)) fs.mkdirSync(this.instinctsDir, { recursive: true });
    }
    
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
        this.storage.writeAsync(this.weights).catch(e => console.error("Save error:", e));
    }

    saveLatent() {
        this.latentStorage.writeAsync(this.latentWeights).catch(e => console.error("Latent save error:", e));
    }

    _getLogFiles(forceToday = false) {
        const today = new Date().toISOString().split('T')[0];
        let logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/) && !f.includes(today);
        if (forceToday) {
            logFilter = f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/);
            console.log('[Synapse] Force mode: Including today\'s log');
        }
        return fs.readdirSync(LOGS_DIR).filter(logFilter);
    }

    _extractKeywordsAndUpdateWeights(logs, fileKeywordsMap) {
        let keywordsExtracted = 0;
        
        logs.forEach(file => {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const keywords = extractKeywords(content);
            
            if (this.stdpTrainer) {
                try {
                    this.stdpTrainer.processContent(content);
                } catch (e) {
                    console.warn('[Synapse] STDP processing failed:', e.message);
                }
            }
            
            keywords.forEach(keyword => {
                const lowerKeyword = keyword.toLowerCase();
                
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

    _processSpecialLinesAndArchive(logs) {
        let processedCount = 0;
        
        logs.forEach(file => {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const lines = content.split('\n');
            lines.forEach(line => {
                if (line.match(/(IMPORTANT|TODO|DECISION|LESSON|REMEMBER)/i)) {
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

    _applyLTDAndSave(fileKeywordsMap) {
        this.applyUnusedRecallPenalty();
        this.buildHebbianLinks(fileKeywordsMap);
        this.applyLTD();
        this.save();
    }

    _performObserverAnalysis() {
        try {
            const Observer = require('../observer.js');
            const obs = new Observer();
            obs.performBatchAnalysis();
        } catch (e) {
            console.log(`[Observer] Batch analysis skipped: ${e.message}`);
        }
    }

    distillCore(forceToday = false) {
        console.log('[Synapse] Core distillation (fast lane)...');
        
        const weightsStat = fs.existsSync(WEIGHTS_FILE) ? fs.statSync(WEIGHTS_FILE) : null;
        const weightsMtime = weightsStat ? weightsStat.mtimeMs : 0;
        
        const logs = this._getLogFiles(forceToday);
        
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
        
        this._performObserverAnalysis();
        
        if (logs.length === 0) {
            return { success: true, processedCount: 0, keywordsExtracted: 0, needsVectorIndex: false };
        }

        const fileKeywordsMap = new Map();
        
        const keywordsExtracted = this._extractKeywordsAndUpdateWeights(logs, fileKeywordsMap);
        
        const processedCount = this._processSpecialLinesAndArchive(logs);

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

    async distillVector(specificFile = null) {
        console.log('[Synapse] Vector indexing (slow lane, background)...');
        
        try {
            const VectorEmbed = require('../vector-embed');
            const embedder = new VectorEmbed();
            
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

    async distill(forceToday = false) {
        console.log('[Synapse] Starting distillation process...');
        
        this._performObserverAnalysis();
        
        const logs = this._getLogFiles(forceToday);
        
        const fileKeywordsMap = new Map();

        if (logs.length === 0) {
            return 'No historical logs to distill. Today\'s log is kept Active.';
        }

        const keywordsExtracted = this._extractKeywordsAndUpdateWeights(logs, fileKeywordsMap);
        
        const processedCount = this._processSpecialLinesAndArchive(logs);

        this._applyLTDAndSave(fileKeywordsMap);

        try {
            const VectorEmbed = require('../vector-embed');
            const embedder = new VectorEmbed();
            if (embedder.isConfigured()) {
                const today = new Date().toISOString().split('T')[0];
                const todayFile = path.join(LOGS_DIR, `${today}.md`);
                if (fs.existsSync(todayFile)) {
                    console.log('[Synapse] Today\'s memory file detected, triggering incremental vector indexing...');
                    await embedder.incrementalIndex(todayFile);
                }
            }
        } catch (e) {
            console.log('[Synapse] Incremental indexing skipped:', e.message);
        }
        
        silentObserve('distill-completed', 'workflow');
        
        return `Distilled ${processedCount} logs. Extracted ${keywordsExtracted} keywords. Current concepts: ${Object.keys(this.weights).length}`;
    }

    async recall(query, options = {}) {
        const { deep = false, reviveLimit = 5 } = options;
        console.log(`[Synapse] Recalling: "${query}"${deep ? ' (deep mode)' : ''}`);
        
        const queryLower = query.toLowerCase();
        
        const activatedConcepts = new Set();
        const candidateFiles = new Set();
        let isPinnedHit = false;

        const anchorConcepts = Object.keys(this.weights).filter(k => 
            queryLower.includes(k) || k.includes(queryLower)
        );

        anchorConcepts.forEach(c => {
            activatedConcepts.add(c);
            (this.weights[c].refs || []).forEach(f => candidateFiles.add(f));

            if (this.weights[c].pinned || this.weights[c].weight > 100) {
                isPinnedHit = true; 
            }
            
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
        
        const isSparseActive = candidateFiles.size > 0 && candidateFiles.size < Object.keys(this.weights).length;
        
        const topConcepts = Array.from(activatedConcepts)
            .sort((a, b) => (this.weights[b]?.weight || 0) - (this.weights[a]?.weight || 0))
            .slice(0, 5);
        
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
            console.log(`[Synapse] Hebbian expansion: "${query}" -> [${expandedQuery.join(', ')}]`);
        }
        
        this.save();

        let searchResults = [];
        let searchSource = 'none';
        let vectorTimeout = false;
        
        const queryEntropy = query.length > 50 || /[\{\}\[\]\_<>=]/.test(query);

        const localStartTime = Date.now();
        const filterOpts = { candidateFiles: isSparseActive && !isPinnedHit && !queryEntropy ? Array.from(candidateFiles) : null };
        
        if (filterOpts.candidateFiles) {
            console.log(`[Synapse] System 1 Pruning Active: Target restricted to ${filterOpts.candidateFiles.length} specific files.`);
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
        
        const LOCAL_HIGH_CONFIDENCE_THRESHOLD = 1000;
        if (maxLocalScore >= LOCAL_HIGH_CONFIDENCE_THRESHOLD || isPinnedHit || queryEntropy) {
            searchResults = localResults;
            searchSource = 'local-high-confidence';
            console.log(`[Synapse] Local high confidence (${maxLocalScore}), skipping vector search`);
        } else {
            const vectorStartTime = Date.now();
            let vectorResults = [];
            
            try {
                const VectorEmbed = getVectorEmbed();
                if (VectorEmbed) {
                    const embedder = new VectorEmbed();
                    if (embedder.isConfigured()) {
                        const vectorPromise = embedder.search(query, 3);
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Vector timeout')), 3000)
                        );
                        
                        vectorResults = await Promise.race([vectorPromise, timeoutPromise]);
                        console.log(`[Synapse] Vector search completed in ${Date.now() - vectorStartTime}ms`);
                    }
                }
            } catch (e) {
                vectorTimeout = true;
                console.log(`[Synapse] Vector search ${e.message === 'Vector timeout' ? 'timed out' : 'failed'}: ${e.message}`);
            }
            
            if (vectorResults && vectorResults.success && vectorResults.results && vectorResults.results.length > 0) {
                searchResults = this.mergeSearchResults(localResults, vectorResults.results);
                searchSource = 'hybrid';
            } else {
                searchResults = localResults;
                searchSource = vectorTimeout ? 'local-vector-timeout' : 'local';
            }
        }

        if (deep) {
            const latentResults = await this.deepRecall(query, reviveLimit);
            return {
                source: 'brain_synapse_deep',
                query: query,
                concepts: topConcepts,
                hebbian_expansion: hebbianTerms,
                results: searchResults,
                search_source: searchSource,
                latent_revived: latentResults.revived_memories,
                total_concepts: Object.keys(this.weights).length
            };
        }
        
        return {
            source: 'brain_synapse',
            query: query,
            concepts: topConcepts,
            hebbian_expansion: hebbianTerms,
            results: searchResults,
            search_source: searchSource,
            total_concepts: Object.keys(this.weights).length
        };
    }

    async deepRecall(query, reviveLimit = 5) {
        console.log(`[Synapse] Deep recall from latent storage: "${query}"`);
        
        const queryLower = query.toLowerCase();
        const revived = [];
        
        for (const [keyword, memory] of Object.entries(this.latentWeights)) {
            if (keyword.includes(queryLower) || queryLower.includes(keyword)) {
                if (revived.length < reviveLimit) {
                    this.weights[keyword] = {
                        ...memory,
                        weight: REVIVED_WEIGHT,
                        lastAccess: Date.now(),
                        revivedFrom: 'latent'
                    };
                    delete this.latentWeights[keyword];
                    revived.push({ keyword, memory });
                }
            }
        }
        
        if (revived.length > 0) {
            this.save();
            this.saveLatent();
            console.log(`[Synapse] Revived ${revived.length} memories from latent storage`);
        }
        
        const archiveContext = [];
        try {
            const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md'));
            for (const file of archiveFiles.slice(0, 10)) {
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

    applyLTD() {
        const toArchive = [];
        
        for (const [keyword, data] of Object.entries(this.weights)) {
            if (data.pinned) continue;
            
            data.weight *= DECAY_RATE;
            
            if (data.weight < FORGET_THRESHOLD) {
                toArchive.push(keyword);
            }
        }
        
        for (const keyword of toArchive) {
            this.latentWeights[keyword] = {
                ...this.weights[keyword],
                archivedAt: Date.now()
            };
            delete this.weights[keyword];
        }
        
        if (toArchive.length > 0) {
            console.log(`[Synapse] LTD: Archived ${toArchive.length} low-weight memories to latent storage`);
            this.saveLatent();
        }
    }

    buildHebbianLinks(fileKeywordsMap) {
        let linksCreated = 0;
        
        for (const [file, keywords] of fileKeywordsMap) {
            for (let i = 0; i < keywords.length; i++) {
                for (let j = i + 1; j < keywords.length; j++) {
                    const wordA = keywords[i];
                    const wordB = keywords[j];
                    
                    if (!this.weights[wordA]) this.weights[wordA] = { weight: 1.0, refs: [] };
                    if (!this.weights[wordB]) this.weights[wordB] = { weight: 1.0, refs: [] };
                    
                    if (!this.weights[wordA].synapses) this.weights[wordA].synapses = {};
                    if (!this.weights[wordB].synapses) this.weights[wordB].synapses = {};
                    
                    this.weights[wordA].synapses[wordB] = (this.weights[wordA].synapses[wordB] || 0) + 0.1;
                    this.weights[wordB].synapses[wordA] = (this.weights[wordB].synapses[wordA] || 0) + 0.1;
                    
                    linksCreated++;
                }
            }
        }
        
        if (linksCreated > 0) {
            console.log(`[Synapse] Hebbian: Created ${linksCreated} synaptic links`);
        }
    }

    getHebbianAssociations(query) {
        const queryLower = query.toLowerCase();
        const associations = [];
        
        if (this.weights[queryLower] && this.weights[queryLower].synapses) {
            const synapses = this.weights[queryLower].synapses;
            const sorted = Object.entries(synapses)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            
            for (const [word, strength] of sorted) {
                if (strength > 0.2) {
                    associations.push(word);
                }
            }
        }
        
        return associations;
    }

    applyUnusedRecallPenalty() {
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        for (const [keyword, data] of Object.entries(this.weights)) {
            if (data.pinned) continue;
            
            const daysSinceAccess = (now - (data.lastAccess || data.lastSeen)) / ONE_DAY;
            if (daysSinceAccess > 7 && data.recall_count === 0) {
                data.weight *= 0.9;
            }
        }
    }

    async localFileSearch(queries, options = {}) {
        try {
            const LocalFileSearch = require('../local_file_search.js');
            const searcher = new LocalFileSearch();
            return await searcher.execute(queries, options);
        } catch (e) {
            console.warn(`[Synapse] Local file search failed: ${e.message}`);
            return [];
        }
    }

    mergeSearchResults(localResults, vectorResults) {
        const merged = new Map();
        
        for (const result of localResults) {
            merged.set(result.file, {
                ...result,
                localScore: result.score,
                vectorScore: 0
            });
        }
        
        for (const result of vectorResults) {
            if (merged.has(result.file)) {
                merged.get(result.file).vectorScore = result.similarity;
            } else {
                merged.set(result.file, {
                    file: result.file,
                    preview: result.preview,
                    localScore: 0,
                    vectorScore: result.similarity
                });
            }
        }
        
        return Array.from(merged.values())
            .map(r => ({
                ...r,
                score: r.localScore + (r.vectorScore * 100)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    observe(sessionHistory) {
        console.log('[Synapse] Starting observer analysis...');
        
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
        
        const patterns = {
            userCorrections: [],
            errorResolutions: [],
            repeatedWorkflows: [],
            toolPreferences: []
        };
        
        this.detectUserCorrections(sessionHistory, patterns);
        this.detectErrorResolutions(sessionHistory, patterns);
        this.detectRepeatedWorkflows(sessionHistory, patterns);
        this.detectToolPreferences(sessionHistory, patterns);
        
        const newInstincts = this.createInstinctsFromPatterns(patterns, existingInstincts);
        
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
    
    detectUserCorrections(sessionHistory, patterns) {
        for (let i = 1; i < sessionHistory.length; i++) {
            const current = sessionHistory[i];
            const previous = sessionHistory[i - 1];
            
            if (current.role === 'user' && previous.role === 'assistant') {
                const userMessage = current.content[0]?.text?.toLowerCase() || '';
                if (userMessage.includes('no,') || userMessage.includes('actually')) {
                    patterns.userCorrections.push({
                        timestamp: current.timestamp,
                        correction: userMessage,
                        context: previous.content[0]?.text || ''
                    });
                }
            }
        }
    }
    
    detectErrorResolutions(sessionHistory, patterns) {
        for (let i = 0; i < sessionHistory.length - 1; i++) {
            const current = sessionHistory[i];
            const next = sessionHistory[i + 1];
            
            const currentContent = current.content[0]?.text || '';
            if (currentContent.includes('error') || currentContent.includes('failed')) {
                const nextContent = next.content[0]?.text || '';
                if (nextContent.includes('success') || nextContent.includes('completed')) {
                    patterns.errorResolutions.push({
                        timestamp: next.timestamp,
                        error: currentContent,
                        resolution: nextContent
                    });
                }
            }
        }
    }
    
    detectRepeatedWorkflows(sessionHistory, patterns) {
        const toolSequences = [];
        let currentSequence = [];
        
        sessionHistory.forEach(msg => {
            if (msg.content && Array.isArray(msg.content)) {
                msg.content.forEach(item => {
                    if (item.type === 'toolCall') {
                        if (currentSequence.length > 0 && 
                            Math.abs(msg.timestamp - currentSequence[currentSequence.length - 1].timestamp) > 300000) {
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
        
        toolUsage.forEach((count, tool) => {
            if (count >= 3) {
                patterns.toolPreferences.push({
                    tool: tool,
                    usageCount: count
                });
            }
        });
    }
    
    createInstinctsFromPatterns(patterns, existingInstincts) {
        const newInstincts = [];
        const now = Date.now();
        
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
        
        return newInstincts;
    }
}

module.exports = SynapseMemory;
