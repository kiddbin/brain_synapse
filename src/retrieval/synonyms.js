/**
 * @file brain_synapse/src/retrieval/synonyms.js
 * @description 同义词映射表 - Layer 2 智能扩展
 * @version 1.0.0
 * 
 * 设计原则：
 * 1. 双向索引 - 存记忆时也扩展（不是只查的时候）
 * 2. 权重衰减 - 同义词匹配权重 × 0.7（低于原词）
 * 3. 可进化 - 用 auto-hook.js 自动发现新同义词对
 */

const SYNONYM_MAP = {
    // ==================== 通用词 ====================
    'remember': ['recall', 'retrieve', 'memory', 'memorize', 'remembers', 'remembering', 'remembered'],
    'search': ['find', 'lookup', 'query', 'seek', 'searching', 'searched'],
    'error': ['bug', 'issue', 'problem', 'fail', 'exception', 'errors', 'bugs', 'issues'],
    'help': ['assist', 'support', 'aid', 'guide', 'helping'],
    'learn': ['study', 'understand', 'master', 'learning', 'learned'],
    'know': ['understand', 'aware', 'knowledge', 'knew', 'known'],
    'think': ['believe', 'consider', 'ponder', 'thinking', 'thought'],
    'work': ['function', 'operate', 'run', 'working', 'worked'],
    'use': ['utilize', 'employ', 'apply', 'using', 'used'],
    'make': ['create', 'build', 'generate', 'making', 'made'],
    
    // ==================== 技术词 ====================
    'browser': ['chrome', 'playwright', 'selenium', 'web', 'browsers'],
    'api': ['endpoint', 'rest', 'http', 'request', 'apis', 'endpoints'],
    'deploy': ['publish', 'release', 'launch', 'container', 'deploying', 'deployed'],
    'code': ['script', 'program', 'source', 'coding', 'coded'],
    'debug': ['troubleshoot', 'fix', 'resolve', 'debugging', 'debugged'],
    'test': ['verify', 'validate', 'check', 'testing', 'tested'],
    'build': ['compile', 'construct', 'assemble', 'building', 'built'],
    'run': ['execute', 'start', 'launch', 'running', 'ran'],
    'install': ['setup', 'configure', 'add', 'installing', 'installed'],
    'config': ['configuration', 'setting', 'options', 'configs', 'settings'],
    'file': ['document', 'path', 'location', 'files'],
    'folder': ['directory', 'dir', 'folders', 'directories'],
    'database': ['db', 'sql', 'data', 'databases'],
    'server': ['host', 'machine', 'instance', 'servers'],
    'client': ['user', 'browser', 'frontend', 'clients'],
    'network': ['connection', 'internet', 'web', 'networks'],
    'security': ['auth', 'authentication', 'authorization', 'protect', 'secure'],
    'performance': ['speed', 'optimization', 'fast', 'slow', 'latency'],
    
    // ==================== 编程相关 ====================
    'function': ['method', 'procedure', 'routine', 'functions'],
    'variable': ['var', 'value', 'data', 'variables'],
    'array': ['list', 'collection', 'sequence', 'arrays'],
    'object': ['struct', 'entity', 'instance', 'objects'],
    'class': ['type', 'module', 'component', 'classes'],
    'loop': ['iteration', 'cycle', 'repeat', 'loops'],
    'condition': ['if', 'statement', 'branch', 'conditions'],
    'string': ['text', 'char', 'characters', 'strings'],
    'number': ['int', 'float', 'numeric', 'numbers'],
    'boolean': ['bool', 'true', 'false', 'booleans'],
    'null': ['none', 'undefined', 'empty', 'nil'],
    'return': ['output', 'result', 'yield', 'returns'],
    'parameter': ['param', 'argument', 'input', 'parameters', 'arguments'],
    
    // ==================== 中文同义词 ====================
    '记忆': ['回忆', '记住', '存储', '存档', '记忆力'],
    '错误': ['报错', '问题', 'bug', '异常', '故障'],
    '浏览器': ['Chrome', '网页', '自动化', '浏览器自动化'],
    '搜索': ['查找', '查询', '检索', '寻找'],
    '帮助': ['协助', '支持', '帮忙', '指导'],
    '学习': ['学会', '掌握', '理解', '研习'],
    '知道': ['了解', '明白', '清楚', '知晓'],
    '思考': ['想', '考虑', '思索', '认为'],
    '工作': ['运行', '操作', '执行', '任务'],
    '使用': ['利用', '应用', '采用', '运用'],
    '创建': ['建立', '生成', '制作', '构建'],
    '代码': ['程序', '脚本', '源码', '编程'],
    '调试': ['排错', '修复', '解决', '修正'],
    '测试': ['验证', '检验', '试验', '测验'],
    '部署': ['发布', '上线', '配置', '安装'],
    '文件': ['文档', '路径', '位置', '档案'],
    '文件夹': ['目录', '路径', '文件夹'],
    '数据库': ['数据', '存储', '表', '纪录'],
    '服务器': ['主机', '机器', '实例', '服务端'],
    '客户端': ['用户', '浏览器', '前端', '客户'],
    '网络': ['连接', '互联网', '链路', '通讯'],
    '安全': ['认证', '授权', '保护', '加密'],
    '性能': ['速度', '优化', '效率', '快慢'],
    '函数': ['方法', '过程', '例程', '功能'],
    '变量': ['参数', '值', '数据', '变数'],
    '数组': ['列表', '集合', '序列', '阵列'],
    '对象': ['实体', '实例', '目标', '物体'],
    '类': ['类型', '模块', '组件', '类别'],
    '循环': ['迭代', '周期', '重复', '轮回'],
    '条件': ['判断', '分支', '语句', '前提'],
    '字符串': ['文本', '字符', '字串', '文字'],
    '数字': ['数值', '整数', '小数', '数目'],
    '布尔': ['真假', '逻辑', '是否', '布尔值'],
    '空值': ['无', '未定义', '空白', '零'],
    '返回': ['输出', '结果', '回馈', '答复'],
    '参数': ['参量', '引数', '输入', '变量'],
    
    // ==================== OpenClaw 特定 ====================
    'openclaw': ['claw', 'clawd', 'openclaw 框架', '框架'],
    'skill': ['技能', '能力', '功能模块', 'skills'],
    'agent': ['代理', '机器人', '助手', 'agents'],
    'session': ['会话', '对话', '线程', 'sessions'],
    'workspace': ['工作区', '目录', '项目', '工作空间'],
    'memory': ['记忆', '存储', 'recall', 'memories'],
    'recall': ['检索', '召回', '查找', '回忆'],
    'tool': ['工具', '函数', '方法', 'tools'],
    'browser': ['浏览器', 'playwright', 'chrome', '网页'],
    'feishu': ['飞书', 'lark', '文档', 'wiki'],
    'message': ['消息', '发送', '通知', 'messages'],
    'command': ['命令', '指令', 'cmd', 'commands']
};

/**
 * 扩展查询 Token
 * @param {Array<string>} tokens - 原始 Token 列表
 * @returns {Array<string>} 扩展后的 Token 列表
 */
function expandQuery(tokens) {
    const expanded = new Set(tokens);
    
    tokens.forEach(token => {
        const tokenLower = token.toLowerCase();
        const synonyms = SYNONYM_MAP[tokenLower] || [];
        synonyms.forEach(syn => expanded.add(syn));
        
        // 反向查找：如果 token 是同义词，添加原词
        Object.entries(SYNONYM_MAP).forEach(([original, synList]) => {
            if (synList.includes(tokenLower)) {
                expanded.add(original);
            }
        });
    });
    
    return Array.from(expanded);
}

/**
 * 获取同义词列表
 * @param {string} word - 单词
 * @returns {Array<string>} 同义词列表
 */
function getSynonyms(word) {
    const wordLower = word.toLowerCase();
    const direct = SYNONYM_MAP[wordLower] || [];
    const reverse = [];
    
    // 反向查找
    Object.entries(SYNONYM_MAP).forEach(([original, synList]) => {
        if (synList.includes(wordLower)) {
            reverse.push(original);
        }
    });
    
    return [...new Set([...direct, ...reverse])];
}

/**
 * 添加新的同义词对（运行时动态扩展）
 * @param {string} word1 - 单词 1
 * @param {string} word2 - 单词 2
 */
function addSynonymPair(word1, word2) {
    const w1 = word1.toLowerCase();
    const w2 = word2.toLowerCase();
    
    if (!SYNONYM_MAP[w1]) {
        SYNONYM_MAP[w1] = [];
    }
    if (!SYNONYM_MAP[w1].includes(w2)) {
        SYNONYM_MAP[w1].push(w2);
    }
    
    if (!SYNONYM_MAP[w2]) {
        SYNONYM_MAP[w2] = [];
    }
    if (!SYNONYM_MAP[w2].includes(w1)) {
        SYNONYM_MAP[w2].push(w1);
    }
}

module.exports = {
    SYNONYM_MAP,
    expandQuery,
    getSynonyms,
    addSynonymPair
};
