/**
 * @file brain_synapse/benchmark/runners/benchmark_runner.js
 * @description Benchmark 基准测试运行器 - Layer 5
 * @version 2.1.0
 * 
 * 测试维度：
 * - Latency（延迟）
 * - Recall@K（召回率）
 * - Conflict Resolution Accuracy（冲突消解准确率）
 * - Temporal Validity Accuracy（时间有效性准确率）
 * - File Reference Accuracy（文件引用准确率）
 * - Failed-Attempt Warning（失败尝试警告）
 */

const path = require('path');
const fs = require('fs');
const { BrainSynapseSDK, MemoryItem } = require('../../src/index');

class BenchmarkRunner {
    /**
     * 创建测试运行器
     * @param {string} testDatasetPath - 测试数据集路径
     */
    constructor(testDatasetPath) {
        this.testDatasetPath = testDatasetPath;
        this.results = [];
    }

    /**
     * 运行所有测试
     * @returns {Promise<Object>} 测试结果报告
     */
    async runAll() {
        console.log('[Benchmark] Starting full benchmark suite...\n');
        
        const testDataset = JSON.parse(fs.readFileSync(this.testDatasetPath, 'utf8'));
        const testCases = testDataset.test_cases;
        
        console.log(`[Benchmark] Loaded ${testCases.length} test cases\n`);
        console.log(`[Benchmark] Categories: ${Object.entries(testDataset.metadata.categories).map(([k, v]) => `${k}(${v})`).join(', ')}\n`);
        
        const testResults = [];
        
        // 执行每个测试（每个测试使用独立的 SDK 实例）
        for (const testCase of testCases) {
            console.log(`\n[Benchmark] Running: ${testCase.name} (${testCase.id})`);
            console.log(`  Type: ${testCase.type}`);
            
            // 每个测试使用独立的临时文件，避免数据污染
            const tempWeightsFile = path.join(__dirname, `benchmark_weights.${testCase.id}.${Date.now()}.json`);
            const sdk = new BrainSynapseSDK({
                weightsFile: tempWeightsFile,
                latentFile: tempWeightsFile + '.latent',
                autoLoad: false
            });
            
            try {
                await sdk.init();
                
                // 设置测试数据
                await this._setupTestData(sdk, testCase.setup);
                
                // 执行测试
                const startTime = Date.now();
                const result = await sdk.recall(testCase.query);
                const latency = Date.now() - startTime;
                
                // 验证结果
                const validation = this._validateResult(result, testCase.expected, testCase.type);
                
                testResults.push({
                    id: testCase.id,
                    name: testCase.name,
                    type: testCase.type,
                    passed: validation.passed,
                    latency,
                    resultCount: result.results.length,
                    confidence: result.confidence,
                    query: testCase.query,
                    validationDetails: validation.details
                });
                
                if (validation.passed) {
                    console.log(`  ✓ PASS - Latency: ${latency}ms, Results: ${result.results.length}`);
                } else {
                    console.log(`  ✗ FAIL - Latency: ${latency}ms`);
                    console.log(`    Reasons: ${validation.details.join(', ')}`);
                }
                
            } catch (error) {
                console.error(`  ✗ ERROR: ${error.message}`);
                testResults.push({
                    id: testCase.id,
                    name: testCase.name,
                    type: testCase.type,
                    passed: false,
                    error: error.message
                });
            } finally {
                // 清理临时文件
                await this._cleanup(tempWeightsFile);
            }
        }
        
        // 生成报告
        const report = this._generateReport(testResults, testDataset.metadata);
        
        return report;
    }

    /**
     * 设置测试数据
     * @private
     * @param {BrainSynapseSDK} sdk - SDK 实例
     * @param {Object} setup - 测试设置
     */
    async _setupTestData(sdk, setup) {
        if (!setup || !setup.memories) return;
        
        for (const memData of setup.memories) {
            // 自动填充缺失的必要字段
            const enrichedData = {
                ...memData,
                created_at: memData.created_at || memData.timestamp_valid_from || Date.now(),
                updated_at: memData.updated_at || memData.timestamp_valid_from || Date.now(),
                confidence: memData.confidence ?? 0.5,
                salience: memData.salience ?? 0.5,
                recency: memData.recency ?? 1.0,
                access_count: memData.access_count ?? 0
            };
            await sdk.createMemory(enrichedData);
        }
    }

    /**
     * 验证结果
     * @private
     * @param {RecallResult} result - 检索结果
     * @param {Object} expected - 期望结果
     * @param {string} testType - 测试类型
     * @returns {{passed: boolean, details: Array<string>}}
     */
    _validateResult(result, expected, testType) {
        const memories = result.getMemories();
        const details = [];
        let passed = true;
        
        // 验证结果 ID
        if (expected.result_id) {
            const found = memories.find(m => m.id === expected.result_id);
            if (!found) {
                passed = false;
                details.push(`expected_id_not_found:${expected.result_id}`);
            }
        }
        
        // 验证第一个结果的 ID（排序优先级）
        if (expected.first_result_id) {
            if (memories.length === 0 || memories[0].id !== expected.first_result_id) {
                passed = false;
                const actual = memories.length > 0 ? memories[0].id : 'none';
                details.push(`first_result_id_mismatch:expected=${expected.first_result_id},actual=${actual}`);
            }
        }
        
        // 验证包含内容
        if (expected.result_contains) {
            const found = memories.some(m =>
                JSON.stringify(m.content).includes(expected.result_contains)
            );
            if (!found) {
                passed = false;
                details.push(`expected_content_not_found:${expected.result_contains}`);
            }
        }
        
        // 验证不包含内容
        if (expected.should_not_contain) {
            const found = memories.some(m =>
                JSON.stringify(m.content).includes(expected.should_not_contain)
            );
            if (found) {
                passed = false;
                details.push(`unexpected_content_found:${expected.should_not_contain}`);
            }
        }
        
        // 验证失败尝试数量
        if (expected.failed_attempts_count !== undefined) {
            const failedCount = memories.filter(m => m.memory_type === 'failed_attempt').length;
            if (failedCount !== expected.failed_attempts_count) {
                passed = false;
                details.push(`failed_attempts_count_mismatch:expected=${expected.failed_attempts_count},actual=${failedCount}`);
            }
        }
        
        // 验证最小结果数
        if (expected.min_results !== undefined) {
            if (memories.length < expected.min_results) {
                passed = false;
                details.push(`insufficient_results:expected>=${expected.min_results},actual=${memories.length}`);
            }
        }
        
        // 验证文件过滤
        if (expected.file_filter) {
            const fileFiltered = memories.filter(m =>
                m.provenance && 
                m.provenance.file_reference && 
                m.provenance.file_reference.includes(expected.file_filter)
            );
            if (fileFiltered.length === 0) {
                passed = false;
                details.push(`file_filter_failed:${expected.file_filter}`);
            }
        }
        
        // 验证应该激活的记忆（赫布扩散）
        if (expected.should_activate) {
            const activatedIds = memories.map(m => m.id);
            const missing = expected.should_activate.filter(id => !activatedIds.includes(id));
            if (missing.length > 0) {
                passed = false;
                details.push(`expected_activations_missing:${missing.join(',')}`);
            }
        }
        
        // 验证失败尝试警告
        if (expected.should_warn_attempted) {
            const failedAttempt = memories.find(m =>
                m.memory_type === 'failed_attempt' &&
                JSON.stringify(m.content).includes(expected.should_warn_attempted)
            );
            if (!failedAttempt) {
                passed = false;
                details.push(`failed_attempt_warning_expected:${expected.should_warn_attempted}`);
            }
        }
        
        return { passed, details };
    }

    /**
     * 生成报告
     * @private
     * @param {Array<Object>} testResults - 测试结果
     * @param {Object} metadata - 测试元数据
     * @returns {Object}
     */
    _generateReport(testResults, metadata) {
        const passed = testResults.filter(r => r.passed).length;
        const failed = testResults.filter(r => !r.passed).length;
        const total = testResults.length;
        
        const passedResults = testResults.filter(r => r.latency !== undefined);
        const avgLatency = passedResults.length > 0
            ? passedResults.reduce((sum, r) => sum + r.latency, 0) / passedResults.length
            : 0;
        
        const passRate = (passed / total * 100).toFixed(2);
        
        // 按类型统计
        const typeStats = {};
        testResults.forEach(r => {
            if (!typeStats[r.type]) {
                typeStats[r.type] = { total: 0, passed: 0 };
            }
            typeStats[r.type].total++;
            if (r.passed) typeStats[r.type].passed++;
        });
        
        const report = {
            summary: {
                total,
                passed,
                failed,
                passRate: `${passRate}%`,
                avgLatency: `${avgLatency.toFixed(2)}ms`
            },
            typeStats,
            testResults,
            metadata,
            timestamp: new Date().toISOString(),
            version: '2.1.0'
        };
        
        // 打印报告
        console.log('\n' + '='.repeat(70));
        console.log('                        BENCHMARK REPORT v2.1');
        console.log('='.repeat(70));
        console.log(`Total Tests:     ${total}`);
        console.log(`Passed:          ${passed}`);
        console.log(`Failed:          ${failed}`);
        console.log(`Pass Rate:       ${passRate}%`);
        console.log(`Avg Latency:     ${avgLatency.toFixed(2)}ms`);
        console.log('-'.repeat(70));
        console.log('Results by Type:');
        
        Object.entries(typeStats).forEach(([type, stats]) => {
            const rate = (stats.passed / stats.total * 100).toFixed(0);
            const bar = '█'.repeat(Math.floor(rate / 5)) + '░'.repeat(20 - Math.floor(rate / 5));
            console.log(`  ${type.padEnd(25)} ${bar} ${stats.passed}/${stats.total} (${rate}%)`);
        });
        
        console.log('='.repeat(70));
        
        // 打印失败的测试
        const failedTests = testResults.filter(r => !r.passed);
        if (failedTests.length > 0) {
            console.log('\nFailed Tests:');
            failedTests.forEach(t => {
                console.log(`  ✗ ${t.name} (${t.id})`);
                if (t.validationDetails) {
                    t.validationDetails.forEach(d => console.log(`    - ${d}`));
                }
                if (t.error) {
                    console.log(`    Error: ${t.error}`);
                }
            });
        }
        
        return report;
    }

    /**
     * 清理临时文件
     * @private
     * @param {string} basePath - 基础路径
     */
    async _cleanup(basePath) {
        try {
            if (fs.existsSync(basePath)) {
                fs.unlinkSync(basePath);
            }
            if (fs.existsSync(basePath + '.latent')) {
                fs.unlinkSync(basePath + '.latent');
            }
        } catch (e) {
            // 静默清理失败
        }
    }
}

// 主函数
async function main() {
    const datasetPath = path.join(__dirname, '../datasets/coding_queries.json');
    const runner = new BenchmarkRunner(datasetPath);
    
    const report = await runner.runAll();
    
    // 保存报告
    const reportPath = path.join(__dirname, `benchmark_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n[Benchmark] Report saved to: ${reportPath}`);
}

// 如果直接运行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = BenchmarkRunner;
