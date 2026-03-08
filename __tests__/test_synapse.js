/**
 * @file brain_synapse/__tests__/test_synapse.js
 * @description Basic test suite for Brain Synapse Memory System
 * @version 2.0.0
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDir = __dirname;
const rootDir = path.join(testDir, '..');

console.log('=== Brain Synapse Test Suite ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${e.message}`);
        failed++;
    }
}

test('Core memory module exists', () => {
    const memoryPath = path.join(rootDir, 'core/memory.js');
    assert.ok(fs.existsSync(memoryPath), 'core/memory.js should exist');
});

test('Core NLP module exists', () => {
    const nlpPath = path.join(rootDir, 'core/nlp.js');
    assert.ok(fs.existsSync(nlpPath), 'core/nlp.js should exist');
});

test('Storage module exists', () => {
    const storagePath = path.join(rootDir, 'storage/storage.js');
    assert.ok(fs.existsSync(storagePath), 'storage/storage.js should exist');
});

test('Main skill.js exists', () => {
    const skillPath = path.join(rootDir, 'skill.js');
    assert.ok(fs.existsSync(skillPath), 'skill.js should exist');
});

test('Observer module exists', () => {
    const observerPath = path.join(rootDir, 'observer.js');
    assert.ok(fs.existsSync(observerPath), 'observer.js should exist');
});

test('STDP temporal module exists', () => {
    const stdpPath = path.join(rootDir, 'stdp-temporal.js');
    assert.ok(fs.existsSync(stdpPath), 'stdp-temporal.js should exist');
});

test('Conflict resolver module exists', () => {
    const conflictPath = path.join(rootDir, 'conflict-resolver.js');
    assert.ok(fs.existsSync(conflictPath), 'conflict-resolver.js should exist');
});

test('Auto-hook module exists', () => {
    const autoHookPath = path.join(rootDir, 'auto-hook.js');
    assert.ok(fs.existsSync(autoHookPath), 'auto-hook.js should exist');
});

test('Local file search module exists', () => {
    const localSearchPath = path.join(rootDir, 'local_file_search.js');
    assert.ok(fs.existsSync(localSearchPath), 'local_file_search.js should exist');
});

test('Vector embed module exists', () => {
    const vectorPath = path.join(rootDir, 'vector-embed.js');
    assert.ok(fs.existsSync(vectorPath), 'vector-embed.js should exist');
});

test('.env.example exists', () => {
    const envPath = path.join(rootDir, '.env.example');
    assert.ok(fs.existsSync(envPath), '.env.example should exist');
});

test('package.json exists', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
});

test('Core memory module can be loaded', () => {
    const SynapseMemory = require(path.join(rootDir, 'core/memory.js'));
    assert.ok(SynapseMemory, 'SynapseMemory should be loadable');
});

test('Core NLP module can be loaded', () => {
    const nlp = require(path.join(rootDir, 'core/nlp.js'));
    assert.ok(nlp.extractKeywords, 'extractKeywords should be exported');
    assert.ok(nlp.isStopword, 'isStopword should be exported');
});

test('Storage module can be loaded', () => {
    const SynapseStorage = require(path.join(rootDir, 'storage/storage.js'));
    assert.ok(SynapseStorage, 'SynapseStorage should be loadable');
});

test('Observer module can be loaded', () => {
    const ObserverPattern = require(path.join(rootDir, 'observer.js'));
    assert.ok(ObserverPattern, 'ObserverPattern should be loadable');
});

test('STDP module can be loaded', () => {
    const STDPTrainer = require(path.join(rootDir, 'stdp-temporal.js'));
    assert.ok(STDPTrainer, 'STDPTrainer should be loadable');
});

test('Conflict resolver module can be loaded', () => {
    const ConflictResolver = require(path.join(rootDir, 'conflict-resolver.js'));
    assert.ok(ConflictResolver, 'ConflictResolver should be loadable');
});

test('Auto-hook module can be loaded', () => {
    const autoHook = require(path.join(rootDir, 'auto-hook.js'));
    assert.ok(autoHook.recordToolCall, 'recordToolCall should be exported');
});

test('Local file search module can be loaded', () => {
    const LocalFileSearch = require(path.join(rootDir, 'local_file_search.js'));
    assert.ok(LocalFileSearch, 'LocalFileSearch should be loadable');
});

test('Vector embed module can be loaded', () => {
    const VectorEmbed = require(path.join(rootDir, 'vector-embed.js'));
    assert.ok(VectorEmbed, 'VectorEmbed should be loadable');
});

test('NLP extractKeywords returns array', () => {
    const { extractKeywords } = require(path.join(rootDir, 'core/nlp.js'));
    const result = extractKeywords('This is a test sentence with some keywords');
    assert.ok(Array.isArray(result), 'extractKeywords should return an array');
});

test('NLP isStopword works correctly', () => {
    const { isStopword } = require(path.join(rootDir, 'core/nlp.js'));
    assert.ok(isStopword('the', false), '"the" should be a stopword');
    assert.ok(!isStopword('important', false), '"important" should not be a stopword');
});

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
    process.exit(1);
}
