/**
 * @file brain_synapse/auto-hook.js
 * @description 自动经验捕获 Hook - 马斯克式自动化方案
 * @description 不需要 AI 记得调用，系统自动检测并记录关键经验
 * 
 * 核心原则：
 * 1. 零依赖 AI 自觉性 - 完全自动化
 * 2. 检测关键经验时刻 - 失败→成功、错误解决、首次验证
 * 3. 自动调用 pin-exp - 固定到长期记忆
 * 4. 静默运行 - 不打扰正常流程
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- 配置 ---
const HOOK_LOG_FILE = path.join(__dirname, 'hook-log.json');
const AUTO_PIN_FILE = path.join(__dirname, 'auto-pinned.json');

// --- 关键经验检测规则 ---
const EXPERIENCE_PATTERNS = [
    // 1. 错误解决模式
    {
        name: 'error_resolved',
        description: '错误被解决',
        detect: (context) => {
            // 之前有错误，现在成功了
            return context.success && context.previousError;
        },
        extract: (context) => {
            return {
                keyword: context.tool || context.api,
                rule: `解决"${context.previousError}" → ${context.solution || '成功'}`
            };
        }
    },
    
    // 2. 首次成功验证
    {
        name: 'first_success',
        description: '首次成功验证 API/功能',
        detect: (context) => {
            return context.success && context.isFirstAttempt && context.tool;
        },
        extract: (context) => {
            return {
                keyword: `${context.tool}_success`,
                rule: context.successMessage || `首次验证成功：${context.tool}`
            };
        }
    },
    
    // 3. 参数/格式发现
    {
        name: 'parameter_discovery',
        description: '发现关键参数或格式',
        detect: (context) => {
            return context.parameter && (context.correctValue || context.format);
        },
        extract: (context) => {
            const value = context.correctValue || context.format;
            return {
                keyword: `${context.tool}_${context.parameter}`,
                rule: `${context.parameter}必须为${value}`
            };
        }
    },
    
    // 4. 反面教材（错误做法）
    {
        name: 'anti_pattern',
        description: '验证了错误做法',
        detect: (context) => {
            return context.error && context.wrongApproach;
        },
        extract: (context) => {
            return {
                keyword: `${context.tool}_error`,
                rule: `禁止使用${context.wrongApproach} → ${context.error}`
            };
        }
    },
    
    // 5. API 调用成功（带关键信息）
    {
        name: 'api_success',
        description: 'API 调用成功并有关键发现',
        detect: (context) => {
            return context.api && context.success && context.keyFinding;
        },
        extract: (context) => {
            return {
                keyword: `${context.api.replace(/\//g, '_')}`,
                rule: context.keyFinding
            };
        }
    }
];

// --- 核心功能 ---

/**
 * 记录工具调用上下文
 * @param {object} context - 调用上下文
 */
function recordToolCall(context) {
    try {
        const log = {
            timestamp: Date.now(),
            tool: context.tool,
            action: context.action,
            params: context.params,
            success: context.success,
            error: context.error,
            result: context.result
        };
        
        // 读取现有日志
        let logs = [];
        if (fs.existsSync(HOOK_LOG_FILE)) {
            logs = JSON.parse(fs.readFileSync(HOOK_LOG_FILE, 'utf8'));
        }
        
        // 添加新日志
        logs.push(log);
        
        // 保留最近 1000 条
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }
        
        // 保存
        fs.writeFileSync(HOOK_LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
        
        // 检测关键经验
        detectAndPinExperience(context);
        
    } catch (e) {
        // 静默失败，不影响主流程
        console.warn('[AutoHook] recordToolCall failed:', e.message);
    }
}

/**
 * 检测并固定关键经验
 * @param {object} context - 调用上下文
 */
function detectAndPinExperience(context) {
    try {
        // 遍历所有检测规则
        for (const pattern of EXPERIENCE_PATTERNS) {
            if (pattern.detect(context)) {
                const extracted = pattern.extract(context);
                
                // 检查是否已固定
                if (isAlreadyPinned(extracted.keyword)) {
                    return; // 已存在，跳过
                }
                
                // 调用 pin-exp
                pinExperience(extracted.keyword, extracted.rule);
                
                // 记录已固定
                recordAutoPin(extracted.keyword, extracted.rule, pattern.name);
                
                console.log(`[AutoHook] ✅ 自动固定经验：${extracted.keyword} → ${extracted.rule}`);
                return; // 只固定第一个匹配
            }
        }
    } catch (e) {
        console.warn('[AutoHook] detectAndPinExperience failed:', e.message);
    }
}

/**
 * 检查经验是否已固定
 * @param {string} keyword - 关键词
 * @returns {boolean}
 */
function isAlreadyPinned(keyword) {
    try {
        if (!fs.existsSync(AUTO_PIN_FILE)) {
            return false;
        }
        
        const pinned = JSON.parse(fs.readFileSync(AUTO_PIN_FILE, 'utf8'));
        return pinned.some(p => p.keyword === keyword);
    } catch (e) {
        return false;
    }
}

/**
 * 记录自动固定的经验
 * @param {string} keyword - 关键词
 * @param {string} rule - 规则
 * @param {string} pattern - 匹配的模式
 */
function recordAutoPin(keyword, rule, pattern) {
    try {
        let pinned = [];
        if (fs.existsSync(AUTO_PIN_FILE)) {
            pinned = JSON.parse(fs.readFileSync(AUTO_PIN_FILE, 'utf8'));
        }
        
        pinned.push({
            keyword,
            rule,
            pattern,
            timestamp: Date.now()
        });
        
        fs.writeFileSync(AUTO_PIN_FILE, JSON.stringify(pinned, null, 2), 'utf8');
    } catch (e) {
        console.warn('[AutoHook] recordAutoPin failed:', e.message);
    }
}

/**
 * 调用 pin-exp 固定经验
 * @param {string} keyword - 关键词
 * @param {string} rule - 规则
 */
function pinExperience(keyword, rule) {
    try {
        const cmd = `node "${path.join(__dirname, 'skill.js')}" pin-exp "${keyword}:${rule}"`;
        execSync(cmd, { stdio: 'pipe' });
    } catch (e) {
        console.warn('[AutoHook] pinExperience failed:', e.message);
    }
}

/**
 * 获取自动固定的经验列表
 * @returns {array}
 */
function getAutoPinned() {
    try {
        if (!fs.existsSync(AUTO_PIN_FILE)) {
            return [];
        }
        
        return JSON.parse(fs.readFileSync(AUTO_PIN_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

/**
 * 清除 Hook 日志（维护用）
 */
function clearHookLog() {
    try {
        if (fs.existsSync(HOOK_LOG_FILE)) {
            fs.unlinkSync(HOOK_LOG_FILE);
        }
        console.log('[AutoHook] Hook log cleared');
    } catch (e) {
        console.warn('[AutoHook] clearHookLog failed:', e.message);
    }
}

// --- CLI 入口 ---

if (require.main === module) {
    const command = process.argv[2];
    
    switch (command) {
        case 'list':
            const pinned = getAutoPinned();
            console.log('Auto-pinned experiences:');
            pinned.forEach(p => {
                console.log(`  ${p.keyword}: ${p.rule}`);
            });
            break;
            
        case 'clear':
            clearHookLog();
            break;
            
        default:
            console.log('Usage: node auto-hook.js <list|clear>');
    }
}

// --- 导出 ---
module.exports = {
    recordToolCall,
    detectAndPinExperience,
    getAutoPinned,
    clearHookLog
};
