/**
 * @file brain_synapse/benchmark/runners/audit_runner.js
 * @description 独立审计脚本 - 验证 Brain Synapse v2.2 真实性与稳健性
 * @version 1.0.0
 * 
 * 审计维度：
 * A. 盲测审计用例 (8个)
 * B. Semantic Fallback 开/关对照
 * C. IndexManager 索引真实消费
 * D. Layer 4 MVP 真实效果
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK, MemoryItem } = require('../../src/index');

class AuditRunner {
    constructor() {
        this.results = {
            blindTests: [],
            semanticComparison: {},
            indexAudit: {},
            layer4Audit: {},
            vulnerabilities: [],
            strengths: []
        };
    }

    async runFullAudit() {
        console.log('='.repeat(70));
        console.log('           BRAIN SYNAPSE v2.2 INDEPENDENT AUDIT');
        console.log('='.repeat(70));
        console.log(`Started: ${new Date().toISOString()}\n`);

        await this.runBlindTests();
        await this.runSemanticComparison();
        await this.runIndexAudit();
        await this.runLayer4Audit();
        this.generateReport();

        return this.results;
    }

    async createTempSDK(testId) {
        const tempFile = path.join(__dirname, `audit_temp.${testId}.${Date.now()}.json`);
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

    async runBlindTests() {
        console.log('\n' + '='.repeat(70));
        console.log('A. BLIND TEST AUDIT (8 Cases)');
        console.log('='.repeat(70));

        const blindTestCases = [
            {
                id: 'blind_01_query_rewrite',
                name: 'Query 改写 - 数据库连接池',
                type: 'query_rewrite',
                setup: [
                    { id: 'm1', memory_type: 'semantic', content: { keyword: '连接池', rule: '数据库连接池最大连接数为 50' }, timestamp_valid_from: Date.now() - 86400000 }
                ],
                query: '最大连接数是多少',
                expected: { result_contains: '50' }
            },
            {
                id: 'blind_02_synonym',
                name: '同义表达 - 认证/鉴权',
                type: 'synonym',
                setup: [
                    { id: 'm2', memory_type: 'semantic', content: { keyword: '鉴权', rule: '使用 OAuth 2.0 进行身份验证' } }
                ],
                query: '身份验证方式',
                expected: { min_results: 1 }
            },
            {
                id: 'blind_03_file_hard',
                name: 'File/Path Hard Query',
                type: 'file_path',
                setup: [
                    { id: 'm3', memory_type: 'procedural', content: { keyword: '初始化', rule: '在 main.js 中初始化应用' }, provenance: { file_reference: 'src/app/main.js:L10' } },
                    { id: 'm4', memory_type: 'semantic', content: { keyword: '配置', rule: '配置文件在 config.json' }, provenance: { file_reference: 'config/settings.json:L1' } }
                ],
                query: 'main.js',
                expected: { file_filter: 'main.js', min_results: 1 }
            },
            {
                id: 'blind_04_noisy_log',
                name: 'Noisy Log 提取',
                type: 'noisy_log',
                setup: [
                    { id: 'm5', memory_type: 'episodic', content: { keyword: 'Error', rule: '2024-01-15 10:23:45 ERROR [DatabaseService] Connection timeout after 30000ms - retrying...' } }
                ],
                query: '数据库超时错误',
                expected: { min_results: 1 }
            },
            {
                id: 'blind_05_cross_file',
                name: 'Cross-File 依赖追踪',
                type: 'cross_file',
                setup: [
                    { id: 'm6', memory_type: 'semantic', content: { keyword: '导入', rule: '从 utils.js 导入 helper 函数' }, provenance: { file_reference: 'src/services/api.js:L5' }, linked_entities: ['utils', 'helper'] },
                    { id: 'm7', memory_type: 'semantic', content: { keyword: '导出', rule: '导出 helper 函数' }, provenance: { file_reference: 'src/utils/utils.js:L20' }, linked_entities: ['utils', 'helper'] }
                ],
                query: 'helper 函数',
                expected: { min_results: 2 }
            },
            {
                id: 'blind_06_stale_supersede',
                name: 'Stale/Supersede 检测',
                type: 'stale_supersede',
                setup: [
                    { id: 'm8', memory_type: 'semantic', content: { keyword: '缓存策略', rule: '使用 LRU 缓存' }, timestamp_valid_from: Date.now() - 60 * 24 * 60 * 60 * 1000, superseded_by: 'm9' },
                    { id: 'm9', memory_type: 'semantic', content: { keyword: '缓存策略', rule: '使用 Redis 分布式缓存' }, timestamp_valid_from: Date.now() - 5 * 24 * 60 * 60 * 1000, supersedes: 'm8' }
                ],
                query: '缓存策略',
                expected: { result_contains: 'Redis', result_id: 'm9' }
            },
            {
                id: 'blind_07_abstract_query',
                name: '抽象表达 - 性能问题',
                type: 'abstract',
                setup: [
                    { id: 'm10', memory_type: 'failed_attempt', content: { type: 'failed_attempt', bug: '慢查询', attempted: '添加索引', error: '索引未生效' } },
                    { id: 'm11', memory_type: 'procedural', content: { type: 'solution', bug: '慢查询', solution: '优化 SQL 语句，避免 SELECT *' } }
                ],
                query: '数据库性能问题怎么解决',
                expected: { min_results: 1 }
            },
            {
                id: 'blind_08_query_rewrite_2',
                name: 'Query 改写 - 端口配置',
                type: 'query_rewrite',
                setup: [
                    { id: 'm12', memory_type: 'semantic', content: { keyword: '端口', rule: '应用监听端口为 8080' } }
                ],
                query: '服务跑在哪个端口',
                expected: { result_contains: '8080' }
            }
        ];

        let passed = 0;
        let failed = 0;

        for (const tc of blindTestCases) {
            const { sdk, tempFile } = await this.createTempSDK(tc.id);
            
            try {
                for (const mem of tc.setup) {
                    await sdk.createMemory({
                        ...mem,
                        created_at: mem.created_at || mem.timestamp_valid_from || Date.now(),
                        updated_at: mem.updated_at || mem.timestamp_valid_from || Date.now(),
                        confidence: mem.confidence ?? 0.5,
                        salience: mem.salience ?? 0.5,
                        recency: mem.recency ?? 1.0,
                        access_count: mem.access_count ?? 0
                    });
                }

                const startTime = Date.now();
                const result = await sdk.recall(tc.query);
                const latency = Date.now() - startTime;

                const validation = this.validateResult(result, tc.expected);
                
                const testResult = {
                    id: tc.id,
                    name: tc.name,
                    type: tc.type,
                    query: tc.query,
                    expected: tc.expected,
                    actual: {
                        resultCount: result.results.length,
                        topResult: result.results[0] ? {
                            id: result.results[0].memory.id,
                            content: result.results[0].memory.content
                        } : null,
                        latency
                    },
                    passed: validation.passed,
                    details: validation.details,
                    trace: result.traceLog.slice(0, 5)
                };

                this.results.blindTests.push(testResult);

                if (validation.passed) {
                    passed++;
                    console.log(`  ✓ ${tc.name} - PASS (${latency}ms)`);
                } else {
                    failed++;
                    console.log(`  ✗ ${tc.name} - FAIL`);
                    console.log(`    Query: "${tc.query}"`);
                    console.log(`    Details: ${validation.details.join(', ')}`);
                }

            } catch (error) {
                failed++;
                console.log(`  ✗ ${tc.name} - ERROR: ${error.message}`);
                this.results.blindTests.push({
                    id: tc.id,
                    name: tc.name,
                    passed: false,
                    error: error.message
                });
            } finally {
                this.cleanup(tempFile);
            }
        }

        console.log(`\nBlind Tests Summary: ${passed}/${blindTestCases.length} passed`);
        this.results.blindTestSummary = { passed, failed, total: blindTestCases.length };
    }

    async runSemanticComparison() {
        console.log('\n' + '='.repeat(70));
        console.log('B. SEMANTIC FALLBACK COMPARISON (ON vs OFF)');
        console.log('='.repeat(70));

        const testQueries = [
            { query: '如何处理并发请求', type: 'low_lexical_overlap' },
            { query: '系统架构设计原则', type: 'low_lexical_overlap' },
            { query: '错误处理最佳实践', type: 'low_lexical_overlap' },
            { query: 'src/handler.js', type: 'file_path_query' },
            { query: 'config.json', type: 'file_path_query' },
            { query: 'validateEmail', type: 'identifier_query' },
            { query: '数据库优化方案', type: 'low_lexical_overlap' },
            { query: '安全防护措施', type: 'low_lexical_overlap' }
        ];

        const setupMemories = [
            { id: 's1', memory_type: 'semantic', content: { keyword: '并发', rule: '使用消息队列处理并发' } },
            { id: 's2', memory_type: 'semantic', content: { keyword: '架构', rule: '采用微服务架构' } },
            { id: 's3', memory_type: 'procedural', content: { keyword: '错误处理', rule: '统一错误处理中间件' }, provenance: { file_reference: 'src/handler.js:L10' } },
            { id: 's4', memory_type: 'semantic', content: { keyword: '配置', rule: '配置存储在 config.json' }, provenance: { file_reference: 'config.json:L1' } },
            { id: 's5', memory_type: 'procedural', content: { keyword: '验证', rule: 'validateEmail 函数验证邮箱格式' }, provenance: { file_reference: 'src/utils.js:L20' } },
            { id: 's6', memory_type: 'semantic', content: { keyword: '优化', rule: '数据库索引优化' } },
            { id: 's7', memory_type: 'semantic', content: { keyword: '安全', rule: 'XSS 防护和 CSRF Token' } }
        ];

        const comparisonResults = [];

        for (const tq of testQueries) {
            const { sdk: sdkOn, tempFile: tempOn } = await this.createTempSDK(`sem_on_${tq.type}`);
            const { sdk: sdkOff, tempFile: tempOff } = await this.createTempSDK(`sem_off_${tq.type}`);

            try {
                for (const mem of setupMemories) {
                    const memData = { ...mem, created_at: Date.now(), updated_at: Date.now(), confidence: 0.5, salience: 0.5, recency: 1.0, access_count: 0 };
                    await sdkOn.createMemory(memData);
                    await sdkOff.createMemory(memData);
                }

                const startOn = Date.now();
                const resultOn = await sdkOn.recall(tq.query, { trackAOptions: { enableSemanticFallback: true } });
                const latencyOn = Date.now() - startOn;

                const startOff = Date.now();
                const resultOff = await sdkOff.recall(tq.query, { trackAOptions: { enableSemanticFallback: false } });
                const latencyOff = Date.now() - startOff;

                const trackA = sdkOn.getOrchestrator().getTrackA();
                const sfStatus = trackA.getSemanticFallbackStatus();

                const cmp = {
                    query: tq.query,
                    type: tq.type,
                    semanticEnabled: {
                        resultCount: resultOn.results.length,
                        latency: latencyOn,
                        topScore: resultOn.results[0]?.score || 0,
                        confidence: resultOn.confidence
                    },
                    semanticDisabled: {
                        resultCount: resultOff.results.length,
                        latency: latencyOff,
                        topScore: resultOff.results[0]?.score || 0,
                        confidence: resultOff.confidence
                    },
                    fallbackStatus: sfStatus,
                    difference: {
                        resultCountDiff: resultOn.results.length - resultOff.results.length,
                        latencyDiff: latencyOn - latencyOff
                    }
                };

                comparisonResults.push(cmp);

                console.log(`\n  Query: "${tq.query}" (${tq.type})`);
                console.log(`    ON:  ${resultOn.results.length} results, ${latencyOn}ms, confidence=${resultOn.confidence.toFixed(2)}`);
                console.log(`    OFF: ${resultOff.results.length} results, ${latencyOff}ms, confidence=${resultOff.confidence.toFixed(2)}`);
                console.log(`    Fallback Status: available=${sfStatus.available}, enabled=${sfStatus.enabled}`);

            } catch (error) {
                console.log(`  Error for "${tq.query}": ${error.message}`);
            } finally {
                this.cleanup(tempOn);
                this.cleanup(tempOff);
            }
        }

        this.results.semanticComparison = {
            results: comparisonResults,
            summary: {
                totalQueries: testQueries.length,
                fileQueriesBlocked: comparisonResults.filter(r => r.type.includes('file') || r.type.includes('identifier')).length,
                semanticAvailable: comparisonResults.filter(r => r.fallbackStatus.available).length
            }
        };
    }

    async runIndexAudit() {
        console.log('\n' + '='.repeat(70));
        console.log('C. INDEX MANAGER AUDIT');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('index_audit');

        try {
            const testMemories = [
                { id: 'idx1', memory_type: 'semantic', content: { keyword: '测试', rule: '测试规则 1' }, provenance: { file_reference: 'src/test.js:L10' }, linked_entities: ['test', 'unit'] },
                { id: 'idx2', memory_type: 'procedural', content: { keyword: '部署', rule: '部署步骤' }, provenance: { file_reference: 'deploy/config.yml:L5' }, linked_entities: ['deploy', 'ci'] },
                { id: 'idx3', memory_type: 'semantic', content: { keyword: '测试', rule: '测试规则 2' }, provenance: { file_reference: 'src/test.js:L20' }, linked_entities: ['test', 'integration'] }
            ];

            for (const mem of testMemories) {
                await sdk.createMemory({ ...mem, created_at: Date.now(), updated_at: Date.now(), confidence: 0.5, salience: 0.5, recency: 1.0, access_count: 0 });
            }

            const backend = sdk.getBackend();
            const indexManager = backend.indexManager;

            console.log('\n  1. Index Build Status:');
            console.log(`     - Built: ${indexManager._isBuilt}`);
            console.log(`     - Token Index Size: ${indexManager.tokenInvertedIndex.size}`);
            console.log(`     - Entity Index Size: ${indexManager.entityIndex.size}`);
            console.log(`     - File Index Size: ${indexManager.fileIndex.size}`);
            console.log(`     - Adjacency List Size: ${indexManager.adjacencyList.size}`);
            console.log(`     - Supersedes Chain Size: ${indexManager.supersedesChain.size}`);

            console.log('\n  2. Token Index Lookup Test:');
            const testTokenResult = indexManager.getMemoriesByToken('测试');
            console.log(`     - Query "测试": ${testTokenResult.size} memories found`);
            console.log(`     - Expected: 2, Actual: ${testTokenResult.size}`);

            console.log('\n  3. Entity Index Lookup Test:');
            const testEntityResult = indexManager.getMemoriesByEntity('test');
            console.log(`     - Query "test": ${testEntityResult.size} memories found`);
            console.log(`     - Expected: 3, Actual: ${testEntityResult.size}`);

            console.log('\n  4. File Index Lookup Test:');
            const testFileResult = indexManager.getMemoriesByFile('test.js');
            console.log(`     - Query "test.js": ${testFileResult.size} memories found`);
            console.log(`     - Expected: 2, Actual: ${testFileResult.size}`);

            console.log('\n  5. Adjacency List Test:');
            const edges = indexManager.getGraphEdges('idx1');
            console.log(`     - Edges from idx1: ${edges.size} connections`);

            console.log('\n  6. Full Scan Detection:');

            const fullScanLocations = this.detectFullScan();

            this.results.indexAudit = {
                indexBuildStatus: {
                    built: indexManager._isBuilt,
                    tokenIndexSize: indexManager.tokenInvertedIndex.size,
                    entityIndexSize: indexManager.entityIndex.size,
                    fileIndexSize: indexManager.fileIndex.size,
                    adjacencyListSize: indexManager.adjacencyList.size
                },
                lookupTests: {
                    token: { query: '测试', expected: 2, actual: testTokenResult.size, passed: testTokenResult.size === 2 },
                    entity: { query: 'test', expected: 3, actual: testEntityResult.size, passed: testEntityResult.size === 3 },
                    file: { query: 'test.js', expected: 2, actual: testFileResult.size, passed: testFileResult.size === 2 }
                },
                fullScanLocations
            };

        } finally {
            this.cleanup(tempFile);
        }
    }

    detectFullScan() {
        const locations = [];

        const trackAPath = path.join(__dirname, '../../src/retrieval/track_a_intuitive.js');
        const trackAContent = fs.readFileSync(trackAPath, 'utf8');

        if (trackAContent.includes('_anchorConceptsFallback')) {
            locations.push({
                file: 'track_a_intuitive.js',
                method: '_anchorConceptsFallback',
                type: 'fallback_path',
                severity: 'medium',
                description: 'Fallback path uses full scan when index not built'
            });
        }

        if (trackAContent.includes('_hebbianSpreadFallback')) {
            locations.push({
                file: 'track_a_intuitive.js',
                method: '_hebbianSpreadFallback',
                type: 'fallback_path',
                severity: 'medium',
                description: 'Hebbian spread fallback uses full scan'
            });
        }

        const trackBPath = path.join(__dirname, '../../src/retrieval/track_b_deliberative.js');
        const trackBContent = fs.readFileSync(trackBPath, 'utf8');

        if (trackBContent.includes('async directQuery')) {
            locations.push({
                file: 'track_b_deliberative.js',
                method: 'directQuery',
                type: 'query_path',
                severity: 'high',
                description: 'directQuery uses getAll() which is full scan'
            });
        }

        const backendPath = path.join(__dirname, '../../src/storage/backend_json.js');
        const backendContent = fs.readFileSync(backendPath, 'utf8');

        if (backendContent.includes('async query(predicate)')) {
            locations.push({
                file: 'backend_json.js',
                method: 'query',
                type: 'query_path',
                severity: 'medium',
                description: 'Generic query method uses filter on all memories'
            });
        }

        console.log(`     Found ${locations.length} full scan locations:`);
        locations.forEach(loc => {
            console.log(`     - [${loc.severity.toUpperCase()}] ${loc.file}#${loc.method}: ${loc.description}`);
        });

        return locations;
    }

    async runLayer4Audit() {
        console.log('\n' + '='.repeat(70));
        console.log('D. LAYER 4 MVP (Context Packer) AUDIT');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('layer4_audit');

        try {
            const testMemories = [
                { id: 'l4_1', memory_type: 'failed_attempt', content: { type: 'failed_attempt', bug: '内存泄漏', attempted: '手动释放', error: '仍有泄漏' }, provenance: { file_reference: 'src/memory.js:L50' } },
                { id: 'l4_2', memory_type: 'procedural', content: { type: 'solution', bug: '内存泄漏', solution: '使用 Chrome DevTools 定位泄漏源' } },
                { id: 'l4_3', memory_type: 'semantic', content: { keyword: '配置', rule: '数据库连接池大小为 10' }, timestamp_valid_from: Date.now() - 60 * 24 * 60 * 60 * 1000, superseded_by: 'l4_4' },
                { id: 'l4_4', memory_type: 'semantic', content: { keyword: '配置', rule: '数据库连接池大小调整为 20' }, timestamp_valid_from: Date.now() - 5 * 24 * 60 * 60 * 1000, supersedes: 'l4_3' },
                { id: 'l4_5', memory_type: 'semantic', content: { keyword: 'API', rule: '使用 REST API 风格' }, created_at: Date.now() - 40 * 24 * 60 * 60 * 1000 }
            ];

            for (const mem of testMemories) {
                await sdk.createMemory({ ...mem, created_at: mem.created_at || mem.timestamp_valid_from || Date.now(), updated_at: mem.updated_at || mem.timestamp_valid_from || Date.now(), confidence: 0.5, salience: 0.5, recency: 1.0, access_count: 0 });
            }

            console.log('\n  Test Case 1: Bugfix Scenario');
            const bugfixResult = await sdk.recall('内存泄漏');
            const bugfixBundle = sdk.contextPacker.pack(bugfixResult, {});
            const bugfixPrompt = sdk.contextPacker.generatePrompt(bugfixBundle, 'bugfix');

            console.log(`     Raw Results: ${bugfixResult.results.length} memories`);
            console.log(`     Packed Bundle: ${bugfixBundle.memories.length} memories, ${bugfixBundle.tokenCount} tokens`);
            console.log(`     Conflicts: ${bugfixBundle.conflicts.length}`);
            console.log(`     Stale Warnings: ${bugfixBundle.staleWarnings.length}`);

            console.log('\n  Test Case 2: Config Query Scenario');
            const configResult = await sdk.recall('数据库连接池');
            const configBundle = sdk.contextPacker.pack(configResult, {});
            const configPrompt = sdk.contextPacker.generatePrompt(configBundle, 'config_query');

            console.log(`     Raw Results: ${configResult.results.length} memories`);
            console.log(`     Packed Bundle: ${configBundle.memories.length} memories, ${configBundle.tokenCount} tokens`);

            console.log('\n  Test Case 3: Coding Agent Scenario');
            const codingResult = await sdk.recall('API 设计');
            const codingBundle = sdk.contextPacker.pack(codingResult, {});
            const codingPrompt = sdk.contextPacker.generatePrompt(codingBundle, 'coding_agent');

            console.log(`     Raw Results: ${codingResult.results.length} memories`);
            console.log(`     Packed Bundle: ${codingBundle.memories.length} memories, ${codingBundle.tokenCount} tokens`);

            console.log('\n  Bundle Sample (Bugfix):');
            console.log('  ' + '-'.repeat(50));
            console.log(bugfixPrompt.split('\n').slice(0, 15).map(l => '  ' + l).join('\n'));

            console.log('\n  Token Budget Test:');
            const packerWithOptions = sdk.contextPacker;
            const smallBudgetBundle = packerWithOptions.pack(bugfixResult, { maxTokens: 500 });
            console.log(`     Budget 500 tokens: ${smallBudgetBundle.memories.length} memories packed, ${smallBudgetBundle.tokenCount} tokens used`);

            this.results.layer4Audit = {
                bugfixScenario: {
                    rawCount: bugfixResult.results.length,
                    packedCount: bugfixBundle.memories.length,
                    tokenCount: bugfixBundle.tokenCount,
                    conflicts: bugfixBundle.conflicts.length,
                    staleWarnings: bugfixBundle.staleWarnings.length
                },
                configScenario: {
                    rawCount: configResult.results.length,
                    packedCount: configBundle.memories.length,
                    tokenCount: configBundle.tokenCount
                },
                codingScenario: {
                    rawCount: codingResult.results.length,
                    packedCount: codingBundle.memories.length,
                    tokenCount: codingBundle.tokenCount
                },
                tokenBudgetTest: {
                    budget: 500,
                    packedCount: smallBudgetBundle.memories.length,
                    actualTokens: smallBudgetBundle.tokenCount
                }
            };

        } finally {
            this.cleanup(tempFile);
        }
    }

    validateResult(result, expected) {
        const memories = result.getMemories();
        const details = [];
        let passed = true;

        if (expected.result_id) {
            const found = memories.find(m => m.id === expected.result_id);
            if (!found) {
                passed = false;
                details.push(`expected_id_not_found:${expected.result_id}`);
            }
        }

        if (expected.result_contains) {
            const found = memories.some(m => JSON.stringify(m.content).includes(expected.result_contains));
            if (!found) {
                passed = false;
                details.push(`expected_content_not_found:${expected.result_contains}`);
            }
        }

        if (expected.min_results !== undefined) {
            if (memories.length < expected.min_results) {
                passed = false;
                details.push(`insufficient_results:expected>=${expected.min_results},actual=${memories.length}`);
            }
        }

        if (expected.file_filter) {
            const fileFiltered = memories.filter(m => m.provenance && m.provenance.file_reference && m.provenance.file_reference.includes(expected.file_filter));
            if (fileFiltered.length === 0) {
                passed = false;
                details.push(`file_filter_failed:${expected.file_filter}`);
            }
        }

        return { passed, details };
    }

    generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('                    AUDIT REPORT SUMMARY');
        console.log('='.repeat(70));

        const vulnerabilities = [];
        const strengths = [];

        if (this.results.blindTestSummary.failed > 0) {
            vulnerabilities.push({
                severity: 'high',
                area: 'Blind Tests',
                description: `${this.results.blindTestSummary.failed} blind tests failed`
            });
        } else {
            strengths.push({
                area: 'Blind Tests',
                description: 'All 8 blind tests passed'
            });
        }

        if (!this.results.semanticComparison.summary?.semanticAvailable) {
            vulnerabilities.push({
                severity: 'medium',
                area: 'Semantic Fallback',
                description: 'Semantic fallback not available (SiliconEmbed not configured)'
            });
        } else {
            strengths.push({
                area: 'Semantic Fallback',
                description: 'Semantic fallback properly configured and functional'
            });
        }

        const indexLookups = this.results.indexAudit?.lookupTests || {};
        const failedLookups = Object.values(indexLookups).filter(t => !t.passed);
        if (failedLookups.length > 0) {
            vulnerabilities.push({
                severity: 'high',
                area: 'IndexManager',
                description: `${failedLookups.length} index lookup tests failed`
            });
        } else {
            strengths.push({
                area: 'IndexManager',
                description: 'All index lookups working correctly'
            });
        }

        const fullScanLocations = this.results.indexAudit?.fullScanLocations || [];
        const highSeverityFullScans = fullScanLocations.filter(l => l.severity === 'high');
        if (highSeverityFullScans.length > 0) {
            vulnerabilities.push({
                severity: 'high',
                area: 'IndexManager',
                description: `${highSeverityFullScans.length} high-severity full scan paths exist`
            });
        }

        const layer4 = this.results.layer4Audit || {};
        if (layer4.bugfixScenario?.conflicts > 0 || layer4.bugfixScenario?.staleWarnings > 0) {
            strengths.push({
                area: 'Context Packer',
                description: 'Conflict and stale detection working'
            });
        }

        console.log('\n1. AUDIT SCOPE:');
        console.log('   - Blind Tests: 8 cases');
        console.log('   - Semantic Comparison: 8 queries');
        console.log('   - Index Audit: Full scan detection + lookup tests');
        console.log('   - Layer 4 MVP: 3 scenarios');

        console.log('\n2. TEST RESULTS:');
        console.log(`   - Blind Tests: ${this.results.blindTestSummary?.passed || 0}/${this.results.blindTestSummary?.total || 0} passed`);
        console.log(`   - Semantic Fallback: ${this.results.semanticComparison.summary?.semanticAvailable ? 'Available' : 'Not Available'}`);
        console.log(`   - Index Lookups: ${Object.values(indexLookups).filter(t => t.passed).length}/${Object.keys(indexLookups).length} passed`);
        console.log(`   - Full Scan Locations: ${fullScanLocations.length} found`);

        console.log('\n3. VULNERABILITIES FOUND:');
        if (vulnerabilities.length === 0) {
            console.log('   None');
        } else {
            vulnerabilities.forEach((v, i) => {
                console.log(`   [${v.severity.toUpperCase()}] ${v.area}: ${v.description}`);
            });
        }

        console.log('\n4. TOP 5 VULNERABILITIES:');
        const top5Vulns = vulnerabilities.slice(0, 5);
        if (top5Vulns.length === 0) {
            console.log('   No critical vulnerabilities found');
        } else {
            top5Vulns.forEach((v, i) => {
                console.log(`   ${i + 1}. [${v.severity.toUpperCase()}] ${v.area}: ${v.description}`);
            });
        }

        console.log('\n5. TOP 5 STRENGTHS:');
        const top5Strengths = strengths.slice(0, 5);
        top5Strengths.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.area}: ${s.description}`);
        });

        console.log('\n6. RECOMMENDATION:');
        const criticalVulns = vulnerabilities.filter(v => v.severity === 'high');
        if (criticalVulns.length > 0) {
            console.log('   NOT READY for next phase - Critical vulnerabilities exist');
            console.log(`   Must fix: ${criticalVulns.map(v => v.description).join(', ')}`);
        } else {
            console.log('   READY for next phase with minor improvements');
        }

        console.log('\n7. BEFORE NEXT PHASE:');
        if (fullScanLocations.length > 0) {
            console.log('   - Consider optimizing full scan paths');
        }
        if (!this.results.semanticComparison.summary?.semanticAvailable) {
            console.log('   - Configure SiliconEmbed for semantic fallback');
        }
        console.log('   - Add more edge case tests');

        this.results.vulnerabilities = vulnerabilities;
        this.results.strengths = strengths;
    }
}

async function main() {
    const runner = new AuditRunner();
    await runner.runFullAudit();

    const reportPath = path.join(__dirname, `audit_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(runner.results, null, 2), 'utf8');
    console.log(`\n[Audit] Full report saved to: ${reportPath}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = AuditRunner;
