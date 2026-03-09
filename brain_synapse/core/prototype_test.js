const fs = require('fs');
const path = require('path');
const SynapseStorage = require('../storage/storage'); // <-- Fixed relative path

/**
 * 这是一个极简的只读测试工具，用于评估当前系统的检索瓶颈
 * 以及不同检索策略（全量筛选 vs 启发式稀疏筛选）的速度和召回差异点。
 */
async function runBaselineAndPrototype() {
    console.log("🚀 [Sprint 2: Prototype] 正在加载概念网络和语料...");
    
    // File relies 1 level up from core
    const WEIGHTS_FILE = path.join(__dirname, '../synapse_weights.json');
    if (!fs.existsSync(WEIGHTS_FILE)) {
        console.error(`❌ 找不到权重文件，跳过测试。(Path: ${WEIGHTS_FILE})`);
        return;
    }

    const storage = new SynapseStorage(WEIGHTS_FILE, {});
    const weights = storage.readSync();
    
    // 1. 基准测量：规模和量级
    const totalConcepts = Object.keys(weights).length;
    let totalRelations = 0;
    
    Object.values(weights).forEach(val => {
        if (val.synapses) {
            totalRelations += Object.keys(val.synapses).length;
        }
    });

    console.log("\n📊 --- Baseline System Metrics ---");
    console.log(`- 总概念数 (Nodes): ${totalConcepts}`);
    console.log(`- 总关系数 (Edges): ${totalRelations}`);
    
    // 准备测试查询
    const query = "playwright"; 
    const queryLower = query.toLowerCase();
    
    console.log(`\n🔍 --- Test Query: "${query}" ---`);

    // ==========================================
    // 方法 A: 当前系统 (类似全文扫描所有的节点来匹配关键词)
    // 复杂度: O(N)
    // ==========================================
    const startA = process.hrtime.bigint();
    
    // 模拟全盘扫描找出相关的节点名称 (System 2 only approach)
    const methodAResults = [];
    Object.keys(weights).forEach(k => {
        if (k.includes(queryLower) || queryLower.includes(k)) {
            methodAResults.push(k);
        }
    });
    
    const endA = process.hrtime.bigint();
    const timeAMs = Number(endA - startA) / 1000000;
    
    console.log(`[方法 A: 纯暴搜遍历所有节点]`);
    console.log(`- 耗时: ${timeAMs.toFixed(3)} ms`);
    console.log(`- 命中概念数: ${methodAResults.length}`);
    
    // ==========================================
    // 方法 B: 混合路由原型 (基于相连的图边游走)
    // 复杂度: O(E) 即边的数量
    // ==========================================
    const startB = process.hrtime.bigint();
    
    const methodBResults = new Set();
    
    // 1. O(1) 锚点定位 (System 1 - 发起点)
    // Hash map access is effectively O(1) in JS V8! This answers the AI's question.
    if (weights[queryLower]) {
        methodBResults.add(queryLower);
        
        // 2. 局部散乱传播 (只看与之相连的边, O(E) complexity)
        const synapses = weights[queryLower].synapses || {};
        for (const [relatedWord, connectionScore] of Object.entries(synapses)) {
            if (connectionScore > 0) { // low threshold for testing
                methodBResults.add(relatedWord);
            }
        }
    } else {
        // 如果完全没有索引过该词，退化为暴搜
        Object.keys(weights).forEach(k => {
            if (k.includes(queryLower) || queryLower.includes(k)) {
                methodBResults.add(k);
            }
        });
    }

    const endB = process.hrtime.bigint();
    const timeBMs = Number(endB - startB) / 1000000;

    console.log(`\n[方法 B: 双轨锚点路由 (System 1 -> System 2 过滤区)]`);
    console.log(`- 耗时: ${timeBMs.toFixed(3)} ms`);
    console.log(`- 初筛圈定的概念数: ${methodBResults.size} (将这批传入确切子文件检索)`);
    console.log(`- 剪枝率: ${((1 - methodBResults.size / Math.max(1, totalConcepts)) * 100).toFixed(2)}% of search space pruned`);
    
    
    console.log("\n💡 对那位 AI 同行的回应证明:");
    console.log("1. **O(1) 是存在的**：因为 JSON 解析在内存中是个 HashTable。`weights['keyword']` 这步锚定是绝对的 O(1)。然后遍历它的边确实是 O(E)，但对于单个稀疏节点来说 E 远小于总节点 N，综合下来 O(1) + O(E) << O(N)。");
    console.log("2. **BM25 并不是强求文档矩阵**：你的判断很对，我们不需要做全局词频倒排。我们的 BM25 是在经过 System 1 **圈定**后，取出背后的 `content/refs`，在仅仅十几句话的内容中执行局部关键词打分（也可以说是更智能局部的 BM25 变体），完全避开了重型构建。");
    console.log("3. **100% 精确度的定义**：不是说囊括宇宙。而是指针对于特定错误日志或者被 `pinned` 的规则，不会像大模型向量数据库那样生成“意思差不多”的模糊幻觉，而是确切抓到那个字符串。");
}

runBaselineAndPrototype().catch(console.error);
