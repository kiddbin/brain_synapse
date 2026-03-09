/**
 * @file brain_synapse/examples/coding_agent_demo.js
 * @description Coding Agent 快速示例 - 5 分钟上手
 * @version 2.0.0
 * 
 * 演示内容：
 * 1. 创建记忆（包括 Failed-Attempt）
 * 2. 检索记忆（双轨检索）
 * 3. 冲突解决（时间有效性验证）
 * 4. Coding Agent 扩展功能
 */

const path = require('path');
const { BrainSynapseSDK, MemoryItem } = require('../src/index');
const CodingAgentExtension = require('../src/extensions/coding_agent');

async function demo() {
    console.log('='.repeat(60));
    console.log('Brain Synapse v2.0 - Coding Agent Demo');
    console.log('='.repeat(60));
    console.log();
    
    // 初始化 SDK（使用临时文件）
    const tempFile = path.join(__dirname, `demo_weights.${Date.now()}.json`);
    const sdk = new BrainSynapseSDK({
        weightsFile: tempFile,
        latentFile: tempFile + '.latent',
        autoLoad: false
    });
    
    await sdk.init();
    
    // 创建 Coding Agent 扩展
    const codingAgent = new CodingAgentExtension(sdk);
    
    console.log('Step 1: 记录 Failed Attempt');
    console.log('-'.repeat(60));
    const failedAttempt = await codingAgent.rememberFailedAttempt({
        fileReference: 'src/api/handler.js:L78',
        errorMessage: 'Race condition detected: multiple async calls',
        attemptedSolution: '使用 setTimeout 延迟 100ms 加载',
        bugDescription: 'API 调用出现竞态条件，数据不一致'
    });
    console.log(`✓ Created failed attempt: ${failedAttempt.id}`);
    console.log();
    
    console.log('Step 2: 记录成功解决方案');
    console.log('-'.repeat(60));
    const solution = await codingAgent.rememberSuccess({
        fileReference: 'src/api/handler.js:L78',
        solution: '使用 Promise.all 同步加载所有依赖',
        bugDescription: 'API 调用出现竞态条件，数据不一致',
        failedAttempts: [failedAttempt.id]
    });
    console.log(`✓ Created solution: ${solution.id}`);
    console.log();
    
    console.log('Step 3: 记录配置记忆（时间有效性演示）');
    console.log('-'.repeat(60));
    
    // 旧配置（已失效）
    const configV1 = await sdk.createMemory({
        memory_type: 'semantic',
        content: { keyword: '数据库超时', rule: '数据库连接超时设置为 30 秒' },
        timestamp_valid_from: Date.now() - 86400000 * 2, // 2 天前
        timestamp_valid_to: Date.now() - 86400000,       // 1 天前失效
        superseded_by: 'config_v2'
    });
    console.log(`✓ Created config v1 (expired): ${configV1.id}`);
    
    // 新配置（当前有效）
    const configV2 = await sdk.createMemory({
        memory_type: 'semantic',
        content: { keyword: '数据库超时', rule: '数据库连接超时设置为 60 秒' },
        timestamp_valid_from: Date.now() - 86400000,     // 1 天前生效
        timestamp_valid_to: null,                         // 当前有效
        supersedes: configV1.id
    });
    console.log(`✓ Created config v2 (current): ${configV2.id}`);
    console.log();
    
    console.log('Step 4: 检索演示 - 双轨检索');
    console.log('-'.repeat(60));
    const recallResult = await sdk.recall('竞态条件 解决方案');
    console.log(`\n检索结果：${recallResult.results.length} 条`);
    console.log(`置信度：${(recallResult.confidence * 100).toFixed(2)}%`);
    console.log(`延迟：${recallResult.latency}ms`);
    
    if (recallResult.getBest()) {
        console.log(`\n最佳结果:`);
        console.log(`  ID: ${recallResult.getBest().memory.id}`);
        console.log(`  内容：${JSON.stringify(recallResult.getBest().memory.content)}`);
    }
    console.log();
    
    console.log('Step 5: 时间有效性验证');
    console.log('-'.repeat(60));
    const configQuery = await sdk.recall('数据库连接超时');
    console.log(`\n查询："数据库连接超时"`);
    console.log(`返回结果数：${configQuery.results.length}`);
    
    if (configQuery.getBest()) {
        const best = configQuery.getBest().memory;
        console.log(`最佳匹配:`);
        console.log(`  ID: ${best.id}`);
        console.log(`  内容：${best.content.rule}`);
        console.log(`  是否当前有效：${best.isValidNow() ? '✓ 是' : '✗ 否'}`);
        
        if (best.supersedes) {
            console.log(`  取代了：${best.supersedes}`);
        }
    }
    console.log();
    
    console.log('Step 6: 检查是否尝试过某方案');
    console.log('-'.repeat(60));
    const checkResult = await codingAgent.checkIfAttempted(
        'src/api/handler.js:L78',
        'setTimeout'
    );
    
    if (checkResult.attempted) {
        console.log(`⚠️  该方案已尝试过并失败！`);
        console.log(`  错误信息：${checkResult.error}`);
    } else {
        console.log(`✓ 该方案未尝试过`);
    }
    console.log();
    
    console.log('Step 7: 生成 Bugfix 报告');
    console.log('-'.repeat(60));
    const report = await codingAgent.generateBugfixReport('src/api/handler.js:L78');
    console.log(`Bugfix 报告:`);
    console.log(`  失败尝试：${report.failedAttempts.length} 次`);
    console.log(`  成功方案：${report.solutions.length} 个`);
    console.log(`  总记忆数：${report.totalMemories}`);
    
    if (report.failedAttempts.length > 0) {
        console.log(`\n  失败历史:`);
        report.failedAttempts.forEach((attempt, i) => {
            console.log(`    ${i + 1}. ${attempt.attempted} → ${attempt.error}`);
        });
    }
    
    if (report.solutions.length > 0) {
        console.log(`\n  成功方案:`);
        report.solutions.forEach((sol, i) => {
            console.log(`    ${i + 1}. ${sol.solution}`);
        });
    }
    console.log();
    
    console.log('Step 8: 打印追踪日志（可解释性）');
    console.log('-'.repeat(60));
    recallResult.printTrace();
    
    // 清理
    console.log('\n' + '='.repeat(60));
    console.log('Demo completed!');
    console.log('='.repeat(60));
    
    // 实际使用时请取消注释以下行来清理临时文件
    // const fs = require('fs');
    // fs.unlinkSync(tempFile);
    // fs.unlinkSync(tempFile + '.latent');
}

// 运行演示
demo().catch(console.error);
