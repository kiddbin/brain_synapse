/**
 * @file brain_synapse/config.js
 * @description 集中配置文件 - 用于管理所有可配置的参数
 * 
 * ==================== 配置说明 ====================
 * 
 * 本文件包含 brain_synapse 系统的所有可配置项。
 * 开源版本已移除所有隐私信息，请按需配置。
 * 
 * 【支持的向量 API 提供商】
 * - Voyage AI (推荐): https://dash.voyageai.com
 * - Hugging Face: https://huggingface.co
 * - Ollama (本地): http://localhost:11434
 * 
 * 【本地运行模式】
 * - 即使不配置 API Key，系统也能完全本地运行！
 * - 不使用向量搜索时，系统会回退到本地文件搜索
 * - 所有记忆功能（蒸馏、联想检索、遗忘周期等）都能正常工作
 * 
 * ==================== 配置项 ====================
 */

// ==================== 向量搜索 API 配置 ====================
// 【可选】如需启用语义向量搜索，请配置以下选项
// 方式1: 在此直接填写（不推荐开源项目使用）
// CONFIG.vectorSearchApi.apiKey = 'your-api-key-here';

// 方式2: 设置环境变量（推荐）
// Voyage AI: export VOYAGE_API_KEY='your-key'    (Linux/Mac)
// HuggingFace: export HF_TOKEN='your-token'
// Ollama: 无需设置 (本地离线)

const CONFIG = {
    // ==================== 核心配置 ====================
    
    // 工作目录 - 指向包含 memory 文件夹的目录
    workspaceRoot: null,  // 运行时自动检测
    
    // 活跃记忆存储路径
    weightsFile: 'synapse_weights.json',
    
    // 冷库记忆存储路径（遗忘的记忆）
    latentWeightsFile: 'latent_weights.json',
    
    // ==================== LTD (Long-Term Depression) 遗忘周期参数 ====================
    // 【新手安全测试模式 - 专为前期测试设计】
    // 
    // [为什么是保守配置]
    // 刚装好系统时，大多数人都会胡乱测试。如果 AI 学习太敏锐、记忆留存太久，
    // 反而会把错误测试固化成垃圾记忆，甚至导致 Token 浪费。
    // 
    // [参数说明]
    // - decayRate 0.90: 较快的遗忘率，半衰期约 7 轮
    // - forgetThreshold 0.2: 较容易进入冷库，防止脏数据污染
    // - minObservationsForInstinct 5: 保守阈值，防止把"瞎折腾"当成真理
    // 
    ltd: {
        // 每次遗忘周期的权重衰减率
        // [新手安全配置] 0.90 = 每次衰减10%，半衰期约 7 轮
        // 快速遗忘适合前期测试，确保上下文保持极简，不浪费 Token
        decayRate: 0.90,
        
        // 低于此权重值，记忆移入冷库
        // [新手安全配置] 0.2 较高门槛，记忆稍微不用就立刻踢入冷库，极致省 Token
        forgetThreshold: 0.2,
        
        // 从冷库复苏后的初始权重
        revivedWeight: 0.5,
        
        // 新记忆创建时的初始权重
        initialWeight: 1.0
    },
    
    // ==================== 向量搜索 API 配置 ====================
    // 【可选】如需启用语义搜索，请配置
    // 支持多提供商：Voyage AI, Hugging Face, Ollama
    vectorSearchApi: {
        // API 地址（根据提供商选择）
        // Voyage AI:   'https://api.voyageai.com/v1/embeddings'
        // HuggingFace: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3'
        // Ollama:      'http://localhost:11434/api/embeddings'
        apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3',
        
        // 向量模型选择
        // Voyage AI:   'voyage-3' (SOTA) 或 'voyage-multilingual-2'
        // HuggingFace: 'BAAI/bge-m3' (推荐多语言) 或 'BAAI/bge-large-zh-v1.5' (中文)
        // Ollama:      'nomic-embed-text'
        model: 'BAAI/bge-m3',
        
        // API Key - 支持环境变量或直接填写
        // 优先级: VOYAGE_API_KEY > HF_TOKEN > SILICONFLOW_API_KEY > 直接填写
        // 如果未配置，系统会自动回退到本地搜索
        apiKey: process.env.VOYAGE_API_KEY || process.env.HF_TOKEN || process.env.SILICONFLOW_API_KEY || '',
        
        // 超时设置（毫秒）
        timeout: 5000,
        
        // 最大返回结果数
        maxResults: 5,
        
        // 文本分块大小
        chunkSize: 1000
    },
    
    // ==================== 本地文件搜索配置 ====================
    // 【必选】无需 API Key，完全本地运行
    localSearch: {
        // 最大执行时间（毫秒）
        // 防止搜索占用过多资源
        maxExecutionTime: 100,
        
        // 缓存文件路径
        cacheFile: 'local_index_cache.json'
    },
    
    // ==================== Observer 模式配置 ====================
    // 【新手安全测试模式 - 保守的潜意识固化】
    // 
    // [为什么是保守配置]
    // 新手前期经常会胡乱测试。如果阈值太低，AI 会把你的"瞎折腾"当成真理
    // 固化下来，产生垃圾本能。设为 5 次可以有效防止误学。
    // 
    observer: {
        // 创建本能（Instinct）所需的最少观察次数
        // [新手安全配置] 5 次保守阈值，防止把测试行为固化为本能
        // 初期测试时行为不稳定，需要更多次数确认是真实模式
        minObservationsForInstinct: 5,
        
        // 置信度参数
        confidenceBase: 0.3,        // 基础置信度
        confidenceIncrement: 0.05, // 每次正向反馈增量
        confidenceDecrement: 0.1,  // 每次负向反馈减量
        confidenceDecayWeekly: 0.02 // 每周自然衰减
    },
    
    // ==================== 关键词提取配置 ====================
    keywords: {
        // 最小词长度
        minWordLength: 2,
        
        // 最大权重倍数
        // 防止某个词权重过高而主导检索
        maxWeightMultiplier: 2.0,
        
        // 衰减因子
        decayFactor: 0.1,
        
        // 有效的词性标签
        validPosTags: ['n', 'nr', 'nz', 'eng', 'noun', 'NN', 'NNS', 'NNP', 'NNPS', 'FW']
    },
    
    // ==================== 功能开关 ====================
    features: {
        // 是否启用向量搜索（需要配置 API Key）
        // 自动检测：如果有有效的 API Key 则启用
        enableVectorSearch: !!(process.env.VOYAGE_API_KEY || process.env.HF_TOKEN || process.env.SILICONFLOW_API_KEY),
        
        // 是否启用 Observer 模式（自动学习用户行为）
        enableObserver: true,
        
        // 是否启用自动蒸馏
        enableAutoDistill: true
    }
};

// 自动检测工作目录
const path = require('path');
const fs = require('fs');

function detectWorkspaceRoot() {
    // 尝试从当前目录向上查找
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
    
    // 默认返回父目录
    return path.resolve(__dirname, '..');
}

// 初始化工作目录
CONFIG.workspaceRoot = detectWorkspaceRoot();

// 如果环境变量中有 API Key，自动启用向量搜索
if (process.env.SILICONFLOW_API_KEY) {
    CONFIG.features.enableVectorSearch = true;
}

module.exports = CONFIG;
