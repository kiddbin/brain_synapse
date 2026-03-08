/**
 * @file brain_synapse/local_file_search.js
 * @description Local File Search Fallback Plugin - Backup search engine when QMD is unavailable
 * @author Foundry (on behalf of Antigravity)
 * @version 1.3.0
 * 
 * Core Features:
 * 1. 100ms timeout racing - Strict performance-first principle
 * 2. Memory index mechanism - Avoid repeated disk I/O
 * 3. Incremental index persistence - Cache mtime, only process changed files
 * 4. Silent fault tolerance - Any error will not interrupt the main flow
 * 5. Seamless integration - Automatically mounts to brain_synapse recall logic
 * 6. Chinese support - Correctly handles Chinese character indexing and search
 * 7. Filename high-weight - Filename match weight is 600+ times content match
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'local_index_cache.json');

class LocalFileSearch {
    constructor() {
        this.maxExecutionTime = 100;
        this.indexCache = new Map();
        this.lastIndexTime = 0;
        this.memoryDir = path.join(__dirname, '../../workspace/memory');
        this.archiveDir = path.join(__dirname, '../../workspace/memory/archive');
        this._fileCache = null;
    }

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

    async execute(queryOrArray, options = {}) {
        try {
            const startTime = Date.now();
            
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

    async performSearch(queries, options = {}) {
        await this.buildIndexIncremental();
        
        const allResults = [];
        const processedFiles = new Set();
        
        for (const query of queries) {
            const results = this.searchInIndex(query.toLowerCase(), options.candidateFiles);
            
            for (const result of results) {
                if (!processedFiles.has(result.file)) {
                    processedFiles.add(result.file);
                    allResults.push(result);
                }
            }
        }
        
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

    searchInIndex(query, candidateFilesArray) {
        const candidateSet = candidateFilesArray ? new Set(candidateFilesArray) : null;
        const fileScores = new Map();
        const fileInfoMap = new Map();
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(query);
        const queryLower = query.toLowerCase();
        
        for (const [fileName, fileData] of Object.entries(this._fileCache)) {
            if (candidateSet && !candidateSet.has(fileName)) continue;
            const filePath = fileData.path;
            const fileNameLower = fileName.toLowerCase();
            
            let filenameMatchScore = 0;
            
            if (fileNameLower === queryLower || fileNameLower === queryLower + '.md') {
                filenameMatchScore = 10000;
            }
            else if (fileNameLower.replace('.md', '').includes(queryLower)) {
                const nameWithoutExt = fileNameLower.replace('.md', '');
                const density = queryLower.length / nameWithoutExt.length;
                filenameMatchScore = 5000 * density;
            }
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
        
        if (hasChinese) {
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
            .sort((a, b) => {
                const aInfo = fileInfoMap.get(a[0]) || {};
                const bInfo = fileInfoMap.get(b[0]) || {};
                
                if (aInfo.filenameMatch && !bInfo.filenameMatch) return -1;
                if (!aInfo.filenameMatch && bInfo.filenameMatch) return 1;
                
                if (aInfo.filenameMatch && bInfo.filenameMatch) {
                    return bInfo.filenameScore - aInfo.filenameScore;
                }
                
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
    
    segmentChineseQuery(query) {
        const words = [];
        const cleanQuery = query.replace(/\.md$/, '');
        
        if (!cleanQuery.includes(' ') && cleanQuery.length >= 2) {
            words.push(cleanQuery);
        }
        
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

    extractRelevantContent(filePath, query) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const queryLower = query.toLowerCase();
            
            const MAX_CHARS = 2000;
            const CONTEXT_LINES = 15;
            
            const isMetadataLine = (line) => {
                return line.startsWith('# Session:') ||
                       line.startsWith('- **Session') ||
                       line.startsWith('Conversation info') ||
                       line.startsWith('```json') ||
                       line.startsWith('```') ||
                       line.match(/^[\s]*$/);
            };
            
            const findFirstContentLine = () => {
                for (let i = 0; i < lines.length; i++) {
                    if (!isMetadataLine(lines[i]) && lines[i].trim().length > 0) {
                        return i;
                    }
                }
                return 0;
            };
            
            const extractBestContent = () => {
                const startIdx = findFirstContentLine();
                
                const keyPatterns = [
                    /## (Summary|Experience|Plan|Lesson|Key|Core|Success|Failure|Note)/i,
                    /### (Summary|Experience|Plan|Lesson|Key|Core|Success|Failure|Note)/i,
                    /\*\*(Summary|Experience|Plan|Lesson|Key|Core|Success|Failure)\*\*/i,
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
                                extracted = extracted.substring(0, MAX_CHARS) + '\n... [truncated]';
                            }
                            return extracted;
                        }
                    }
                }
                
                let endIdx = Math.min(lines.length, startIdx + 40);
                let extracted = lines.slice(startIdx, endIdx).join('\n').trim();
                if (extracted.length > MAX_CHARS) {
                    extracted = extracted.substring(0, MAX_CHARS) + '\n... [truncated]';
                }
                return extracted;
            };
            
            let matchIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                    if (!isMetadataLine(lines[i])) {
                        matchIndex = i;
                        break;
                    }
                }
            }
            
            if (matchIndex === -1) {
                return extractBestContent();
            }
            
            let start = Math.max(0, matchIndex - CONTEXT_LINES);
            let end = Math.min(lines.length, matchIndex + CONTEXT_LINES + 1);
            
            while (start > 0 && lines[start - 1].startsWith('#')) {
                start--;
            }
            while (end < lines.length && lines[end].startsWith('#')) {
                end++;
            }
            
            let extracted = lines.slice(start, end).join('\n').trim();
            
            if (extracted.length > MAX_CHARS) {
                extracted = extracted.substring(0, MAX_CHARS) + '\n... [truncated]';
            }
            
            return extracted;
        } catch (error) {
            return `Failed to read content: ${error.message}`;
        }
    }

    getMarkdownFiles(dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(dir, f));
    }
}

module.exports = LocalFileSearch;
