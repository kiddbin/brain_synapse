/**
 * @file brain_synapse/benchmark/runners/layer4_fix_verification.js
 * @description Layer 4 Hardening 修复验证脚本
 * @version 1.0.0
 * 
 * 验证项：
 * A. Context Packer 模板渲染修复
 * B. Token Budget 生效验证
 * C. directQuery 风险降级验证
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK } = require('../../src/index');

class Layer4FixVerification {
    constructor() {
        this.results = {
            templateFix: [],
            tokenBudgetFix: [],
            directQueryFix: {}
        };
    }

    async runAll() {
        console.log('='.repeat(70));
        console.log('        LAYER 4 HARDENING FIX VERIFICATION');
        console.log('='.repeat(70));

        await this.verifyTemplateFix();
        await this.verifyTokenBudgetFix();
        await this.verifyDirectQueryFix();
        this.printSummary();

        return this.results;
    }

    async createTempSDK(testId) {
        const tempFile = path.join(__dirname, `verify_temp.${testId}.${Date.now()}.json`);
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

    async verifyTemplateFix() {
        console.log('\n' + '='.repeat(70));
        console.log('A. CONTEXT PACKER 模板渲染修复验证');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('template_fix');

        try {
            // 创建不同类型的测试记忆
            const testMemories = [
                {
                    id: 'fail_1',
                    memory_type: 'failed_attempt',
                    content: { type: 'failed_attempt', bug: '内存泄漏', attempted: '手动释放对象', error: '仍有泄漏' },
                    provenance: { file_reference: 'src/memory.js:L50' }
                },
                {
                    id: 'fail_2',
                    memory_type: 'failed_attempt',
                    content: { type: 'failed_attempt', bug: '竞态条件', attempted: 'setTimeout 延迟', error: '仍然出现竞态' },
                    provenance: { file_reference: 'src/handler.js:L78' }
                },
                {
                    id: 'sol_1',
                    memory_type: 'procedural',
                    content: { keyword: '内存泄漏', solution: '使用 Chrome DevTools Memory Profile 定位并修复' }
                },
                {
                    id: 'sem_1',
                    memory_type: 'semantic',
                    content: { keyword: '数据库连接', rule: '数据库连接池大小为 20' }
                },
                {
                    id: 'epi_1',
                    memory_type: 'episodic',
                    content: { keyword: 'Bug修复', rule: '在 L45 添加了空值检查' }
                }
            ];

            for (const mem of testMemories) {
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

            // 测试 1: Bugfix 模板
            console.log('\n  Test 1: Bugfix 模板渲染');
            const bugfixResult = await sdk.recall('内存泄漏');
            const bugfixBundle = sdk.contextPacker.pack(bugfixResult, {});
            const bugfixPrompt = sdk.contextPacker.generatePrompt(bugfixBundle, 'bugfix');

            const hasUndefined = bugfixPrompt.includes('undefined');
            console.log(`    - 包含 undefined: ${hasUndefined ? '❌ FAIL' : '✅ PASS'}`);
            console.log(`    - Bundle 记忆数: ${bugfixBundle.memories.length}`);
            console.log(`    - Prompt 长度: ${bugfixPrompt.length} chars`);

            this.results.templateFix.push({
                test: 'bugfix_template',
                passed: !hasUndefined,
                promptLength: bugfixPrompt.length,
                memoryCount: bugfixBundle.memories.length
            });

            // 打印渲染后的 prompt
            console.log('\n  渲染后的 Bugfix Prompt:');
            console.log('  ' + '-'.repeat(50));
            console.log(bugfixPrompt.split('\n').slice(0, 20).map(l => '  ' + l).join('\n'));

            // 测试 2: Coding Agent 模板
            console.log('\n\n  Test 2: Coding Agent 模板渲染');
            const codingResult = await sdk.recall('竞态条件');
            const codingBundle = sdk.contextPacker.pack(codingResult, {});
            const codingPrompt = sdk.contextPacker.generatePrompt(codingBundle, 'coding_agent');

            const codingHasUndefined = codingPrompt.includes('undefined');
            console.log(`    - 包含 undefined: ${codingHasUndefined ? '❌ FAIL' : '✅ PASS'}`);

            this.results.templateFix.push({
                test: 'coding_agent_template',
                passed: !codingHasUndefined,
                promptLength: codingPrompt.length
            });

            // 测试 3: Default 模板
            console.log('\n  Test 3: Default 模板渲染');
            const defaultResult = await sdk.recall('数据库');
            const defaultBundle = sdk.contextPacker.pack(defaultResult, {});
            const defaultPrompt = sdk.contextPacker.generatePrompt(defaultBundle, 'default');

            const defaultHasUndefined = defaultPrompt.includes('undefined');
            console.log(`    - 包含 undefined: ${defaultHasUndefined ? '❌ FAIL' : '✅ PASS'}`);

            this.results.templateFix.push({
                test: 'default_template',
                passed: !defaultHasUndefined,
                promptLength: defaultPrompt.length
            });

        } finally {
            this.cleanup(tempFile);
        }
    }

    async verifyTokenBudgetFix() {
        console.log('\n' + '='.repeat(70));
        console.log('B. TOKEN BUDGET 生效验证');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('token_budget');

        try {
            // 创建多个测试记忆
            for (let i = 1; i <= 10; i++) {
                await sdk.createMemory({
                    id: `mem_${i}`,
                    memory_type: 'semantic',
                    content: { keyword: `测试关键词${i}`, rule: `这是一条测试规则，包含一些中文内容来增加 token 数量。规则编号 ${i}。` },
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    confidence: 0.5,
                    salience: 0.5,
                    recency: 1.0,
                    access_count: 0
                });
            }

            const result = await sdk.recall('测试');

            // 测试不同预算
            const budgets = [200, 500, 1000, 4000];

            console.log('\n  Token Budget 对照测试:');
            console.log('  ' + '-'.repeat(60));
            console.log('  Budget    | Memories | Tokens   | Excluded');
            console.log('  ' + '-'.repeat(60));

            for (const budget of budgets) {
                const bundle = sdk.contextPacker.pack(result, { maxTokens: budget });
                const excluded = bundle.composition?.excludedCount || 0;

                console.log(`  ${budget.toString().padEnd(10)} | ${bundle.memories.length.toString().padEnd(8)} | ${bundle.tokenCount.toString().padEnd(8)} | ${excluded}`);

                this.results.tokenBudgetFix.push({
                    budget,
                    memoryCount: bundle.memories.length,
                    tokenCount: bundle.tokenCount,
                    excludedCount: excluded,
                    passed: bundle.tokenCount <= budget + 200 // 允许 200 的 summary 开销
                });
            }

            // 验证预算生效
            const smallBudget = sdk.contextPacker.pack(result, { maxTokens: 200 });
            const largeBudget = sdk.contextPacker.pack(result, { maxTokens: 4000 });

            const budgetWorking = smallBudget.memories.length < largeBudget.memories.length ||
                                  smallBudget.tokenCount < largeBudget.tokenCount;

            console.log('\n  验证结果:');
            console.log(`    - 预算 200: ${smallBudget.memories.length} memories, ${smallBudget.tokenCount} tokens`);
            console.log(`    - 预算 4000: ${largeBudget.memories.length} memories, ${largeBudget.tokenCount} tokens`);
            console.log(`    - 预算生效: ${budgetWorking ? '✅ PASS' : '❌ FAIL'}`);

        } finally {
            this.cleanup(tempFile);
        }
    }

    async verifyDirectQueryFix() {
        console.log('\n' + '='.repeat(70));
        console.log('C. DIRECTQUERY 风险降级验证');
        console.log('='.repeat(70));

        const { sdk, tempFile } = await this.createTempSDK('direct_query');

        try {
            // 创建测试记忆
            await sdk.createMemory({
                id: 'dq_1',
                memory_type: 'semantic',
                content: { keyword: '测试', rule: '测试规则 1' },
                provenance: { file_reference: 'src/test.js:L10' },
                linked_entities: ['test', 'unit'],
                created_at: Date.now(),
                updated_at: Date.now(),
                confidence: 0.5,
                salience: 0.5,
                recency: 1.0,
                access_count: 0
            });

            await sdk.createMemory({
                id: 'dq_2',
                memory_type: 'procedural',
                content: { keyword: '部署', rule: '部署步骤' },
                provenance: { file_reference: 'deploy/config.yml:L5' },
                linked_entities: ['deploy', 'ci'],
                created_at: Date.now(),
                updated_at: Date.now(),
                confidence: 0.5,
                salience: 0.5,
                recency: 1.0,
                access_count: 0
            });

            const orchestrator = sdk.getOrchestrator();
            const trackB = orchestrator.getTrackB();

            // 测试 1: 文件引用查询（应使用索引）
            console.log('\n  Test 1: 文件引用查询');
            const fileResult = await trackB.directQuery({ fileReference: 'test.js' });
            console.log(`    - 结果数: ${fileResult.length}`);
            console.log(`    - 查询方法: ${fileResult[0]?.queryTrace?.method || 'unknown'}`);
            console.log(`    - 使用索引: ${fileResult[0]?.queryTrace?.method === 'index' ? '✅ PASS' : '⚠️ FALLBACK'}`);

            this.results.directQueryFix.fileQuery = {
                method: fileResult[0]?.queryTrace?.method,
                useIndex: fileResult[0]?.queryTrace?.method === 'index'
            };

            // 测试 2: 实体查询（应使用索引）
            console.log('\n  Test 2: 实体查询');
            const entityResult = await trackB.directQuery({ entity: 'test' });
            console.log(`    - 结果数: ${entityResult.length}`);
            console.log(`    - 查询方法: ${entityResult[0]?.queryTrace?.method || 'unknown'}`);
            console.log(`    - 使用索引: ${entityResult[0]?.queryTrace?.method === 'index' ? '✅ PASS' : '⚠️ FALLBACK'}`);

            this.results.directQueryFix.entityQuery = {
                method: entityResult[0]?.queryTrace?.method,
                useIndex: entityResult[0]?.queryTrace?.method === 'index'
            };

            // 测试 3: 无条件查询（全表扫描，但有 trace）
            console.log('\n  Test 3: 无条件查询（预期全表扫描）');
            const allResult = await trackB.directQuery({ memoryType: 'semantic' });
            console.log(`    - 结果数: ${allResult.length}`);
            console.log(`    - 查询方法: ${allResult[0]?.queryTrace?.method || 'unknown'}`);
            console.log(`    - 有 trace: ${allResult[0]?.queryTrace ? '✅ PASS' : '❌ FAIL'}`);

            this.results.directQueryFix.allQuery = {
                method: allResult[0]?.queryTrace?.method,
                hasTrace: !!allResult[0]?.queryTrace
            };

            // 输出 residual full scan 清单
            console.log('\n  Residual Full Scan 清单:');
            console.log('    1. track_a_intuitive.js#_anchorConceptsFallback - Fallback 路径（索引不可用时）');
            console.log('    2. track_a_intuitive.js#_hebbianSpreadFallback - Fallback 路径（索引不可用时）');
            console.log('    3. track_b_deliberative.js#directQuery - 辅助 API（无 file/entity 条件时）');
            console.log('    4. backend_json.js#query - 通用查询方法');

        } finally {
            this.cleanup(tempFile);
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(70));
        console.log('                    FIX VERIFICATION SUMMARY');
        console.log('='.repeat(70));

        const templatePassed = this.results.templateFix.filter(r => r.passed).length;
        const templateTotal = this.results.templateFix.length;

        const budgetPassed = this.results.tokenBudgetFix.filter(r => r.passed).length;
        const budgetTotal = this.results.tokenBudgetFix.length;

        console.log(`\n  A. 模板渲染修复: ${templatePassed}/${templateTotal} 通过`);
        console.log(`  B. Token Budget 修复: ${budgetPassed}/${budgetTotal} 通过`);
        console.log(`  C. directQuery 风险降级: ${this.results.directQueryFix.fileQuery?.useIndex ? '✅' : '⚠️'} 文件索引 | ${this.results.directQueryFix.entityQuery?.useIndex ? '✅' : '⚠️'} 实体索引 | ${this.results.directQueryFix.allQuery?.hasTrace ? '✅' : '❌'} trace`);

        const allPassed = templatePassed === templateTotal && budgetPassed === budgetTotal;

        console.log('\n  结论: ' + (allPassed ? '✅ 所有修复验证通过' : '⚠️ 存在未通过的修复'));
    }
}

async function main() {
    const verification = new Layer4FixVerification();
    await verification.runAll();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = Layer4FixVerification;
