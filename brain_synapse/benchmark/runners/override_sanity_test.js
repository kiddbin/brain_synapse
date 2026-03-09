/**
 * @file brain_synapse/benchmark/runners/override_sanity_test.js
 * @description Override 机制最小可控测试 - 验证 override 是否真正工作
 * @version 1.0.0
 */

const path = require('path');
const TrackBDeliberative = require('../../src/retrieval/track_b_deliberative');

class OverrideSanityTest {
    constructor() {
        this.testResults = [];
    }

    run() {
        console.log('='.repeat(80));
        console.log('        OVERRIDE SANITY TEST');
        console.log('='.repeat(80));
        console.log('Testing override mechanism with minimal controlled cases\n');

        this.testCaseA();
        this.testCaseB();
        this.testCaseC();

        this.printResults();
        this.printVerdict();
    }

    testCaseA() {
        console.log('Case A: Should trigger override (low priority, high score vs high priority, low score)');
        console.log('-'.repeat(80));

        const trackB = new TrackBDeliberative();
        const context = { overrideStats: { triggered: 0, improved: 0, degraded: 0 } };

        const candidates = [
            {
                hitType: 'spread',
                score: 0.95,
                memory: {
                    id: 'mem_low_priority_high_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            },
            {
                hitType: 'exact',
                score: 0.50,
                memory: {
                    id: 'mem_high_priority_low_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            }
        ];

        console.log('Input:');
        console.log(`  Candidate A: hitType=spread (priority=2), score=0.95`);
        console.log(`  Candidate B: hitType=exact (priority=5), score=0.50`);
        console.log(`  Score difference: ${0.95 - 0.50} (threshold=0.3)`);
        console.log(`  Expected: Override triggered, A should win\n`);

        const sorted = trackB._preciseSort([...candidates], context);
        const winner = sorted[0];

        console.log('Output:');
        console.log(`  Override triggered: ${context.overrideStats.triggered > 0 ? 'YES' : 'NO'}`);
        console.log(`  Winner: ${winner.hitType} (priority=${this.getPriority(winner.hitType)}), score=${winner.score}`);
        console.log(`  Result: ${winner.hitType === 'spread' ? '✅ PASS' : '❌ FAIL'}\n`);

        this.testResults.push({
            case: 'A',
            expected: 'Override triggered, spread wins',
            actual: `Override ${context.overrideStats.triggered > 0 ? 'triggered' : 'NOT triggered'}, ${winner.hitType} wins`,
            passed: winner.hitType === 'spread' && context.overrideStats.triggered > 0
        });
    }

    testCaseB() {
        console.log('Case B: Should NOT trigger override (score difference insufficient)');
        console.log('-'.repeat(80));

        const trackB = new TrackBDeliberative();
        const context = { overrideStats: { triggered: 0, improved: 0, degraded: 0 } };

        const candidates = [
            {
                hitType: 'spread',
                score: 0.70,
                memory: {
                    id: 'mem_low_priority_slightly_high_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            },
            {
                hitType: 'exact',
                score: 0.50,
                memory: {
                    id: 'mem_high_priority_lower_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            }
        ];

        console.log('Input:');
        console.log(`  Candidate A: hitType=spread (priority=2), score=0.70`);
        console.log(`  Candidate B: hitType=exact (priority=5), score=0.50`);
        console.log(`  Score difference: ${0.70 - 0.50} (threshold=0.3)`);
        console.log(`  Expected: Override NOT triggered, exact should win (priority-based)\n`);

        const sorted = trackB._preciseSort([...candidates], context);
        const winner = sorted[0];

        console.log('Output:');
        console.log(`  Override triggered: ${context.overrideStats.triggered > 0 ? 'YES' : 'NO'}`);
        console.log(`  Winner: ${winner.hitType} (priority=${this.getPriority(winner.hitType)}), score=${winner.score}`);
        console.log(`  Result: ${winner.hitType === 'exact' && context.overrideStats.triggered === 0 ? '✅ PASS' : '❌ FAIL'}\n`);

        this.testResults.push({
            case: 'B',
            expected: 'Override NOT triggered, exact wins',
            actual: `Override ${context.overrideStats.triggered > 0 ? 'triggered' : 'NOT triggered'}, ${winner.hitType} wins`,
            passed: winner.hitType === 'exact' && context.overrideStats.triggered === 0
        });
    }

    testCaseC() {
        console.log('Case C: Should NOT trigger override (priority already correct)');
        console.log('-'.repeat(80));

        const trackB = new TrackBDeliberative();
        const context = { overrideStats: { triggered: 0, improved: 0, degraded: 0 } };

        const candidates = [
            {
                hitType: 'exact',
                score: 0.95,
                memory: {
                    id: 'mem_high_priority_high_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            },
            {
                hitType: 'spread',
                score: 0.50,
                memory: {
                    id: 'mem_low_priority_low_score',
                    content: { keyword: 'test' },
                    confidence: 0.8,
                    recency: 0.8,
                    access_count: 5
                }
            }
        ];

        console.log('Input:');
        console.log(`  Candidate A: hitType=exact (priority=5), score=0.95`);
        console.log(`  Candidate B: hitType=spread (priority=2), score=0.50`);
        console.log(`  Expected: Override NOT triggered, exact should win (already correct)\n`);

        const sorted = trackB._preciseSort([...candidates], context);
        const winner = sorted[0];

        console.log('Output:');
        console.log(`  Override triggered: ${context.overrideStats.triggered > 0 ? 'YES' : 'NO'}`);
        console.log(`  Winner: ${winner.hitType} (priority=${this.getPriority(winner.hitType)}), score=${winner.score}`);
        console.log(`  Result: ${winner.hitType === 'exact' && context.overrideStats.triggered === 0 ? '✅ PASS' : '❌ FAIL'}\n`);

        this.testResults.push({
            case: 'C',
            expected: 'Override NOT triggered, exact wins',
            actual: `Override ${context.overrideStats.triggered > 0 ? 'triggered' : 'NOT triggered'}, ${winner.hitType} wins`,
            passed: winner.hitType === 'exact' && context.overrideStats.triggered === 0
        });
    }

    getPriority(hitType) {
        const priorities = {
            'exact': 5,
            'entity': 4,
            'file': 4,
            'anchor': 3,
            'spread': 2,
            'semantic': 1
        };
        return priorities[hitType] || 2;
    }

    printResults() {
        console.log('='.repeat(80));
        console.log('        SANITY TEST RESULTS');
        console.log('='.repeat(80));
        console.log('\n| Case | Expected                              | Actual                                    | Status |');
        console.log('|------|---------------------------------------|-------------------------------------------|--------|');

        for (const result of this.testResults) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`| ${result.case}    | ${result.expected.padEnd(37)} | ${result.actual.padEnd(41)} | ${status} |`);
        }
    }

    printVerdict() {
        const allPassed = this.testResults.every(r => r.passed);

        console.log('\n' + '='.repeat(80));
        if (allPassed) {
            console.log('✅ SANITY TEST PASSED');
            console.log('Override mechanism is working correctly.');
            console.log('Ready to proceed with small-scale benchmark.');
        } else {
            console.log('❌ SANITY TEST FAILED');
            console.log('Override mechanism is NOT working correctly.');
            console.log('DO NOT proceed with benchmark until sanity test passes.');
        }
        console.log('='.repeat(80));
    }
}

if (require.main === module) {
    const test = new OverrideSanityTest();
    test.run();
}

module.exports = { OverrideSanityTest };
