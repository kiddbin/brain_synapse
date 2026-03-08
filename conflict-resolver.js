/**
 * @file brain_synapse/conflict-resolver.js
 * @description Memory Conflict Resolution Module
 * @author Brain Synapse Team
 * @version 1.5.0
 * 
 * Handles contradictions between new and old memories:
 * - Refinement: New memory adds details to old memory
 * - Update: Newer timestamp memory replaces older
 * - Supersession: New version completely replaces old
 * - Flag: Uncertain conflicts pending manual review
 */

const fs = require('fs');
const path = require('path');

const CONFLICT_LOG_FILE = path.join(__dirname, 'conflict_log.json');

class ConflictResolver {
    constructor(weights) {
        this.weights = weights;
        this.conflictLog = this.loadConflictLog();
    }

    loadConflictLog() {
        if (fs.existsSync(CONFLICT_LOG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFLICT_LOG_FILE, 'utf8'));
        }
        return [];
    }

    saveConflictLog() {
        fs.writeFileSync(CONFLICT_LOG_FILE, JSON.stringify(this.conflictLog, null, 2), 'utf8');
    }

    calculateSemanticSimilarity(conceptA, conceptB) {
        const keywordsA = new Set(this.extractKeywords(conceptA));
        const keywordsB = new Set(this.extractKeywords(conceptB));
        
        const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
        const union = new Set([...keywordsA, ...keywordsB]);
        
        return intersection.size / union.size;
    }

    extractKeywords(text) {
        const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];
        return [...chineseWords, ...englishWords].map(w => w.toLowerCase());
    }

    isRefinement(newFact, oldFact) {
        const newKeywords = new Set(this.extractKeywords(newFact.rule || newFact));
        const oldKeywords = new Set(this.extractKeywords(oldFact.rule || oldFact));
        
        for (const kw of oldKeywords) {
            if (!newKeywords.has(kw)) return false;
        }
        
        return newKeywords.size > oldKeywords.size;
    }

    isUpdate(newFact, oldFact) {
        const similarity = this.calculateSemanticSimilarity(
            newFact.keyword || newFact,
            oldFact.keyword || oldFact
        );
        
        return similarity > 0.7 && !this.isRefinement(newFact, oldFact);
    }

    isSupersession(newFact, oldFact) {
        const newText = (newFact.rule || newFact).toLowerCase();
        const supersessionMarkers = [
            'v2', 'v3', 'new-version', 'updated', 'upgrade',
            'replace', 'supersede', 'deprecated', 'changed-to'
        ];
        
        return supersessionMarkers.some(marker => newText.includes(marker));
    }

    hasOppositeConclusion(newFact, oldFact) {
        const newText = (newFact.rule || newFact).toLowerCase();
        const oldText = (oldFact.rule || oldFact).toLowerCase();
        
        const opposites = [
            ['must', 'forbidden'],
            ['use', 'do-not-use'],
            ['enable', 'disable'],
            ['increase', 'decrease'],
            ['is', 'is-not'],
            ['can', 'cannot'],
            ['true', 'false']
        ];
        
        return opposites.some(([pos, neg]) => 
            (newText.includes(pos) && oldText.includes(neg)) ||
            (newText.includes(neg) && oldText.includes(pos))
        );
    }

    findConflicts(newFact, existingFacts, similarityThreshold = 0.6) {
        const conflicts = [];
        
        for (const oldFact of existingFacts) {
            const similarity = this.calculateSemanticSimilarity(
                newFact.keyword || newFact,
                oldFact.keyword || oldFact
            );
            
            if (similarity >= similarityThreshold) {
                const isOpposite = this.hasOppositeConclusion(newFact, oldFact);
                conflicts.push({
                    existing: oldFact,
                    similarity,
                    isOpposite,
                    relationship: this.classifyRelationship(newFact, oldFact)
                });
            }
        }
        
        return conflicts.sort((a, b) => b.similarity - a.similarity);
    }

    classifyRelationship(newFact, oldFact) {
        if (this.isRefinement(newFact, oldFact)) return 'refinement';
        if (this.isSupersession(newFact, oldFact)) return 'supersession';
        if (this.isUpdate(newFact, oldFact)) return 'update';
        return 'uncertain';
    }

    resolveConflict(newFact, conflicts) {
        if (conflicts.length === 0) {
            return { action: 'create', reason: 'no_conflict' };
        }
        
        const topConflict = conflicts[0];
        const oldFact = topConflict.existing;
        
        let result;
        
        switch (topConflict.relationship) {
            case 'refinement':
                result = {
                    action: 'refine',
                    oldFact,
                    newFact,
                    merged: this.mergeFacts(oldFact, newFact),
                    reason: 'new_fact_refines_old'
                };
                break;
                
            case 'supersession':
                result = {
                    action: 'supersede',
                    oldFact,
                    newFact,
                    reason: 'explicit_version_upgrade'
                };
                break;
                
            case 'update':
                const newTime = newFact.lastAccess || newFact.firstSeen || Date.now();
                const oldTime = oldFact.lastAccess || oldFact.firstSeen || 0;
                
                if (newTime > oldTime) {
                    result = {
                        action: 'update',
                        oldFact,
                        newFact,
                        reason: 'newer_timestamp'
                    };
                } else {
                    result = {
                        action: 'keep_old',
                        oldFact,
                        newFact,
                        reason: 'existing_is_newer'
                    };
                }
                break;
                
            default:
                result = {
                    action: 'flag',
                    oldFact,
                    newFact,
                    conflicts,
                    reason: 'uncertain_relationship'
                };
        }
        
        this.conflictLog.push({
            timestamp: Date.now(),
            newFact: newFact.keyword || newFact,
            oldFact: oldFact.keyword || oldFact,
            action: result.action,
            reason: result.reason
        });
        
        if (this.conflictLog.length > 100) {
            this.conflictLog = this.conflictLog.slice(-100);
        }
        
        this.saveConflictLog();
        
        return result;
    }

    mergeFacts(oldFact, newFact) {
        const merged = { ...oldFact };
        
        merged.firstSeen = oldFact.firstSeen;
        merged.count = (oldFact.count || 0) + (newFact.count || 1);
        
        if (newFact.rule) {
            merged.rule = newFact.rule;
        }
        
        merged.lastAccess = Date.now();
        merged.lastSeen = Date.now();
        
        merged.weight = Math.max(oldFact.weight || 1, newFact.weight || 1) + 0.2;
        
        return merged;
    }

    checkAndResolve(newFact, weights) {
        const existingFacts = Object.entries(weights).map(([keyword, data]) => ({
            keyword,
            ...data
        }));
        
        const conflicts = this.findConflicts(newFact, existingFacts);
        return this.resolveConflict(newFact, conflicts);
    }

    getConflictLog(limit = 20) {
        return this.conflictLog.slice(-limit);
    }

    getStats() {
        const stats = {
            totalConflicts: this.conflictLog.length,
            byAction: {}
        };
        
        this.conflictLog.forEach(entry => {
            stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
        });
        
        return stats;
    }
}

module.exports = ConflictResolver;
