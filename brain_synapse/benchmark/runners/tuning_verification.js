/**
 * @file brain_synapse/benchmark/runners/tuning_verification.js
 * @description Full Pipeline Tuning Verification - 验证调优效果
 * @version 1.0.0
 * 
 * 调优内容：
 * 1. spreadDepth: 2 -> 1
 * 2. minWeight: 0.1 -> 0.3
 * 3. minAnchors: 新增，默认 2
 * 4. maxSpreadRatio: 新增，默认 3.0
 * 5. abstentionThreshold: 新增，默认 0.1
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class TuningVerification {
    constructor() {
        this.scale = 5000;
        this.results = {
            indexOnly: null,
            fullPipeline: null
        };
        this.testQueries = [
            { query: '数据库连接配置', expectedKeyword: '数据库', type: 'semantic' },
            { query: '缓存策略', expectedKeyword: '缓存', type: 'semantic' },
            { query: '认证流程', expectedKeyword: '认证', type: 'semantic' },
            { query: 'api.js', expectedFile: 'api.js', type: 'file' },
            { query: 'UserService', expectedEntity: 'UserService', type: 'entity' },
            { query: '内存泄漏 解决', expectedType: 'failed_attempt', type: 'failed_attempt' },
            { query: '为什么选择微服务', expectedKeyword: '微服务', type: 'architecture' },
            { query: '身份验证', expectedKeyword: '认证', type: 'synonym' },
            { query: 'xyz123abc', expectedKeyword: null, type: 'noise' },
            { query: '不存在的关键词', expectedKeyword: null, type: 'noise' }
        ];
        this.keywords = [
            '数据库', '缓存', '认证', '授权', '日志', '配置', 'API', '微服务',
            '消息队列', '定时任务', '文件上传', '性能优化', '安全防护', '测试'
        ];
        this.files = [
            'src/services/api.js', 'src/services/auth.js', 'src/services/cache.js',
            'src/models/user.js', 'src/utils/helper.js', 'config/database.js'
        ];
        this.entities = [
            'UserService', 'AuthService', 'CacheService', 'DatabaseService',
            'helper', 'validator', 'logger', 'middleware'
        ];
    }

    async run() {
        console.log('='.repeat(70));
        console.log('        FULL PIPELINE TUNING VERIFICATION');
        console.log('='.repeat(70));
        console.log(`Scale: ${this.scale} memories`);
        console.log(`Test queries: ${this.testQueries.length}\n`);

        const tempFile = path.join(__dirname, `tuning_test_${Date.now()}.json`);
        
        try {
            const sdk = new BrainSynapseSDK({
                weightsFile: tempFile,
                latentFile: tempFile + '.latent',
                autoLoad: false
            });
            await sdk.init();

            console.log(`Generating ${this.scale} memories...`);
            const memories = this.generateMemories();
            
            console.log(`Importing memories...`);
            for (const mem of memories) {
                await sdk.createMemory(mem);
            }

            console.log('\n' + '='.repeat(70));
            console.log('Testing index-only mode...');
            console.log('='.repeat(70));
            this.results.indexOnly = await this.runMode(sdk, 'index-only');

            console.log('\n' + '='.repeat(70));
            console.log('Testing full-pipeline mode (TUNED)...');
            console.log('='.repeat(70));
            this.results.fullPipeline = await this.runMode(sdk, 'full-pipeline');

            this.printComparison();

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
                    rule: `${keyword}相关规则：使用标准配置`
                },
                provenance: {
                    file_reference: this.files[i % this.files.length]
                },
                linked_entities: [this.entities[i % this.entities.length]],
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random()
            });
        }

        for (let i = 0; i < this.scale * 0.2; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'procedural',
                content: {
                    keyword: keyword,
                    solution: `${keyword}解决方案`
                },
                provenance: {
                    file_reference: this.files[i % this.files.length]
                },
                linked_entities: [this.entities[i % this.entities.length]],
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random()
            });
        }

        for (let i = 0; i < this.scale * 0.1; i++) {
            const bug = ['内存泄漏', '竞态条件', '死锁', '超时', '连接失败'][i % 5];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'failed_attempt',
                content: {
                    type: 'failed_attempt',
                    bug: bug,
                    attempted: '尝试解决方案',
                    error: '问题仍然存在'
                },
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random()
            });
        }

        for (let i = 0; i < this.scale * 0.3; i++) {
            const keyword = this.keywords[i % this.keywords.length];
            memories.push({
                id: `mem_${id++}`,
                memory_type: 'episodic',
                content: {
                    keyword: keyword,
                    rule: `${keyword}事件记录`
                },
                created_at: now - Math.floor(Math.random() * 30) * dayMs,
                confidence: 0.5 + Math.random() * 0.5,
                salience: 0.5 + Math.random() * 0.5,
                recency: Math.random()
            });
        }

        return memories;
    }

    async runMode(sdk, mode) {
        const results = {
            passed: 0,
            failed: 0,
            noiseCorrect: 0,
            noiseTotal: 0,
            irrelevantCount: 0,
            totalResults: 0,
            details: []
        };

        for (const tq of this.testQueries) {
            const result = await this.runQuery(sdk, mode, tq);
            results.details.push(result);

            if (result.passed) results.passed++;
            else results.failed++;

            if (tq.type === 'noise') {
                results.noiseTotal++;
                if (result.passed) results.noiseCorrect++;
            }

            results.totalResults += result.resultCount;
            results.irrelevantCount += result.irrelevantCount;
        }

        results.passRate = (results.passed / this.testQueries.length * 100).toFixed(2);
        results.noisePassRate = results.noiseTotal > 0 
            ? (results.noiseCorrect / results.noiseTotal * 100).toFixed(2) 
            : 'N/A';
        results.irrelevantRatio = results.totalResults > 0 
            ? (results.irrelevantCount / results.totalResults * 100).toFixed(2) 
            : '0.00';

        return results;
    }

    async runQuery(sdk, mode, tq) {
        const result = {
            query: tq.query,
            type: tq.type,
            passed: false,
            resultCount: 0,
            irrelevantCount: 0
        };

        try {
            let recallResult;
            if (mode === 'index-only') {
                recallResult = await sdk.recall(tq.query, {
                    trackAOptions: { enableSemanticFallback: false }
                });
            } else {
                recallResult = await sdk.recall(tq.query);
            }

            const memories = recallResult.getMemories ? recallResult.getMemories() : 
                            (recallResult.results || []).map(r => r.memory);

            result.resultCount = memories.length;
            result.passed = this.validateResult(memories, tq);

            memories.forEach(m => {
                const isRelevant = (tq.expectedKeyword && JSON.stringify(m.content).includes(tq.expectedKeyword)) ||
                                  (tq.expectedFile && m.provenance?.file_reference?.includes(tq.expectedFile)) ||
                                  (tq.expectedEntity && (m.linked_entities?.some(e => e.includes(tq.expectedEntity)) ||
                                      JSON.stringify(m.content).includes(tq.expectedEntity))) ||
                                  (tq.expectedType && m.memory_type === tq.expectedType);
                if (!isRelevant && tq.type !== 'noise') {
                    result.irrelevantCount++;
                }
            });

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    validateResult(memories, tq) {
        if (tq.type === 'noise') {
            return memories.length === 0;
        }

        if (memories.length === 0) return false;

        if (tq.expectedKeyword) {
            return memories.some(m => JSON.stringify(m.content).includes(tq.expectedKeyword));
        }

        if (tq.expectedFile) {
            return memories.some(m => m.provenance?.file_reference?.includes(tq.expectedFile));
        }

        if (tq.expectedEntity) {
            return memories.some(m => 
                m.linked_entities?.some(e => e.includes(tq.expectedEntity)) ||
                JSON.stringify(m.content).includes(tq.expectedEntity)
            );
        }

        if (tq.expectedType) {
            return memories.some(m => m.memory_type === tq.expectedType);
        }

        return true;
    }

    printComparison() {
        console.log('\n' + '='.repeat(70));
        console.log('TUNING RESULTS COMPARISON');
        console.log('='.repeat(70));

        console.log('\n| Metric              | index-only | full-pipeline | Target |');
        console.log('|---------------------|------------|---------------|--------|');

        const idx = this.results.indexOnly;
        const full = this.results.fullPipeline;

        console.log(`| Pass Rate           | ${idx.passRate.padEnd(10)} | ${full.passRate.padEnd(13)} | >= 85% |`);
        console.log(`| Noise Pass Rate     | ${idx.noisePassRate.padEnd(10)} | ${full.noisePassRate.padEnd(13)} | 100%   |`);
        console.log(`| Irrelevant Ratio    | ${idx.irrelevantRatio.padEnd(10)} | ${full.irrelevantRatio.padEnd(13)} | < 20%  |`);

        console.log('\n' + '='.repeat(70));
        console.log('NOISE QUERY DETAILS');
        console.log('='.repeat(70));

        const noiseQueries = this.testQueries.filter(tq => tq.type === 'noise');
        for (const tq of noiseQueries) {
            const idxDetail = idx.details.find(d => d.query === tq.query);
            const fullDetail = full.details.find(d => d.query === tq.query);

            console.log(`\nQuery: "${tq.query}"`);
            console.log(`  index-only:     ${idxDetail.resultCount} results, passed=${idxDetail.passed}`);
            console.log(`  full-pipeline:  ${fullDetail.resultCount} results, passed=${fullDetail.passed}`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('VERDICT');
        console.log('='.repeat(70));

        const fullPassRate = parseFloat(full.passRate);
        const idxPassRate = parseFloat(idx.passRate);
        const fullNoiseRate = parseFloat(full.noisePassRate);
        const fullIrrelRatio = parseFloat(full.irrelevantRatio);

        let verdict = 'PASS';
        const issues = [];

        if (fullPassRate < idxPassRate) {
            issues.push(`Pass rate regression: ${fullPassRate}% < ${idxPassRate}%`);
        }

        if (fullNoiseRate < 100) {
            issues.push(`Noise queries not fully rejected: ${fullNoiseRate}%`);
        }

        if (fullIrrelRatio > parseFloat(idx.irrelevantRatio)) {
            issues.push(`Irrelevant ratio higher: ${fullIrrelRatio}% > ${idx.irrelevantRatio}%`);
        }

        if (issues.length > 0) {
            verdict = 'NEEDS MORE TUNING';
            console.log(`\nStatus: ${verdict}`);
            console.log('Issues:');
            issues.forEach(i => console.log(`  - ${i}`));
        } else {
            console.log(`\nStatus: ${verdict}`);
            console.log('Full-pipeline now matches or exceeds index-only performance!');
        }
    }

    cleanup(tempFile) {
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(tempFile + '.latent')) fs.unlinkSync(tempFile + '.latent');
        } catch (e) {}
    }
}

async function main() {
    const test = new TuningVerification();
    await test.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TuningVerification;
