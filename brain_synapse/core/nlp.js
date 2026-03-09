/**
 * Natural Language Processing Toolkit for Synapse Memory
 * Features:
 * - Lazy loaded node-nlp (to keep fast boots)
 * - Stopword filtering
 * - Zero-dependency fallback word extraction
 */

const VALID_POS_TAGS = ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW'];
const MIN_WORD_LENGTH = 2;

const CHINESE_STOPWORDS = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', 
    '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '里', '什么',
    '可以', '觉得', '应该', '可能', '因为', '所以', '但是', '如果', '只是', '还是', '或者', '而且',
    '然后', '已经', '这样', '那样', '怎么', '这个', '那个', '现在', '之前', '以后', '时候', '方法',
    '东西', '事情', '问题', '地方', '时间', '一下', '一点', '一些', '每次', '还有', '虽然', '不过'
]);

const ENGLISH_STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own',
    'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'any', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'if', 'else', 'then', 'there'
]);

// Lazy dependencies
let _nlpManager = null;
let _nlpUtilZh = null;
let _nlpLoaded = false;

function getNlp() {
    if (!_nlpLoaded) {
        try {
            _nlpManager = require('node-nlp').NlpManager;
            _nlpUtilZh = require('@nlpjs/lang-zh');
        } catch (e) {
            console.warn('[NLP] node-nlp not available, using fallback keyword extraction');
        }
        _nlpLoaded = true;
    }
    return { NlpManager: _nlpManager, NlpUtilZh: _nlpUtilZh };
}

function isStopword(word, isChinese) {
    if (isChinese) {
        return CHINESE_STOPWORDS.has(word) || word.length < MIN_WORD_LENGTH;
    } else {
        return ENGLISH_STOPWORDS.has(word.toLowerCase());
    }
}

/**
 * Extract semantic keywords from text using hybrid strategy
 * (POS tagging + node-nlp + regex fallback)
 */
function extractKeywords(text) {
    const keywords = new Set();
    const { NlpManager, NlpUtilZh } = getNlp();
    
    // Path 1: Chinese specific NLP
    if (NlpUtilZh && NlpUtilZh.ZhNotes) {
        try {
            const zhNotes = new NlpUtilZh.ZhNotes();
            const tokenized = zhNotes.tokenize(text);
            if (tokenized && Array.isArray(tokenized)) {
                tokenized.forEach(item => {
                    if (item && item.normalized && item.pos) {
                        const pos = item.pos.toLowerCase();
                        const word = item.normalized;
                        if (VALID_POS_TAGS.includes(pos) && word.length >= MIN_WORD_LENGTH) {
                            if (!isStopword(word, true)) keywords.add(word.toLowerCase());
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('[NLP] Chinese POS tagging failed:', e.message);
        }
    }
    
    // Path 2: node-nlp generic tags
    if (NlpManager) {
        try {
            const nlpManager = new NlpManager({ languages: ['en', 'zh'] });
            const result = nlpManager.extractTags(text);
            if (result && Array.isArray(result)) {
                result.forEach(item => {
                    if (item && item.value && item.value.length >= MIN_WORD_LENGTH) {
                        const w = item.value.toLowerCase();
                        if (!isStopword(w, false) && !isStopword(w, true)) keywords.add(w);
                    }
                });
            }
        } catch (e) {
            console.warn('[NLP] node-nlp extraction failed:', e.message);
        }
    }
    
    // Path 3: Fallback Regex Splitter (used when node-nlp fails or misses)
    if (keywords.size === 0) {
        const chineseChars = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];
        
        chineseChars.forEach(word => {
            if (!isStopword(word, true)) {
                keywords.add(word.toLowerCase());
            }
        });
        englishWords.forEach(word => {
            if (!isStopword(word, false)) {
                keywords.add(word.toLowerCase());
            }
        });
    }
    
    return Array.from(keywords);
}

module.exports = {
    extractKeywords,
    isStopword
};
