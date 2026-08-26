/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateWeightMetrics, WeightLog } from './workoutEngine';

export interface WeightTestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  details: string;
}

export function runWeightMetricsTests(): { total: number; passed: number; failed: number; results: WeightTestResult[] } {
  const results: WeightTestResult[] = [];

  // W1: 0 weight records -> explicit nulls / empty state (never 0kg or fake 72.6kg)
  const emptyLogs: WeightLog[] = [];
  const emptyMetrics = calculateWeightMetrics(emptyLogs);
  const w1Passed = emptyMetrics.current === null &&
                   emptyMetrics.fourWeeksAgo === null &&
                   emptyMetrics.diff === null &&
                   emptyMetrics.progress === null;
  results.push({
    scenarioId: 'W1',
    name: '0 weight records -> explicit nulls (no fake numbers)',
    passed: w1Passed,
    details: w1Passed ? 'Empty weight logs cleanly return nulls' : `Expected nulls, got current=${emptyMetrics.current}`
  });

  // W2: 1 valid weight record -> returns actual value
  const singleLog: WeightLog[] = [
    { id: 'w-1', date: '2026-03-01', weight: 75.5 }
  ];
  const singleMetrics = calculateWeightMetrics(singleLog);
  const w2Passed = singleMetrics.current === 75.5 &&
                   singleMetrics.fourWeeksAgo === 75.5 &&
                   singleMetrics.diff === 0;
  results.push({
    scenarioId: 'W2',
    name: '1 valid weight record -> actual measurement returned',
    passed: w2Passed,
    details: w2Passed ? 'Single record parsed with correct current=75.5kg and diff=0' : 'Failed on single record'
  });

  // W3: Multiple weight records -> latest date selected as current
  const multiLogs: WeightLog[] = [
    { id: 'w-1', date: '2026-01-01', weight: 80.0 },
    { id: 'w-2', date: '2026-03-01', weight: 74.0 },
    { id: 'w-3', date: '2026-02-01', weight: 76.0 },
  ];
  const multiMetrics = calculateWeightMetrics(multiLogs);
  const w3Passed = multiMetrics.current === 74.0;
  results.push({
    scenarioId: 'W3',
    name: 'Multiple weight records -> latest chronological record selected',
    passed: w3Passed,
    details: w3Passed ? 'Latest weight 74.0kg correctly identified' : `Expected 74.0kg, got ${multiMetrics.current}`
  });

  // W4: Absence is not coerced to 0 or arbitrary default
  const w4Passed = emptyMetrics.current !== 0 && emptyMetrics.current !== 72.6;
  results.push({
    scenarioId: 'W4',
    name: 'Absence is not coerced to 0kg or arbitrary measurement',
    passed: w4Passed,
    details: w4Passed ? 'Absence remains strictly null, not coerced to 0 or 72.6' : 'Coerced to number'
  });

  const passed = results.filter(r => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}
