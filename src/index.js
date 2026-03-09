/**
 * @file brain_synapse/src/index.js
 * @description Brain Synapse SDK 统一入口
 * @version 2.1.0
 * 
 * 对外暴露的 API：
 * - createMemory() - 创建记忆
 * - recall() - 检索记忆
 * - recallAndPack() - 检索并打包为 Agent-ready Bundle
 * - supersede() - 取代记忆（冲突解决）
 * - migrateFromLegacy() - 迁移旧数据
 */

const path = require('path');
const SynapseBackend = require('./storage/backend_json');
const MemoryItem = require('./schema/memory-item');
const { validateMemoryItem } = require('./schema/validators');
const RecallOrchestrator = require('./retrieval/orchestrator');
const ContextPacker = require('./reasoning/context_packer');
const MemoryGuardian = require('./guard/memory_guardian');

// 默认文件路径
const DEFAULT_WEIGHTS_FILE = path.join(__dirname, '../synapse_weights.v2.json');
const DEFAULT_LATENT_FILE = path.join(__dirname, '../latent_weights.v2.json');

/**
 * Brain Synapse SDK 主类
 */
class BrainSynapseSDK {
    /**
     * 创建 SDK 实例
     * @param {Object} options - 选项
     */
    constructor(options = {}) {
        const {
            weightsFile = DEFAULT_WEIGHTS_FILE,
            latentFile = DEFAULT_LATENT_FILE,
            autoLoad = true,
            packerOptions = {}
        } = options;
        
        this.weightsFile = weightsFile;
        this.latentFile = latentFile;
        
        // 初始化存储后端
        this.backend = new SynapseBackend(weightsFile);
        this.latentBackend = new SynapseBackend(latentFile);
        
        // 初始化检索编排器
        this.orchestrator = new RecallOrchestrator(this.backend);
        
        // 初始化 Context Packer
        this.contextPacker = new ContextPacker(packerOptions);
        
        this.initialized = false;
        
        if (autoLoad) {
            this.init();
        }
    }

    /**
     * 初始化
     * @returns {Promise<void>}
     */
    async init() {
        const initStart = Date.now();
        console.log('[BrainSynapseSDK] Initializing...');
        
        const backendStart = Date.now();
        await this.backend.load();
        const backendLoadMs = Date.now() - backendStart;
        
        const latentStart = Date.now();
        await this.latentBackend.load();
        const latentLoadMs = Date.now() - latentStart;
        
        const getAllStart = Date.now();
        const memories = await this.backend.getAll();
        const getAllMs = Date.now() - getAllStart;
        
        // IndexManager 已经在 backend.load() 中构建，这里只需要检查状态
        const indexManager = this.backend.indexManager;
        const indexExists = !!indexManager;
        const indexBuilt = indexExists && indexManager._isBuilt;
        const indexBuildMs = 0; // 已在 backend.load() 中完成
        
        console.log(`[BrainSynapseSDK] IndexManager status: exists=${indexExists}, built=${indexBuilt}`);
        
        // 初始化 Track A 的赫布权重
        this.orchestrator.getTrackA().initializeHebbianWeights(memories);
        
        const totalInitMs = Date.now() - initStart;
        console.log(`[BrainSynapseSDK] Initialized successfully in ${totalInitMs}ms (backend:${backendLoadMs}ms, latent:${latentLoadMs}ms, getAll:${getAllMs}ms, memories:${memories.length})`);
        
        // 保存性能数据到 perfLog（如果有）
        if (this.perfLog) {
            this.perfLog.backend_load_ms = backendLoadMs;
            this.perfLog.latent_load_ms = latentLoadMs;
            this.perfLog.get_all_memories_ms = getAllMs;
            this.perfLog.memory_count = memories.length;
            this.perfLog.index_exists = indexExists;
            this.perfLog.index_built = indexBuilt;
            this.perfLog.index_build_ms = indexBuildMs;
        }
        
        this.initialized = true;
    }

    /**
     * 创建记忆
     * @param {Object} data - 记忆数据
     * @returns {Promise<MemoryItem>}
     */
    async createMemory(data) {
        if (!this.initialized) await this.init();
        
        const memory = new MemoryItem(data);
        
        // 验证
        const validation = validateMemoryItem(memory.toJSON());
        if (!validation.valid) {
            throw new Error(`Invalid memory: ${validation.errors.join(', ')}`);
        }
        
        await this.backend.create(memory);
        console.log(`[BrainSynapseSDK] Created memory: ${memory.id}`);
        
        return memory;
    }

    /**
     * 检索记忆
     * @param {string} query - 查询
     * @param {Object} context - 上下文
     * @returns {Promise<RecallResult>}
     */
    async recall(query, context = {}) {
        // 传递 perfLog 到 orchestrator
        if (context.perfLog) {
            this.perfLog = context.perfLog;
        }
        
        if (!this.initialized) await this.init();
        
        return this.orchestrator.recall(query, context);
    }

    /**
     * 检索并打包为 Agent-ready Bundle
     * @param {string} query - 查询
     * @param {Object} options - 选项
     * @returns {Promise<Object>} MemoryBundle
     */
    async recallAndPack(query, options = {}) {
        if (!this.initialized) await this.init();
        
        const {
            recallContext = {},
            packerContext = {},
            template = 'default'
        } = options;
        
        // 1. 检索
        const recallResult = await this.orchestrator.recall(query, recallContext);
        
        // 2. 打包
        const bundle = this.contextPacker.pack(recallResult, packerContext);
        
        // 3. 生成 Prompt（可选）
        if (template) {
            bundle.prompt = this.contextPacker.generatePrompt(bundle, template);
        }
        
        return bundle;
    }

    /**
     * 取代记忆（冲突解决）
     * @param {string} oldId - 旧记忆 ID
     * @param {Object} newData - 新记忆数据
     * @returns {Promise<MemoryItem>}
     */
    async supersede(oldId, newData) {
        if (!this.initialized) await this.init();
        
        const oldMemory = await this.backend.get(oldId);
        if (!oldMemory) {
            throw new Error(`Memory not found: ${oldId}`);
        }
        
        // 创建新记忆
        const newMemory = new MemoryItem({
            ...newData,
            supersedes: oldId
        });
        
        // 更新旧记忆
        oldMemory.superseded_by = newMemory.id;
        await this.backend.update(oldMemory);
        
        // 保存新记忆
        await this.backend.create(newMemory);
        
        console.log(`[BrainSynapseSDK] Superseded ${oldId} with ${newMemory.id}`);
        
        return newMemory;
    }

    /**
     * 从旧格式迁移
     * @returns {Promise<number>} 迁移的记忆数量
     */
    async migrateFromLegacy() {
        const legacyWeightsFile = path.join(__dirname, '../synapse_weights.json');
        const legacyLatentFile = path.join(__dirname, '../latent_weights.json');
        
        console.log('[BrainSynapseSDK] Migrating from legacy format...');
        
        const count = await this.backend.migrateFromLegacy(
            legacyWeightsFile,
            legacyLatentFile
        );
        
        console.log(`[BrainSynapseSDK] Migrated ${count} memories`);
        
        return count;
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        return this.backend.getStats();
    }

    /**
     * 直接查询（高级 API）
     * @param {Object} query - 查询条件
     * @returns {Promise<RecallResult>}
     */
    async directQuery(query) {
        if (!this.initialized) await this.init();
        
        return this.orchestrator.directQuery(query);
    }

    /**
     * 获取后端实例
     * @returns {SynapseBackend}
     */
    getBackend() {
        return this.backend;
    }

    /**
     * 获取编排器实例
     * @returns {RecallOrchestrator}
     */
    getOrchestrator() {
        return this.orchestrator;
    }

    /**
     * 获取 Context Packer 实例
     * @returns {ContextPacker}
     */
    getContextPacker() {
        return this.contextPacker;
    }
}

// 便捷函数
async function createMemory(data) {
    const sdk = new BrainSynapseSDK();
    return sdk.createMemory(data);
}

async function recall(query, context = {}) {
    const sdk = new BrainSynapseSDK();
    return sdk.recall(query, context);
}

async function recallAndPack(query, options = {}) {
    const sdk = new BrainSynapseSDK();
    return sdk.recallAndPack(query, options);
}

async function supersede(oldId, newData) {
    const sdk = new BrainSynapseSDK();
    return sdk.supersede(oldId, newData);
}

// 导出
module.exports = {
    BrainSynapseSDK,
    MemoryItem,
    SynapseBackend,
    RecallOrchestrator,
    ContextPacker,
    MemoryGuardian,
    createMemory,
    recall,
    recallAndPack,
    supersede,
    validateMemoryItem
};
