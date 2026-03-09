/**
 * @file brain_synapse/benchmark/runners/small_scale_override_test.js
 * @description 小规模真实性验证 benchmark - 验证 override 在真实链路中的行为
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class SmallScaleOverrideTest {
    constructor() {
        this.scale = 300;
        this.threshold = 0.30;
        this.results = {
            baseline: null,
            patched: null
        };
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
            'OrderService', 'ProductService', 'PaymentService', 'NotificationService',
            'helper', 'validator', 'logger', 'middleware', 'controller'
        ];
        this.overrideAnalysis = {
            totalTriggered: 0,
            queries: [],
            improved: 0,
            degraded: 0,
            unchanged: 0,
            hitTypeBattles: {}
        };
    }

    async run() {
        console.log('='.repeat(80));
        console.log('        SMALL SCALE OVERRIDE TEST (Real-world Validation)');
        console.log('='.repeat(80));
        console.log(`Scale: ${this.scale} memories`);
        console.log(`Threshold: ${this.threshold}`);
        console.log(`Test queries: ${this.testQueries.length}`);
        console.log(`Environment: No-agent (direct execution)\n`);

        const tempFile = path.join(__dirname, `small_scale_${Date.now()}.json`);
        
        try {
            console.log(`Generating ${this.scale} memories...`);
            const memories = this.generateMemories();

            console.log(`\nTesting baseline (no override)...`);
            process.env.OVERRIDE_THRESHOLD = '999'; // Disable override
            this.results.baseline = await this.runTest(memories, tempFile, 'baseline');

            console.log(`\nTesting patched (override threshold=${this.threshold})...`);
            process.env.OVERRIDE_THRESHOLD = this.threshold.toString();
            this.results.patched = await this.runTest(memories, tempFile, 'patched');

            this.printComparison();
            this.printOverrideAnalysis();
            this.printCaseAnalysis();
            this.printVerdict();

        } finally {
            this.cleanup(tempFile);
        }
    }

    generateMemories() {
        const memories = [];
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        let id = 1;

        for (let i = 0; i < this.scale * 0.4; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'semantic',
                content: {
                    keyword: keyword,
                    rule: `${keyword}相关规则：使用标准配置，最大连接数为 ${50 + Math.floor(Math.random() * 100)}`
                },
                provenance: {
                    file_reference: this.files[i % this.files.length] + `:L${Math.floor(Math.random() * 100)}`
                },
                linked_entities: [this.entities[i % this.entities.length]],
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                updated_at: now - Math.floor(Math.random() * 10) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random(),
                access_count: Math.floor(Math.random() * 10)
            });
        }

        for (let i = 0; i < this.scale * 0.2; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'procedural',
                content: {
                    keyword: keyword,
                    solution: `${keyword}解决方案：按照标准流程执行`
                },
                provenance: {
                    file_reference: this.files[i % this.files.length] + `:L${Math.floor(Math.random() * 100)}`
                },
                linked_entities: [this.entities[i % this.entities.length]],
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                updated_at: now - Math.floor(Math.random() * 10) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random(),
                access_count: Math.floor(Math.random() * 10)
            });
        }

        for (let i = 0; i < this.scale * 0.15; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'episodic',
                content: {
                    keyword: keyword,
                    rule: `${keyword}事件记录：在 ${new Date(now - Math.floor(Math.random() * 30) * dayMs).toLocaleDateString()} 发生了相关事件`
                },
                provenance: {
                    file_reference: this.files[i % this.files.length] + `:L${Math.floor(Math.random() * 100)}`
                },
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                updated_at: now - Math.floor(Math.random() * 10) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random(),
                access_count: Math.floor(Math.random() * 10)
            });
        }

        for (let i = 0; i < this.scale * 0.1; i++) {
            const bug = ['内存泄漏', '竞态条件', '死锁', '超时', '连接失败'][i % 5];
            const attempted = ['重启服务', '增加超时时间', '添加锁', '清理缓存', '重新连接'][i % 5];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'failed_attempt',
                content: {
                    type: 'failed_attempt',
                    bug: bug,
                    attempted: attempted,
                    error: '问题仍然存在'
                },
                provenance: {
                    file_reference: this.files[i % this.files.length] + `:L${Math.floor(Math.random() * 100)}`
                },
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                updated_at: now - Math.floor(Math.random() * 10) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random(),
                access_count: Math.floor(Math.random() * 10)
            });
        }

        for (let i = 0; i < this.scale * 0.15; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'reflective',
                content: {
                    keyword: keyword,
                    reason: `${keyword}反思：应该采用更好的设计方案`
                },
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                updated_at: now - Math.floor(Math.random() * 10) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random(),
                access_count: Math.floor(Math.random() * 10)
            });
        }

        return memories;
    }

    async runTest(memories, tempFile, mode) {
        const sdk = new BrainSynapseSDK({
            weightsFile: tempFile,
            latentFile: tempFile + '.latent',
            autoLoad: false
        });
        await sdk.init();

        console.log(`Importing memories...`);
        for (const mem of memories) {
            await sdk.createMemory(mem);
        }

        const results = {
            totalQueries: this.testQueries.length,
            passed: 0,
            failed: 0,
            latencies: [],
            top1Correct: 0,
            top1Total: 0,
            irrelevantCount: 0,
            totalResults: 0,
            noiseCorrect: 0,
            noiseTotal: 0,
            overrideStats: {
                triggered: 0,
                improved: 0,
                degraded: 0,
                unchanged: 0
            },
            top1HitTypes: {},
            details: []
        };

        for (const tq of this.testQueries) {
            const result = await this.runQuery(sdk, tq, mode);
            results.details.push(result);

            if (result.passed) results.passed++;
            else results.failed++;

            results.latencies.push(result.latency);
            results.totalResults += result.resultCount;

            if (tq.type === 'noise') {
                results.noiseTotal++;
                if (result.passed) results.noiseCorrect++;
            }

            if (result.top1Correct !== null) {
                results.top1Total++;
                if (result.top1Correct) results.top1Correct++;
            }

            if (result.top1HitType) {
                results.top1HitTypes[result.top1HitType] = (results.top1HitTypes[result.top1HitType] || 0) + 1;
            }

            results.irrelevantCount += result.irrelevantCount;

            if (result.overrideTriggered) {
                results.overrideStats.triggered++;
                if (result.overrideImproved) results.overrideStats.improved++;
                else if (result.overrideDegraded) results.overrideStats.degraded++;
                else results.overrideStats.unchanged++;

                this.overrideAnalysis.totalTriggered++;
                this.overrideAnalysis.queries.push({
                    query: tq.query,
                    baseline: result.baselineTop1,
                    patched: result.patchedTop1,
                    improved: result.overrideImproved,
                    degraded: result.overrideDegraded
                });

                if (result.overrideImproved) this.overrideAnalysis.improved++;
                else if (result.overrideDegraded) this.overrideAnalysis.degraded++;
                else this.overrideAnalysis.unchanged++;

                const battle = `${result.baselineHitType} → ${result.patchedHitType}`;
                this.overrideAnalysis.hitTypeBattles[battle] = (this.overrideAnalysis.hitTypeBattles[battle] || 0) + 1;
            }
        }

        results.passRate = (results.passed / results.totalQueries * 100).toFixed(2);
        results.avgLatency = this.average(results.latencies);
        results.top1Correctness = results.top1Total > 0 
            ? (results.top1Correct / results.top1Total * 100).toFixed(2) 
            : 'N/A';
        results.irrelevantRatio = results.totalResults > 0 
            ? (results.irrelevantCount / results.totalResults * 100).toFixed(2) 
            : '0.00';
        results.noisePassRate = results.noiseTotal > 0 
            ? (results.noiseCorrect / results.noiseTotal * 100).toFixed(2) 
            : 'N/A';

        console.log(`  Pass Rate: ${results.passRate}%`);
        console.log(`  Top-1 Correctness: ${results.top1Correctness}%`);
        console.log(`  Irrelevant Ratio: ${results.irrelevantRatio}%`);
        console.log(`  Avg Latency: ${results.avgLatency.toFixed(1)}ms`);
        console.log(`  Noise Rejection: ${results.noisePassRate}%`);
        console.log(`  Override Triggered: ${results.overrideStats.triggered} times`);

        this.cleanup(tempFile);
        return results;
    }

    async runQuery(sdk, tq, mode) {
        const result = {
            query: tq.query,
            type: tq.type,
            mode: mode,
            passed: false,
            latency: 0,
            resultCount: 0,
            top1Correct: null,
            top1HitType: null,
            top1Score: null,
            irrelevantCount: 0,
            overrideTriggered: false,
            overrideImproved: false,
            overrideDegraded: false,
            baselineTop1: null,
            patchedTop1: null,
            baselineHitType: null,
            patchedHitType: null
        };

        try {
            const startTime = Date.now();
            const recallResult = await sdk.recall(tq.query);
            const latency = Date.now() - startTime;

            result.latency = latency;
            result.resultCount = recallResult.results.length;

            if (recallResult.results.length > 0) {
                const top1 = recallResult.results[0];
                result.top1HitType = top1.hitType || 'unknown';
                result.top1Score = top1.score || 0;
                result.patchedTop1 = top1.memory.id;
                result.patchedHitType = top1.hitType;

                if (tq.expectedKeyword) {
                    const content = JSON.stringify(top1.memory.content);
                    result.top1Correct = content.includes(tq.expectedKeyword);
                } else if (tq.expectedFile) {
                    const fileRef = top1.memory.provenance?.file_reference || '';
                    result.top1Correct = fileRef.includes(tq.expectedFile);
                } else if (tq.expectedEntity) {
                    const entities = top1.memory.linked_entities || [];
                    result.top1Correct = entities.some(e => e.includes(tq.expectedEntity));
                } else if (tq.expectedType) {
                    result.top1Correct = top1.memory.memory_type === tq.expectedType;
                }

                for (let i = 0; i < Math.min(3, recallResult.results.length); i++) {
                    const mem = recallResult.results[i];
                    let isUseful = false;
                    if (tq.expectedKeyword) {
                        isUseful = JSON.stringify(mem.memory.content).includes(tq.expectedKeyword);
                    } else if (tq.expectedFile) {
                        isUseful = (mem.memory.provenance?.file_reference || '').includes(tq.expectedFile);
                    } else if (tq.expectedEntity) {
                        isUseful = (mem.memory.linked_entities || []).some(e => e.includes(tq.expectedEntity));
                    }
                    if (!isUseful) result.irrelevantCount++;
                }

                result.irrelevantCount += Math.max(0, recallResult.results.length - 3);
            }

            if (tq.type === 'noise') {
                result.passed = recallResult.results.length === 0;
            } else {
                result.passed = recallResult.results.length > 0;
            }

        } catch (error) {
            console.error(`  [Error] Query "${tq.query}": ${error.message}`);
            result.passed = false;
        }

        return result;
    }

    printComparison() {
        console.log('\n' + '='.repeat(80));
        console.log('        COMPARISON TABLE');
        console.log('='.repeat(80));
        
        console.log('\n| Metric              | Baseline (no override) | Patched (override=0.30) | Difference |');
        console.log('|---------------------|------------------------|-------------------------|------------|');

        const metrics = [
            { name: 'Pass Rate', key: 'passRate', unit: '%' },
            { name: 'Top-1 Correctness', key: 'top1Correctness', unit: '%' },
            { name: 'Irrelevant Ratio', key: 'irrelevantRatio', unit: '%' },
            { name: 'Avg Latency', key: 'avgLatency', unit: 'ms' },
            { name: 'Noise Rejection', key: 'noisePassRate', unit: '%' },
            { name: 'Override Triggered', key: 'overrideStats.triggered', unit: '' }
        ];

        for (const metric of metrics) {
            let baseline, patched;
            
            if (metric.key.includes('.')) {
                const keys = metric.key.split('.');
                baseline = this.results.baseline[keys[0]][keys[1]];
                patched = this.results.patched[keys[0]][keys[1]];
            } else {
                baseline = this.results.baseline[metric.key];
                patched = this.results.patched[metric.key];
            }
            
            const diff = typeof baseline === 'number' && typeof patched === 'number'
                ? (patched - baseline).toFixed(2)
                : 'N/A';
            
            console.log(`| ${metric.name.padEnd(20)} | ${(baseline + metric.unit).padStart(22)} | ${(patched + metric.unit).padStart(23)} | ${diff.padStart(10)} |`);
        }
    }

    printOverrideAnalysis() {
        console.log('\n' + '='.repeat(80));
        console.log('        OVERRIDE BEHAVIOR ANALYSIS');
        console.log('='.repeat(80));

        console.log('\nOverride Statistics:');
        console.log(`  Total Triggered: ${this.overrideAnalysis.totalTriggered}`);
        console.log(`  Improved: ${this.overrideAnalysis.improved}`);
        console.log(`  Degraded: ${this.overrideAnalysis.degraded}`);
        console.log(`  Unchanged: ${this.overrideAnalysis.unchanged}`);

        console.log('\nHitType Battle Distribution:');
        const battles = Object.entries(this.overrideAnalysis.hitTypeBattles)
            .sort((a, b) => b[1] - a[1]);
        
        if (battles.length === 0) {
            console.log('  No override triggered');
        } else {
            for (const [battle, count] of battles) {
                console.log(`  ${battle}: ${count} times`);
            }
        }

        console.log('\nOverride Triggered Queries:');
        if (this.overrideAnalysis.queries.length === 0) {
            console.log('  No override triggered');
        } else {
            for (const q of this.overrideAnalysis.queries.slice(0, 5)) {
                const status = q.improved ? '✅ Improved' : (q.degraded ? '❌ Degraded' : '➡️ Unchanged');
                console.log(`  - ${q.query}: ${status}`);
            }
        }
    }

    printCaseAnalysis() {
        console.log('\n' + '='.repeat(80));
        console.log('        CASE-LEVEL ANALYSIS (Top 5)');
        console.log('='.repeat(80));

        const cases = [];
        for (let i = 0; i < this.testQueries.length && cases.length < 5; i++) {
            const baselineDetail = this.results.baseline.details[i];
            const patchedDetail = this.results.patched.details[i];
            
            if (baselineDetail.top1HitType !== patchedDetail.top1HitType || 
                baselineDetail.overrideTriggered) {
                cases.push({
                    query: this.testQueries[i].query,
                    baseline: baselineDetail,
                    patched: patchedDetail
                });
            }
        }

        if (cases.length === 0) {
            console.log('\nNo significant differences found between baseline and patched.');
            return;
        }

        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            console.log(`\nCase ${i + 1}: "${c.query}"`);
            console.log('-'.repeat(80));
            console.log(`  Baseline Top-1: ${c.baseline.top1HitType} (score=${(c.baseline.top1Score || 0).toFixed(2)})`);
            console.log(`  Patched Top-1: ${c.patched.top1HitType} (score=${(c.patched.top1Score || 0).toFixed(2)})`);
            console.log(`  Override Triggered: ${c.patched.overrideTriggered ? 'YES' : 'NO'}`);
            
            const improved = c.baseline.top1Correct === false && c.patched.top1Correct === true;
            const degraded = c.baseline.top1Correct === true && c.patched.top1Correct === false;
            const status = improved ? '✅ Improved' : (degraded ? '❌ Degraded' : '➡️ Unchanged');
            console.log(`  Result: ${status}`);
        }
    }

    printVerdict() {
        console.log('\n' + '='.repeat(80));
        console.log('        VERDICT');
        console.log('='.repeat(80));

        const triggered = this.overrideAnalysis.totalTriggered > 0;
        const improved = this.overrideAnalysis.improved > this.overrideAnalysis.degraded;
        const noiseOk = this.results.patched.noisePassRate === '100.00';
        const latencyOk = this.results.patched.avgLatency < 100;

        console.log('\nPass Criteria:');
        console.log(`  ${triggered ? '✅' : '❌'} Override triggered in real pipeline (${this.overrideAnalysis.totalTriggered} times)`);
        console.log(`  ${improved ? '✅' : '❌'} Improved > Degraded (${this.overrideAnalysis.improved} vs ${this.overrideAnalysis.degraded})`);
        console.log(`  ${noiseOk ? '✅' : '❌'} Noise Rejection preserved (${this.results.patched.noisePassRate}%)`);
        console.log(`  ${latencyOk ? '✅' : '❌'} Latency acceptable (${this.results.patched.avgLatency.toFixed(1)}ms)`);

        const allPassed = triggered && improved && noiseOk && latencyOk;

        console.log('\n' + '='.repeat(80));
        if (allPassed) {
            console.log('✅ VERDICT: PASS');
            console.log('Override mechanism is worth investing resources in larger-scale benchmark.');
        } else {
            console.log('❌ VERDICT: FAIL');
            console.log('Override mechanism needs further tuning before larger-scale benchmark.');
        }
        console.log('='.repeat(80));
    }

    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    cleanup(tempFile) {
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            if (fs.existsSync(tempFile + '.latent')) {
                fs.unlinkSync(tempFile + '.latent');
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

if (require.main === module) {
    const test = new SmallScaleOverrideTest();
    test.run().catch(console.error);
}

module.exports = { SmallScaleOverrideTest };
