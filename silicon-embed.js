/**
 * @file brain_synapse/silicon-embed.js
 * @description Silicon Flow Vector Embedding Module - Provides semantic retrieval for brain_synapse
 * @version 2.0.0
 * 
 * Architecture:
 * 1. Local vector cache - Pre-process and store file embeddings to avoid real-time API calls
 * 2. Single API call per query - Only call API for the query, not for all documents
 * 3. Local cosine similarity - Pure Node.js computation for fast retrieval
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// Load configuration from environment or config file
function loadConfig() {
    // Try to load from .env file or environment variables
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value && !process.env[key.trim()]) {
                process.env[key.trim()] = value.trim();
            }
        });
    }
    
    return {
        apiUrl: process.env.SILICON_API_URL || 'https://api.siliconflow.cn/v1/embeddings',
        apiKey: process.env.SILICON_API_KEY || '',
        model: process.env.SILICON_MODEL || 'BAAI/bge-m3',
        timeout: parseInt(process.env.SILICON_TIMEOUT) || 5000,
        maxResults: parseInt(process.env.SILICON_MAX_RESULTS) || 5,
        chunkSize: parseInt(process.env.SILICON_CHUNK_SIZE) || 1000
    };
}

const CONFIG = loadConfig();

const VECTOR_CACHE_FILE = path.join(__dirname, 'vector_cache.json');
const VECTOR_META_FILE = path.join(__dirname, 'vector_meta.json');

class SiliconEmbed {
    constructor() {
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileIndexCache = null;
        this._cacheTime = 0;
        this._vectorCache = null;
    }

    /**
     * Check if API is configured
     */
    isConfigured() {
        return CONFIG.apiKey && CONFIG.apiKey.length > 0;
    }

    /**
     * Load vector cache
     * @returns {Object} Vector cache { chunks: [{id, file, preview, embedding}], lastUpdate }
     */
    loadVectorCache() {
        if (this._vectorCache) {
            return this._vectorCache;
        }
        
        if (fs.existsSync(VECTOR_CACHE_FILE)) {
            try {
                const data = fs.readFileSync(VECTOR_CACHE_FILE, 'utf8');
                this._vectorCache = JSON.parse(data);
                return this._vectorCache;
            } catch (e) {
                console.warn('[SiliconEmbed] Failed to load vector cache:', e.message);
            }
        }
        
        return { chunks: [], lastUpdate: 0 };
    }

    /**
     * Save vector cache
     */
    saveVectorCache(cache) {
        fs.writeFileSync(VECTOR_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
        this._vectorCache = cache;
    }

    /**
     * Get embedding from Silicon Flow API
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async getEmbedding(text) {
        return new Promise((resolve, reject) => {
            const url = new URL(CONFIG.apiUrl);
            const postData = JSON.stringify({
                model: CONFIG.model,
                input: text.substring(0, CONFIG.chunkSize),
                encoding_format: 'float'
            });

            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: CONFIG.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.data && response.data[0] && response.data[0].embedding) {
                            resolve(response.data[0].embedding);
                        } else {
                            reject(new Error('Invalid response format'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Search for relevant memories
     * @param {string} query - Search query
     * @param {number} topK - Number of results to return
     * @returns {Promise<{success: boolean, results: Array}>}
     */
    async search(query, topK = CONFIG.maxResults) {
        if (!this.isConfigured()) {
            return { success: false, error: 'API not configured', results: [] };
        }

        try {
            // Get query embedding
            const queryEmbedding = await this.getEmbedding(query);
            
            // Load vector cache
            const cache = this.loadVectorCache();
            
            if (cache.chunks.length === 0) {
                return { success: false, error: 'No indexed memories', results: [] };
            }

            // Calculate similarities
            const results = cache.chunks.map(chunk => ({
                ...chunk,
                similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
            }));

            // Sort by similarity and return top K
            results.sort((a, b) => b.similarity - a.similarity);
            
            return {
                success: true,
                results: results.slice(0, topK).map(r => ({
                    file: r.file,
                    preview: r.preview,
                    similarity: Math.round(r.similarity * 100) / 100
                }))
            };
        } catch (error) {
            return { success: false, error: error.message, results: [] };
        }
    }

    /**
     * Incrementally index a new file
     */
    async incrementalIndex(filePath) {
        if (!this.isConfigured()) {
            console.log('[SiliconEmbed] Skip indexing: API not configured');
            return { success: false, reason: 'API not configured' };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const chunks = this.chunkText(content);
            const cache = this.loadVectorCache();
            
            // Remove old chunks from this file
            cache.chunks = cache.chunks.filter(c => c.file !== filePath);
            
            // Index new chunks
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.getEmbedding(chunk);
                
                cache.chunks.push({
                    id: `${filePath}_${i}`,
                    file: filePath,
                    preview: chunk.substring(0, 200),
                    embedding: embedding
                });
            }
            
            cache.lastUpdate = Date.now();
            this.saveVectorCache(cache);
            
            return { success: true, indexed: chunks.length };
        } catch (error) {
            console.error('[SiliconEmbed] Indexing failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Split text into chunks
     */
    chunkText(text, chunkSize = CONFIG.chunkSize) {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
        return chunks.length > 0 ? chunks : [text];
    }
}

module.exports = SiliconEmbed;
