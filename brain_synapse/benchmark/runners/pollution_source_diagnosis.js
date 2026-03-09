/**
 * @file brain_synapse/benchmark/runners/pollution_source_diagnosis.js
 * @description 污染源诊断 - 定位 irrelevant ratio 偏高的根本原因
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class PollutionSourceDiagnosis {
    constructor() {
        this.scale = 300;
        this.results = {
            hitTypeDistribution: {},
            irrelevantBySource: {},
            top1ErrorCauses: {
                noCorrectAnswer: 0,
                correctButLowRank: 0,
                semanticOccupied: 0,
                spreadOverActivated: 0,
                evaluatorMismatch: 0
            },
            queryTypePollution: {},
            details: []
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
    }

    async run() {
        console.log('='.repeat(80));
        console.log('        POLLUTION SOURCE DIAGNOSIS');
        console.log('='.repeat(80));
        console.log(`Scale: ${this.scale} memories`);
        console.log(`Test queries: ${this.testQueries.length}`);
        console.log(`Goal: Identify main sources of irrelevant results\n`);

        const tempFile = path.join(__dirname, `diagnosis_${Date.now()}.json`);
        
        try {
            const sdk = new BrainSynapseSDK({
                weightsFile: tempFile,
                latentFile: tempFile + '.latent',
                autoLoad: false
            });
            await sdk.init();

            console.log(`Generating ${this.scale} memories...`);
            const memories = this.generateMemories();
            
            for (const mem of memories) {
                await sdk.createMemory(mem);
            }

            console.log(`\nRunning diagnosis...`);
            await this.runDiagnosis(sdk);

            this.printHitTypeDistribution();
            this.printIrrelevantBySource();
            this.printTop1ErrorCauses();
            this.printQueryTypePollution();
            this.printRecommendations();

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

    async runDiagnosis(sdk) {
        for (const tq of this.testQueries) {
            const result = await this.diagnoseQuery(sdk, tq);
            this.results.details.push(result);

            if (!this.results.queryTypePollution[tq.type]) {
                this.results.queryTypePollution[tq.type] = {
                    total: 0,
                    irrelevant: 0,
                    top1Error: 0
                };
            }
            this.results.queryTypePollution[tq.type].total++;
            this.results.queryTypePollution[tq.type].irrelevant += result.irrelevantCount;
            if (!result.top1Correct) {
                this.results.queryTypePollution[tq.type].top1Error++;
            }
        }
    }

    async diagnoseQuery(sdk, tq) {
        const result = {
            query: tq.query,
            type: tq.type,
            passed: false,
            top1Correct: null,
            top1HitType: null,
            irrelevantCount: 0,
            irrelevantByHitType: {},
            candidates: [],
            hasCorrectAnswer: false,
            correctAnswerRank: -1
        };

        try {
            const recallResult = await sdk.recall(tq.query);

            if (recallResult.results.length > 0) {
                const top1 = recallResult.results[0];
                result.top1HitType = top1.hitType || 'unknown';

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

                for (let i = 0; i < recallResult.results.length; i++) {
                    const mem = recallResult.results[i];
                    const hitType = mem.hitType || 'unknown';

                    if (!this.results.hitTypeDistribution[hitType]) {
                        this.results.hitTypeDistribution[hitType] = 0;
                    }
                    this.results.hitTypeDistribution[hitType]++;

                    let isRelevant = false;
                    if (tq.expectedKeyword) {
                        isRelevant = JSON.stringify(mem.memory.content).includes(tq.expectedKeyword);
                    } else if (tq.expectedFile) {
                        isRelevant = (mem.memory.provenance?.file_reference || '').includes(tq.expectedFile);
                    } else if (tq.expectedEntity) {
                        isRelevant = (mem.memory.linked_entities || []).some(e => e.includes(tq.expectedEntity));
                    } else if (tq.expectedType) {
                        isRelevant = mem.memory.memory_type === tq.expectedType;
                    }

                    if (isRelevant) {
                        result.hasCorrectAnswer = true;
                        if (result.correctAnswerRank === -1) {
                            result.correctAnswerRank = i;
                        }
                    } else {
                        result.irrelevantCount++;
                        if (!this.results.irrelevantBySource[hitType]) {
                            this.results.irrelevantBySource[hitType] = 0;
                        }
                        this.results.irrelevantBySource[hitType]++;
                        if (!result.irrelevantByHitType[hitType]) {
                            result.irrelevantByHitType[hitType] = 0;
                        }
                        result.irrelevantByHitType[hitType]++;
                    }

                    result.candidates.push({
                        rank: i,
                        hitType: hitType,
                        score: mem.score || 0,
                        isRelevant: isRelevant
                    });
                }

                if (!result.top1Correct && result.hasCorrectAnswer) {
                    if (result.correctAnswerRank === -1) {
                        this.results.top1ErrorCauses.noCorrectAnswer++;
                    } else if (result.correctAnswerRank > 0) {
                        if (result.top1HitType === 'semantic') {
                            this.results.top1ErrorCauses.semanticOccupied++;
                        } else if (result.top1HitType === 'spread') {
                            this.results.top1ErrorCauses.spreadOverActivated++;
                        } else {
                            this.results.top1ErrorCauses.correctButLowRank++;
                        }
                    }
                } else if (!result.top1Correct && !result.hasCorrectAnswer) {
                    this.results.top1ErrorCauses.noCorrectAnswer++;
                }
            }

            if (tq.type === 'noise') {
                result.passed = recallResult.results.length === 0;
            } else {
                result.passed = recallResult.results.length > 0;
            }

        } catch (error) {
            console.error(`[Error] Query "${tq.query}": ${error.message}`);
            result.passed = false;
        }

        return result;
    }

    printHitTypeDistribution() {
        console.log('\n' + '='.repeat(80));
        console.log('        HITTYPE DISTRIBUTION IN RESULTS');
        console.log('='.repeat(80));
        
        const total = Object.values(this.results.hitTypeDistribution).reduce((a, b) => a + b, 0);
        
        console.log('\n| HitType   | Count | Percentage |');
        console.log('|-----------|-------|------------|');
        
        const sorted = Object.entries(this.results.hitTypeDistribution)
            .sort((a, b) => b[1] - a[1]);
        
        for (const [hitType, count] of sorted) {
            const pct = (count / total * 100).toFixed(2);
            console.log(`| ${hitType.padEnd(9)} | ${count.toString().padStart(5)} | ${pct.padStart(9)}% |`);
        }
        
        console.log(`| ${'TOTAL'.padEnd(9)} | ${total.toString().padStart(5)} | ${'100.00'.padStart(9)}% |`);
    }

    printIrrelevantBySource() {
        console.log('\n' + '='.repeat(80));
        console.log('        IRRELEVANT RESULTS BY SOURCE');
        console.log('='.repeat(80));
        
        const total = Object.values(this.results.irrelevantBySource).reduce((a, b) => a + b, 0);
        
        console.log('\n| Source (HitType) | Irrelevant Count | Percentage |');
        console.log('|------------------|------------------|------------|');
        
        const sorted = Object.entries(this.results.irrelevantBySource)
            .sort((a, b) => b[1] - a[1]);
        
        for (const [hitType, count] of sorted) {
            const pct = (count / total * 100).toFixed(2);
            console.log(`| ${hitType.padEnd(16)} | ${count.toString().padStart(16)} | ${pct.padStart(9)}% |`);
        }
        
        console.log(`| ${'TOTAL'.padEnd(16)} | ${total.toString().padStart(16)} | ${'100.00'.padStart(9)}% |`);
    }

    printTop1ErrorCauses() {
        console.log('\n' + '='.repeat(80));
        console.log('        TOP-1 ERROR CAUSES');
        console.log('='.repeat(80));
        
        const total = Object.values(this.results.top1ErrorCauses).reduce((a, b) => a + b, 0);
        
        console.log('\n| Cause                    | Count | Percentage |');
        console.log('|--------------------------|-------|------------|');
        
        const causes = [
            { key: 'noCorrectAnswer', label: 'No correct answer in candidates' },
            { key: 'correctButLowRank', label: 'Correct answer but low rank' },
            { key: 'semanticOccupied', label: 'Semantic result occupied Top-1' },
            { key: 'spreadOverActivated', label: 'Spread result over-activated' },
            { key: 'evaluatorMismatch', label: 'Evaluator mismatch' }
        ];
        
        for (const cause of causes) {
            const count = this.results.top1ErrorCauses[cause.key];
            const pct = total > 0 ? (count / total * 100).toFixed(2) : '0.00';
            console.log(`| ${cause.label.padEnd(24)} | ${count.toString().padStart(5)} | ${pct.padStart(9)}% |`);
        }
        
        console.log(`| ${'TOTAL'.padEnd(24)} | ${total.toString().padStart(5)} | ${'100.00'.padStart(9)}% |`);
    }

    printQueryTypePollution() {
        console.log('\n' + '='.repeat(80));
        console.log('        QUERY TYPE VS POLLUTION RISK');
        console.log('='.repeat(80));
        
        console.log('\n| Query Type      | Total Queries | Avg Irrelevant | Top-1 Error Rate |');
        console.log('|-----------------|---------------|----------------|------------------|');
        
        const sorted = Object.entries(this.results.queryTypePollution)
            .sort((a, b) => (b[1].irrelevant / b[1].total) - (a[1].irrelevant / a[1].total));
        
        for (const [type, data] of sorted) {
            const avgIrrelevant = (data.irrelevant / data.total).toFixed(2);
            const errorRate = (data.top1Error / data.total * 100).toFixed(2);
            console.log(`| ${type.padEnd(15)} | ${data.total.toString().padStart(13)} | ${avgIrrelevant.padStart(14)} | ${errorRate.padStart(16)}% |`);
        }
    }

    printRecommendations() {
        console.log('\n' + '='.repeat(80));
        console.log('        RECOMMENDATIONS');
        console.log('='.repeat(80));

        const totalIrrelevant = Object.values(this.results.irrelevantBySource).reduce((a, b) => a + b, 0);
        const sortedSources = Object.entries(this.results.irrelevantBySource)
            .sort((a, b) => b[1] - a[1]);

        console.log('\n🎯 Top 2 Pollution Sources to Fix:\n');

        if (sortedSources.length > 0) {
            const [top1, count1] = sortedSources[0];
            const pct1 = (count1 / totalIrrelevant * 100).toFixed(2);
            console.log(`1. ${top1.toUpperCase()} (${pct1}% of irrelevant results)`);
            console.log(`   → This is the primary source of pollution.`);
            console.log(`   → Recommendation: Analyze why ${top1} results are frequently irrelevant.`);
        }

        if (sortedSources.length > 1) {
            const [top2, count2] = sortedSources[1];
            const pct2 = (count2 / totalIrrelevant * 100).toFixed(2);
            console.log(`\n2. ${top2.toUpperCase()} (${pct2}% of irrelevant results)`);
            console.log(`   → This is the secondary source of pollution.`);
            console.log(`   → Recommendation: Investigate ${top2} activation/filtering logic.`);
        }

        console.log('\n' + '='.repeat(80));
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
    const diagnosis = new PollutionSourceDiagnosis();
    diagnosis.run().catch(console.error);
}

module.exports = { PollutionSourceDiagnosis };
