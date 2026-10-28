/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StressDimension } from '../types/stressModel.types';
import {
  DimensionResidualState,
  AllDimensionResidualStates,
} from '../types/dimensionResidualState.types';
import {
  ResidualStressTrace,
  EvaluationContext,
  PersistenceState,
} from '../types/residualStressTrace.types';
import {
  mapSingleDimensionLoad,
  mapBodyLoadPresentation,
  mapBodyLoadFromReplayResult,
} from './bodyLoadPresentationMapper';
import { CANONICAL_STRESS_DIMENSIONS } from '../stress/stressVocabulary';
import { evaluateSingleHistoricalPoint } from '../replay/historicalReplayEngine';
import { HistoricalEvaluationPoint } from '../types/historicalReplay.types';
import { WorkoutLog } from '../../../types';
import { evaluateVNextProduction } from './productionRecommendationService';
import { deriveEvaluationContext } from '../stress/residualStressTrace';

function createMockContext(): EvaluationContext {
  return deriveEvaluationContext({
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    evaluationTimezone: 'Asia/Seoul',
  });
}

function createMockTrace(
  dimension: StressDimension,
  attenuation: ResidualStressTrace['temporalAttenuation']
): ResidualStressTrace {
  return {
    sourceEvidence: {
      kind: 'dimension-projected-strength-stress',
      sourceLogId: 'log-1',
      dimension,
      date: '2026-08-20',
      startTime: '10:00:00',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      associatedDimensions: [dimension],
      sourceSessionMagnitude: {} as any,
    },
    occurrenceState: 'occurred-exact',
    elapsedTime: { kind: 'exact', elapsedSeconds: 3600 },
    temporalAttenuation: attenuation,
  };
}

function createMockDimensionState(options: {
  dimension: StressDimension;
  immediateCount?: number;
  residualCount?: number;
  historicalCount?: number;
  bracketCount?: number;
  uncertainCount?: number;
  potential?: PersistenceState;
}): DimensionResidualState {
  const dim = options.dimension;
  const immediateTraces: ResidualStressTrace[] = [];
  const residualTraces: ResidualStressTrace[] = [];
  const historicalTraces: ResidualStressTrace[] = [];
  const bracketTraces: ResidualStressTrace[] = [];
  const uncertainTraces: ResidualStressTrace[] = [];

  for (let i = 0; i < (options.immediateCount || 0); i++) {
    immediateTraces.push(
      createMockTrace(dim, {
        kind: 'exact-ordinal',
        state: 'immediate',
        thresholdPolicy: 'product-policy-24h-72h',
      })
    );
  }
  for (let i = 0; i < (options.residualCount || 0); i++) {
    residualTraces.push(
      createMockTrace(dim, {
        kind: 'exact-ordinal',
        state: 'residual',
        thresholdPolicy: 'product-policy-24h-72h',
      })
    );
  }
  for (let i = 0; i < (options.historicalCount || 0); i++) {
    historicalTraces.push(
      createMockTrace(dim, {
        kind: 'exact-ordinal',
        state: 'historical',
        thresholdPolicy: 'product-policy-24h-72h',
      })
    );
  }
  for (let i = 0; i < (options.bracketCount || 0); i++) {
    bracketTraces.push(
      createMockTrace(dim, {
        kind: 'bracket-ordinal',
        lowerBoundState: 'historical',
        upperBoundState: options.potential || 'residual',
        thresholdPolicy: 'product-policy-24h-72h',
      })
    );
  }
  for (let i = 0; i < (options.uncertainCount || 0); i++) {
    uncertainTraces.push(
      createMockTrace(dim, {
        kind: 'uncomputed',
        reason: 'missing-same-day-time',
      })
    );
  }

  let definite: PersistenceState | 'none' = 'none';
  if (immediateTraces.length > 0) definite = 'immediate';
  else if (residualTraces.length > 0) definite = 'residual';
  else if (historicalTraces.length > 0) definite = 'historical';

  const potential: PersistenceState | 'none' = options.potential || definite;

  return {
    dimension: dim,
    evaluationContext: createMockContext(),
    relevantTraces: [
      ...immediateTraces,
      ...residualTraces,
      ...historicalTraces,
      ...bracketTraces,
      ...uncertainTraces,
    ],
    immediateTraces,
    residualTraces,
    historicalTraces,
    bracketTraces,
    uncertainTraces,
    ineligibleTraces: [],
    modalitySummary: {
      presence: 'strength-only',
      hasStrength: true,
      hasRunning: false,
      strengthTraceCount: 1,
      runningTraceCount: 0,
    },
    strongestPersistence: {
      definite,
      potential,
      hasPotentialPromotion: potential !== definite,
    },
    uncertaintyMetadata: {
      hasUncertainTraces: uncertainTraces.length > 0,
      hasBracketTraces: bracketTraces.length > 0,
      uncertainTraceCount: uncertainTraces.length,
      bracketTraceCount: bracketTraces.length,
      totalTraceCount:
        immediateTraces.length +
        residualTraces.length +
        historicalTraces.length +
        bracketTraces.length +
        uncertainTraces.length,
      eligibleResidualTraceCount:
        immediateTraces.length +
        residualTraces.length +
        historicalTraces.length +
        bracketTraces.length,
    },
  };
}

export function runBodyLoadPresentationMapperTests(): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let allPassed = true;

  function assert(condition: boolean, desc: string) {
    if (!condition) {
      allPassed = false;
      details.push(`[FAIL] ${desc}`);
    } else {
      details.push(`[PASS] ${desc}`);
    }
  }

  // 1. Immediate evidence present -> '최근 부하'
  const stateImmediate = createMockDimensionState({
    dimension: 'knee-dominant-lower-body',
    immediateCount: 1,
  });
  const resImmediate = mapSingleDimensionLoad('knee-dominant-lower-body', stateImmediate);
  assert(resImmediate.status === '최근 부하', 'Immediate evidence maps to 최근 부하');
  assert(
    resImmediate.isImmediate === true && resImmediate.isResidual === false,
    'Immediate boolean flags consistent'
  );

  // 2. Residual evidence present -> '잔여 부하'
  const stateResidual = createMockDimensionState({
    dimension: 'horizontal-push',
    residualCount: 1,
  });
  const resResidual = mapSingleDimensionLoad('horizontal-push', stateResidual);
  assert(resResidual.status === '잔여 부하', 'Residual evidence maps to 잔여 부하');
  assert(
    resResidual.isResidual === true && resResidual.isImmediate === false,
    'Residual boolean flags consistent'
  );

  // 3. Historical evidence present without potential active load -> '최근 부하 근거 없음'
  const stateHistorical = createMockDimensionState({
    dimension: 'vertical-push',
    historicalCount: 1,
    potential: 'historical',
  });
  const resHistorical = mapSingleDimensionLoad('vertical-push', stateHistorical);
  assert(
    resHistorical.status === '최근 부하 근거 없음',
    'Pure historical evidence maps to 최근 부하 근거 없음'
  );
  assert(
    resHistorical.isHistorical === true && resHistorical.isInsufficient === false,
    'Historical boolean flags consistent'
  );

  // 4. No eligible traces (none) -> '판단 정보 부족'
  const stateEmpty = createMockDimensionState({
    dimension: 'horizontal-pull',
  });
  const resEmpty = mapSingleDimensionLoad('horizontal-pull', stateEmpty);
  assert(resEmpty.status === '판단 정보 부족', 'No traces maps to 판단 정보 부족');
  assert(
    resEmpty.isInsufficient === true && resEmpty.uncertainty.hasUncertainty === false,
    'Empty state has no uncertainty'
  );

  // 5. Data missing / undefined -> '판단 정보 부족'
  const resMissing = mapSingleDimensionLoad('axial-systemic-loading', undefined);
  assert(resMissing.status === '판단 정보 부족', 'Missing state maps to 판단 정보 부족');
  assert(resMissing.isInsufficient === true, 'Missing state flag is isInsufficient: true');

  // 6a. Uncertain evidence only (uncomputed same-day missing time)
  // Strict check: NOT promoted to confirmed ('최근 부하' / '잔여 부하') and NOT treated as recovered ('최근 부하 근거 없음')
  const stateUncertainOnly = createMockDimensionState({
    dimension: 'hip-posterior-chain',
    uncertainCount: 1,
  });
  const resUncertainOnly = mapSingleDimensionLoad('hip-posterior-chain', stateUncertainOnly);
  assert(
    resUncertainOnly.status === '판단 정보 부족',
    'Uncertain-only traces remain 판단 정보 부족 without promotion or false recovery'
  );
  assert(
    resUncertainOnly.uncertainty.hasUncertainty === true,
    'Uncertainty flag preserved when uncertain traces present'
  );
  assert(resUncertainOnly.uncertainty.hasUncertainTraces === true, 'hasUncertainTraces flag is true');

  // 6b. Bracket evidence only (bracket-ordinal threshold crossing)
  const stateBracketOnly = createMockDimensionState({
    dimension: 'vertical-pull',
    bracketCount: 1,
    potential: 'residual',
  });
  const resBracketOnly = mapSingleDimensionLoad('vertical-pull', stateBracketOnly);
  assert(
    resBracketOnly.status === '판단 정보 부족',
    'Bracket-only traces remain 판단 정보 부족 without promotion to confirmed'
  );
  assert(resBracketOnly.uncertainty.hasUncertainty === true, 'Bracket uncertainty flag preserved');
  assert(resBracketOnly.uncertainty.hasBracketTraces === true, 'hasBracketTraces flag is true');

  // 7a. Confirmed immediate + Uncertain coexistence
  // Strict check: preserves confirmed status AND uncertainty flag
  const stateCoexistImmediate = createMockDimensionState({
    dimension: 'knee-dominant-lower-body',
    immediateCount: 1,
    uncertainCount: 1,
  });
  const resCoexistImmediate = mapSingleDimensionLoad(
    'knee-dominant-lower-body',
    stateCoexistImmediate
  );
  assert(
    resCoexistImmediate.status === '최근 부하',
    'Coexisting immediate + uncertain preserves confirmed status 최근 부하'
  );
  assert(
    resCoexistImmediate.uncertainty.hasUncertainty === true,
    'Coexisting immediate + uncertain preserves uncertainty flag'
  );

  // 7b. Confirmed residual + Bracket coexistence
  const stateCoexistResidual = createMockDimensionState({
    dimension: 'horizontal-push',
    residualCount: 1,
    bracketCount: 1,
    potential: 'immediate',
  });
  const resCoexistResidual = mapSingleDimensionLoad('horizontal-push', stateCoexistResidual);
  assert(
    resCoexistResidual.status === '잔여 부하',
    'Coexisting residual + bracket preserves confirmed status 잔여 부하'
  );
  assert(
    resCoexistResidual.uncertainty.hasUncertainty === true,
    'Coexisting residual + bracket preserves uncertainty flag'
  );

  // 8. uncertainSameDaySessionCount preservation without guessing body parts
  const mockAllStates: AllDimensionResidualStates = {} as any;
  for (const dim of CANONICAL_STRESS_DIMENSIONS) {
    (mockAllStates as any)[dim] = createMockDimensionState({ dimension: dim });
  }
  const bodyLoadWithExcluded = mapBodyLoadPresentation(mockAllStates, 2);
  assert(bodyLoadWithExcluded.uncertainSameDaySessionCount === 2, 'uncertainSameDaySessionCount is 2');
  assert(
    bodyLoadWithExcluded.hasUncertainty === true,
    'Top-level hasUncertainty is true due to excluded sessions'
  );
  assert(bodyLoadWithExcluded.dimensions.length === 7, 'Exactly seven canonical dimensions preserved');
  assert(
    bodyLoadWithExcluded.dimensions.every((d) => d.status === '판단 정보 부족'),
    'No arbitrary body parts guessed for excluded sessions'
  );

  // 9. Historical Replay: Zero future data leakage at fixed evaluation point
  const historicalLogs: WorkoutLog[] = [
    {
      id: 'log-past-1',
      date: '2026-08-19',
      startTime: '10:00:00',
      routineName: '스쿼트 데이',
      notes: '',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's1', weight: 100, reps: 5, completed: true } as any],
        },
      ],
    },
    {
      id: 'log-past-2',
      date: '2026-08-20',
      startTime: '08:00:00',
      routineName: '모닝 벤치',
      notes: '',
      exercises: [
        {
          exerciseId: 'bench_press',
          exerciseName: '벤치프레스',
          category: 'Chest',
          sets: [{ id: 's2', weight: 80, reps: 5, completed: true } as any],
        },
      ],
    },
    {
      id: 'log-future-1',
      date: '2026-08-20',
      startTime: '18:00:00', // 6 hours after evaluation instant (12:00)
      routineName: '미래 데드리프트',
      notes: '',
      exercises: [
        {
          exerciseId: 'deadlift',
          exerciseName: '데드리프트',
          category: 'Back',
          sets: [{ id: 's3', weight: 140, reps: 5, completed: true } as any],
        },
      ],
    },
  ];

  const evalPoint: HistoricalEvaluationPoint = {
    pointId: 'eval-zero-future-leak',
    kind: 'pre-session',
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    evaluationCalendarDate: '2026-08-20',
    evaluationLocalTime: '12:00:00',
    evaluationTimezone: 'Asia/Seoul',
    hasChronologyUncertainty: false,
  };

  const replayResult = evaluateSingleHistoricalPoint(historicalLogs, evalPoint);

  assert(
    Boolean(replayResult.dimensionResidualStates),
    'HistoricalReplayResult exposes dimensionResidualStates'
  );
  assert(
    replayResult.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount === 1,
    'Exactly 1 future log excluded'
  );
  assert(
    replayResult.availableHistoricalEvidenceCount.eligibleWorkoutLogCount === 2,
    'Exactly 2 past logs eligible'
  );

  const replayBodyLoad = mapBodyLoadFromReplayResult(replayResult);
  assert(replayBodyLoad.dimensions.length === 7, 'Replay bodyLoad has 7 dimensions');

  // Verify future deadlift (hip-posterior-chain & axial-systemic) is NOT present as immediate stress from the future log
  // bench_press (at 08:00, 4h elapsed) is immediate on horizontal-push
  const benchDim = replayBodyLoad.dimensions.find((d) => d.dimension === 'horizontal-push');
  assert(
    benchDim?.status === '최근 부하',
    'Bench press at 08:00 is correctly evaluated as 최근 부하 at 12:00'
  );

  // deadlift at 18:00 is future; verify hip-posterior-chain does not have immediate burden from future deadlift
  const hipDim = replayBodyLoad.dimensions.find((d) => d.dimension === 'hip-posterior-chain');
  assert(
    hipDim?.status !== '최근 부하',
    'Future deadlift at 18:00 did NOT leak into 12:00 evaluation as 최근 부하'
  );

  // 10. End-to-end evaluateVNextProduction exposure
  const prodResult = evaluateVNextProduction(historicalLogs, {
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    calendarDate: '2026-08-20',
    timezone: 'Asia/Seoul',
  });

  assert(Boolean(prodResult.presentation.bodyLoad), 'RecommendationResult exposes bodyLoad');
  assert(
    prodResult.presentation.bodyLoad?.dimensions.length === 7,
    'prodResult.presentation.bodyLoad has 7 dimensions'
  );

  return { passed: allPassed, details };
}

// Direct execution when invoked via tsx
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1]?.includes('bodyLoadPresentationMapper.test')
) {
  const result = runBodyLoadPresentationMapperTests();
  console.log('=== Body Load Presentation Mapper Unit Tests ===');
  for (const line of result.details) {
    console.log(line);
  }
  console.log(`\nOverall Result: ${result.passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  if (!result.passed) process.exit(1);
}
