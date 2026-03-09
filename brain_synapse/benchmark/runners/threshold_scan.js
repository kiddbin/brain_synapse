/**
 * @file brain_synapse/benchmark/runners/threshold_scan.js
 * @description 阈值扫描实验 - 收集 override 统计和阈值对比
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class ThresholdScan {
    constructor() {
        this.scale = 10000;
        this.thresholds = [0.20, 0.25, 0.30, 0.35];
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
            'OrderService', 'ProductService', 'PaymentService', 'NotificationService',
            'helper', 'validator', 'logger', 'middleware', 'controller'
        ];
        this.memories = null;
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

        for (let i = 0; i < this.scale * 0.1; i++) {
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

        for (let i = 0; i < this.scale * 0.03; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            const validFrom = now - 90 * dayMs;
            const validTo = now - 30 * dayMs;
            
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'semantic',
                content: {
                    keyword: keyword,
                    rule: `旧版${keyword}规则：此规则已过期`
                },
                created_at: validFrom,
                updated_at: validFrom,
                timestamp_valid_from: validFrom,
                timestamp_valid_to: validTo,
                confidence: 0.5,
                salience: 0.5,
                recency: 0.1,
                access_count: 0
            });
        }

        for (let i = 0; i < this.scale * 0.02; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            const oldId = `mem_${id++}`;
            const newId = `mem_${id++}`;
            
            memories.push({
                id: oldId,
                memory_type: 'semantic',
                content: {
                    keyword: keyword,
                    rule: `旧版${keyword}规则：使用 MySQL`
                },
                created_at: now - 60 * dayMs,
                updated_at: now - 60 * dayMs,
                superseded_by: newId,
                confidence: 0.5,
                salience: 0.5,
                recency: 0.1,
                access_count: 0
            });
            
            memories.push({
                id: newId,
                memory_type: 'semantic',
                content: {
                    keyword: keyword,
                    rule: `新版${keyword}规则：使用 PostgreSQL`
                },
                created_at: now - 5 * dayMs,
                updated_at: now - 5 * dayMs,
                supersedes: oldId,
                confidence: 0.8,
                salience: 0.8,
                recency: 1.0,
                access_count: 5
            });
        }

        return memories;
    }

    async run() {
        console.log('='.repeat(80));
        console.log('        THRESHOLD SCAN EXPERIMENT');
        console.log('='.repeat(80));
        console.log(`Scale: ${this.scale} memories`);
        console.log(`Thresholds: ${this.thresholds.join(', ')}`);
        console.log(`Test queries: ${this.testQueries.length}`);
        console.log(`Environment: No-agent (direct execution)\n`);

        const tempFile = path.join(__dirname, `threshold_scan_${Date.now()}.json`);
        
        try {
            console.log(`Generating ${this.scale} memories once...`);
            this.memories = this.generateMemories();

            for (const threshold of this.thresholds) {
                console.log('\n' + '='.repeat(80));
                console.log(`Testing with OVERRIDE_THRESHOLD = ${threshold}`);
                console.log('='.repeat(80));
                
                const sdk = new BrainSynapseSDK({
                    weightsFile: tempFile,
                    latentFile: tempFile + '.latent',
                    autoLoad: false
                });
                await sdk.init();

                console.log(`Importing memories...`);
                const importStart = Date.now();
                for (const mem of this.memories) {
                    await sdk.createMemory(mem);
                }
                const importTime = Date.now() - importStart;
                console.log(`Import completed in ${importTime}ms\n`);

                process.env.OVERRIDE_THRESHOLD = threshold;
                
                this.results[threshold] = await this.runMode(sdk, threshold);
                
                this.cleanup(tempFile);
            }

            this.printComparison();
            this.saveReport();

        } finally {
            this.cleanup(tempFile);
        }
    }

    async runMode(sdk, threshold) {
        const results = {
            totalQueries: this.testQueries.length,
            passed: 0,
            failed: 0,
            latencies: [],
            top1Correct: 0,
            top1Total: 0,
            top3Useful: 0,
            top3Total: 0,
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
            const result = await this.runQuery(sdk, tq, threshold);
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

            results.top3Total += result.top3Total;
            results.top3Useful += result.top3Useful;
            results.irrelevantCount += result.irrelevantCount;

            if (result.overrideTriggered) {
                results.overrideStats.triggered++;
                if (result.overrideImproved) results.overrideStats.improved++;
                else if (result.overrideDegraded) results.overrideStats.degraded++;
                else results.overrideStats.unchanged++;
            }
        }

        results.passRate = (results.passed / results.totalQueries * 100).toFixed(2);
        results.avgLatency = this.average(results.latencies);
        results.p95Latency = this.percentile(results.latencies, 95);
        results.avgResults = results.totalResults / results.totalQueries;
        results.top1Correctness = results.top1Total > 0 
            ? (results.top1Correct / results.top1Total * 100).toFixed(2) 
            : 'N/A';
        results.top3Usefulness = results.top3Total > 0 
            ? (results.top3Useful / results.top3Total * 100).toFixed(2) 
            : 'N/A';
        results.irrelevantRatio = results.totalResults > 0 
            ? (results.irrelevantCount / results.totalResults * 100).toFixed(2) 
            : '0.00';
        results.noisePassRate = results.noiseTotal > 0 
            ? (results.noiseCorrect / results.noiseTotal * 100).toFixed(2) 
            : 'N/A';

        console.log(`  Pass Rate: ${results.passRate}%`);
        console.log(`  Avg Latency: ${results.avgLatency.toFixed(1)}ms`);
        console.log(`  P95 Latency: ${results.p95Latency.toFixed(1)}ms`);
        console.log(`  Top-1 Correctness: ${results.top1Correctness}%`);
        console.log(`  Irrelevant Ratio: ${results.irrelevantRatio}%`);
        console.log(`  Noise Rejection: ${results.noisePassRate}%`);
        console.log(`  Override Triggered: ${results.overrideStats.triggered} times`);
        console.log(`  Override Improved: ${results.overrideStats.improved}, Degraded: ${results.overrideStats.degraded}`);

        return results;
    }

    async runQuery(sdk, tq, threshold) {
        const result = {
            query: tq.query,
            type: tq.type,
            passed: false,
            latency: 0,
            resultCount: 0,
            top1Correct: null,
            top1HitType: null,
            top1Score: null,
            top3Useful: 0,
            top3Total: 0,
            irrelevantCount: 0,
            memories: [],
            overrideTriggered: false,
            overrideImproved: false,
            overrideDegraded: false
        };

        try {
            const startTime = Date.now();
            const recallResult = await sdk.recall(tq.query);
            const latency = Date.now() - startTime;

            result.latency = latency;
            result.resultCount = recallResult.results.length;
            result.memories = recallResult.results.slice(0, 3);

            if (recallResult.results.length > 0) {
                const top1 = recallResult.results[0];
                result.top1HitType = top1.hitType || 'unknown';
                result.top1Score = top1.score || 0;

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
                    result.top3Total++;
                    
                    let isUseful = false;
                    if (tq.expectedKeyword) {
                        isUseful = JSON.stringify(mem.memory.content).includes(tq.expectedKeyword);
                    } else if (tq.expectedFile) {
                        isUseful = (mem.memory.provenance?.file_reference || '').includes(tq.expectedFile);
                    } else if (tq.expectedEntity) {
                        isUseful = (mem.memory.linked_entities || []).some(e => e.includes(tq.expectedEntity));
                    }
                    
                    if (isUseful) result.top3Useful++;
                    else result.irrelevantCount++;
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
        console.log('        THRESHOLD SCAN COMPARISON TABLE');
        console.log('='.repeat(80));
        
        console.log('\n| Metric              |');
        this.thresholds.forEach(t => {
            console.log(` Threshold @${t.toFixed(2)} |`);
        });
        console.log('|---------------------|');
        this.thresholds.forEach(() => {
            console.log('----------------|');
        });

        const metrics = [
            { name: 'Pass Rate', key: 'passRate', unit: '%' },
            { name: 'Top-1 Correctness', key: 'top1Correctness', unit: '%' },
            { name: 'Irrelevant Ratio', key: 'irrelevantRatio', unit: '%' },
            { name: 'Avg Latency', key: 'avgLatency', unit: 'ms' },
            { name: 'P95 Latency', key: 'p95Latency', unit: 'ms' },
            { name: 'Noise Rejection', key: 'noisePassRate', unit: '%' },
            { name: 'Avg Results/Query', key: 'avgResults', unit: '' },
            { name: 'Override Triggered', key: 'overrideStats.triggered', unit: '' },
            { name: 'Override Improved', key: 'overrideStats.improved', unit: '' },
            { name: 'Override Degraded', key: 'overrideStats.degraded', unit: '' }
        ];

        for (const metric of metrics) {
            let row = `| ${metric.name.padEnd(20)}|`;
            
            for (const threshold of this.thresholds) {
                const result = this.results[threshold];
                let value;
                
                if (metric.key.includes('.')) {
                    const keys = metric.key.split('.');
                    value = result[keys[0]][keys[1]];
                } else {
                    value = result[metric.key];
                }
                
                if (typeof value === 'number') {
                    row += ` ${value.toFixed(1)}${metric.unit}`.padStart(15) + ' |';
                } else {
                    row += ` ${value}${metric.unit}`.padStart(15) + ' |';
                }
            }
            
            console.log(row);
        }

        console.log('\nTop-1 HitType Distribution:');
        console.log('| HitType   |');
        this.thresholds.forEach(t => {
            console.log(` @${t.toFixed(2)} |`);
        });
        console.log('|-----------|');
        this.thresholds.forEach(() => {
            console.log('-------|');
        });

        const allHitTypes = new Set();
        for (const threshold of this.thresholds) {
            const hitTypes = this.results[threshold].top1HitTypes;
            for (const hitType in hitTypes) {
                allHitTypes.add(hitType);
            }
        }

        for (const hitType of allHitTypes) {
            let row = `| ${hitType.padEnd(10)}|`;
            
            for (const threshold of this.thresholds) {
                const count = this.results[threshold].top1HitTypes[hitType] || 0;
                row += ` ${count}`.padStart(7) + ' |';
            }
            
            console.log(row);
        }
    }

    saveReport() {
        const reportPath = path.join(__dirname, `threshold_scan_report_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify({
            scale: this.scale,
            thresholds: this.thresholds,
            results: this.results
        }, null, 2), 'utf8');
        console.log(`\n[Report] Saved to: ${reportPath}`);
    }

    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = arr.slice().sort((a, b) => a - b);
        const pos = (sorted.length - 1) * p / 100;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
            return sorted[base];
        }
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
    const scanner = new ThresholdScan();
    scanner.run().catch(console.error);
}

module.exports = { ThresholdScan };
