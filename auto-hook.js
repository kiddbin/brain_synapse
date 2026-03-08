/**
 * @file brain_synapse/auto-hook.js
 * @description Auto Experience Capture Hook - Fully Automated Experience Recording
 * @description No need for AI to remember to call, system automatically detects and records key experiences
 * 
 * Core Principles:
 * 1. Zero dependency on AI awareness - Fully automated
 * 2. Detect key experience moments - Failure→Success, Error resolution, First validation
 * 3. Auto-call pin-exp - Pin to long-term memory
 * 4. Silent operation - Does not interrupt normal flow
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_LOG_FILE = path.join(__dirname, 'hook-log.json');
const AUTO_PIN_FILE = path.join(__dirname, 'auto-pinned.json');

const EXPERIENCE_PATTERNS = [
    {
        name: 'error_resolved',
        description: 'Error was resolved',
        detect: (context) => {
            return context.success && context.previousError;
        },
        extract: (context) => {
            return {
                keyword: context.tool || context.api,
                rule: `Resolved "${context.previousError}" -> ${context.solution || 'success'}`
            };
        }
    },
    
    {
        name: 'first_success',
        description: 'First successful validation of API/feature',
        detect: (context) => {
            return context.success && context.isFirstAttempt && context.tool;
        },
        extract: (context) => {
            return {
                keyword: `${context.tool}_success`,
                rule: context.successMessage || `First successful validation: ${context.tool}`
            };
        }
    },
    
    {
        name: 'parameter_discovery',
        description: 'Discovered key parameter or format',
        detect: (context) => {
            return context.parameter && (context.correctValue || context.format);
        },
        extract: (context) => {
            const value = context.correctValue || context.format;
            return {
                keyword: `${context.tool}_${context.parameter}`,
                rule: `${context.parameter} must be ${value}`
            };
        }
    },
    
    {
        name: 'anti_pattern',
        description: 'Validated wrong approach',
        detect: (context) => {
            return context.error && context.wrongApproach;
        },
        extract: (context) => {
            return {
                keyword: `${context.tool}_error`,
                rule: `Do not use ${context.wrongApproach} -> ${context.error}`
            };
        }
    },
    
    {
        name: 'api_success',
        description: 'API call successful with key findings',
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
        
        let logs = [];
        if (fs.existsSync(HOOK_LOG_FILE)) {
            logs = JSON.parse(fs.readFileSync(HOOK_LOG_FILE, 'utf8'));
        }
        
        logs.push(log);
        
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }
        
        fs.writeFileSync(HOOK_LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
        
        detectAndPinExperience(context);
        
    } catch (e) {
        console.warn('[AutoHook] recordToolCall failed:', e.message);
    }
}

function detectAndPinExperience(context) {
    try {
        for (const pattern of EXPERIENCE_PATTERNS) {
            if (pattern.detect(context)) {
                const extracted = pattern.extract(context);
                
                if (isAlreadyPinned(extracted.keyword)) {
                    return;
                }
                
                pinExperience(extracted.keyword, extracted.rule);
                
                recordAutoPin(extracted.keyword, extracted.rule, pattern.name);
                
                console.log(`[AutoHook] Auto-pinned experience: ${extracted.keyword} -> ${extracted.rule}`);
                return;
            }
        }
    } catch (e) {
        console.warn('[AutoHook] detectAndPinExperience failed:', e.message);
    }
}

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

function pinExperience(keyword, rule) {
    try {
        const cmd = `node "${path.join(__dirname, 'skill.js')}" pin-exp "${keyword}:${rule}"`;
        execSync(cmd, { stdio: 'pipe' });
    } catch (e) {
        console.warn('[AutoHook] pinExperience failed:', e.message);
    }
}

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

module.exports = {
    recordToolCall,
    detectAndPinExperience,
    getAutoPinned,
    clearHookLog
};
