/**
 * @file brain_synapse/observer.js
 * @description Observer Pattern Implementation - Read/Write Separation Architecture
 * @version 2.0.0
 * 
 * ==================== Functionality Description ====================
 * 
 * This module implements the Observer Pattern for automatically identifying user behavior patterns and creating "Instincts".
 * 
 * Read/Write Separation Architecture:
 * - Ultra-fast write: recordObservation() only performs synchronous append to observations.jsonl
 * - Heavy computation: performBatchAnalysis() is called during distill, analyzes and generates pinned rules
 * 
 * Observation Types:
 * - user_correction: User correction pattern
 * - error_resolution: Error resolution pattern
 * - workflow: Workflow pattern
 * - tool_preference: Tool preference pattern
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
     * Simple file lock mechanism (prevents JSON corruption from concurrent writes)
     */
    acquireLock(maxRetries = 5, delayMs = 50) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                if (!fs.existsSync(this.LOCK_FILE)) {
                    fs.writeFileSync(this.LOCK_FILE, Date.now().toString(), 'utf8');
                    return true;
                }
            } catch (e) {
                // Lock file is occupied, wait
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
     * Ultra-fast write: only performs synchronous append to file
     * @param {Object} observation - Observation data
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
            console.error(`[Observer] Failed to record observation: ${error.message}`);
        }
        
        return observationRecord.id;
    }

    /**
     * Get observation record count
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
     * Heavy computation: called during distill
     * Analyze all observation records, generate pinned rules
     */
    performBatchAnalysis() {
        console.log('[Observer] Starting batch analysis...');
        
        const count = this.getObservationCount();
        console.log(`[Observer] Found ${count} observation records`);
        
        if (count < 5) {
            console.log(`[Observer] Insufficient observation records (need 5, current ${count})`);
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
            console.log(`[Observer] ✅ Created ${instinctCreated} instinct rules`);
            this.clearObservations();
        } else {
            console.log(`[Observer] No patterns detected (need 3+ similar observations)`);
        }
    }

    /**
     * Generate instincts from analysis results
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
     * Create or update instinct (writes to synapse_weights.json, with pinned: true)
     */
    createOrUpdateInstinct(instinct) {
        if (!this.acquireLock()) {
            console.log(`[Observer] Failed to acquire lock, skipping instinct creation: ${instinct.id}`);
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
            console.log(`[Observer] ✅ Created pinned instinct: ${instinct.id}`);
            return true;
        } catch (error) {
            console.error(`[Observer] Failed to create instinct: ${error.message}`);
            return false;
        } finally {
            this.releaseLock();
        }
    }

    /**
     * Clear observation record file
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
                "Dependency on external toolchains (e.g., QMD) increases system fragility",
                "GitHub clone failures may be related to network environment or authentication issues",
                "Lack of automated error recovery mechanisms"
            ];
            
            analysisResult.recommendations = [
                "Establish localized backup search mechanisms to reduce dependency on external tools",
                "Implement more robust error handling and retry strategies",
                "Create standardized development environment configuration processes"
            ];
        }
        
        return analysisResult;
    }
}

module.exports = ObserverPattern;
