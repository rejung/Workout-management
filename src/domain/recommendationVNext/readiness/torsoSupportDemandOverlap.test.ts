/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Torso Support Demand Overlap Test Suite (VNext Recommendation Engine - Phase 2)
 *
 * Verifies the kinesiological connection between Conventional Deadlift and Bent-Over Barbell Row
 * via shared non-externally supported torso stabilization and erector spinae involvement.
 *
 * Mandatory Verification Matrix:
 * A. 18h Deadlift -> Barbell Row: Direct dimensions clear -> caution via structural overlap.
 * B. 18h Barbell Row -> Deadlift: If already constrained by direct load, remains constrained;
 *    overlap evidence added without duplicate stage elevation or hardblock.
 * C. Temporal boundaries (24h residual, 72h historical, future records):
 *    Historical (>=72h) creates zero constraint (evaluates to clear); future excluded.
 * D. Chronology / timestamp uncertainty: Preserved as uncertain without false immediate certainty.
 * E. Variation safety: Chest-supported row, RDL, and unconfirmed variants rejected.
 * F. Multi-dimension trace deduplication: Single workout session projecting to multiple dimensions
 *    generates exactly one structural overlap.
 * G. Same-day distinct sessions: Separate workout sessions are losslessly preserved.
 * H. Existing Press-pattern overlap: Bench <-> OHP relationship unaffected.
 * I. Zero leakage into training need, volume, or rest decision evidence.
 * J. Production Integration: evaluateVNextProduction demonstrates readiness differentiation
 *    arbitrated cleanly under Rule 7 when need and opportunity are equivalent.
 */

import { deriveEvaluationContext, deriveResidualStressTraces } from '../stress/residualStressTrace';
import { deriveAllDimensionResidualStates } from '../stress/dimensionResidualState';
import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { deriveCandidateReadinessEvidence } from './candidateReadiness';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { deriveCandidateTrainingNeedEvidence } from '../need/candidateTrainingNeed';
import { evaluateVNextProduction } from '../production/productionRecommendationService';
import { DEFAULT_EXERCISES } from '../../../constants';
import { WorkoutLog } from '../../../types';

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export function runTorsoSupportDemandTestSuite(): {
  readonly allPassed: boolean;
  readonly results: readonly TestResult[];
} {
  const results: TestResult[] = [];
  function assert(name: string, condition: boolean, details: string) {
    results.push({ name, passed: condition, details });
  }

  const evalContext = deriveEvaluationContext({
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    evaluationTimezone: 'Asia/Seoul',
  });

  function buildStatesFromInputs(inputs: readonly StressMagnitudeInput[]) {
    const projections: UnifiedDimensionProjectedStress[] = [];
    for (const inp of inputs) {
      if (inp.kind === 'strength') {
        for (const dim of inp.dimensions) {
          projections.push({
            kind: 'dimension-projected-strength-stress',
            sourceLogId: inp.sourceLogId,
            dimension: dim,
            date: inp.date,
            startTime: inp.startTime,
            exerciseId: inp.exerciseId,
            exerciseName: inp.exerciseName,
            associatedDimensions: inp.dimensions,
            sourceSessionMagnitude: inp as any,
          });
        }
      }
    }
    const traceCollection = deriveResidualStressTraces(projections, evalContext);
    return deriveAllDimensionResidualStates(traceCollection.traces, evalContext);
  }

  // =========================================================================
  // Case A: 18h Deadlift -> Barbell Row (clear -> caution)
  // =========================================================================
  {
    // Deadlift 18h ago (2026-08-19 18:00 vs eval 2026-08-20 12:00)
    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-18h',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([dlSession]);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', states, evalContext);

    const hasTorsoOverlap = rowReadiness.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap' && o.sourceExerciseId === 'deadlift' && o.persistence === 'immediate'
    );

    assert(
      'Case A: 18h Deadlift -> Barbell Row transitions clear to caution via torso support demand overlap',
      rowReadiness.clearDimensions.includes('horizontal-pull') &&
        rowReadiness.definiteImmediateDimensions.length === 0 &&
        rowReadiness.definiteResidualDimensions.length === 0 &&
        hasTorsoOverlap &&
        rowReadiness.overallReadinessClass === 'caution',
      `Overall: ${rowReadiness.overallReadinessClass}, HasTorsoOverlap: ${hasTorsoOverlap}, ClearDims: [${rowReadiness.clearDimensions.join(', ')}]`
    );
  }

  // =========================================================================
  // Case B: 18h Barbell Row -> Deadlift (constrained remains constrained)
  // =========================================================================
  {
    // Barbell Row 18h ago
    const rowSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-row-18h',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'barbell_row',
      exerciseName: '바벨 로우',
      dimensions: ['horizontal-pull'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    // Also a direct acute Squat session 6h ago (creating direct immediate stress on hip-posterior-chain & axial)
    const squatSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sq-6h',
      date: '2026-08-20',
      startTime: '06:00',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([rowSession, squatSession]);
    const dlReadiness = deriveCandidateReadinessEvidence('deadlift', states, evalContext);

    const hasRowOverlap = dlReadiness.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap' && o.sourceExerciseId === 'barbell_row'
    );

    assert(
      'Unit Case B: 18h Barbell Row + 6h Squat -> Deadlift preserves constrained status without stage elevation or hardblock',
      dlReadiness.overallReadinessClass === 'constrained' &&
        dlReadiness.hardConstraintBoundary.isHardBlocked === false &&
        hasRowOverlap,
      `Overall: ${dlReadiness.overallReadinessClass}, isHardBlocked: ${dlReadiness.hardConstraintBoundary.isHardBlocked}, hasRowOverlap: ${hasRowOverlap}`
    );
  }

  // =========================================================================
  // Case C: Temporal boundaries (24-72h residual, >=72h historical, future)
  // =========================================================================
  {
    // D+1 residual Deadlift: 36h ago (2026-08-19 00:00 vs eval 2026-08-20 12:00)
    const dlResidual: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-36h',
      date: '2026-08-19',
      startTime: '00:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };
    const statesResidual = buildStatesFromInputs([dlResidual]);
    const rowResidual = deriveCandidateReadinessEvidence('barbell_row', statesResidual, evalContext);

    // D+4 historical Deadlift: 96h ago (2026-08-16 12:00 vs eval 2026-08-20 12:00)
    const dlHistorical: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-96h',
      date: '2026-08-16',
      startTime: '12:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };
    const statesHistorical = buildStatesFromInputs([dlHistorical]);
    const rowHistorical = deriveCandidateReadinessEvidence('barbell_row', statesHistorical, evalContext);

    assert(
      'Case C: 24h-72h residual yields caution; >=72h historical does NOT constrain (yields clear)',
      rowResidual.overallReadinessClass === 'caution' &&
        rowResidual.structuralOverlaps.some((o) => o.persistence === 'residual') &&
        rowHistorical.overallReadinessClass === 'clear' &&
        rowHistorical.hasStructuralOverlap === false &&
        rowHistorical.structuralOverlaps.every((o) => o.persistence === 'historical'),
      `Residual: ${rowResidual.overallReadinessClass}, Historical: ${rowHistorical.overallReadinessClass}, Historical hasActive: ${rowHistorical.hasStructuralOverlap}`
    );
  }

  // =========================================================================
  // Case D: Chronology uncertainty (missing startTime)
  // =========================================================================
  {
    // Same-day Deadlift missing startTime
    const dlUncertain: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-uncertain',
      date: '2026-08-20',
      startTime: undefined,
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([dlUncertain]);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', states, evalContext);

    const overlap = rowReadiness.structuralOverlaps.find((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Case D: Timestamp uncertainty preserved as uncertain persistence without asserting immediate certainty',
      overlap !== undefined &&
        overlap.persistence === 'uncertain' &&
        rowReadiness.overallReadinessClass === 'caution',
      `Persistence: ${overlap?.persistence}, Overall: ${rowReadiness.overallReadinessClass}`
    );
  }

  // =========================================================================
  // Case E: Variation safety (chest-supported row, RDL, seated row rejected)
  // =========================================================================
  {
    // Chest-supported row 18h ago
    const chestRowSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-chest-row',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'chest_supported_row',
      exerciseName: '체스트 서포티드 로우',
      dimensions: ['horizontal-pull'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    // RDL 18h ago
    const rdlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-rdl',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'rdl',
      exerciseName: '로마니안 데드리프트',
      dimensions: ['hip-posterior-chain'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    // Contradictory entry: exerciseId says deadlift, but name says 체스트 서포티드 로우
    const conflictingSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-conflict',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: '체스트 서포티드 로우',
      dimensions: ['hip-posterior-chain'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([chestRowSession, rdlSession, conflictingSession]);
    const dlReadiness = deriveCandidateReadinessEvidence('deadlift', states, evalContext);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', states, evalContext);

    const dlHasTorsoOverlap = dlReadiness.structuralOverlaps.some((o) => o.relation === 'torso-support-demand-overlap');
    const rowHasTorsoOverlap = rowReadiness.structuralOverlaps.some((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Case E: Chest-supported row, RDL, and conflicting variants are safely quarantined and do NOT trigger torso overlap',
      !dlHasTorsoOverlap && !rowHasTorsoOverlap,
      `DL hasTorsoOverlap: ${dlHasTorsoOverlap}, Row hasTorsoOverlap: ${rowHasTorsoOverlap}`
    );
  }

  // =========================================================================
  // Case F: Multi-dimension trace deduplication
  // =========================================================================
  {
    // A single Deadlift session projects to both hip-posterior-chain and axial-systemic-loading
    const singleDlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-multi-dim',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 5, explicitWorkingSetCount: 5, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([singleDlSession]);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', states, evalContext);

    const torsoOverlaps = rowReadiness.structuralOverlaps.filter((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Case F: Multi-dimension projections from a single workout log produce exactly ONE structural overlap',
      torsoOverlaps.length === 1 && torsoOverlaps[0].sourceTraceRefs.length >= 2,
      `Torso overlap count: ${torsoOverlaps.length}, Traces referenced: ${torsoOverlaps[0]?.sourceTraceRefs.length}`
    );
  }

  // =========================================================================
  // Case G: Same-day distinct sessions are preserved
  // =========================================================================
  {
    // Two distinct Deadlift sessions on the same date (morning and evening)
    const morningDl: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-morning',
      date: '2026-08-19',
      startTime: '09:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };
    const eveningDl: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-evening',
      date: '2026-08-19',
      startTime: '19:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([morningDl, eveningDl]);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', states, evalContext);

    const torsoOverlaps = rowReadiness.structuralOverlaps.filter((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Case G: Distinct workout sessions on the same date are both losslessly preserved in structural overlaps',
      torsoOverlaps.length === 2 &&
        torsoOverlaps.some((o) => o.sourceLogId === 'log-dl-morning') &&
        torsoOverlaps.some((o) => o.sourceLogId === 'log-dl-evening'),
      `Overlaps preserved: ${torsoOverlaps.length}, LogIds: [${torsoOverlaps.map((o) => o.sourceLogId).join(', ')}]`
    );
  }

  // =========================================================================
  // Case H: Press-pattern overlap intact
  // =========================================================================
  {
    // OHP 18h ago
    const ohpSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-ohp-18h',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'overhead_press',
      exerciseName: '오버헤드 프레스',
      dimensions: ['vertical-push', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const states = buildStatesFromInputs([ohpSession]);
    const benchReadiness = deriveCandidateReadinessEvidence('bench_press', states, evalContext);

    const hasPressOverlap = benchReadiness.structuralOverlaps.some((o) => o.relation === 'press-pattern-overlap');
    const hasTorsoOverlap = benchReadiness.structuralOverlaps.some((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Case H: Existing Bench <-> OHP press pattern overlap continues to function and does not cross-trigger torso overlap',
      hasPressOverlap && !hasTorsoOverlap && benchReadiness.overallReadinessClass === 'caution',
      `HasPressOverlap: ${hasPressOverlap}, HasTorsoOverlap: ${hasTorsoOverlap}, Overall: ${benchReadiness.overallReadinessClass}`
    );
  }

  // =========================================================================
  // Case I: Zero contamination of training need, session count, or rest metrics
  // =========================================================================
  {
    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-i',
      date: '2026-08-19',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
    };

    const rowNeed = deriveCandidateTrainingNeedEvidence('barbell_row', [dlSession], evalContext);

    assert(
      'Case I: Deadlift exposure does NOT count towards Barbell Row training need satisfaction or session counts',
      rowNeed.historicalContext.totalHistoricalSessionCount === 0 &&
        rowNeed.historicalContext.isColdStart === true &&
        rowNeed.recency.calendarDaysSinceLastPerformed === undefined &&
        rowNeed.recency.lastPerformedDate === undefined &&
        rowNeed.needClass === 'insufficient-history',
      `ColdStart: ${rowNeed.historicalContext.isColdStart}, TotalHistoryCount: ${rowNeed.historicalContext.totalHistoricalSessionCount}, NeedClass: ${rowNeed.needClass}`
    );
  }

  // =========================================================================
  // Case J: Production Integration (evaluateVNextProduction Rule 7 Arbitration)
  // =========================================================================
  {
    // Both Bench Press and Barbell Row performed 5 days ago (2026-08-15) -> Both are available in regular rotation
    // Deadlift performed 18h ago (2026-08-19 18:00)
    const logs: WorkoutLog[] = [
      {
        id: 'log-bench-past',
        date: '2026-08-15',
        startTime: '10:00',
        routineName: '가슴 훈련',
        notes: '',
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: '벤치프레스',
            category: 'Chest',
            sets: [{ id: 'sb1', reps: 5, weight: 100, isWarmup: false }],
          },
        ],
      },
      {
        id: 'log-row-past',
        date: '2026-08-15',
        startTime: '11:00',
        routineName: '등 훈련',
        notes: '',
        exercises: [
          {
            exerciseId: 'barbell_row',
            exerciseName: '바벨 로우',
            category: 'Back',
            sets: [{ id: 'sr1', reps: 5, weight: 80, isWarmup: false }],
          },
        ],
      },
      {
        id: 'log-dl-recent',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: '데드리프트 훈련',
        notes: '',
        exercises: [
          {
            exerciseId: 'deadlift',
            exerciseName: '데드리프트',
            category: 'Back',
            sets: [{ id: 'sd1', reps: 5, weight: 140, isWarmup: false }],
          },
        ],
      },
    ];

    const prodResult = evaluateVNextProduction(logs, {
      evaluationInstant: '2026-08-20T12:00:00+09:00',
      calendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    const candidateSet = prodResult.replayResult.candidateDecisionSet;
    const rowCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'barbell_row');
    const benchCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'bench_press');

    // Both Bench Press and Barbell Row have equal training need ('available')
    // Because Bench Press has clear readiness and Barbell Row has caution (via torso support demand overlap),
    // Bench Press is preferred (Case E) and Barbell Row is viable (Case F). Rule 7 favors Bench Press!
    const rowIsCaution = rowCand?.readinessEvidence.overallReadinessClass === 'caution';
    const benchIsClear = benchCand?.readinessEvidence.overallReadinessClass === 'clear';
    const isBenchPreferred = benchCand?.decisionClass === 'preferred';
    const isRowViable = rowCand?.decisionClass === 'viable';
    const isBenchFirstPreferred = candidateSet.todayDecision.preferredCandidates[0]?.candidateExerciseId === 'bench_press';

    assert(
      'Case J: evaluateVNextProduction successfully arbitrates Rule 7 favoring clear Bench Press over caution Barbell Row',
      rowIsCaution === true &&
        benchIsClear === true &&
        isBenchPreferred === true &&
        isRowViable === true &&
        isBenchFirstPreferred === true,
      `RowReadiness: ${rowCand?.readinessEvidence.overallReadinessClass} (Decision: ${rowCand?.decisionClass}), BenchReadiness: ${benchCand?.readinessEvidence.overallReadinessClass} (Decision: ${benchCand?.decisionClass}), Preferred#1: ${candidateSet.todayDecision.preferredCandidates[0]?.candidateExerciseId}`
    );
  }

  // =========================================================================
  // OPERATIONAL INTEGRATION SUITE (evaluateVNextProduction + constants.ts IDs)
  // =========================================================================
  const defaultBarbellRow = DEFAULT_EXERCISES.find((e) => e.id === 'barbell-row')!;
  const defaultDeadlift = DEFAULT_EXERCISES.find((e) => e.id === 'deadlift')!;
  const defaultSquat = DEFAULT_EXERCISES.find((e) => e.id === 'squat')!;
  const defaultBench = DEFAULT_EXERCISES.find((e) => e.id === 'bench-press')!;
  const defaultRdl = DEFAULT_EXERCISES.find((e) => e.id === 'romanian-deadlift')!;
  const defaultSeatedRow = DEFAULT_EXERCISES.find((e) => e.id === 'seated-row')!;
  const defaultDumbbellRow = DEFAULT_EXERCISES.find((e) => e.id === 'dumbbell-row')!;

  const prodEvalOpts = {
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    calendarDate: '2026-08-20',
    timezone: 'Asia/Seoul',
  };

  // =========================================================================
  // Prod-A: Default ID barbell-row -> deadlift (caution when no direct constraint)
  // =========================================================================
  {
    const logs: WorkoutLog[] = [
      {
        id: 'prod-log-row-only',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: '등 훈련',
        notes: '',
        exercises: [
          {
            exerciseId: defaultBarbellRow.id, // 'barbell-row'
            exerciseName: defaultBarbellRow.name, // '바벨 로우 (Barbell Row)'
            category: defaultBarbellRow.category,
            sets: [{ id: 's1', reps: 8, weight: 70, isWarmup: false }],
          },
        ],
      },
    ];

    const prodResult = evaluateVNextProduction(logs, prodEvalOpts);
    const dlCand = prodResult.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );
    const overlap = dlCand?.readinessEvidence.structuralOverlaps.find(
      (o) => o.relation === 'torso-support-demand-overlap'
    );

    assert(
      'Prod-A: Default ID barbell-row -> deadlift produces torso overlap and caution when direct dimensions are clear',
      dlCand !== undefined &&
        overlap !== undefined &&
        overlap.sourceExerciseId === 'barbell-row' &&
        overlap.sourceExerciseName === defaultBarbellRow.name &&
        overlap.persistence === 'immediate' &&
        dlCand.readinessEvidence.clearDimensions.includes('hip-posterior-chain') &&
        dlCand.readinessEvidence.clearDimensions.includes('axial-systemic-loading') &&
        dlCand.readinessEvidence.overallReadinessClass === 'caution',
      `DL Readiness: ${dlCand?.readinessEvidence.overallReadinessClass}, SourceId: ${overlap?.sourceExerciseId}, SourceName: ${overlap?.sourceExerciseName}, Persistence: ${overlap?.persistence}`
    );
  }

  // =========================================================================
  // Prod-B: Default ID deadlift -> barbell_row candidate
  // =========================================================================
  {
    const logs: WorkoutLog[] = [
      {
        id: 'prod-log-dl-only',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: '데드리프트 훈련',
        notes: '',
        exercises: [
          {
            exerciseId: defaultDeadlift.id, // 'deadlift'
            exerciseName: defaultDeadlift.name, // '데드리프트 (Deadlift)'
            category: defaultDeadlift.category,
            sets: [{ id: 's1', reps: 5, weight: 140, isWarmup: false }],
          },
        ],
      },
    ];

    const prodResult = evaluateVNextProduction(logs, prodEvalOpts);
    const rowCand = prodResult.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'barbell_row'
    );
    const overlap = rowCand?.readinessEvidence.structuralOverlaps.find(
      (o) => o.relation === 'torso-support-demand-overlap'
    );

    assert(
      'Prod-B: Default ID deadlift -> barbell_row preserves existing torso overlap direction and provenance',
      rowCand !== undefined &&
        overlap !== undefined &&
        overlap.sourceExerciseId === 'deadlift' &&
        overlap.sourceExerciseName === defaultDeadlift.name &&
        overlap.persistence === 'immediate' &&
        rowCand.readinessEvidence.clearDimensions.includes('horizontal-pull') &&
        rowCand.readinessEvidence.overallReadinessClass === 'caution',
      `Row Readiness: ${rowCand?.readinessEvidence.overallReadinessClass}, SourceId: ${overlap?.sourceExerciseId}, SourceName: ${overlap?.sourceExerciseName}`
    );
  }

  // =========================================================================
  // Prod-C: Same-day missing startTime deadlift -> barbell_row (uncertain, max caution, no contamination)
  // =========================================================================
  {
    const logs: WorkoutLog[] = [
      {
        id: 'prod-log-dl-notime-today',
        date: '2026-08-20',
        // startTime omitted intentionally
        routineName: '당일 시간 미지정 데드리프트',
        notes: '',
        exercises: [
          {
            exerciseId: defaultDeadlift.id,
            exerciseName: defaultDeadlift.name,
            category: defaultDeadlift.category,
            sets: [{ id: 's1', reps: 5, weight: 140, isWarmup: false }],
          },
        ],
      },
    ];

    const prodResult = evaluateVNextProduction(logs, prodEvalOpts);
    const candidateSet = prodResult.replayResult.candidateDecisionSet;
    const rowCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'barbell_row');
    const dlCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'deadlift');
    const squatCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'squat');
    const ohpCand = candidateSet.candidates.find((c) => c.candidateExerciseId === 'overhead_press');

    const rowOverlap = rowCand?.readinessEvidence.structuralOverlaps.find(
      (o) => o.relation === 'torso-support-demand-overlap'
    );
    const tracesAreUncertain =
      rowOverlap !== undefined &&
      rowOverlap.sourceTraceRefs.length >= 2 &&
      rowOverlap.sourceTraceRefs.every(
        (t) =>
          t.occurrenceState === 'occurrence-uncertain' &&
          t.elapsedTime.kind === 'unavailable' &&
          t.temporalAttenuation.kind === 'uncomputed'
      );

    // Must NOT be treated as completed session today, nor counted in eligible logs/volume/need,
    // nor alter direct readiness of deadlift/squat/ohp
    const notCompletedToday =
      prodResult.decision.kind === 'train' &&
      prodResult.replayResult.restDecisionEvidence.recentTrainingContext
        .consecutiveTrainingDayContext.isSameDaySessionCompleted === false &&
      prodResult.replayResult.restDecisionEvidence.recentTrainingContext.recentSessionCount === 0;
    const notCountedInEligibleOrNeed =
      prodResult.replayResult.availableHistoricalEvidenceCount.eligibleWorkoutLogCount === 0 &&
      dlCand?.trainingNeedEvidence.historicalContext.totalHistoricalSessionCount === 0 &&
      rowCand?.trainingNeedEvidence.historicalContext.totalHistoricalSessionCount === 0;
    const otherDirectReadinessUnchanged =
      dlCand?.readinessEvidence.overallReadinessClass === 'clear' &&
      squatCand?.readinessEvidence.overallReadinessClass === 'clear' &&
      ohpCand?.readinessEvidence.overallReadinessClass === 'clear';

    // Forward projection (next day 2026-08-21) also uses the exact same evaluateSingleHistoricalPoint pipeline
    // where 2026-08-20 becomes calendar-bounded prior date -> bracket overlap on barbell_row
    const projRowCand = prodResult.projectedSession?.underlyingCandidateSet?.candidates.find(
      (c) => c.candidateExerciseId === 'barbell_row'
    );
    const projHasTorsoOverlap = projRowCand?.readinessEvidence.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap' && o.persistence === 'bracket'
    );

    assert(
      'Prod-C: Same-day missing-time deadlift -> row preserves uncertain overlap (max caution) without completed-session or direct-load contamination',
      rowOverlap !== undefined &&
        rowOverlap.persistence === 'uncertain' &&
        tracesAreUncertain &&
        rowCand?.readinessEvidence.overallReadinessClass === 'caution' &&
        rowCand?.readinessEvidence.clearDimensions.includes('horizontal-pull') &&
        notCompletedToday &&
        notCountedInEligibleOrNeed &&
        otherDirectReadinessUnchanged &&
        projHasTorsoOverlap === true,
      `RowReadiness: ${rowCand?.readinessEvidence.overallReadinessClass}, Persistence: ${rowOverlap?.persistence}, DecisionKind: ${prodResult.decision.kind}, EligibleLogs: ${prodResult.replayResult.availableHistoricalEvidenceCount.eligibleWorkoutLogCount}, DLReadiness: ${dlCand?.readinessEvidence.overallReadinessClass}, ProjBracketOverlap: ${projHasTorsoOverlap}`
    );
  }

  // =========================================================================
  // Prod-D: Future deadlift (same-day later & next-day) produces zero torso overlap
  // =========================================================================
  {
    const logs: WorkoutLog[] = [
      {
        id: 'prod-log-dl-same-day-future',
        date: '2026-08-20',
        startTime: '18:00', // 6h AFTER eval 12:00
        routineName: '당일 미래 데드리프트',
        notes: '',
        exercises: [
          {
            exerciseId: defaultDeadlift.id,
            exerciseName: defaultDeadlift.name,
            category: defaultDeadlift.category,
            sets: [{ id: 's1', reps: 5, weight: 140, isWarmup: false }],
          },
        ],
      },
      {
        id: 'prod-log-dl-next-day-future',
        date: '2026-08-21',
        // no startTime, future calendar day
        routineName: '익일 미래 데드리프트',
        notes: '',
        exercises: [
          {
            exerciseId: defaultDeadlift.id,
            exerciseName: defaultDeadlift.name,
            category: defaultDeadlift.category,
            sets: [{ id: 's2', reps: 5, weight: 140, isWarmup: false }],
          },
        ],
      },
    ];

    const prodResult = evaluateVNextProduction(logs, prodEvalOpts);
    const rowCand = prodResult.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'barbell_row'
    );
    const hasTorsoOverlap = rowCand?.readinessEvidence.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap'
    );

    assert(
      'Prod-D: Future deadlift (same-day later & future date) produces zero torso overlap and remains clear',
      hasTorsoOverlap === false &&
        rowCand?.readinessEvidence.overallReadinessClass === 'clear' &&
        prodResult.replayResult.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount === 2,
      `HasTorsoOverlap: ${hasTorsoOverlap}, RowReadiness: ${rowCand?.readinessEvidence.overallReadinessClass}, ExcludedFutureLogs: ${prodResult.replayResult.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount}`
    );
  }

  // =========================================================================
  // Prod-E: Row only (caution) vs Row + recent Squat (constrained preserved)
  // =========================================================================
  {
    const rowOnlyLog: WorkoutLog = {
      id: 'prod-log-e-row',
      date: '2026-08-19',
      startTime: '18:00',
      routineName: '등 훈련',
      notes: '',
      exercises: [
        {
          exerciseId: defaultBarbellRow.id,
          exerciseName: defaultBarbellRow.name,
          category: defaultBarbellRow.category,
          sets: [{ id: 's1', reps: 8, weight: 75, isWarmup: false }],
        },
      ],
    };

    const recentSquatLog: WorkoutLog = {
      id: 'prod-log-e-squat',
      date: '2026-08-20',
      startTime: '06:00',
      routineName: '하체 훈련',
      notes: '',
      exercises: [
        {
          exerciseId: defaultSquat.id,
          exerciseName: defaultSquat.name,
          category: defaultSquat.category,
          sets: [{ id: 's2', reps: 5, weight: 120, isWarmup: false }],
        },
      ],
    };

    const resRowOnly = evaluateVNextProduction([rowOnlyLog], prodEvalOpts);
    const resRowPlusSquat = evaluateVNextProduction([rowOnlyLog, recentSquatLog], prodEvalOpts);

    const dlRowOnly = resRowOnly.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );
    const dlRowPlusSquat = resRowPlusSquat.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );

    const rowOnlyHasOverlap = dlRowOnly?.readinessEvidence.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap' && o.sourceExerciseId === 'barbell-row'
    );
    const rowPlusSquatHasOverlap = dlRowPlusSquat?.readinessEvidence.structuralOverlaps.some(
      (o) => o.relation === 'torso-support-demand-overlap' && o.sourceExerciseId === 'barbell-row'
    );

    assert(
      'Prod-E: Row-only yields caution on Deadlift; Row + recent Squat preserves constrained without elevation or hardblock',
      rowOnlyHasOverlap === true &&
        dlRowOnly?.readinessEvidence.overallReadinessClass === 'caution' &&
        rowPlusSquatHasOverlap === true &&
        dlRowPlusSquat?.readinessEvidence.overallReadinessClass === 'constrained' &&
        dlRowPlusSquat?.readinessEvidence.hardConstraintBoundary.isHardBlocked === false,
      `RowOnly DL: ${dlRowOnly?.readinessEvidence.overallReadinessClass} (overlap=${rowOnlyHasOverlap}), Row+Squat DL: ${dlRowPlusSquat?.readinessEvidence.overallReadinessClass} (overlap=${rowPlusSquatHasOverlap}, hardBlocked=${dlRowPlusSquat?.readinessEvidence.hardConstraintBoundary.isHardBlocked})`
    );
  }

  // =========================================================================
  // Prod-F: Default ID vs Internal ID equivalence & variation/conflict rejection
  // =========================================================================
  {
    const benchPastLog: WorkoutLog = {
      id: 'prod-log-f-bench',
      date: '2026-08-15',
      startTime: '10:00',
      routineName: '가슴',
      notes: '',
      exercises: [
        {
          exerciseId: defaultBench.id, // 'bench-press'
          exerciseName: defaultBench.name,
          category: defaultBench.category,
          sets: [{ id: 'sb', reps: 5, weight: 90, isWarmup: false }],
        },
      ],
    };

    const dlPastLog: WorkoutLog = {
      id: 'prod-log-f-dl-past',
      date: '2026-08-15',
      startTime: '11:00',
      routineName: '데드리프트',
      notes: '',
      exercises: [
        {
          exerciseId: defaultDeadlift.id,
          exerciseName: defaultDeadlift.name,
          category: defaultDeadlift.category,
          sets: [{ id: 'sd', reps: 5, weight: 140, isWarmup: false }],
        },
      ],
    };

    const rowDefaultIdLog: WorkoutLog = {
      id: 'prod-log-f-row-default',
      date: '2026-08-19',
      startTime: '18:00',
      routineName: '등',
      notes: '',
      exercises: [
        {
          exerciseId: defaultBarbellRow.id, // 'barbell-row'
          exerciseName: defaultBarbellRow.name, // '바벨 로우 (Barbell Row)'
          category: defaultBarbellRow.category,
          sets: [{ id: 'sr1', reps: 8, weight: 70, isWarmup: false }],
        },
      ],
    };

    const rowInternalIdLog: WorkoutLog = {
      id: 'prod-log-f-row-internal',
      date: '2026-08-19',
      startTime: '18:00',
      routineName: '등',
      notes: '',
      exercises: [
        {
          exerciseId: 'barbell_row',
          exerciseName: '바벨 로우',
          category: 'Back',
          sets: [{ id: 'sr2', reps: 8, weight: 70, isWarmup: false }],
        },
      ],
    };

    const resDefault = evaluateVNextProduction([benchPastLog, dlPastLog, rowDefaultIdLog], prodEvalOpts);
    const resInternal = evaluateVNextProduction([benchPastLog, dlPastLog, rowInternalIdLog], prodEvalOpts);

    const dlFromDefault = resDefault.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );
    const dlFromInternal = resInternal.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );

    const equivalenceMatched =
      dlFromDefault?.readinessEvidence.overallReadinessClass === 'caution' &&
      dlFromInternal?.readinessEvidence.overallReadinessClass === 'caution' &&
      dlFromDefault?.decisionClass === dlFromInternal?.decisionClass &&
      dlFromDefault?.readinessEvidence.structuralOverlaps[0]?.sourceExerciseId === 'barbell-row' &&
      dlFromInternal?.readinessEvidence.structuralOverlaps[0]?.sourceExerciseId === 'barbell_row' &&
      resDefault.decision.kind === resInternal.decision.kind &&
      resDefault.decision.primaryCandidate?.candidateExerciseId ===
        resInternal.decision.primaryCandidate?.candidateExerciseId;

    // Variations, unsupported IDs with supported names, and ID/name conflicts must all be rejected
    const quarantineLogs: WorkoutLog[] = [
      {
        id: 'prod-log-q-rdl',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: 'RDL',
        notes: '',
        exercises: [
          {
            exerciseId: defaultRdl.id, // 'romanian-deadlift'
            exerciseName: defaultRdl.name,
            category: defaultRdl.category,
            sets: [{ id: 'sq1', reps: 8, weight: 100, isWarmup: false }],
          },
        ],
      },
      {
        id: 'prod-log-q-seated-row',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: 'Seated Row',
        notes: '',
        exercises: [
          {
            exerciseId: defaultSeatedRow.id, // 'seated-row'
            exerciseName: defaultSeatedRow.name,
            category: defaultSeatedRow.category,
            sets: [{ id: 'sq2', reps: 10, weight: 60, isWarmup: false }],
          },
        ],
      },
      {
        id: 'prod-log-q-db-row',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: 'DB Row',
        notes: '',
        exercises: [
          {
            exerciseId: defaultDumbbellRow.id, // 'dumbbell-row'
            exerciseName: defaultDumbbellRow.name,
            category: defaultDumbbellRow.category,
            sets: [{ id: 'sq3', reps: 10, weight: 30, isWarmup: false }],
          },
        ],
      },
      {
        id: 'prod-log-q-unsupported-id-supported-name',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: 'Custom Row',
        notes: '',
        exercises: [
          {
            exerciseId: 'custom-unmapped-row-id',
            exerciseName: defaultBarbellRow.name, // Supported name MUST NOT rescue unsupported ID
            category: 'Back',
            sets: [{ id: 'sq4', reps: 8, weight: 60, isWarmup: false }],
          },
        ],
      },
      {
        id: 'prod-log-q-conflict-id-name',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: 'Conflict',
        notes: '',
        exercises: [
          {
            exerciseId: defaultBarbellRow.id, // 'barbell-row'
            exerciseName: '체스트 서포티드 로우', // Variant conflict in name
            category: 'Back',
            sets: [{ id: 'sq5', reps: 8, weight: 60, isWarmup: false }],
          },
          {
            exerciseId: defaultDeadlift.id, // 'deadlift'
            exerciseName: defaultBarbellRow.name, // Cross-exercise conflict in name
            category: 'Back',
            sets: [{ id: 'sq6', reps: 5, weight: 100, isWarmup: false }],
          },
        ],
      },
    ];

    const resQuarantine = evaluateVNextProduction(quarantineLogs, prodEvalOpts);
    const qDl = resQuarantine.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'deadlift'
    );
    const qRow = resQuarantine.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'barbell_row'
    );
    const quarantinePassed =
      !qDl?.readinessEvidence.structuralOverlaps.some((o) => o.relation === 'torso-support-demand-overlap') &&
      !qRow?.readinessEvidence.structuralOverlaps.some((o) => o.relation === 'torso-support-demand-overlap');

    assert(
      'Prod-F: Default ID and internal ID produce identical outcomes while variations, unsupported IDs, and conflicts stay blocked',
      equivalenceMatched && quarantinePassed,
      `Equivalence: ${equivalenceMatched} (DefaultPrimary=${resDefault.decision.primaryCandidate?.candidateExerciseId}, InternalPrimary=${resInternal.decision.primaryCandidate?.candidateExerciseId}), QuarantinePassed: ${quarantinePassed}`
    );
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Standalone execution support
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('torsoSupportDemandOverlap.test')) {
  console.log('==================================================');
  console.log('RUNNING TORSO SUPPORT DEMAND TEST SUITE (PHASE 2)');
  console.log('==================================================');
  const { allPassed, results } = runTorsoSupportDemandTestSuite();
  for (const r of results) {
    console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.details}`);
  }
  console.log(`\nAll Torso Support Demand Tests Passed: ${allPassed} (${results.filter((r) => r.passed).length}/${results.length})`);
  if (!allPassed) {
    process.exit(1);
  }
}
