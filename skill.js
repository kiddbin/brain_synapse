/**
 * @file brain_synapse/skill.js
 * @description Digital Synapse Memory Core Implementation
 * @author Foundry (on behalf of Antigravity)
 * @version 2.0.0
 * 
 * Based on "Human Brain Memory Mechanism Deep Research Report":
 * 1. Sparse Coding: Extract only high-weight features, ignore redundant information.
 * 2. Hierarchical Storage: Active -> Schema -> Latent.
 * 3. Long-Term Depression (LTD): Active forgetting of low-frequency synapses.
 * 4. Spreading Activation: Activation diffusion mechanism.
 * 5. Observer Pattern: Active identification of session patterns and behavior patterns.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory');
const ARCHIVE_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory/archive');
const WEIGHTS_FILE = path.join(__dirname, 'synapse_weights.json');
const LATENT_WEIGHTS_FILE = path.join(__dirname, 'latent_weights.json');
const INSTINCTS_DIR = path.join(__dirname, 'instincts');

const DECAY_RATE = 0.95;
const FORGET_THRESHOLD = 0.1;
const REVIVED_WEIGHT = 0.5;
const INITIAL_WEIGHT = 1.0;

const MIN_OBSERVATIONS_FOR_INSTINCT = 3;
const CONFIDENCE_BASE = 0.3;
const CONFIDENCE_INCREMENT = 0.05;
const CONFIDENCE_DECREMENT = 0.1;
const CONFIDENCE_DECAY_WEEKLY = 0.02;

if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
if (!fs.existsSync(INSTINCTS_DIR)) fs.mkdirSync(INSTINCTS_DIR, { recursive: true });
if (!fs.existsSync(WEIGHTS_FILE)) fs.writeFileSync(WEIGHTS_FILE, '{}', 'utf8');
if (!fs.existsSync(LATENT_WEIGHTS_FILE)) fs.writeFileSync(LATENT_WEIGHTS_FILE, '{}', 'utf8');

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
        // Silent failure, does not affect main flow
    }
}

const SynapseMemory = require('./core/memory');

const [,, command, ...args] = process.argv;
const memory = new SynapseMemory();

async function main() {
    switch (command) {
        case 'distill':
            const forceDistill = args.includes('--force') || args.includes('-f');
            const distillResult = await memory.distill(forceDistill);
            console.log(distillResult);
            break;
        case 'distill-core':
            const forceCore = args.includes('--force') || args.includes('-f');
            const coreResult = memory.distillCore(forceCore);
            console.log(JSON.stringify(coreResult, null, 2));
            process.exit(0);
            break;
        case 'distill-vector':
            const vectorResult = await memory.distillVector(args[0]);
            console.log(JSON.stringify(vectorResult, null, 2));
            process.exit(0);
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
                console.error('Example: pin-exp browser_fill:Use type instead of fill when encountering fill errors');
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
        case 'memorize':
            const memArgs = args.join(' ');
            let memConcept, memContent;
            
            const memColonIndex = memArgs.indexOf(':');
            if (memColonIndex !== -1) {
                memConcept = memArgs.substring(0, memColonIndex).trim();
                memContent = memArgs.substring(memColonIndex + 1).trim();
            } else {
                const memParts = args;
                if (memParts.length < 2) {
                    console.error('Usage: memorize <concept>:<content>');
                    console.error('   or: memorize <concept> <content>');
                    console.error('');
                    console.error('Examples:');
                    console.error('  node skill.js memorize "user_preference:prefers Chinese communication"');
                    console.error('  node skill.js memorize "user_preference" "prefers Chinese communication"');
                    console.error('  node skill.js memorize "important:meeting at 3pm tomorrow"');
                    process.exit(1);
                }
                memConcept = memParts[0];
                memContent = memParts.slice(1).join(' ');
            }
            
            if (!memConcept || !memContent) {
                console.error('Concept and content are required');
                process.exit(1);
            }
            
            const memLower = memConcept.toLowerCase();
            const timestamp = Date.now();
            memory.weights[memLower] = {
                weight: 5.0,
                lastAccess: timestamp,
                lastSeen: timestamp,
                firstSeen: timestamp,
                count: 1,
                refs: [],
                rule: memContent,
                source: 'explicit_memorize',
                memorizedAt: new Date().toISOString()
            };
            memory.save();
            
            console.log(`[Synapse] Instant memory physically written: "${memConcept}"`);
            console.log(`[Synapse] Content: "${memContent}"`);
            console.log(`[Synapse] Weight: 5.0 (strong LTP, will decay if not reactivated)`);
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
            let sessionHistory = [];
            try {
                if (args.length > 0) {
                    const historyFile = args[0];
                    if (fs.existsSync(historyFile)) {
                        sessionHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                    }
                } else {
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
        case 'stdp-stats':
            if (memory.stdpTrainer) {
                const stdpStats = memory.stdpTrainer.getStats();
                console.log(JSON.stringify(stdpStats, null, 2));
            } else {
                console.log('STDP module not available');
            }
            setTimeout(() => process.exit(0), 10);
            break;
        case 'stdp-predict':
            const predictQuery = args.join(' ');
            if (memory.stdpTrainer) {
                const predictions = memory.stdpTrainer.getTemporalPredictions(predictQuery, 5);
                console.log(JSON.stringify({
                    query: predictQuery,
                    predictions: predictions
                }, null, 2));
            } else {
                console.log('STDP module not available');
            }
            setTimeout(() => process.exit(0), 10);
            break;
        case 'stdp-chain':
            const chainStart = args[0];
            const maxDepth = parseInt(args[1]) || 3;
            if (memory.stdpTrainer) {
                const chain = memory.stdpTrainer.detectCausalChain(chainStart, maxDepth);
                console.log(JSON.stringify({
                    start: chainStart,
                    chain: chain
                }, null, 2));
            } else {
                console.log('STDP module not available');
            }
            setTimeout(() => process.exit(0), 10);
            break;
        case 'conflict-log':
            const limit = parseInt(args[0]) || 20;
            if (memory.conflictResolver) {
                const log = memory.conflictResolver.getConflictLog(limit);
                console.log(JSON.stringify(log, null, 2));
            } else {
                console.log('Conflict resolver not available');
            }
            setTimeout(() => process.exit(0), 10);
            break;
        case 'conflict-stats':
            if (memory.conflictResolver) {
                const conflictStats = memory.conflictResolver.getStats();
                console.log(JSON.stringify(conflictStats, null, 2));
            } else {
                console.log('Conflict resolver not available');
            }
            setTimeout(() => process.exit(0), 10);
            break;
        default:
            console.log(`Brain Synapse CLI - Digital Synapse Memory System

Usage: node skill.js <command> [options]

Commands:
  distill              Distill memory (full version: fast lane + slow lane)
  distill-core         Fast lane only (~100ms, pure local, suitable for /new calls)
  distill-vector       Slow lane only (async vector indexing, run in background)
  recall <query>       Associative retrieval
    --deep, -d         Deep retrieval (includes latent storage)
  deep-recall <query>  Hypnotic retrieval (revive memories from latent storage)
  latent-stats         View latent storage statistics
  forget               Manual LTD cycle (decay and archive low-weight memories)
  pin-exp <kw>:<rule>  Pin an experience (permanent memory with rule)
  memorize <c>:<cnt>   Instant memory write (high weight, will decay if unused)
  get-pinned           List all pinned experiences
  get-top-concepts [N] Show top N concepts by weight (default: 5)
  observe [file]       Analyze session history for patterns
  stdp-stats           Show STDP temporal learning statistics
  stdp-predict <query> Get temporal predictions for a keyword
  stdp-chain <kw> [N]  Detect causal chain starting from keyword
  conflict-log [N]     Show recent conflict resolution log
  conflict-stats       Show conflict resolution statistics

Examples:
  node skill.js distill
  node skill.js recall "browser automation"
  node skill.js recall --deep "error handling"
  node skill.js pin-exp "browser_fill:Use type instead of fill"
  node skill.js memorize "project_structure:Uses TypeScript with strict mode"
`);
            process.exit(0);
    }
}

main().catch(err => {
    console.error('[Synapse] Error:', err.message);
    process.exit(1);
});
