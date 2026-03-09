/**
 * @file brain_synapse/benchmark/runners/ablation_semantic_weight.js
 * @description Ablation Experiment - Semantic Score Weight Tuning
 * @version 1.0.0
 * 
 * 目标：找到 Top-1 最优的 semanticScoreFactor
 * 
 * 实验设计：
 * - w = 0.0, 0.1, 0.2, 0.3, 0.4
 * - 每组输出：Top-1 Correctness, Irrelevant Ratio, Pass Rate
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class AblationSemanticWeight {
    constructor() {
        this.scale = 10000;
        this.weights = [0.0, 0.1, 0.2, 0.3, 0.4];
        this.results = {};
        this.testQueries = [
            { query: '数据库连接配置', expectedKeyword: '数据库', type: 'semantic' },
            { query: '缓存策略', expectedKeyword: '缓存', type: 'semantic' },
            { query: '认证流程', expectedKeyword: '认证', type: 'semantic' },
            { query: '日志记录方式', expectedKeyword: '日志', type: 'semantic' },
            { query: 'api.js', expectedFile: 'api.js', type: 'file' },
            { query: 'auth.js', expectedFile: 'auth.js', type: 'file' },
            { query: 'config/database', expectedFile: 'database', type: 'file' },
            { query: 'UserService', expectedEntity: 'UserService', type: 'entity' },
            { query: 'AuthService', expectedEntity: 'AuthService', type: 'entity' },
            { query: 'helper 函数', expectedEntity: 'helper', type: 'entity' },
            { query: '内存泄漏 解决', expectedType: 'failed_attempt', type: 'failed_attempt' },
            { query: '竞态条件', expectedType: 'failed_attempt', type: 'failed_attempt' },
            { query: '为什么选择微服务', expectedKeyword: '微服务', type: 'architecture' },
            { query: '技术选型', expectedKeyword: '技术', type: 'architecture' },
            { query: '身份验证', expectedKeyword: '认证', type: 'synonym' },
            { query: '性能问题', expectedKeyword: '性能', type: 'synonym' },
            { query: '安全措施', expectedKeyword: '安全', type: 'synonym' },
            { query: 'xyz123abc', expectedKeyword: null, type: 'noise' },
            { query: '不存在的关键词', expectedKeyword: null, type: 'noise' },
            { query: '依赖关系', expectedEntity: 'Service', type: 'cross_file' }
        ];
        this.keywords = [
            '数据库', '缓存', '认证', '授权', '日志', '配置', 'API', '微服务',
            '消息队列', '定时任务', '文件上传', '性能优化', '安全防护', '测试',
            '部署', '监控', '错误处理', '数据验证', '并发控制', '事务管理'
        ];
        this.files = [
            'src/services/api.js', 'src/services/auth.js', 'src/services/cache.js',
            'src/models/user.js', 'src/models/order.js', 'src/models/product.js',
            'src/utils/helper.js', 'src/utils/validator.js', 'src/utils/logger.js',
            'config/database.js', 'config/redis.js', 'config/app.js',
            'tests/api.test.js', 'tests/unit.test.js', 'tests/integration.test.js'
        ];
        this.entities = [
            'UserService', 'AuthService', 'CacheService', 'DatabaseService',
            'Logger', 'Validator', 'Helper', 'Controller', 'Model', 'Middleware'
        ];
    }

    async generateMemories(sdk) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Generating ${this.scale} memories...`);
        console.log(`${'='.repeat(80)}\n`);

        const startTime = Date.now();
        let count = 0;

        for (let i = 0; i < this.scale; i++) {
            const memoryType = this.getRandomMemoryType();
            const keyword = this.keywords[Math.floor(Math.random() * this.keywords.length)];
            const file = this.files[Math.floor(Math.random() * this.files.length)];
            const entity = this.entities[Math.floor(Math.random() * this.entities.length)];

            let content;
            switch (memoryType) {
                case 'semantic':
                    content = {
                        keyword: keyword,
                        rule: `${keyword}相关规则：使用标准配置，最大连接数为 ${Math.floor(Math.random() * 200)}`
                    };
                    break;
                case 'procedural':
                    content = {
                        keyword: keyword,
                        solution: `${keyword}解决方案：按照标准流程执行`
                    };
                    break;
                case 'episodic':
                    content = {
                        keyword: keyword,
                        rule: `${keyword}事件记录：在 2026/${Math.floor(Math.random() * 12) + 1}/${Math.floor(Math.random() * 28) + 1} 发生了相关事件`
                    };
                    break;
                case 'failed_attempt':
                    content = {
                        type: 'failed_attempt',
                        bug: ['超时', '内存泄漏', '竞态条件', '死锁'][Math.floor(Math.random() * 4)],
                        attempted: ['重启服务', '清理缓存', '增加超时时间', '优化查询'][Math.floor(Math.random() * 4)],
                        error: '问题仍然存在'
                    };
                    break;
                case 'reflective':
                    content = {
                        keyword: keyword,
                        reason: `${keyword}反思：应该采用更好的设计方案`
                    };
                    break;
            }

            await sdk.createMemory({
                memory_type: memoryType,
                content: content,
                provenance: {
                    file_reference: `${file}:L${Math.floor(Math.random() * 100)}`
                },
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.8 + Math.random() * 0.2,
                linked_entities: Math.random() > 0.5 ? [entity] : []
            });

            count++;
            if (count % 1000 === 0) {
                console.log(`[Progress] ${count}/${this.scale} memories created`);
            }
        }

        const importTime = Date.now() - startTime;
        console.log(`\n[Complete] ${count} memories imported in ${importTime}ms\n`);
        return importTime;
    }

    getRandomMemoryType() {
        const types = ['semantic', 'procedural', 'episodic', 'failed_attempt', 'reflective'];
        const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < types.length; i++) {
            cumulative += weights[i];
            if (rand < cumulative) return types[i];
        }
        return types[0];
    }

    async runSingleTest(sdk, query, expected) {
        const startTime = Date.now();
        const result = await sdk.recall(query, { mode: 'serial' });
        const latency = Date.now() - startTime;

        const memories = result.results || [];
        const passed = this.evaluateResult(memories, expected);
        const top1Correct = this.checkTop1Correct(memories, expected);
        const irrelevantCount = this.countIrrelevant(memories, expected);

        return {
            query,
            passed,
            latency,
            resultCount: memories.length,
            top1Correct,
            irrelevantCount,
            memories: memories.slice(0, 3)
        };
    }

    evaluateResult(memories, expected) {
        if (!memories || memories.length === 0) {
            return expected.expectedKeyword === null;
        }

        if (expected.expectedKeyword === null) {
            return false;
        }

        for (const memory of memories) {
            const content = memory.content || {};
            const keyword = content.keyword || '';
            const rule = content.rule || content.solution || content.reason || '';
            const fileRef = memory.provenance?.file_reference || '';

            if (expected.expectedKeyword && 
                (keyword.includes(expected.expectedKeyword) || 
                 rule.includes(expected.expectedKeyword))) {
                return true;
            }

            if (expected.expectedFile && fileRef.includes(expected.expectedFile)) {
                return true;
            }

            if (expected.expectedEntity) {
                const entities = memory.linked_entities || [];
                if (entities.some(e => e.includes(expected.expectedEntity))) {
                    return true;
                }
            }
        }

        return false;
    }

    checkTop1Correct(memories, expected) {
        if (!memories || memories.length === 0) {
            return null;
        }

        if (expected.expectedKeyword === null) {
            return null;
        }

        const topMemory = memories[0];
        const content = topMemory.content || {};
        const keyword = content.keyword || '';
        const rule = content.rule || content.solution || content.reason || '';
        const fileRef = topMemory.provenance?.file_reference || '';

        if (expected.expectedKeyword && 
            (keyword.includes(expected.expectedKeyword) || 
             rule.includes(expected.expectedKeyword))) {
            return true;
        }

        if (expected.expectedFile && fileRef.includes(expected.expectedFile)) {
            return true;
        }

        if (expected.expectedEntity) {
            const entities = topMemory.linked_entities || [];
            if (entities.some(e => e.includes(expected.expectedEntity))) {
                return true;
            }
        }

        return false;
    }

    countIrrelevant(memories, expected) {
        if (!memories || expected.expectedKeyword === null) {
            return 0;
        }

        let irrelevant = 0;
        for (const memory of memories) {
            const content = memory.content || {};
            const keyword = content.keyword || '';
            const rule = content.rule || content.solution || content.reason || '';
            const fileRef = memory.provenance?.file_reference || '';
            const entities = memory.linked_entities || [];

            let isRelevant = false;

            if (expected.expectedKeyword && 
                (keyword.includes(expected.expectedKeyword) || 
                 rule.includes(expected.expectedKeyword))) {
                isRelevant = true;
            }

            if (expected.expectedFile && fileRef.includes(expected.expectedFile)) {
                isRelevant = true;
            }

            if (expected.expectedEntity && 
                entities.some(e => e.includes(expected.expectedEntity))) {
                isRelevant = true;
            }

            if (!isRelevant) {
                irrelevant++;
            }
        }

        return irrelevant;
    }

    async runBenchmarkWithWeight(sdk, weight) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Testing with semanticScoreFactor = ${weight}`);
        console.log(`${'='.repeat(80)}\n`);

        const trackA = sdk.getOrchestrator().getTrackA();
        if (trackA && trackA.semanticFallback) {
            trackA.semanticFallback.options.semanticScoreFactor = weight;
        }

        const results = [];
        let passed = 0;
        let failed = 0;
        let top1Correct = 0;
        let top1Total = 0;
        let irrelevantCount = 0;
        let totalResults = 0;
        const latencies = [];

        for (const testQuery of this.testQueries) {
            const result = await this.runSingleTest(sdk, testQuery.query, testQuery);
            results.push(result);
            latencies.push(result.latency);

            if (result.passed) {
                passed++;
            } else {
                failed++;
            }

            if (result.top1Correct !== null) {
                top1Total++;
                if (result.top1Correct) {
                    top1Correct++;
                }
            }

            irrelevantCount += result.irrelevantCount;
            totalResults += result.resultCount;
        }

        const passRate = ((passed / this.testQueries.length) * 100).toFixed(2);
        const top1Correctness = top1Total > 0 ? ((top1Correct / top1Total) * 100).toFixed(2) : 'N/A';
        const irrelevantRatio = totalResults > 0 ? ((irrelevantCount / totalResults) * 100).toFixed(2) : '0.00';
        const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);

        return {
            weight,
            passRate,
            top1Correctness,
            irrelevantRatio,
            avgLatency,
            passed,
            failed,
            top1Correct,
            top1Total,
            irrelevantCount,
            totalResults
        };
    }

    async run() {
        console.log('\n' + '='.repeat(80));
        console.log('ABLATION EXPERIMENT: Semantic Score Weight Tuning');
        console.log('='.repeat(80) + '\n');

        const sdk = new BrainSynapseSDK({ autoLoad: false });
        await sdk.init();

        await this.generateMemories(sdk);

        for (const weight of this.weights) {
            const result = await this.runBenchmarkWithWeight(sdk, weight);
            this.results[weight] = result;
        }

        this.printComparisonTable();

        const reportPath = path.join(__dirname, `ablation_report_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify({
            scale: this.scale,
            weights: this.weights,
            results: this.results,
            timestamp: new Date().toISOString()
        }, null, 2));
        console.log(`\n[Report] Saved to: ${reportPath}`);
    }

    printComparisonTable() {
        console.log('\n' + '='.repeat(80));
        console.log('ABLATION RESULTS COMPARISON');
        console.log('='.repeat(80) + '\n');

        console.log('| Weight | Pass Rate | Top-1 Correctness | Irrelevant Ratio | Avg Latency |');
        console.log('|--------|-----------|-------------------|------------------|-------------|');

        for (const weight of this.weights) {
            const r = this.results[weight];
            console.log(`| ${weight.toFixed(1)}    | ${r.passRate.padStart(8)}% | ${r.top1Correctness.padStart(17)}% | ${r.irrelevantRatio.padStart(16)}% | ${r.avgLatency.padStart(10)}ms |`);
        }

        console.log('\n' + '-'.repeat(80));

        let bestTop1 = { weight: null, value: -1 };
        let bestIrrelevant = { weight: null, value: Infinity };

        for (const weight of this.weights) {
            const r = this.results[weight];
            const top1 = parseFloat(r.top1Correctness) || 0;
            const irr = parseFloat(r.irrelevantRatio) || 0;

            if (top1 > bestTop1.value) {
                bestTop1 = { weight, value: top1 };
            }
            if (irr < bestIrrelevant.value) {
                bestIrrelevant = { weight, value: irr };
            }
        }

        console.log(`\nBest Top-1 Correctness: w = ${bestTop1.weight} (${bestTop1.value.toFixed(2)}%)`);
        console.log(`Best Irrelevant Ratio:  w = ${bestIrrelevant.weight} (${bestIrrelevant.value.toFixed(2)}%)`);

        console.log('\n' + '='.repeat(80));
        console.log('CONCLUSION');
        console.log('='.repeat(80) + '\n');

        if (bestTop1.weight === 0.0) {
            console.log('⚠️  Best Top-1 at w=0.0: Semantic fallback is harmful for Top-1 accuracy.');
            console.log('   Recommendation: Consider disabling semantic fallback or further reducing weight.');
        } else if (bestTop1.weight <= 0.2) {
            console.log(`✅ Optimal weight found: w = ${bestTop1.weight}`);
            console.log('   Semantic fallback provides marginal benefit at low weight.');
        } else {
            console.log(`✅ Optimal weight found: w = ${bestTop1.weight}`);
            console.log('   Semantic fallback contributes positively to retrieval quality.');
        }
    }
}

async function main() {
    const experiment = new AblationSemanticWeight();
    await experiment.run();
}

main().catch(console.error);
