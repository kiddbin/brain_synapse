/**
 * 紧急修复：从真实记忆文件重建记忆库
 * 
 * 问题：synapse_weights.v2.json 全是 benchmark 假数据
 * 解决：从 workspace/memory/*.md 重新导入真实记忆
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../../../workspace/memory');
const WEIGHTS_FILE = path.join(__dirname, '../synapse_weights.v2.json');
const BACKUP_FILE = path.join(__dirname, '../synapse_weights.v2.json.backup.' + Date.now());

console.log('🔍 扫描真实记忆文件...\n');

// 读取所有 .md 文件
const mdFiles = fs.readdirSync(MEMORY_DIR)
  .filter(f => f.endsWith('.md'))
  .sort();

console.log(`找到 ${mdFiles.length} 个记忆文件\n`);

// 备份旧的假数据
if (fs.existsSync(WEIGHTS_FILE)) {
  console.log(`💾 备份旧的 synapse_weights.v2.json...`);
  fs.copyFileSync(WEIGHTS_FILE, BACKUP_FILE);
  console.log(`   备份到：${BACKUP_FILE}\n`);
}

// 导入真实记忆
const memories = {};
let count = 0;

mdFiles.forEach(file => {
  const filePath = path.join(MEMORY_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 提取关键词（简化版）
  const keywords = extractKeywords(content);
  
  // 创建记忆
  const memoryId = `memory_${file.replace('.md', '')}`;
  memories[memoryId] = {
    id: memoryId,
    memory_type: 'episodic',
    content: {
      keyword: keywords.join(', '),
      file: file,
      content: content.substring(0, 500), // 预览
      full_path: filePath
    },
    provenance: {
      file_reference: filePath,
      source: 'workspace_memory'
    },
    created_at: fs.statSync(filePath).mtimeMs,
    weight: 1.5, // 真实记忆高权重
    salience: 0.8
  };
  
  count++;
  if (count <= 5) {
    console.log(`✓ ${file} → ${keywords.slice(0, 3).join(', ')}`);
  }
});

if (count > 5) {
  console.log(`... 还有 ${count - 5} 个文件`);
}

// 保存新的记忆库
console.log(`\n💾 保存新的 synapse_weights.v2.json...`);
fs.writeFileSync(WEIGHTS_FILE, JSON.stringify({
  memories: memories,
  latent: {},
  metadata: {
    source: 'workspace_memory_import',
    imported_at: new Date().toISOString(),
    memory_count: count,
    backup_file: BACKUP_FILE
  }
}, null, 2));

console.log(`✅ 完成！导入 ${count} 条真实记忆`);
console.log(`\n现在可以运行：node skill.js recall "推特计划"`);

/**
 * 简单关键词提取
 */
function extractKeywords(content) {
  const keywords = [];
  
  // 查找中文关键词
  const chineseMatches = content.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  keywords.push(...chineseMatches.slice(0, 10));
  
  // 查找英文关键词
  const englishMatches = content.match(/[a-zA-Z]{3,}/g) || [];
  keywords.push(...englishMatches.slice(0, 5));
  
  return [...new Set(keywords)].slice(0, 10);
}
