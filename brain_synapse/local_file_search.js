/**
 * @file brain_synapse/local_file_search.js
 * @description 本地文件检索降级插件 - QMD 损坏时的备用搜索引擎
 * @author 巫迪 (Wū Dí)
 * @version 1.3.0
 * 
 * 核心特性：
 * 1. 100ms 超时竞速 - 严格执行性能优先原则
 * 2. 内存索引机制 - 避免重复磁盘 I/O
 * 3. 增量索引持久化 - 缓存 mtime，只处理变化文件
 * 4. 静默容错 - 任何错误都不会中断主流程
 * 5. 无缝集成 - 自动挂载到 brain_synapse 的 recall 逻辑
 * 6. ✅ 中文支持 - 正确处理中文字符的索引和搜索
 * 7. 🔥 文件名超高权重 - 文件名匹配权重是内容匹配的 600+ 倍
 * 
 * 版本历史：
 * - v1.3.0 (2026-03-05): 新增文件名匹配超高权重机制
 *   - 完全匹配文件名：10000 分
 *   - 文件名包含完整查询词：5000 * 密度分
 *   - 文件名分词匹配：300 分/词
 *   - 内容匹配：1-10 分
 *   - 确保 SOP 文档、规范文档等高价值文件绝对优先召回
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
    async execute(queryOrArray, options = {}) {
        try {
            const startTime = Date.now();
            
            // 支持数组查询（赫布扩展联想）
            const queries = Array.isArray(queryOrArray) ? queryOrArray : [queryOrArray];
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('LocalFileSearch timeout')), 
                    this.maxExecutionTime);
            });
            
            const searchPromise = this.performSearch(queries, options);
            
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
    async performSearch(queries, options = {}) {
        await this.buildIndexIncremental();
        
        // 支持多查询（赫布联想扩展）
        const allResults = [];
        const processedFiles = new Set();
        
        for (const query of queries) {
            const results = this.searchInIndex(query.toLowerCase(), options.candidateFiles);
            
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
     * 在内存索引中搜索（核心优化：文件名匹配超高权重）
     * @param {string} query - 搜索关键词
     * @returns {Array} 搜索结果
     */
    searchInIndex(query, candidateFilesArray) {
        const candidateSet = candidateFilesArray ? new Set(candidateFilesArray) : null;
        const fileScores = new Map();
        const fileInfoMap = new Map(); // 存储文件额外信息
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(query);
        const queryLower = query.toLowerCase();
        
        // ==================== 第一步：文件名匹配（超高权重）====================
        // 遍历所有缓存文件，检查文件名是否包含关键词
        for (const [fileName, fileData] of Object.entries(this._fileCache)) {
            if (candidateSet && !candidateSet.has(fileName)) continue; // System 1 Pruning!
            const filePath = fileData.path;
            const fileNameLower = fileName.toLowerCase();
            
            // 计算文件名匹配度
            let filenameMatchScore = 0;
            
            // 1. 完全匹配（包括扩展名）- 最高权重
            if (fileNameLower === queryLower || fileNameLower === queryLower + '.md') {
                filenameMatchScore = 10000;
            }
            // 2. 文件名包含完整查询词（不含扩展名）
            else if (fileNameLower.replace('.md', '').includes(queryLower)) {
                // 计算包含的紧密度：查询词长度 / 文件名长度
                const nameWithoutExt = fileNameLower.replace('.md', '');
                const density = queryLower.length / nameWithoutExt.length;
                filenameMatchScore = 5000 * density;
            }
            // 3. 文件名包含查询词的部分（分词匹配）
            else {
                const queryWords = hasChinese ? 
                    this.segmentChineseQuery(queryLower) : 
                    queryLower.split(/\W+/).filter(w => w.length > 1);
                
                let matchedWords = 0;
                queryWords.forEach(word => {
                    if (word.length >= 2 && fileNameLower.includes(word)) {
                        matchedWords++;
                    }
                });
                
                if (matchedWords > 0) {
                    // 文件名分词匹配：每个匹配词 300 分
                    filenameMatchScore = matchedWords * 300;
                }
            }
            
            if (filenameMatchScore > 0) {
                fileScores.set(filePath, (fileScores.get(filePath) || 0) + filenameMatchScore);
                fileInfoMap.set(filePath, { 
                    filenameMatch: true, 
                    filenameScore: filenameMatchScore,
                    fileName: fileName
                });
            }
        }
        
        // ==================== 第二步：内容匹配（正常权重）====================
        if (hasChinese) {
            // 中文精确匹配
            const exactFiles = this.indexCache.get(queryLower) || new Set();
            exactFiles.forEach(file => {
                fileScores.set(file, (fileScores.get(file) || 0) + 10);
            });
            
            // 中文字符拆分匹配
            for (const char of queryLower) {
                if (char.length === 1 && /[\u4e00-\u9fa5]/.test(char)) {
                    const charFiles = this.indexCache.get(char) || new Set();
                    charFiles.forEach(file => {
                        fileScores.set(file, (fileScores.get(file) || 0) + 1);
                    });
                }
            }
        } else {
            // 英文分词匹配
            const queryWords = query.split(/\W+/).filter(w => w.length > 2);
            
            queryWords.forEach(word => {
                const files = this.indexCache.get(word) || new Set();
                files.forEach(file => {
                    fileScores.set(file, (fileScores.get(file) || 0) + 1);
                });
            });
        }
        
        // ==================== 第三步：排序和输出 ====================
        return Array.from(fileScores.entries())
            .sort((a, b) => {
                const aInfo = fileInfoMap.get(a[0]) || {};
                const bInfo = fileInfoMap.get(b[0]) || {};
                
                // 优先排序文件名匹配的
                if (aInfo.filenameMatch && !bInfo.filenameMatch) return -1;
                if (!aInfo.filenameMatch && bInfo.filenameMatch) return 1;
                
                // 都匹配文件名时，按文件名匹配度排序
                if (aInfo.filenameMatch && bInfo.filenameMatch) {
                    return bInfo.filenameScore - aInfo.filenameScore;
                }
                
                // 都不匹配文件名时，按内容分数排序
                return b[1] - a[1];
            })
            .map(([file, score]) => {
                const fileInfo = fileInfoMap.get(file);
                return { 
                    file: path.relative(path.join(__dirname, '../..'), file),
                    score: score,
                    content: this.extractRelevantContent(file, query),
                    filenameMatch: fileInfo ? fileInfo.filenameMatch : false,
                    fileName: fileInfo ? fileInfo.fileName : path.basename(file)
                };
            });
    }
    
    /**
     * 中文查询分词（优化版）
     * @param {string} query - 中文查询词
     * @returns {string[]} 分词结果
     */
    segmentChineseQuery(query) {
        const words = [];
        const len = query.length;
        
        // 移除.md 等扩展名
        const cleanQuery = query.replace(/\.md$/, '');
        
        // 1. 整个查询词（如果不包含空格）
        if (!cleanQuery.includes(' ') && cleanQuery.length >= 2) {
            words.push(cleanQuery);
        }
        
        // 2. 滑动窗口提取 2-4 字词语
        for (let windowSize = 4; windowSize >= 2; windowSize--) {
            for (let i = 0; i <= cleanQuery.length - windowSize; i++) {
                const word = cleanQuery.substring(i, i + windowSize);
                if (!words.includes(word)) {
                    words.push(word);
                }
            }
        }
        
        return words;
    }

    /**
     * 提取相关文件内容片段（增强版语义块提取）
     * @param {string} filePath - 文件路径
     * @param {string} query - 搜索关键词
     * @returns {string} 相关内容片段
     */
    extractRelevantContent(filePath, query) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const queryLower = query.toLowerCase();
            
            const MAX_CHARS = 2000;
            const CONTEXT_LINES = 15;
            
            // 跳过头部元数据的辅助函数
            const isMetadataLine = (line) => {
                return line.startsWith('# Session:') ||
                       line.startsWith('- **Session') ||
                       line.startsWith('Conversation info') ||
                       line.startsWith('```json') ||
                       line.startsWith('```') ||
                       line.match(/^[\s]*$/);
            };
            
            // 找到第一个非元数据行的索引
            const findFirstContentLine = () => {
                for (let i = 0; i < lines.length; i++) {
                    if (!isMetadataLine(lines[i]) && lines[i].trim().length > 0) {
                        return i;
                    }
                }
                return 0;
            };
            
            // 提取最有价值内容的辅助函数
            const extractBestContent = () => {
                const startIdx = findFirstContentLine();
                
                // 策略1：寻找关键段落（总结、经验、计划等）
                const keyPatterns = [
                    /## (总结|经验|计划|教训|关键|核心|成功|失败|注意)/i,
                    /### (总结|经验|计划|教训|关键|核心|成功|失败|注意)/i,
                    /\*\*(总结|经验|计划|教训|关键|核心|成功|失败)\*\*/i,
                    /✨|📌|⚠️|🚀|💡/i
                ];
                
                for (let i = startIdx; i < lines.length; i++) {
                    for (const pattern of keyPatterns) {
                        if (pattern.test(lines[i])) {
                            let end = Math.min(lines.length, i + 30);
                            for (let j = i + 1; j < end; j++) {
                                if (lines[j].startsWith('## ') && j > i + 5) {
                                    end = j;
                                    break;
                                }
                            }
                            let extracted = lines.slice(i, end).join('\n').trim();
                            if (extracted.length > MAX_CHARS) {
                                extracted = extracted.substring(0, MAX_CHARS) + '\n... [内容截断]';
                            }
                            return extracted;
                        }
                    }
                }
                
                // 策略2：返回第一个有意义的段落
                let endIdx = Math.min(lines.length, startIdx + 40);
                let extracted = lines.slice(startIdx, endIdx).join('\n').trim();
                if (extracted.length > MAX_CHARS) {
                    extracted = extracted.substring(0, MAX_CHARS) + '\n... [内容截断]';
                }
                return extracted;
            };
            
            // 尝试精确匹配
            let matchIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                    // 跳过元数据行
                    if (!isMetadataLine(lines[i])) {
                        matchIndex = i;
                        break;
                    }
                }
            }
            
            // 如果没有精确匹配，返回最有价值的内容
            if (matchIndex === -1) {
                return extractBestContent();
            }
            
            // 有精确匹配时，提取匹配点周围的内容
            let start = Math.max(0, matchIndex - CONTEXT_LINES);
            let end = Math.min(lines.length, matchIndex + CONTEXT_LINES + 1);
            
            // 向上扩展到最近的标题
            while (start > 0 && lines[start - 1].startsWith('#')) {
                start--;
            }
            // 向下扩展到下一个标题
            while (end < lines.length && lines[end].startsWith('#')) {
                end++;
            }
            
            let extracted = lines.slice(start, end).join('\n').trim();
            
            if (extracted.length > MAX_CHARS) {
                extracted = extracted.substring(0, MAX_CHARS) + '\n... [内容截断]';
            }
            
            return extracted;
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
