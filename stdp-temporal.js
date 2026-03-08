/**
 * @file brain_synapse/stdp-temporal.js
 * @description STDP (Spike-Timing-Dependent Plasticity) Temporal Learning Module
 * @author Brain Synapse Team
 * @version 1.5.0
 * 
 * Based on human brain STDP mechanism:
 * - Presynaptic neuron fires before postsynaptic neuron → LTP (strengthening)
 * - Presynaptic neuron fires after postsynaptic neuron → LTD (weakening)
 * - Smaller time difference = larger weight change
 */

const fs = require('fs');
const path = require('path');

const TEMPORAL_WEIGHTS_FILE = path.join(__dirname, 'temporal_weights.json');

const STDP_WINDOW_MS = 5000;
const STDP_MAX_STRENGTH = 1.0;
const STDP_DECAY_RATE = 0.98;

class STDPTrainer {
    constructor() {
        this.temporalWeights = this.loadTemporalWeights();
    }

    loadTemporalWeights() {
        if (fs.existsSync(TEMPORAL_WEIGHTS_FILE)) {
            return JSON.parse(fs.readFileSync(TEMPORAL_WEIGHTS_FILE, 'utf8'));
        }
        return {};
    }

    saveTemporalWeights() {
        fs.writeFileSync(TEMPORAL_WEIGHTS_FILE, JSON.stringify(this.temporalWeights, null, 2), 'utf8');
    }

    extractTemporalKeywords(content, baseTimestamp = Date.now()) {
        const lines = content.split('\n');
        const keywords = [];
        
        lines.forEach((line, lineIndex) => {
            const chineseWords = line.match(/[\u4e00-\u9fa5]{2,}/g) || [];
            const englishWords = line.match(/[a-zA-Z]{3,}/g) || [];
            
            [...chineseWords, ...englishWords].forEach(word => {
                keywords.push({
                    keyword: word.toLowerCase(),
                    position: lineIndex,
                    timestamp: baseTimestamp + (lineIndex * 100)
                });
            });
        });
        
        return keywords;
    }

    applySTDP(keywords) {
        let updates = 0;
        
        for (let i = 0; i < keywords.length; i++) {
            for (let j = i + 1; j < keywords.length; j++) {
                const pre = keywords[i];
                const post = keywords[j];
                
                if (pre.keyword === post.keyword) continue;
                
                const timeDiff = post.timestamp - pre.timestamp;
                
                if (timeDiff > STDP_WINDOW_MS) break;
                
                const strength = STDP_MAX_STRENGTH * Math.exp(-timeDiff / 1000);
                
                if (!this.temporalWeights[pre.keyword]) {
                    this.temporalWeights[pre.keyword] = {};
                }
                
                const currentWeight = this.temporalWeights[pre.keyword][post.keyword] || 0;
                this.temporalWeights[pre.keyword][post.keyword] = 
                    Math.min(STDP_MAX_STRENGTH, currentWeight + strength * 0.1);
                
                updates++;
            }
        }
        
        if (updates > 0) {
            console.log(`[STDP] Applied learning: ${updates} temporal connections updated`);
        }
        
        return updates;
    }

    applyTemporalDecay() {
        let decayed = 0;
        
        Object.keys(this.temporalWeights).forEach(source => {
            Object.keys(this.temporalWeights[source]).forEach(target => {
                this.temporalWeights[source][target] *= STDP_DECAY_RATE;
                
                if (this.temporalWeights[source][target] < 0.01) {
                    delete this.temporalWeights[source][target];
                    decayed++;
                }
            });
            
            if (Object.keys(this.temporalWeights[source]).length === 0) {
                delete this.temporalWeights[source];
            }
        });
        
        if (decayed > 0) {
            console.log(`[STDP] Decayed ${decayed} weak temporal connections`);
        }
    }

    getTemporalPredictions(keyword, topN = 3) {
        const predictions = this.temporalWeights[keyword.toLowerCase()];
        if (!predictions) return [];
        
        return Object.entries(predictions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([kw, weight]) => ({
                keyword: kw,
                probability: weight
            }));
    }

    detectCausalChain(startKeyword, maxDepth = 3) {
        const chain = [startKeyword];
        let current = startKeyword.toLowerCase();
        
        for (let i = 0; i < maxDepth; i++) {
            const predictions = this.getTemporalPredictions(current, 1);
            if (predictions.length === 0) break;
            
            const next = predictions[0];
            if (next.probability < 0.3) break;
            
            chain.push(next.keyword);
            current = next.keyword;
        }
        
        return chain;
    }

    processContent(content) {
        const keywords = this.extractTemporalKeywords(content);
        const updates = this.applySTDP(keywords);
        this.saveTemporalWeights();
        return updates;
    }

    getStats() {
        const sources = Object.keys(this.temporalWeights).length;
        let connections = 0;
        
        Object.values(this.temporalWeights).forEach(targets => {
            connections += Object.keys(targets).length;
        });
        
        return {
            sourceNodes: sources,
            totalConnections: connections,
            averageConnectionsPerNode: sources > 0 ? (connections / sources).toFixed(2) : 0
        };
    }
}

module.exports = STDPTrainer;
