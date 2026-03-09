/**
 * @file brain_synapse/benchmark/runners/layer4_efficiency_analysis.js
 * @description Layer 4 Efficiency 分析脚本 - 分析 token 增长来源
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class Layer4EfficiencyAnalysis {
    constructor() {
        this.results = {
            rawVsPacked: [],
            tokenBreakdown: {},
            scenarios: {}
        };
    }

    async runAnalysis() {
        console.log('='.repeat(70));
        console.log('        LAYER 4 EFFICIENCY ANALYSIS');
        console.log('='.repeat(70));

        await this.analyzeTokenBreakdown();
        await this.analyzeScenarios();
        this.printReport();

        return this.results;
    }

    async createTempSDK(testId) {
        const tempFile = path.join(__dirname, `efficiency_temp.${testId}.${Date.now()}.json`);
        const sdk = new BrainSynapseSDK({
            weightsFile: tempFile,
            latentFile: tempFile + '.latent',
            autoLoad: false
        });
        await sdk.init();
        return { sdk, tempFile };
    }

    cleanup(tempFile) {
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(tempFile + '.latent')) fs.unlinkSync(tempFile + '.latent');
        } catch (e) {}
    }

    estimateTokens(text) {
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars / 1.5 + otherChars / 4);
    }

    async analyzeTokenBreakdown() {
        console.log('\n' + '='.repeat(70));
        console.log('1. Token 增长来源分析');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('breakdown');

        try {
            // 创建一个典型的记忆
            await sdk.createMemory({
                id: 'test_mem_1',
                memory_type: 'semantic',
                content: { keyword: '数据库连接池', rule: '数据库连接池最大连接数为 50，最小空闲连接数为 10' },
                provenance: { file_reference: 'config/database.js:L25' },
                created_at: Date.now(),
                updated_at: Date.now(),
                confidence: 0.8,
                salience: 0.7,
                recency: 1.0,
                access_count: 5
            });

            // 原始记忆的 token 数
            const rawMemory = await sdk.getBackend().get('test_mem_1');
            const rawJson = JSON.stringify(rawMemory);
            const rawTokens = this.estimateTokens(rawJson);

            // compacted memory 的 token 数
            const packer = sdk.contextPacker;
            const compacted = packer._compactMemory(rawMemory);
            const compactedJson = JSON.stringify(compacted);
            const compactedTokens = this.estimateTokens(compactedJson);

            // 模板 prompt 的 token 数
            const recallResult = await sdk.recall('数据库连接池');
            const bundle = packer.pack(recallResult, {});
            const prompt = packer.generatePrompt(bundle, 'default');
            const promptTokens = this.estimateTokens(prompt);

            console.log('\n  Token 构成分析:');
            console.log('  ' + '-'.repeat(60));
            console.log(`  原始记忆 JSON:       ${rawTokens} tokens`);
            console.log(`  Compacted 记忆:     ${compactedTokens} tokens`);
            console.log(`  Bundle (含格式):    ${bundle.tokenCount} tokens`);
            console.log(`  最终 Prompt:        ${promptTokens} tokens`);
            console.log('  ' + '-'.repeat(60));

            // 分析 compacted memory 的字段
            console.log('\n  Compacted Memory 字段分析:');
            Object.entries(compacted).forEach(([key, value]) => {
                const fieldTokens = this.estimateTokens(JSON.stringify(value));
                console.log(`    - ${key}: ${fieldTokens} tokens`);
            });

            // 分析 token 增长来源
            console.log('\n  Token 增长来源:');
            const fieldOverhead = compactedTokens - this.estimateTokens(JSON.stringify({
                keyword: compacted.keyword,
                rule: compacted.rule
            }));
            console.log(`    - 核心内容 (keyword + rule): ${compactedTokens - fieldOverhead} tokens`);
            console.log(`    - 元信息开销 (id, type, file, etc.): ${fieldOverhead} tokens`);
            console.log(`    - 模板格式化开销: ${promptTokens - bundle.tokenCount} tokens`);

            this.results.tokenBreakdown = {
                rawTokens,
                compactedTokens,
                bundleTokens: bundle.tokenCount,
                promptTokens,
                fieldOverhead,
                templateOverhead: promptTokens - bundle.tokenCount
            };

        } finally {
            this.cleanup(tempFile);
        }
    }

    async analyzeScenarios() {
        console.log('\n' + '='.repeat(70));
        console.log('2. 典型场景 Raw vs Packed 对比');
        console.log('='.repeat(70));

        // 场景 1: Bugfix
        await this.analyzeScenario('bugfix', [
            { id: 'fail_1', memory_type: 'failed_attempt', content: { type: 'failed_attempt', bug: '内存泄漏', attempted: '手动释放对象', error: '仍有泄漏' }, provenance: { file_reference: 'src/memory.js:L50' } },
            { id: 'fail_2', memory_type: 'failed_attempt', content: { type: 'failed_attempt', bug: '内存泄漏', attempted: 'setTimeout 延迟释放', error: '延迟后仍有泄漏' }, provenance: { file_reference: 'src/memory.js:L78' } },
            { id: 'sol_1', memory_type: 'procedural', content: { keyword: '内存泄漏', solution: '使用 Chrome DevTools Memory Profile 定位泄漏源并修复' } }
        ], '内存泄漏');

        // 场景 2: Config Query
        await this.analyzeScenario('config_query', [
            { id: 'cfg_1', memory_type: 'semantic', content: { keyword: '数据库连接池', rule: '最大连接数 50，最小空闲 10' }, provenance: { file_reference: 'config/database.js:L25' } },
            { id: 'cfg_2', memory_type: 'semantic', content: { keyword: 'Redis 配置', rule: 'Redis 主机地址为 redis.example.com:6379' }, provenance: { file_reference: 'config/redis.js:L10' } },
            { id: 'cfg_3', memory_type: 'semantic', content: { keyword: 'API 超时', rule: 'API 请求超时时间为 30 秒' }, provenance: { file_reference: 'config/api.js:L15' } }
        ], '数据库配置');

        // 场景 3: Cross-file / Architecture
        await this.analyzeScenario('cross_file', [
            { id: 'dep_1', memory_type: 'semantic', content: { keyword: '导入', rule: '从 utils.js 导入 helper 函数' }, provenance: { file_reference: 'src/services/api.js:L5' }, linked_entities: ['utils', 'helper'] },
            { id: 'dep_2', memory_type: 'semantic', content: { keyword: '导出', rule: '导出 helper 函数用于 API 处理' }, provenance: { file_reference: 'src/utils/utils.js:L20' }, linked_entities: ['utils', 'helper'] },
            { id: 'arch_1', memory_type: 'semantic', content: { keyword: '架构', rule: '采用微服务架构，服务间通过 gRPC 通信' }, provenance: { file_reference: 'docs/architecture.md:L10' } }
        ], 'helper 函数');
    }

    async analyzeScenario(name, memories, query) {
        console.log(`\n  场景: ${name}`);
        console.log('  ' + '-'.repeat(60));

        const { sdk, tempFile } = await this.createTempSDK(name);

        try {
            // 创建记忆
            for (const mem of memories) {
                await sdk.createMemory({
                    ...mem,
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    confidence: 0.5,
                    salience: 0.5,
                    recency: 1.0,
                    access_count: 0
                });
            }

            // 获取原始记忆
            const backend = sdk.getBackend();
            const allMemories = await backend.getAll();
            
            // 计算原始 token 数
            let rawTokens = 0;
            allMemories.forEach(m => {
                rawTokens += this.estimateTokens(JSON.stringify(m));
            });

            // 执行 recall
            const recallResult = await sdk.recall(query);
            const recalledMemories = recallResult.getMemories ? recallResult.getMemories() : 
                                    (recallResult.results || []).map(r => r.memory);

            // 计算 recall 结果的原始 token 数
            let recallRawTokens = 0;
            recalledMemories.forEach(m => {
                recallRawTokens += this.estimateTokens(JSON.stringify(m));
            });

            // 打包
            const packer = sdk.contextPacker;
            const bundle = packer.pack(recallResult, {});
            const prompt = packer.generatePrompt(bundle, name.includes('bugfix') ? 'bugfix' : (name.includes('config') ? 'config_query' : 'default'));
            const promptTokens = this.estimateTokens(prompt);

            // 计算效率
            const efficiency = recallRawTokens > 0 ? ((promptTokens / recallRawTokens - 1) * 100).toFixed(1) : 0;

            console.log(`    原始记忆总数:       ${allMemories.length} 条`);
            console.log(`    Recall 结果:        ${recalledMemories.length} 条`);
            console.log(`    Raw tokens:         ${recallRawTokens}`);
            console.log(`    Bundle tokens:      ${bundle.tokenCount}`);
            console.log(`    Prompt tokens:      ${promptTokens}`);
            console.log(`    效率变化:           ${efficiency > 0 ? '+' : ''}${efficiency}%`);

            this.results.scenarios[name] = {
                memoryCount: allMemories.length,
                recallCount: recalledMemories.length,
                rawTokens: recallRawTokens,
                bundleTokens: bundle.tokenCount,
                promptTokens,
                efficiency: parseFloat(efficiency)
            };

        } finally {
            this.cleanup(tempFile);
        }
    }

    printReport() {
        console.log('\n' + '='.repeat(70));
        console.log('3. 分析结论');
        console.log('='.repeat(70));

        const breakdown = this.results.tokenBreakdown;
        const scenarios = this.results.scenarios;

        console.log('\n  Token 增长主要来源:');
        if (breakdown) {
            console.log(`    1. 元信息开销: ~${breakdown.fieldOverhead} tokens/memory`);
            console.log(`    2. 模板格式化: ~${breakdown.templateOverhead} tokens`);
        }

        console.log('\n  场景效率对比:');
        console.log('  ' + '-'.repeat(60));
        console.log('  场景          | Raw    | Prompt | 效率变化');
        console.log('  ' + '-'.repeat(60));
        
        Object.entries(scenarios).forEach(([name, data]) => {
            const eff = data.efficiency > 0 ? `+${data.efficiency}%` : `${data.efficiency}%`;
            console.log(`  ${name.padEnd(14)} | ${data.rawTokens.toString().padEnd(6)} | ${data.promptTokens.toString().padEnd(6)} | ${eff}`);
        });

        console.log('  ' + '-'.repeat(60));

        // 计算平均效率
        const avgEfficiency = Object.values(scenarios).reduce((sum, s) => sum + s.efficiency, 0) / Object.keys(scenarios).length;
        console.log(`\n  平均效率变化: ${avgEfficiency > 0 ? '+' : ''}${avgEfficiency.toFixed(1)}%`);

        if (avgEfficiency > 0) {
            console.log('\n  结论: Layer 4 当前增加了 token 数，需要优化');
            console.log('  优化方向:');
            console.log('    1. 移除冗余元信息 (id, type, confidence, timestamp)');
            console.log('    2. 精简模板格式 (减少标题、分隔符)');
            console.log('    3. 只保留核心内容 (keyword + rule)');
        } else {
            console.log('\n  结论: Layer 4 实现了净压缩');
        }
    }
}

async function main() {
    const analysis = new Layer4EfficiencyAnalysis();
    await analysis.runAnalysis();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = Layer4EfficiencyAnalysis;
