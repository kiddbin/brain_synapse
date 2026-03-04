/**
 * @file brain_synapse/local_file_search.js
 * @description Local File Search Fallback Plugin - Backup search engine for vector API failures
 * @author 巫迪 (Wū Dí)
 * @version 1.2.0
 * 
 * Core Features:
 * 1. 100ms timeout enforcement - Strict performance-first principle
 * 2. In-memory indexing - Avoid repeated disk I/O
 * 3. Incremental index persistence - Cache mtime, only process changed files
 * 4. Silent fault tolerance - Any error won't interrupt main flow
 * 5. Seamless integration - Auto-mount to brain_synapse recall logic
 * 6. Multilingual support - Correctly handle Chinese character indexing and search
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'local_index_cache.json');

class LocalFileSearch {
    constructor() {
        this.maxExecutionTime = 100; // 100ms hard limit
        this.indexCache = new Map(); // In-memory index: word -> Set(files)
        this.lastIndexTime = 0;
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileCache = null; // Persistent cache: filename -> {mtime, words}
    }

    /**
     * Load persistent cache
     */
    loadCache() {
        if (this._fileCache) return this._fileCache;
        
        if (fs.existsSync(CACHE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                this.lastIndexTime = data.lastBuildTime || 0;
                this._fileCache = data.files || {};
                console.log(`[LocalFileSearch] Loaded cache: ${Object.keys(this._fileCache).length} files`);
                return this._fileCache;
            } catch (e) {
                console.warn(`[LocalFileSearch] Cache corrupted, will rebuild: ${e.message}`);
            }
        }
        
        this._fileCache = {};
        return this._fileCache;
    }

    /**
     * Save persistent cache
     */
    saveCache() {
        try {
            const data = {
                lastBuildTime: this.lastIndexTime,
                files: this._fileCache
            };
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[LocalFileSearch] Failed to save cache: ${e.message}`);
        }
    }

    /**
     * Execute local file search (with 100ms timeout protection)
     * @param {string} query - Search keyword
     * @returns {Promise<Object>} Search result
     */
    async execute(queryOrArray) {
        try {
            const startTime = Date.now();
            
            // Support array query (Hebbian extended association)
            const queries = Array.isArray(queryOrArray) ? queryOrArray : [queryOrArray];
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('LocalFileSearch timeout')), 
                    this.maxExecutionTime);
            });
            
            const searchPromise = this.performSearch(queries);
            
            const result = await Promise.race([searchPromise, timeoutPromise]);
            
            console.log(`[LocalFileSearch] Completed in ${Date.now() - startTime}ms`);
            return result;
            
        } catch (error) {
            console.warn(`[LocalFileSearch] Failed: ${error.message}`);
            return {
                source: 'local-file-search',
                query: query,
                error: error.message,
                results: [],
                executionTime: Date.now()
            };
        }
    }

    /**
     * Execute actual search logic
     * @param {string} query - Search keyword
     * @returns {Promise<Object>} Search result
     */
    async performSearch(queries) {
        await this.buildIndexIncremental();
        
        // Support multi-query (Hebbian association extension)
        const allResults = [];
        const processedFiles = new Set();
        
        for (const query of queries) {
            const results = this.searchInIndex(query.toLowerCase());
            
            // Merge results, deduplicate
            for (const result of results) {
                if (!processedFiles.has(result.file)) {
                    processedFiles.add(result.file);
                    allResults.push(result);
                }
            }
        }
        
        // Sort by relevance (original query results first)
        const querySet = new Set(queries.map(q => q.toLowerCase()));
        allResults.sort((a, b) => {
            const aHasDirectMatch = querySet.has(a.query?.toLowerCase()) || a.file.includes(a.query?.toLowerCase());
            const bHasDirectMatch = querySet.has(b.query?.toLowerCase()) || b.file.includes(b.query?.toLowerCase());
            if (aHasDirectMatch && !bHasDirectMatch) return -1;
            if (!aHasDirectMatch && bHasDirectMatch) return 1;
            return (b.score || 0) - (a.score || 0);
        });
        
        return {
            source: 'local-file-search',
            query: queries.join(' + '),
            results: allResults.slice(0, 5),
            hebbian_queries: queries,
            executionTime: Date.now()
        };
    }

    /**
     * Incremental index build (core optimization)
     */
    async buildIndexIncremental() {
        const cache = this.loadCache();
        
        const allFiles = [
            ...this.getMarkdownFiles(this.memoryDir),
            ...this.getMarkdownFiles(this.archiveDir)
        ];
        
        let changed = false;
        
        for (const filePath of allFiles) {
            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const currentMtime = stats.mtimeMs;
            
            const cached = cache[fileName];
            
            if (!cached || cached.mtime !== currentMtime) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const words = this.extractWords(content);
                    
                    cache[fileName] = {
                        mtime: currentMtime,
                        path: filePath,
                        words: words
                    };
                    
                    changed = true;
                } catch (e) {
                    console.warn(`[LocalFileSearch] Failed to read ${fileName}: ${e.message}`);
                }
            }
        }
        
        if (changed) {
            this.lastIndexTime = Date.now();
            this.saveCache();
        }
        
        this.rebuildMemoryIndex(cache);
        
        console.log(`[LocalFileSearch] Index ready: ${Object.keys(cache).length} files cached`);
    }

    /**
     * Rebuild in-memory index from cache
     */
    rebuildMemoryIndex(cache) {
        this.indexCache.clear();
        
        for (const [fileName, data] of Object.entries(cache)) {
            const filePath = data.path;
            const words = data.words || [];
            
            words.forEach(word => {
                if (!this.indexCache.has(word)) {
                    this.indexCache.set(word, new Set());
                }
                this.indexCache.get(word).add(filePath);
            });
        }
    }

    /**
     * Extract valid words from text (supports mixed Chinese-English)
     * @param {string} text - Original text
     * @returns {Array} Word array
     */
    extractWords(text) {
        const words = new Set();
        const textLower = text.toLowerCase();
        
        const chineseMatches = textLower.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        chineseMatches.forEach(word => {
            if (word.length >= 2) {
                words.add(word);
                for (const char of word) {
                    if (/[\u4e00-\u9fa5]/.test(char)) {
                        words.add(char);
                    }
                }
            }
        });
        
        const englishMatches = textLower.match(/[a-zA-Z]{2,}/g) || [];
        englishMatches.forEach(word => {
            words.add(word);
        });
        
        const mixedMatches = textLower.match(/[a-zA-Z0-9]{2,}/g) || [];
        mixedMatches.forEach(word => {
            words.add(word);
        });
        
        return Array.from(words);
    }

    /**
     * Search in in-memory index
     * @param {string} query - Search keyword
     * @returns {Array} Search results
     */
    searchInIndex(query) {
        const fileScores = new Map();
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(query);
        
        if (hasChinese) {
            const queryLower = query.toLowerCase();
            
            const exactFiles = this.indexCache.get(queryLower) || new Set();
            exactFiles.forEach(file => {
                fileScores.set(file, (fileScores.get(file) || 0) + 10);
            });
            
            for (const char of queryLower) {
                if (char.length === 1 && /[\u4e00-\u9fa5]/.test(char)) {
                    const charFiles = this.indexCache.get(char) || new Set();
                    charFiles.forEach(file => {
                        fileScores.set(file, (fileScores.get(file) || 0) + 1);
                    });
                }
            }
        } else {
            const queryWords = query.split(/\W+/).filter(w => w.length > 2);
            
            queryWords.forEach(word => {
                const files = this.indexCache.get(word) || new Set();
                files.forEach(file => {
                    fileScores.set(file, (fileScores.get(file) || 0) + 1);
                });
            });
        }
        
        return Array.from(fileScores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([file, score]) => ({ 
                file: path.relative(path.join(__dirname, '../..'), file),
                score: score,
                content: this.extractRelevantContent(file, query)
            }));
    }

    /**
     * Extract relevant file content snippets
     * @param {string} filePath - File path
     * @param {string} query - Search query
     * @returns {string} Relevant content snippet
     */
    extractSnippets(filePath, query, maxLength = 500) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const queryLower = query.toLowerCase();
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                    const start = Math.max(0, i - 1);
                    const end = Math.min(lines.length, i + 2);
                    return lines.slice(start, end).join('\n').trim();
                }
            }
            
            return lines.slice(0, 3).join('\n').trim();
        } catch (error) {
            return `Failed to read content: ${error.message}`;
        }
    }

    /**
     * Get all Markdown files in directory
     * @param {string} dir - directory path
     * @returns {Array} Array of markdown file paths
     */
    getMarkdownFiles(dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(dir, f));
    }

    /**
     * Check if vector search is available
     * @returns {boolean} Whether vector search is available
     */
    static isVectorAvailable() {
        try {
            const result = require('child_process').execSync('qmd status', { 
                timeout: 1000,
                stdio: 'ignore'
            });
            return result.status === 0;
        } catch (error) {
            console.warn(`[LocalFileSearch] QMD not available: ${error.message}`);
            return false;
        }
    }
}

if (require.main === module) {
    const search = new LocalFileSearch();
    const query = process.argv.slice(2).join(' ');
    
    if (query) {
        search.execute(query).then(result => {
            console.log(JSON.stringify(result, null, 2));
        });
    } else {
        console.log('Usage: node local_file_search.js <query>');
    }
}

module.exports = LocalFileSearch;
