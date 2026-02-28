/**
 * @file brain_synapse/config.js
 * @description Central configuration file for managing all tunable parameters
 * 
 * ==================== Configuration Guide ====================
 * 
 * This file contains all configurable options for the brain_synapse system.
 * The open-source version has removed all private information - configure as needed.
 * 
 * 【Supported Vector API Providers】
 * - Voyage AI (Recommended): https://dash.voyageai.com
 * - Hugging Face: https://huggingface.co
 * - Ollama (Local): http://localhost:11434
 * 
 * 【Local-Only Mode】
 * - The system can run fully locally without any API Key!
 * - When vector search is not configured, the system falls back to local file search
 * - All memory functions (distillation, associative recall, forgetting cycles, etc.) work normally
 * 
 * ==================== Configuration Options ====================
 */

// ==================== Vector Search API Configuration ====================
// 【Optional】Configure the following to enable semantic vector search
// Method 1: Fill in directly here (not recommended for open-source projects)
// CONFIG.vectorSearchApi.apiKey = 'your-api-key-here';

// Method 2: Set environment variables (recommended)
// Voyage AI: export VOYAGE_API_KEY='your-key'    (Linux/Mac)
// HuggingFace: export HF_TOKEN='your-token'
// Ollama: No configuration needed (local offline)

const CONFIG = {
    // ==================== Core Configuration ====================
    
    // Workspace directory - points to the directory containing the memory folder
    workspaceRoot: null,  // Auto-detected at runtime
    
    // Active memory storage path
    weightsFile: 'synapse_weights.json',
    
    // Cold storage memory path (forgotten memories)
    latentWeightsFile: 'latent_weights.json',
    
    // ==================== LTD (Long-Term Depression) Forgetting Cycle Parameters ====================
    // 【Beginner Safe Testing Mode - Designed for early testing】
    // 
    // [Why Conservative Settings]
    // When first installing the system, most people will test randomly. If the AI learns too quickly
    // and retains memories too long, it will solidify incorrect tests into garbage memories,
    // even causing Token waste.
    // 
    // [Parameter Description]
    // - decayRate 0.90: Faster forgetting rate, half-life ~7 turns
    // - forgetThreshold 0.2: Easier to move to cold storage, prevents dirty data pollution
    // - minObservationsForInstinct 5: Conservative threshold, prevents "random testing" from becoming "truth"
    // 
    ltd: {
        // Weight decay rate per forgetting cycle
        // [Beginner Safe Config] 0.90 = 10% decay per turn, half-life ~7 turns
        // Fast forgetting suitable for early testing, ensures context stays minimal, saves Tokens
        decayRate: 0.90,
        
        // Below this weight value, memory moves to cold storage
        // [Beginner Safe Config] 0.2 higher threshold, unused memories quickly move to cold storage, extreme Token saving
        forgetThreshold: 0.2,
        
        // Initial weight when reviving from cold storage
        revivedWeight: 0.5,
        
        // Initial weight for new memories
        initialWeight: 1.0
    },
    
    // ==================== Vector Search API Configuration ====================
    // 【Optional】Configure to enable semantic search
    // Supports multiple providers: Voyage AI, Hugging Face, Ollama
    vectorSearchApi: {
        // API URL (choose based on provider)
        // Voyage AI:   'https://api.voyageai.com/v1/embeddings'
        // HuggingFace: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3'
        // Ollama:      'http://localhost:11434/api/embeddings'
        apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3',
        
        // Vector model selection
        // Voyage AI:   'voyage-3' (SOTA) or 'voyage-multilingual-2'
        // HuggingFace: 'BAAI/bge-m3' (recommended multilingual) or 'BAAI/bge-large-zh-v1.5' (Chinese)
        // Ollama:      'nomic-embed-text'
        model: 'BAAI/bge-m3',
        
        // API Key - supports environment variables or direct fill
        // Priority: VOYAGE_API_KEY > HF_TOKEN > SILICONFLOW_API_KEY > direct fill
        // If not configured, system will automatically fall back to local search
        apiKey: process.env.VOYAGE_API_KEY || process.env.HF_TOKEN || process.env.SILICONFLOW_API_KEY || '',
        
        // Timeout setting (milliseconds)
        timeout: 5000,
        
        // Maximum number of results
        maxResults: 5,
        
        // Text chunk size
        chunkSize: 1000
    },
    
    // ==================== Local File Search Configuration ====================
    // 【Required】No API Key needed, runs completely locally
    localSearch: {
        // Maximum execution time (milliseconds)
        // Prevents search from consuming too many resources
        maxExecutionTime: 100,
        
        // Cache file path
        cacheFile: 'local_index_cache.json'
    },
    
    // ==================== Observer Mode Configuration ====================
    // 【Beginner Safe Testing Mode - Conservative subconscious solidification】
    // 
    // [Why Conservative Settings]
    // Beginners often test randomly early on. If threshold is too low, AI will treat your "random testing" as "truth"
    // and solidify it into garbage instincts. Setting to 5 times effectively prevents mislearning.
    // 
    observer: {
        // Minimum observations required to create an Instinct
        // [Beginner Safe Config] 5 times conservative threshold, prevents test behavior from becoming instinct
        // During early testing, behavior is unstable, need more observations to confirm real patterns
        minObservationsForInstinct: 5,
        
        // Confidence parameters
        confidenceBase: 0.3,        // Base confidence
        confidenceIncrement: 0.05, // Increment per positive feedback
        confidenceDecrement: 0.1,  // Decrement per negative feedback
        confidenceDecayWeekly: 0.02 // Natural weekly decay
    },
    
    // ==================== Keyword Extraction Configuration ====================
    keywords: {
        // Minimum word length
        minWordLength: 2,
        
        // Maximum weight multiplier
        // Prevents any single word from dominating retrieval due to excessive weight
        maxWeightMultiplier: 2.0,
        
        // Decay factor
        decayFactor: 0.1,
        
        // Valid POS tags
        validPosTags: ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW']
    },
    
    // ==================== Feature Toggles ====================
    features: {
        // Enable vector search (requires API Key configuration)
        // Auto-detect: enabled if valid API Key exists
        enableVectorSearch: !!(process.env.VOYAGE_API_KEY || process.env.HF_TOKEN || process.env.SILICONFLOW_API_KEY),
        
        // Enable Observer mode (automatically learn user behavior)
        enableObserver: true,
        
        // Enable automatic distillation
        enableAutoDistill: true
    }
};

// Auto-detect workspace directory
const path = require('path');
const fs = require('fs');

function detectWorkspaceRoot() {
    // Try to find by searching upward from current directory
    let currentDir = __dirname;
    
    for (let i = 0; i < 5; i++) {
        const memoryDir = path.join(currentDir, 'workspace', 'memory');
        if (fs.existsSync(memoryDir)) {
            return currentDir;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
    }
    
    // Default to parent directory
    return path.resolve(__dirname, '..');
}

// Initialize workspace directory
CONFIG.workspaceRoot = detectWorkspaceRoot();

// Auto-enable vector search if API Key exists in environment variables
if (process.env.SILICONFLOW_API_KEY) {
    CONFIG.features.enableVectorSearch = true;
}

module.exports = CONFIG;
