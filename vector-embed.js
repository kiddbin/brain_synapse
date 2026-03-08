/**
 * @file brain_synapse/vector-embed.js
 * @description Vector Embedding Module - Provides semantic retrieval for brain_synapse
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

function loadConfig() {
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
        apiUrl: process.env.VECTOR_API_URL || process.env.EMBEDDING_API_URL || '',
        apiKey: process.env.VECTOR_API_KEY || process.env.EMBEDDING_API_KEY || '',
        model: process.env.VECTOR_MODEL || process.env.EMBEDDING_MODEL || 'BAAI/bge-m3',
        timeout: parseInt(process.env.VECTOR_TIMEOUT) || 5000,
        maxResults: parseInt(process.env.VECTOR_MAX_RESULTS) || 5,
        chunkSize: parseInt(process.env.VECTOR_CHUNK_SIZE) || 1000
    };
}

const CONFIG = loadConfig();

const VECTOR_CACHE_FILE = path.join(__dirname, 'vector_cache.json');
const VECTOR_META_FILE = path.join(__dirname, 'vector_meta.json');
const QUERY_CACHE_FILE = path.join(__dirname, 'vector_query_cache.json');

const WARMUP_QUERIES = ['browser', 'playwright', 'error', 'test', 'api', 'fail', 'success'];
const QUERY_SIMILARITY_THRESHOLD = 0.95;

class VectorEmbed {
    constructor() {
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileIndexCache = null;
        this._cacheTime = 0;
        this._vectorCache = null;
        this._queryCache = this.loadQueryCache();
        this._warmupComplete = false;
    }

    isConfigured() {
        return CONFIG.apiKey && CONFIG.apiKey.length > 0 && CONFIG.apiUrl && CONFIG.apiUrl.length > 0;
    }

    loadVectorCache() {
        if (this._vectorCache) {
            return this._vectorCache;
        }
        
        if (fs.existsSync(VECTOR_CACHE_FILE)) {
            try {
                this._vectorCache = JSON.parse(fs.readFileSync(VECTOR_CACHE_FILE, 'utf8'));
                console.log(`[VectorEmbed] Loaded vector cache: ${this._vectorCache.chunks?.length || 0} chunks`);
                return this._vectorCache;
            } catch (e) {
                console.warn(`[VectorEmbed] Failed to load vector cache: ${e.message}`);
            }
        }
        
        this._vectorCache = { chunks: [], lastUpdate: null };
        return this._vectorCache;
    }

    loadQueryCache() {
        if (fs.existsSync(QUERY_CACHE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(QUERY_CACHE_FILE, 'utf8'));
                return new Map(Object.entries(data));
            } catch (e) {
                console.warn(`[VectorEmbed] Failed to load query cache: ${e.message}`);
            }
        }
        return new Map();
    }

    saveQueryCache() {
        try {
            const data = Object.fromEntries(this._queryCache);
            fs.writeFileSync(QUERY_CACHE_FILE, JSON.stringify(data), 'utf8');
        } catch (e) {
            console.warn(`[VectorEmbed] Failed to save query cache: ${e.message}`);
        }
    }

    loadMeta() {
        if (fs.existsSync(VECTOR_META_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(VECTOR_META_FILE, 'utf8'));
            } catch (e) {
                console.warn(`[VectorEmbed] Meta corrupted: ${e.message}`);
            }
        }
        return { files: {} };
    }

    saveMeta(meta) {
        try {
            fs.writeFileSync(VECTOR_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[VectorEmbed] Failed to save meta: ${e.message}`);
        }
    }

    saveVectorCache() {
        try {
            fs.writeFileSync(VECTOR_CACHE_FILE, JSON.stringify(this._vectorCache, null, 2), 'utf8');
            console.log(`[VectorEmbed] Saved vector cache: ${this._vectorCache.chunks.length} chunks`);
        } catch (e) {
            console.error(`[VectorEmbed] Failed to save vector cache: ${e.message}`);
        }
    }

    async getEmbedding(text) {
        return new Promise((resolve, reject) => {
            const url = new URL(CONFIG.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.apiKey}`
                },
                timeout: CONFIG.timeout
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
                model: CONFIG.model,
                input: text
            };

            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    async getEmbeddingsBatch(texts) {
        if (texts.length === 0) return [];
        
        return new Promise((resolve, reject) => {
            const url = new URL(CONFIG.apiUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.apiKey}`
                },
                timeout: CONFIG.timeout * 2
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
                model: CONFIG.model,
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
                        console.warn(`[VectorEmbed] Failed to read ${filePath}: ${e.message}`);
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
            console.log(`[VectorEmbed] Need to embed ${chunksToEmbed.length} new chunks...`);
            
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
                    console.log(`[VectorEmbed] Batch ${apiCalls}: ${i + batch.length}/${chunksToEmbed.length}`);
                } catch (e) {
                    console.error(`[VectorEmbed] Batch embedding failed: ${e.message}`);
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
        console.log(`[VectorEmbed] Index built in ${elapsed}ms, ${newChunks.length} chunks, ${apiCalls} API calls`);
        
        return { chunks: newChunks.length, apiCalls, elapsed };
    }

    async incrementalIndex(filePaths) {
        if (!this.isConfigured()) {
            console.log('[VectorEmbed] Skip indexing: API not configured');
            return 0;
        }

        if (!filePaths || (Array.isArray(filePaths) && filePaths.length === 0)) {
            console.log('[VectorEmbed] No files to index');
            return 0;
        }

        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        console.log(`[VectorEmbed] Starting incremental index: ${files.length} files`);

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
                console.log(`[VectorEmbed] File not found: ${filePath}`);
                continue;
            }

            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');

            const fileChunks = this.splitIntoChunks(content, fileName);
            console.log(`[VectorEmbed] Processing file: ${fileName}, generated ${fileChunks.length} chunks`);

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
                console.error(`[VectorEmbed] Failed to get embeddings for ${fileName}: ${e.message}`);
            }
        }

        if (newChunksAdded > 0) {
            cache.lastUpdate = Date.now();
            this._vectorCache = cache;
            this.saveVectorCache();
            this.saveMeta(meta);
        }

        console.log(`[VectorEmbed] Incremental index complete: ${newChunksAdded} new chunks added`);
        return newChunksAdded;
    }

    async search(query, topK = CONFIG.maxResults) {
        if (!this.isConfigured()) {
            return { success: false, error: 'API not configured', results: [] };
        }

        try {
            const processedQuery = this.preprocessQuery(query);
            const queryEmbedding = await this.getEmbedding(processedQuery);
            
            const cache = this.loadVectorCache();
            
            if (!cache.chunks || cache.chunks.length === 0) {
                return { success: false, error: 'No indexed memories', results: [] };
            }

            const results = cache.chunks.map(chunk => {
                const semanticScore = chunk.embedding ? this.cosineSimilarity(queryEmbedding, chunk.embedding) : 0;
                const lexicalBonus = this.computeLexicalBonus(query, chunk);
                
                return {
                    ...chunk,
                    similarity: semanticScore + lexicalBonus
                };
            });

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
}

module.exports = VectorEmbed;
