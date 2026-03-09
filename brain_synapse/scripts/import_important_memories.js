/**
 * 手动添加缺失的重要记忆
 * 用法：node scripts/import_important_memories.js
 */

const fs = require('fs');
const path = require('path');

const WEIGHTS_FILE = path.join(__dirname, '../synapse_weights.v2.json');

// 用户之前讨论过的重要记忆（需要用户口述内容）
const IMPORTANT_MEMORIES = [
  {
    id: 'twitter_project_001',
    memory_type: 'semantic',
    content: {
      keyword: '推特计划',
      description: '待用户补充具体内容',
      status: 'placeholder'
    },
    created_at: Date.now(),
    weight: 2.0,  // 高权重
    pinned: true
  },
  {
    id: 'quant_project_001',
    memory_type: 'semantic',
    content: {
      keyword: '量化项目',
      description: '待用户补充具体内容',
      status: 'placeholder'
    },
    created_at: Date.now(),
    weight: 2.0,
    pinned: true
  }
];

async function main() {
  console.log('正在加载记忆库...');
  let data = { memories: {}, latent: {}, metadata: {} };
  
  if (fs.existsSync(WEIGHTS_FILE)) {
    data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf-8'));
  }
  
  console.log(`当前记忆数量：${Object.keys(data.memories).length}`);
  
  console.log('\n添加重要记忆...');
  IMPORTANT_MEMORIES.forEach(memory => {
    data.memories[memory.id] = memory;
    console.log(`  ✓ 添加：${memory.content.keyword}`);
  });
  
  console.log(`\n保存记忆库...`);
  fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2));
  
  console.log(`完成！当前记忆数量：${Object.keys(data.memories).length}`);
  console.log('\n现在可以运行：node skill.js recall "推特计划"');
}

main().catch(console.error);
