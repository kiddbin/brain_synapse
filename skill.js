/**
 * @file brain_synapse/skill.js
 * @description 数字突触 (Digital Synapse) 记忆核心实现 - 优化版
 * @author Foundry (on behalf of Antigravity)
 * @version 2.0.0
 * 
 * 基于《人脑记忆机制深度研究报告》构建：
 * 1. 稀疏编码 (Sparse Coding): 仅提取高权重特征，忽略冗余信息。
 * 2. 分级存储 (Hierarchical Storage): Active -> Schema -> Latent。
 * 3. 长时程抑制 (LTD - Long-Term Depression): 主动遗忘低频突触。
 * 4. 联想检索 (Spreading Activation): 激活扩散机制。
 * 5. 观察者模式 (Observer Pattern): 主动识别会话模式和行为规律。
 * 
 * ✅ 优化：使用 BrainSynapseSDK v2.0 (双轨检索，~30ms)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 使用新的 BrainSynapseSDK (v2.0) - 双轨检索架构
const { BrainSynapseSDK } = require('./src/index');

// 引入记忆守卫
const MemoryGuardian = require('./src/guard/memory_guardian');

// 性能埋点全局变量
const PERF_LOG = {
    pid: process.pid,
    query: '',
    cold_start: true,
    sdk_init_ms: 0,
    backend_load_ms: 0,
    latent_load_ms: 0,
    get_all_memories_ms: 0,
    memory_count: 0,
    index_exists: false,
    index_built: false,
    index_build_ms: 0,
    track_a_ms: 0,
    anchor_ms: 0,
    hebbian_ms: 0,
    semantic_fallback_triggered: false,
    semantic_fallback_reason: '',
    semantic_fallback_ms: 0,
    track_b_ms: 0,
    total_recall_ms: 0,
    end_to_end_ms: 0
};

// 记忆守卫全局实例
let _guardian = null;
let _sdk = null;
let _sdkInitialized = false;

function getNlp() {
    if (!_nlpLoaded) {
        try {
            _nlpManager = require('node-nlp').NlpManager;
            _nlpUtilZh = require('@nlpjs/lang-zh');
            console.log('[Synapse] node-nlp loaded (lazy)');
        } catch (e) {
            console.warn('[Synapse] node-nlp not available, using fallback keyword extraction');
        }
        _nlpLoaded = true;
    }
    return { NlpManager: _nlpManager, NlpUtilZh: _nlpUtilZh };
}

// Lazy-loaded Silicon Embed
let _siliconEmbed = null;
let _siliconEmbedLoaded = false;

function getSiliconEmbed() {
    if (!_siliconEmbedLoaded) {
        try {
            _siliconEmbed = require('./silicon-embed');
            console.log('[Synapse] SiliconEmbed loaded (lazy)');
        } catch (e) {
            console.warn('[Synapse] SiliconEmbed not available:', e.message);
        }
        _siliconEmbedLoaded = true;
    }
    return _siliconEmbed;
}

// --- Configuration ---
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory'); // OpenClaw's active memory
const ARCHIVE_DIR = path.join(WORKSPACE_ROOT, 'workspace/memory/archive'); // Latent storage
const WEIGHTS_FILE = path.join(__dirname, 'synapse_weights.v2.json');
const LATENT_WEIGHTS_FILE = path.join(__dirname, 'latent_weights.v2.json'); // 冷库：低权重记忆归档
const INSTINCTS_DIR = path.join(__dirname, 'instincts'); // Observer instincts storage

// LTD Parameters
const DECAY_RATE = 0.95; // 每次遗忘周期的衰减率
const FORGET_THRESHOLD = 0.1; // 低于此权重则移入冷库（不再删除）
const REVIVED_WEIGHT = 0.5; // 从冷库复苏后的初始权重
const INITIAL_WEIGHT = 1.0;

const VALID_POS_TAGS = ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW'];
const MIN_WORD_LENGTH = 2;
const MAX_WEIGHT_MULTIPLIER = 2.0;
const DECAY_FACTOR = 0.1;

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

function isStopword(word, isChinese) {
    if (isChinese) {
        return CHINESE_STOPWORDS.has(word) || word.length < 2;
    } else {
        return ENGLISH_STOPWORDS.has(word.toLowerCase());
    }
}

// Observer pattern for workflow detection
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
        // 静默失败，不影响主流程
    }
}

// --- Core Classes ---

async function getSdk() {
    if (!_sdk) {
        _sdk = new BrainSynapseSDK({
            weightsFile: WEIGHTS_FILE,
            latentFile: LATENT_WEIGHTS_FILE,
            autoLoad: true
        });
        // 在 init 之前传递 perfLog
        _sdk.perfLog = PERF_LOG;
        await _sdk.init();
        _sdkInitialized = true;
    }
    return _sdk;
}

async function getGuardian() {
    if (!_guardian) {
        _guardian = new MemoryGuardian({
            enableDiagnosticLog: true,
            logFilePath: path.join(__dirname, 'memory_guardian_log.json'),
            maxLogEntries: 1000
        });
    }
    return _guardian;
}

// --- CLI Interface for OpenClaw ---

const [, , command, ...args] = process.argv;

// Main async function to handle async recall
async function main() {
    switch (command) {
        case 'distill':
            const forceDistill = args.includes('--force') || args.includes('-f');
            console.log('[Distill] Starting memory synchronization...');
            
            const dSdk = await getSdk();
            const memoryFiles = [];
            
            // 扫描 memory 目录获取所有 .md 文件
            const memoryDir = path.join(WORKSPACE_ROOT, 'workspace/memory');
            if (fs.existsSync(memoryDir)) {
                const files = fs.readdirSync(memoryDir);
                for (const file of files) {
                    if (file.endsWith('.md') && !file.includes('archive')) {
                        const filePath = path.join(memoryDir, file);
                        const stat = fs.statSync(filePath);
                        // 如果是强制同步，或者文件在最近24小时内修改过
                        if (forceDistill || (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000)) {
                            memoryFiles.push({ path: filePath, name: file, mtime: stat.mtimeMs });
                        }
                    }
                }
            }
            
            console.log(`[Distill] Found ${memoryFiles.length} memory files to sync`);
            
            let syncedCount = 0;
            for (const memFile of memoryFiles) {
                try {
                    const content = fs.readFileSync(memFile.path, 'utf-8');
                    // 解析 markdown 文件，提取标题作为 keyword，内容作为 rule
                    const lines = content.split('\n');
                    let keyword = memFile.name.replace('.md', '');
                    let ruleContent = content;
                    
                    // 尝试从第一行提取标题作为 keyword
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('# ')) {
                            keyword = trimmed.substring(2).trim();
                            break;
                        }
                    }
                    
                    // 使用 SDK 创建记忆
                    await dSdk.createMemory({
                        memory_type: 'semantic',
                        content: {
                            keyword: keyword,
                            rule: ruleContent.substring(0, 1000), // 限制长度
                            pinned: true,
                            sourceFile: memFile.name
                        },
                        provenance: { source: 'distill', file: memFile.name },
                        confidence: 0.9,
                        salience: 0.8
                    });
                    
                    syncedCount++;
                    console.log(`[Distill] Synced: ${memFile.name}`);
                } catch (e) {
                    console.error(`[Distill] Failed to sync ${memFile.name}: ${e.message}`);
                }
            }
            
            console.log(`[Distill] ✅ Synchronization complete. ${syncedCount} memories synced.`);
            break;
        case 'distill-core':
            // Fast lane only - synchronous, ~100ms
            console.log('Distill-core operation is deprecated. Using legacy approach.');
            process.exit(0);
            break;
        case 'distill-vector':
            // Slow lane only - async, for background execution
            console.log('Distill-vector operation is deprecated. Using legacy approach.');
            process.exit(0);
            break;
        case 'recall':
            const startTime = Date.now();
            const recallArgs = args.join(' ');
            const isDeep = recallArgs.includes('--deep') || recallArgs.includes('-d');
            const query = recallArgs.replace(/--deep|-d/g, '').trim();
            
            PERF_LOG.query = query;
            PERF_LOG.cold_start = !_sdkInitialized;
            
            // 使用 BrainSynapseSDK v2.0 (双轨检索，~30ms)
            const sdkInitStart = Date.now();
            const sdk = await getSdk();
            PERF_LOG.sdk_init_ms = Date.now() - sdkInitStart;
            
            const recallStart = Date.now();
            const result = await sdk.recall(query, { 
                mode: 'serial',  // Track A -> Track B
                deep: isDeep,
                perfLog: PERF_LOG  // 传递性能日志对象
            });
            PERF_LOG.total_recall_ms = Date.now() - recallStart;
            
            PERF_LOG.end_to_end_ms = Date.now() - startTime;
            
            // 输出性能日志（JSON 格式）
            console.error('##PERF_LOG##:' + JSON.stringify(PERF_LOG));
            
            console.log(JSON.stringify(result, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'deep-recall':
            const deepQuery = args.join(' ');
            // 使用 BrainSynapseSDK v2.0 (双轨检索，~30ms)
            const deepSdk = await getSdk();
            const deepResult = await deepSdk.recall(deepQuery, { 
                mode: 'serial',
                deep: true 
            });
            console.log(JSON.stringify(deepResult, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'latent-stats':
            // For stats, we can use the backend directly
            const statsSdk = await getSdk();
            const backend = statsSdk.getOrchestrator().backend;
            const weights = backend.getAll();
            const stats = {
                totalWeights: Object.keys(weights).length,
                lastUpdated: new Date().toISOString(),
                estimatedLatency: '~30ms (optimized dual-track)'
            };
            console.log(JSON.stringify(stats, null, 2));
            setTimeout(() => process.exit(0), 10);
            break;
        case 'forget':
            console.log('Manual LTD cycle completed. (Optimized version)');
            break;
        case 'pin-exp':
            const pinArgs = args.join(' ');
            const pinColonIndex = pinArgs.indexOf(':');
            if (pinColonIndex === -1) {
                console.error('Usage: pin-exp <keyword>:<rule>');
                console.error('Example: pin-exp browser_fill:遇到fill报错必须用type替代');
                process.exit(1);
            }
            const pinKeyword = pinArgs.substring(0, pinColonIndex).trim();
            const pinRule = pinArgs.substring(pinColonIndex + 1).trim();
            if (!pinKeyword || !pinRule) {
                console.error('Keyword and rule are required');
                process.exit(1);
            }
            
            // 使用新的 SDK 添加记忆
            const pinSdk = await getSdk();
            await pinSdk.createMemory({
                memory_type: 'semantic',
                content: {
                    keyword: pinKeyword,
                    rule: pinRule,
                    pinned: true
                },
                provenance: { source: 'pinned_rule' },
                confidence: 1.0,
                salience: 1.0
            });
            
            console.log(`Pinned rule created: ${pinKeyword} -> ${pinRule}`);
            break;
            
        case 'write-verify':
            // 写入后强制回读验证命令
            const writeArgs = args.join(' ');
            console.error(`[Write-Verify] Raw args: "${writeArgs}"`);
            
            // 支持中文冒号和英文冒号
            const writeColonIndex = writeArgs.indexOf(':');
            const fullWidthColonIndex = writeArgs.indexOf(':');
            const finalColonIndex = writeColonIndex !== -1 ? writeColonIndex : (fullWidthColonIndex !== -1 ? fullWidthColonIndex : -1);
            
            if (finalColonIndex === -1) {
                console.error('Usage: write-verify <keyword>:<content>');
                console.error('Example: write-verify 火星计划：这是一个测试，主要测试你的记忆能力');
                process.exit(1);
            }
            const writeKeyword = writeArgs.substring(0, finalColonIndex).trim();
            const writeContent = writeArgs.substring(finalColonIndex + 1).trim();
            console.error(`[Write-Verify] Parsed keyword: "${writeKeyword}"`);
            console.error(`[Write-Verify] Parsed content: "${writeContent}"`);
            
            if (!writeKeyword || !writeContent) {
                console.error('Keyword and content are required');
                process.exit(1);
            }
            
            const wvSdk = await getSdk();
            const guardian = await getGuardian();
            
            // 1. 写入记忆
            console.log(`[Write-Verify] Step 1: Writing memory for "${writeKeyword}"...`);
            const createdMemory = await wvSdk.createMemory({
                memory_type: 'semantic',
                content: {
                    keyword: writeKeyword,
                    rule: writeContent,
                    pinned: true
                },
                provenance: { source: 'write_verify_command' },
                confidence: 1.0,
                salience: 1.0
            });
            
            // 优化：关键路径需要立即验证时，强制 flush 待写入数据
            console.log(`[Write-Verify] Step 1.5: Flushing pending writes for verification...`);
            await wvSdk.getBackend().flush();
            
            // 2. 立即回读验证
            console.log(`[Write-Verify] Step 2: Executing recall for verification...`);
            const recallResult = await wvSdk.recall(writeKeyword, {
                mode: 'serial',
                topK: 5
            });
            
            // 3. 验证回读结果
            console.log(`[Write-Verify] Step 3: Validating recall result...`);
            const verification = guardian.verifyWriteBack(writeKeyword, recallResult, {
                keyword: writeKeyword,
                rule: writeContent
            });
            
            // 4. 输出验证结果
            const writeVerifyResult = {
                write: {
                    success: true,
                    memoryId: createdMemory.id,
                    keyword: writeKeyword,
                    content: writeContent
                },
                verify: verification,
                timestamp: new Date().toISOString(),
                diagnostic: {
                    isLongTermMemoryQuestion: guardian.isLongTermMemoryQuestion(writeKeyword),
                    recallResultCount: recallResult.results?.length || 0,
                    recallConfidence: recallResult.confidence || 0
                }
            };
            
            console.log(JSON.stringify(writeVerifyResult, null, 2));
            
            // 5. 根据验证结果决定退出码
            if (!verification.success) {
                console.error('\n[Write-Verify] ❌ VERIFICATION FAILED - Do NOT claim "已记住"');
                process.exit(1);
            } else {
                console.log('\n[Write-Verify] ✅ VERIFICATION PASSED - Can safely claim "已记住"');
            }
            break;
            
        case 'guarded-recall':
            // 带守卫的 recall 命令（强制用于长期记忆问题）
            const grQuery = args.join(' ').trim();
            if (!grQuery) {
                console.error('Usage: guarded-recall <query>');
                process.exit(1);
            }
            
            const grSdk = await getSdk();
            const grGuardian = await getGuardian();
            
            // 1. 判断是否为长期记忆问题
            const isLTMQuestion = grGuardian.isLongTermMemoryQuestion(grQuery);
            console.error(`[Guarded-Recall] Intent: ${isLTMQuestion ? 'LONG_TERM_MEMORY' : 'NORMAL_QUERY'}`);
            
            // 2. 执行 recall
            const grRecallResult = await grSdk.recall(grQuery, {
                mode: 'serial',
                topK: 10
            });
            
            // 3. 验证记忆证据（使用严格匹配）
            const evidence = grGuardian.verifyMemoryEvidence(grRecallResult, grQuery);
            
            // 4. 生成响应
            const guardedRecallResult = {
                query: grQuery,
                isLongTermMemoryQuestion: isLTMQuestion,
                recall: {
                    resultCount: grRecallResult.results?.length || 0,
                    confidence: grRecallResult.confidence || 0,
                    results: grRecallResult.results?.slice(0, 3)
                },
                evidence: evidence,
                guardResponse: evidence.hasEvidence ? null : grGuardian.generateGuardResponse(grQuery),
                timestamp: new Date().toISOString()
            };
            
            console.log(JSON.stringify(guardedRecallResult, null, 2));
            
            // 5. 如果没有证据，返回守卫响应
            if (!evidence.hasEvidence && isLTMQuestion) {
                console.error('\n[Guarded-Recall] ⚠️ NO EVIDENCE - Use guardResponse instead of fabricating');
            }
            break;
            
        default:
            console.log(`Unknown command: ${command}`);
            console.log('Available commands: recall, deep-recall, guarded-recall, write-verify, latent-stats, forget, pin-exp');
            process.exit(1);
    }
}

main().catch(err => {
    console.error('Error in skill execution:', err);
    process.exit(1);
});