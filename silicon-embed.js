/**
 * @file brain_synapse/silicon-embed.js
 * @description Vector Embedding Module - Provides semantic search capability for brain_synapse
 * @version 2.1.0
 * 
 * ==================== Important Notes ====================
 * 
 * This module provides vector-based semantic search functionality.
 * Configure your preferred vector API provider in config.js or via environment variables.
 * 
 * 【Local-Only Mode】
 * If API Key is not configured or API calls fail, the system automatically falls back to local file search
 * 
 * ==================== Architecture Notes ====================
 * 
 * 1. Local vector cache - Pre-process and store file embeddings to avoid real-time API calls
 * 2. Single API on query - Only make one API call for the query
 * 3. Local cosine similarity calculation - Pure Node.js computation, ultra-fast returns
 * 4. Seamless degradation - Automatically use local search when API is unavailable
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const CONFIG = require('./config');

const getVectorConfig = () => {
    if (CONFIG.vectorSearchApi) {
        return CONFIG.vectorSearchApi;
    }
    return {
        apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3',
        model: 'BAAI/bge-m3',
        apiKey: '',
        timeout: 5000,
        maxResults: 5,
        chunkSize: 1000
    };
};

const VECTOR_CACHE_FILE = path.join(__dirname, 'vector_cache.json');
const VECTOR_META_FILE = path.join(__dirname, 'vector_meta.json');

class SiliconEmbed {
    constructor() {
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileIndexCache = null;
        this._cacheTime = 0;
        this._vectorCache = null;
        
        const vectorConfig = getVectorConfig();
        this.apiUrl = vectorConfig.apiUrl;
        this.apiKey = vectorConfig.apiKey;
        this.model = vectorConfig.model;
        this.timeout = vectorConfig.timeout;
        this.maxResults = vectorConfig.maxResults;
        this.chunkSize = vectorConfig.chunkSize;
        
        this.isEnabled = CONFIG.features.enableVectorSearch && this.apiKey;
        if (!this.isEnabled) {
            console.log('[SiliconEmbed] Vector search not enabled (API Key not configured), using local search');
        }
    }

    isConfigured() {
        return this.apiKey && this.apiKey.length > 0;
    }

    isAvailable() {
        if (!this.isEnabled || !this.apiKey) return false;
        return this.apiKey.length > 10;
    }

    loadVectorCache() {
        if (this._vectorCache) {
            return this._vectorCache;
        }
        
        if (fs.existsSync(VECTOR_CACHE_FILE)) {
            try {
                this._vectorCache = JSON.parse(fs.readFileSync(VECTOR_CACHE_FILE, 'utf8'));
                console.log(`[SiliconEmbed] Loaded vector cache: ${this._vectorCache.chunks.length} chunks`);
                return this._vectorCache;
            } catch (e) {
                console.warn(`[SiliconEmbed] Failed to load vector cache: ${e.message}`);
            }
        }
        
        this._vectorCache = { chunks: [], lastUpdate: null };
        return this._vectorCache;
    }

    loadMeta() {
        if (fs.existsSync(VECTOR_META_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(VECTOR_META_FILE, 'utf8'));
            } catch (e) {
                console.warn(`[SiliconEmbed] Meta corrupted: ${e.message}`);
            }
        }
        return { files: {} };
    }

    saveMeta(meta) {
        try {
            fs.writeFileSync(VECTOR_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[SiliconEmbed] Failed to save meta: ${e.message}`);
        }
    }

    saveVectorCache() {
        try {
            fs.writeFileSync(VECTOR_CACHE_FILE, JSON.stringify(this._vectorCache, null, 2), 'utf8');
            console.log(`[SiliconEmbed] Saved vector cache: ${this._vectorCache.chunks.length} chunks`);
        } catch (e) {
            console.error(`[SiliconEmbed] Failed to save vector cache: ${e.message}`);
        }
    }

    async getEmbedding(text) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: this.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.data && result.data[0] && result.data[0].embedding) {
                            resolve(result.data[0].embedding);
                        } else if (result.error) {
                            reject(new Error(result.error.message || 'API error'));
                        } else {
                            reject(new Error('Invalid API response: ' + data.substring(0, 200)));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('API request timeout'));
            });

            const payload = {
                model: this.model,
                input: text
            };

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    async getEmbeddingsBatch(texts) {
        if (texts.length === 0) return [];
        
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: this.timeout * 2
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.data && Array.isArray(result.data)) {
                            const embeddings = result.data.map(item => item.embedding);
                            resolve(embeddings);
                        } else if (result.error) {
                            reject(new Error(result.error.message || 'API error'));
                        } else {
                            reject(new Error('Invalid batch API response'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse batch response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('API batch request timeout'));
            });

            const payload = {
                model: this.model,
                input: texts
            };

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    preprocessQuery(query) {
        let processed = query;
        
        processed = processed.replace(/[a-zA-Z]:\\[\\\S]+/g, ' ');
        processed = processed.replace(/\/[\S]+\//g, ' ');
        
        processed = processed.replace(/[\d\-_:]+/g, ' ');
        
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }

    computeLexicalBonus(query, chunk) {
        const LEXICAL_BONUS = 0.15;
        const MIN_KEYWORD_LENGTH = 2;
        
        const keywords = query.toLowerCase().match(/[a-z]{4,}|[^\s]{2,}/g) || [];
        
        if (keywords.length === 0) return 0;
        
        const chunkText = (chunk.preview + ' ' + chunk.file).toLowerCase();
        
        let matchCount = 0;
        for (const kw of keywords) {
            if (kw.length >= MIN_KEYWORD_LENGTH && chunkText.includes(kw)) {
                matchCount++;
            }
        }
        
        if (matchCount > 0) {
            return LEXICAL_BONUS * Math.min(matchCount, 3);
        }
        
        return 0;
    }

    loadMemoryFiles() {
        const now = Date.now();
        
        if (this._fileIndexCache && (now - this._cacheTime) < 60000) {
            return this._fileIndexCache;
        }
        
        const files = [];
        const dirs = [this.memoryDir, this.archiveDir];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    const filePath = path.join(dir, entry.name);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const stats = fs.statSync(filePath);
                        files.push({
                            path: filePath,
                            name: entry.name,
                            content: content,
                            mtime: stats.mtimeMs,
                            isArchive: dir === this.archiveDir
                        });
                    } catch (e) {
                        console.warn(`[SiliconEmbed] Failed to read ${filePath}: ${e.message}`);
                    }
                }
            }
        }
        
        this._fileIndexCache = files;
        this._cacheTime = now;
        
        return files;
    }

    splitIntoChunks(content, fileName = '', maxLength = 1000) {
        const paragraphs = content.split(/\n\n+/);
        const chunks = [];
        let currentChunk = '';
        
        for (const para of paragraphs) {
            if (currentChunk.length + para.length > maxLength) {
                if (currentChunk) {
                    const chunkText = currentChunk.trim();
                    const prefix = fileName ? `[${fileName}] ` : '';
                    chunks.push(prefix + chunkText);
                }
                currentChunk = para;
            } else {
                currentChunk += '\n\n' + para;
            }
        }
        
        if (currentChunk) {
            const chunkText = currentChunk.trim();
            const prefix = fileName ? `[${fileName}] ` : '';
            chunks.push(prefix + chunkText);
        }
        
        return chunks;
    }

    async buildIndex(force = false) {
        const startTime = Date.now();
        
        const cache = this.loadVectorCache();
        const files = this.loadMemoryFiles();
        const meta = this.loadMeta();
        
        const existingChunkMap = new Map();
        if (!force && cache.chunks && cache.chunks.length > 0) {
            for (const chunk of cache.chunks) {
                existingChunkMap.set(chunk.id, chunk);
            }
        }
        
        const newChunks = [];
        let apiCalls = 0;
        let changed = false;
        const processedFiles = {};
        
        for (const file of files) {
            const fileName = file.name;
            const currentMtime = file.mtime;
            const cachedMtime = meta.files[fileName];
            
            processedFiles[fileName] = currentMtime;
            
            if (!force && cachedMtime === currentMtime && existingChunkMap.size > 0) {
                for (let i = 0; i < 1000; i++) {
                    const chunkId = `${fileName}_${i}`;
                    if (existingChunkMap.has(chunkId)) {
                        newChunks.push(existingChunkMap.get(chunkId));
                    } else {
                        break;
                    }
                }
                continue;
            }
            
            changed = true;
            const chunks = this.splitIntoChunks(file.content, fileName);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkId = `${fileName}_${i}`;
                const preview = chunks[i].substring(0, 200);
                
                if (!force && existingChunkMap.has(chunkId)) {
                    const existing = existingChunkMap.get(chunkId);
                    if (existing.preview === preview) {
                        newChunks.push(existing);
                        continue;
                    }
                }
                
                newChunks.push({
                    id: chunkId,
                    file: fileName,
                    path: file.path,
                    preview: preview,
                    embedding: null,
                    mtime: currentMtime
                });
            }
        }
        
        meta.files = processedFiles;
        
        const chunksToEmbed = newChunks.filter(c => c.embedding === null);
        
        if (chunksToEmbed.length > 0) {
            console.log(`[SiliconEmbed] Need to embed ${chunksToEmbed.length} new chunks...`);
            
            const batchSize = 10;
            for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
                const batch = chunksToEmbed.slice(i, i + batchSize);
                const texts = batch.map(c => c.preview);
                
                try {
                    const embeddings = await this.getEmbeddingsBatch(texts);
                    for (let j = 0; j < batch.length; j++) {
                        batch[j].embedding = embeddings[j];
                    }
                    apiCalls++;
                    console.log(`[SiliconEmbed] Batch ${apiCalls}: ${i + batch.length}/${chunksToEmbed.length}`);
                } catch (e) {
                    console.error(`[SiliconEmbed] Batch embedding failed: ${e.message}`);
                }
            }
        }
        
        if (changed || chunksToEmbed.length > 0) {
            this._vectorCache = {
                chunks: newChunks,
                lastUpdate: Date.now()
            };
            
            this.saveVectorCache();
            this.saveMeta(meta);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`[SiliconEmbed] Index built in ${elapsed}ms, ${newChunks.length} chunks, ${apiCalls} API calls`);
        
        return { chunks: newChunks.length, apiCalls, elapsed };
    }

    async incrementalIndex(filePaths) {
        if (!this.isConfigured()) {
            console.log('[SiliconEmbed] Vector search not configured, skipping incremental index');
            return 0;
        }

        if (!filePaths || (Array.isArray(filePaths) && filePaths.length === 0)) {
            console.log('[SiliconEmbed] No files to incrementally index');
            return 0;
        }

        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        console.log(`[SiliconEmbed] Starting incremental index: ${files.length} files`);

        const cache = this.loadVectorCache();
        const meta = this.loadMeta();

        if (!cache.chunks) {
            cache.chunks = [];
        }

        const existingChunkMap = new Map();
        cache.chunks.forEach(chunk => {
            const key = `${chunk.file}::${chunk.preview}`;
            existingChunkMap.set(key, true);
        });

        let newChunksAdded = 0;

        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                console.log(`[SiliconEmbed] File not found: ${filePath}`);
                continue;
            }

            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');

            const fileChunks = this.splitIntoChunks(content, fileName);
            console.log(`[SiliconEmbed] Processing file: ${fileName}, generating ${fileChunks.length} chunks`);

            const texts = fileChunks;

            try {
                const embeddings = await this.getEmbeddingsBatch(texts);

                for (let i = 0; i < fileChunks.length; i++) {
                    const chunk = {
                        file: fileName,
                        path: filePath,
                        preview: fileChunks[i].substring(0, 200),
                        embedding: embeddings[i]
                    };

                    const key = `${chunk.file}::${chunk.preview}`;
                    if (!existingChunkMap.has(key)) {
                        cache.chunks.push(chunk);
                        existingChunkMap.set(key, true);
                        newChunksAdded++;
                    }
                }

                meta.files[fileName] = {
                    mtime: stats.mtimeMs,
                    chunkCount: fileChunks.length
                };

            } catch (e) {
                console.error(`[SiliconEmbed] Incremental index embedding failed for ${fileName}: ${e.message}`);
            }
        }

        if (newChunksAdded > 0) {
            cache.lastUpdate = Date.now();
            this._vectorCache = cache;
            this.saveVectorCache();
            this.saveMeta(meta);
            console.log(`[SiliconEmbed] Incremental index complete: ${newChunksAdded} new chunks, total ${cache.chunks.length} chunks`);
        } else {
            console.log('[SiliconEmbed] No new content');
        }

        return newChunksAdded;
    }

    async search(query) {
        const startTime = Date.now();
        
        try {
            const processedQuery = this.preprocessQuery(query);
            console.log(`[SiliconEmbed] Generating embedding for query: "${processedQuery.substring(0, 30)}..."`);
            
            const queryVector = await this.getEmbedding(processedQuery);
            const queryTime = Date.now() - startTime;
            console.log(`[SiliconEmbed] Query embedding: ${queryTime}ms`);
            
            const cache = this.loadVectorCache();
            
            if (cache.chunks.length === 0) {
                return {
                    success: false,
                    source: 'silicon-embed',
                    query: query,
                    error: 'Vector cache is empty. Run: node silicon-embed.js build-index',
                    results: [],
                    executionTime: Date.now() - startTime
                };
            }
            
            console.log(`[SiliconEmbed] Computing similarity with ${cache.chunks.length} chunks...`);
            
            const results = [];
            for (const chunk of cache.chunks) {
                if (!chunk.embedding) continue;
                
                const similarity = this.cosineSimilarity(queryVector, chunk.embedding);
                const lexicalBonus = this.computeLexicalBonus(query, chunk);
                const finalScore = similarity + lexicalBonus;
                
                results.push({
                    file: chunk.file,
                    path: chunk.path,
                    similarity: similarity,
                    lexicalBonus: lexicalBonus,
                    finalScore: finalScore,
                    preview: chunk.preview
                });
            }
            
            results.sort((a, b) => b.finalScore - a.finalScore);
            
            const topResults = results.slice(0, this.maxResults);
            
            const executionTime = Date.now() - startTime;
            console.log(`[SiliconEmbed] Search completed in ${executionTime}ms (query: ${queryTime}ms, similarity: ${executionTime - queryTime}ms)`);
            
            return {
                success: true,
                source: 'silicon-embed',
                query: query,
                results: topResults,
                executionTime: executionTime,
                totalChunks: cache.chunks.length
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`[SiliconEmbed] Search failed: ${error.message}`);
            
            return {
                success: false,
                source: 'silicon-embed',
                query: query,
                error: error.message,
                results: [],
                executionTime: executionTime
            };
        }
    }

    async testConnection() {
        try {
            await this.getEmbedding('test');
            return true;
        } catch (error) {
            console.error(`[SiliconEmbed] Connection test failed: ${error.message}`);
            return false;
        }
    }

    getCacheStatus() {
        const cache = this.loadVectorCache();
        const meta = this.loadMeta();
        return {
            chunks: cache.chunks ? cache.chunks.length : 0,
            lastUpdate: cache.lastUpdate,
            trackedFiles: Object.keys(meta.files).length,
            file: VECTOR_CACHE_FILE,
            meta: VECTOR_META_FILE
        };
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const embedder = new SiliconEmbed();
    
    if (command === 'test') {
        console.log('[SiliconEmbed] Testing connection...');
        embedder.testConnection().then(ok => {
            console.log(ok ? '[SiliconEmbed] Connection OK' : '[SiliconEmbed] Connection FAILED');
            process.exit(ok ? 0 : 1);
        });
    } else if (command === 'status') {
        console.log('[SiliconEmbed] Cache status:', JSON.stringify(embedder.getCacheStatus(), null, 2));
    } else if (command === 'build-index') {
        console.log('[SiliconEmbed] Building index...');
        const force = args.includes('--force') || args.includes('-f');
        embedder.buildIndex(force).then(result => {
            console.log('[SiliconEmbed] Build complete:', result);
            process.exit(0);
        }).catch(e => {
            console.error('[SiliconEmbed] Build failed:', e.message);
            process.exit(1);
        });
    } else if (command === 'search' && args[1]) {
        const query = args.slice(1).join(' ');
        embedder.search(query).then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        });
    } else {
        console.log(`SiliconEmbed v2.1.0 - Vector Cache CLI

Usage: node silicon-embed.js <command> [options]

Commands:
  test            Test API connection
  status          Show vector cache status
  build-index     Build/update vector cache
    --force      Force rebuild from scratch
  search <query> Search with vector similarity

Examples:
  node silicon-embed.js test
  node silicon-embed.js build-index
  node silicon-embed.js search "browser automation"
`);
    }
}

module.exports = SiliconEmbed;
