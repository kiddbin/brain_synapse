/**
 * @file brain_synapse/local_file_search.js
 * @description 本地文件检索降级插件 - QMD 损坏时的备用搜索引擎
 * @author 巫迪 (Wū Dí)
 * @version 1.2.0
 * 
 * 核心特性：
 * 1. 100ms 超时竞速 - 严格执行性能优先原则
 * 2. 内存索引机制 - 避免重复磁盘 I/O
 * 3. 增量索引持久化 - 缓存 mtime，只处理变化文件
 * 4. 静默容错 - 任何错误都不会中断主流程
 * 5. 无缝集成 - 自动挂载到 brain_synapse 的 recall 逻辑
 * 6. ✅ 中文支持 - 正确处理中文字符的索引和搜索
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'local_index_cache.json');

class LocalFileSearch {
    constructor() {
        this.maxExecutionTime = 100; // 100ms 硬限制
        this.indexCache = new Map(); // 内存索引: word -> Set(files)
        this.lastIndexTime = 0;
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileCache = null; // 持久化缓存: filename -> {mtime, words}
    }

    /**
     * 加载持久化缓存
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
     * 保存持久化缓存
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
     * 执行本地文件搜索（带 100ms 超时保护）
     * @param {string} query - 搜索关键词
     * @returns {Promise<Object>} 搜索结果
     */
    async execute(queryOrArray) {
        try {
            const startTime = Date.now();
            
            // 支持数组查询（赫布扩展联想）
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
     * 执行实际的搜索逻辑
     * @param {string} query - 搜索关键词
     * @returns {Promise<Object>} 搜索结果
     */
    async performSearch(queries) {
        await this.buildIndexIncremental();
        
        // 支持多查询（赫布联想扩展）
        const allResults = [];
        const processedFiles = new Set();
        
        for (const query of queries) {
            const results = this.searchInIndex(query.toLowerCase());
            
            // 合并结果，去重
            for (const result of results) {
                if (!processedFiles.has(result.file)) {
                    processedFiles.add(result.file);
                    allResults.push(result);
                }
            }
        }
        
        // 按相关度排序（原始查询的结果优先）
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
     * 增量构建索引（核心优化）
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
     * 从缓存重建内存索引
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
     * 提取文本中的有效词汇（支持中英文混合）
     * @param {string} text - 原始文本
     * @returns {Array} 词汇数组
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
     * 在内存索引中搜索
     * @param {string} query - 搜索关键词
     * @returns {Array} 搜索结果
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
     * 提取相关文件内容片段
     * @param {string} filePath - 文件路径
     * @param {string} query - 搜索关键词
     * @returns {string} 相关内容片段
     */
    extractRelevantContent(filePath, query) {
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
     * 获取目录下的所有 Markdown 文件
     * @param {string} dir - 目录路径
     * @returns {Array} Markdown 文件路径数组
     */
    getMarkdownFiles(dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(dir, f));
    }

    /**
     * 检测 QMD 是否可用
     * @returns {boolean} QMD 是否可用
     */
    static isQMDAvailable() {
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
