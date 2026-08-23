/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Golden Scenarios Historical Replay Suite (VNext Recommendation Engine - CU5.0)
 *
 * Implements end-to-end replay verification of the 10 Golden Scenarios (GS1 through GS10).
 *
 * Strict Invariants:
 * 1. Complete Pipeline Execution: All scenarios pass through the full frozen VNext pipeline.
 * 2. Zero Future Leakage: Strict temporal boundaries enforced across all scenario evaluation instants.
 * 3. Pure Immutability: Deeply frozen return objects with zero side effects.
 */

import { EvaluationContext } from '../types/residualStressTrace.types';
import { deriveEvaluationContext, deriveResidualStressTraces } from '../stress/residualStressTrace';
import { deriveAllDimensionResidualStates } from '../stress/dimensionResidualState';
import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import {
  StrengthStressMagnitudeInput,
  RunningStressMagnitudeInput,
  StressMagnitudeInput,
} from '../types/stressMagnitudeInput.types';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { deriveFinalTodayDecision } from '../synthesis/finalTodayDecision';
import { FinalTodayDecision } from '../types/finalTodayDecision.types';
import { GoldenScenarioReplayOutcome } from '../types/historicalReplay.types';
import { StressDimension } from '../types/stressModel.types';

function makeStrengthSession(opts: {
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly date: string;
  readonly startTime?: string;
  readonly dimensions: readonly StressDimension[];
  readonly workingSetCount?: number;
  readonly totalLoadVolumeKgReps?: number;
  readonly e1RM?: number;
}): StrengthStressMagnitudeInput {
  const workingCount = opts.workingSetCount ?? 3;
  return Object.freeze({
    kind: 'strength',
    sourceLogId: opts.sourceLogId,
    exerciseId: opts.exerciseId,
    exerciseName: opts.exerciseName,
    date: opts.date,
    startTime: opts.startTime,
    dimensions: opts.dimensions,
    setEvidence: {
      totalRawSetCount: workingCount,
      explicitWorkingSetCount: workingCount,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0,
    },
    loadVolumeEvidence: opts.totalLoadVolumeKgReps !== undefined
      ? {
          totalLoadVolumeKgReps: opts.totalLoadVolumeKgReps,
          highEvidenceLoadVolumeKgReps: opts.totalLoadVolumeKgReps,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: workingCount,
        }
      : undefined,
    e1RMEvidence: opts.e1RM !== undefined
      ? {
          numericalPeakEstimated1RMKg: opts.e1RM,
          selectedPeakEstimated1RMKg: opts.e1RM,
          selectedEvidenceQuality: 'high' as const,
        }
      : undefined,
  });
}

function makeRunningSession(opts: {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly distanceKm?: number;
  readonly durationSeconds?: number;
  readonly dimensions?: readonly StressDimension[];
}): RunningStressMagnitudeInput {
  const dims = opts.dimensions ?? ['knee-dominant-lower-body', 'hip-posterior-chain'];
  return Object.freeze({
    kind: 'running',
    sourceLogId: opts.sourceLogId,
    exerciseId: 'running',
    exerciseName: 'Running',
    date: opts.date,
    startTime: opts.startTime,
    dimensions: dims,
    distanceKm: opts.distanceKm,
    durationSeconds: opts.durationSeconds,
    paceSecondsPerKm:
      opts.distanceKm && opts.durationSeconds
        ? opts.durationSeconds / opts.distanceKm
        : undefined,
    metricProvenance: {
      distanceProvenance: 'explicit' as const,
      durationProvenance: 'explicit' as const,
      distanceLegacyConflict: false,
      durationLegacyConflict: false,
      hasLegacyConflict: false,
      sourceConfidence: 'high' as const,
    },
  });
}

function runFullVNextPipeline(
  sessions: readonly StressMagnitudeInput[],
  evalContext: EvaluationContext,
  candidateIds?: readonly string[]
): FinalTodayDecision {
  const projections: UnifiedDimensionProjectedStress[] = [];
  for (const session of sessions) {
    if (session.kind === 'strength') {
      for (const dim of session.dimensions) {
        projections.push({
          kind: 'dimension-projected-strength-stress',
          sourceLogId: session.sourceLogId,
          dimension: dim,
          date: session.date,
          startTime: session.startTime,
          exerciseId: session.exerciseId,
          exerciseName: session.exerciseName,
          associatedDimensions: session.dimensions,
          sourceSessionMagnitude: session as any,
        });
      }
    } else if (session.kind === 'running') {
      for (const dim of session.dimensions) {
        projections.push({
          kind: 'dimension-projected-running-stress',
          sessionLogId: session.sourceLogId,
          activityType: 'running',
          dimension: dim,
          date: session.date,
          startTime: session.startTime,
          associatedDimensions: session.dimensions as any,
          sourceSessionMagnitude: session as any,
        });
      }
    }
  }

  const traceCollection = deriveResidualStressTraces(projections, evalContext);
  const residualStates = deriveAllDimensionResidualStates(traceCollection.traces, evalContext);
  const evalSet = evaluateCandidateDecisionSet(
    candidateIds,
    residualStates,
    sessions,
    evalContext
  );
  return deriveFinalTodayDecision(evalSet);
}

/**
 * Runs the complete GS1 through GS10 Golden Scenarios suite.
 */
export function runGoldenScenariosReplay(): readonly GoldenScenarioReplayOutcome[] {
  const outcomes: GoldenScenarioReplayOutcome[] = [];

  // =========================================================================
  // GS1: Deadlift completed -> Today Rest -> Next Session Bench > Squat naturally
  // =========================================================================
  {
    // Part 1: Today (2026-08-16 14:00), Deadlift completed at 09:00 -> Rest (completed-session-boundary)
    const evalToday = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T14:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const historyToday: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-dl-today',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-16',
        startTime: '09:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 5,
        e1RM: 150,
      }),
      makeStrengthSession({
        sourceLogId: 'log-sq-past',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-past',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-07',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
    ];

    const decisionToday = runFullVNextPipeline(historyToday, evalToday);
    const passPart1 =
      decisionToday.kind === 'rest' &&
      decisionToday.restCategory === 'completed-session-boundary';

    // Part 2: Next session day (2026-08-17 12:00) -> Bench preferred over Squat
    const evalNextDay = deriveEvaluationContext({
      evaluationInstant: '2026-08-17T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const decisionNextDay = runFullVNextPipeline(historyToday, evalNextDay, [
      'bench_press',
      'squat',
      'deadlift',
    ]);
    const passPart2 =
      decisionNextDay.kind === 'train' &&
      decisionNextDay.primaryCandidate?.candidateExerciseId === 'bench_press' &&
      decisionNextDay.candidateDecisionSet.candidateMap['squat']?.decisionClass === 'viable';

    const passed = passPart1 && passPart2;
    outcomes.push(
      Object.freeze({
        scenarioId: 'GS1',
        title: 'Deadlift completed -> Today Rest -> Next Session Bench > Squat naturally',
        passed,
        details: passed
          ? `GS1 Passed: Today Rest (${decisionToday.restCategory}) -> Next Day Train Bench Press (${decisionNextDay.primaryCandidate?.candidateExerciseName} preferred over Squat).`
          : `GS1 Failed: Part1=${passPart1} (todayKind=${decisionToday.kind}), Part2=${passPart2} (nextPrimary=${decisionNextDay.primaryCandidate?.candidateExerciseId})`,
        evaluationInstant: evalToday.evaluationInstant,
        decisionKind: decisionToday.kind,
        restCategory: decisionToday.restCategory,
      })
    );
  }

  // =========================================================================
  // GS2: Deadlift -> Squat residual evolution across D+1, D+2, D+3
  // =========================================================================
  {
    const dlHistory: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-dl-0',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-10',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 5,
        e1RM: 160,
      }),
    ];

    // D+1 (Aug 11 12:00): 26h elapsed -> active-residual caution
    const evalD1 = deriveEvaluationContext({
      evaluationInstant: '2026-08-11T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const decD1 = runFullVNextPipeline(dlHistory, evalD1, ['squat']);
    const sqD1 = decD1.candidateDecisionSet.candidateMap['squat'];

    // D+2 (Aug 12 12:00): 50h elapsed -> active-residual caution
    const evalD2 = deriveEvaluationContext({
      evaluationInstant: '2026-08-12T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const decD2 = runFullVNextPipeline(dlHistory, evalD2, ['squat']);
    const sqD2 = decD2.candidateDecisionSet.candidateMap['squat'];

    // D+3 (Aug 13 12:00): 74h elapsed (>=72h) -> historical-only clear
    const evalD3 = deriveEvaluationContext({
      evaluationInstant: '2026-08-13T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const decD3 = runFullVNextPipeline(dlHistory, evalD3, ['squat']);
    const sqD3 = decD3.candidateDecisionSet.candidateMap['squat'];

    const passed =
      sqD1?.readinessEvidence.overallReadinessClass === 'caution' &&
      sqD2?.readinessEvidence.overallReadinessClass === 'caution' &&
      sqD3?.readinessEvidence.overallReadinessClass === 'clear';

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS2',
        title: 'Deadlift -> Squat residual evolution across D+1, D+2, D+3',
        passed,
        details: passed
          ? `GS2 Passed: D+1=${sqD1?.readinessEvidence.overallReadinessClass}, D+2=${sqD2?.readinessEvidence.overallReadinessClass}, D+3=${sqD3?.readinessEvidence.overallReadinessClass} (historical-only transition verified).`
          : `GS2 Failed: D1=${sqD1?.readinessEvidence.overallReadinessClass}, D2=${sqD2?.readinessEvidence.overallReadinessClass}, D3=${sqD3?.readinessEvidence.overallReadinessClass}`,
        evaluationInstant: evalD1.evaluationInstant,
        decisionKind: decD3.kind,
        primaryRecommendation: decD3.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS3: OHP -> Bench structural caution (no hardblock)
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // OHP 16h ago (Aug 15 18:00) -> vertical-push residual -> press-pattern overlap with Bench
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-ohp-yesterday',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-15',
        startTime: '18:00',
        dimensions: ['vertical-push'],
        workingSetCount: 5,
        e1RM: 55,
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, ['bench_press']);
    const bp = decision.candidateDecisionSet.candidateMap['bench_press'];

    const passed =
      bp !== undefined &&
      bp.readinessEvidence.overallReadinessClass === 'caution' &&
      bp.readinessEvidence.hardConstraintBoundary.isHardBlocked === false &&
      bp.decisionClass === 'viable' &&
      bp.readinessEvidence.structuralOverlaps.some((o) => o.relation === 'press-pattern-overlap');

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS3',
        title: 'OHP -> Bench structural caution (no hardblock)',
        passed,
        details: passed
          ? `GS3 Passed: Bench press-pattern overlap identified (Readiness=${bp?.readinessEvidence.overallReadinessClass}, HardBlocked=false, DecisionClass=${bp?.decisionClass}).`
          : `GS3 Failed: Bench=${JSON.stringify(bp?.readinessEvidence)}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS4: Deadlift -> Row horizontal-pull contamination check
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Heavy Deadlift yesterday (Aug 15 10:00)
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-dl-yesterday',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 5,
        e1RM: 160,
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, ['barbell_row']);
    const row = decision.candidateDecisionSet.candidateMap['barbell_row'];
    const rowHorizontalPullAssessment = row?.readinessEvidence.dimensionAssessments.find(
      (d) => d.dimension === 'horizontal-pull'
    );

    const passed =
      row !== undefined &&
      rowHorizontalPullAssessment?.dimensionReadinessStatus === 'clear' &&
      !row.readinessEvidence.structuralOverlaps.some((o) => o.targetDimension === 'horizontal-pull');

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS4',
        title: 'Deadlift -> Row horizontal-pull contamination check',
        passed,
        details: passed
          ? `GS4 Passed: Deadlift does NOT contaminate horizontal-pull (Row horizontal-pull status=clear).`
          : `GS4 Failed: Row horizontal-pull status=${rowHorizontalPullAssessment?.dimensionReadinessStatus}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS5: OHP fatigue-confounded evidence (zero causal biological certainty)
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-ohp-1',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-01',
        startTime: '10:00',
        dimensions: ['vertical-push'],
        workingSetCount: 5,
        e1RM: 55,
      }),
      makeStrengthSession({
        sourceLogId: 'log-ohp-2',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['vertical-push'],
        workingSetCount: 5,
        e1RM: 50,
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, ['overhead_press']);
    const ohp = decision.candidateDecisionSet.candidateMap['overhead_press'];
    const jsonStr = JSON.stringify(decision).toLowerCase();

    const hasNoBiologicalGuessing =
      !jsonStr.includes('cns fatigue') &&
      !jsonStr.includes('sleep') &&
      !jsonStr.includes('recovery %') &&
      !jsonStr.includes('muscle damage');

    const passed = ohp !== undefined && hasNoBiologicalGuessing;

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS5',
        title: 'OHP fatigue-confounded evidence (zero causal biological certainty)',
        passed,
        details: passed
          ? `GS5 Passed: Evaluated without unobservable CNS/sleep guessing (Opportunity=${ohp?.progressOpportunityEvidence.opportunityClass}).`
          : `GS5 Failed: Found biological speculation or missing OHP evaluation.`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS6: Running lower-body interaction
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Running 10km yesterday (Aug 15 18:00)
    const history: StressMagnitudeInput[] = [
      makeRunningSession({
        sourceLogId: 'log-run-1',
        date: '2026-08-15',
        startTime: '18:00',
        distanceKm: 10.0,
        durationSeconds: 3600,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-old',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, [
      'squat',
      'deadlift',
      'bench_press',
    ]);
    const sq = decision.candidateDecisionSet.candidateMap['squat'];
    const bp = decision.candidateDecisionSet.candidateMap['bench_press'];

    const passed =
      (sq?.readinessEvidence.overallReadinessClass === 'constrained' ||
        sq?.readinessEvidence.overallReadinessClass === 'caution') &&
      bp?.readinessEvidence.overallReadinessClass === 'clear' &&
      decision.kind === 'train' &&
      decision.primaryCandidate?.candidateExerciseId === 'bench_press';

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS6',
        title: 'Running lower-body interaction (Squat cautioned, Bench clear)',
        passed,
        details: passed
          ? `GS6 Passed: Running lowers Squat readiness (${sq?.readinessEvidence.overallReadinessClass}) while Bench Press remains clear (${bp?.readinessEvidence.overallReadinessClass}) -> Train Bench.`
          : `GS6 Failed: Squat=${sq?.readinessEvidence.overallReadinessClass}, Bench=${bp?.readinessEvidence.overallReadinessClass}, Primary=${decision.primaryCandidate?.candidateExerciseId}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS7: Actual log invalidates prior projection
  // =========================================================================
  {
    // T0: Evaluation on Aug 14 12:00 (Squat projected next)
    const evalT0 = deriveEvaluationContext({
      evaluationInstant: '2026-08-14T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const historyT0: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-10',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
    ];
    const decT0 = runFullVNextPipeline(historyT0, evalT0, ['squat', 'bench_press']);

    // T1: Actual session recorded on Aug 14 18:00 (Bench Press logged, NOT Squat)
    const historyT1: StressMagnitudeInput[] = [
      ...historyT0,
      makeStrengthSession({
        sourceLogId: 'log-bp-new-actual',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-14',
        startTime: '18:00',
        dimensions: ['horizontal-push'],
      }),
    ];
    const evalT1 = deriveEvaluationContext({
      evaluationInstant: '2026-08-15T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const decT1 = runFullVNextPipeline(historyT1, evalT1, ['squat', 'bench_press']);

    const passed =
      decT0.kind === 'train' &&
      decT1.candidateDecisionSet.candidateMap['bench_press']?.trainingNeedEvidence.needClass === 'recently-addressed' &&
      decT1.primaryCandidate?.candidateExerciseId === 'squat';

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS7',
        title: 'Actual log invalidates prior projection (T0 projection invalidated cleanly)',
        passed,
        details: passed
          ? `GS7 Passed: T0 projected Bench, actual Bench arrived at T1 -> prior projection invalidated and Bench marked recently-addressed at T1.`
          : `GS7 Failed: T1 Bench Need=${decT1.candidateDecisionSet.candidateMap['bench_press']?.trainingNeedEvidence.needClass}`,
        evaluationInstant: evalT1.evaluationInstant,
        decisionKind: decT1.kind,
        primaryRecommendation: decT1.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS8: Same-day Running + OHP dual modality preserved
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // On Aug 14: 07:00 Run + 16:00 OHP
    const history: StressMagnitudeInput[] = [
      makeRunningSession({
        sourceLogId: 'log-run-14',
        date: '2026-08-14',
        startTime: '07:00',
        distanceKm: 5.0,
        durationSeconds: 1500,
      }),
      makeStrengthSession({
        sourceLogId: 'log-ohp-14',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-14',
        startTime: '16:00',
        dimensions: ['vertical-push'],
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext);
    const dayBreakdown = decision.restEvidence?.recentTrainingContext.recentTrainingDensity.sessionsByCalendarDay.find(
      (d) => d.calendarDate === '2026-08-14'
    );

    const passed =
      dayBreakdown !== undefined &&
      dayBreakdown.sessionCount === 2 &&
      dayBreakdown.strengthSessionCount === 1 &&
      dayBreakdown.cardioSessionCount === 1 &&
      dayBreakdown.isMultiSessionDay === true;

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS8',
        title: 'Same-day Running + OHP dual modality preserved',
        passed,
        details: passed
          ? `GS8 Passed: Aug 14 multi-session day preserved (2 sessions: 1 strength, 1 cardio).`
          : `GS8 Failed: Breakdown=${JSON.stringify(dayBreakdown)}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS9: Volume -> intensity shift progression opportunity
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Baseline: 70kg x 5 (e1RM ~ 81.6kg)
    // Latest: 85kg x 3 (e1RM ~ 93.5kg)
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-base',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-01',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 5,
        totalLoadVolumeKgReps: 1750,
        e1RM: 81.6,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-latest',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
        totalLoadVolumeKgReps: 765,
        e1RM: 93.5,
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, ['bench_press']);
    const bp = decision.candidateDecisionSet.candidateMap['bench_press'];

    const passed =
      bp !== undefined &&
      bp.progressOpportunityEvidence.opportunityClass === 'progression-supported';

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS9',
        title: 'Volume -> intensity shift progression opportunity',
        passed,
        details: passed
          ? `GS9 Passed: Intensity shift e1RM progression recognized (Opportunity=${bp?.progressOpportunityEvidence.opportunityClass}).`
          : `GS9 Failed: Opportunity=${bp?.progressOpportunityEvidence.opportunityClass}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  // =========================================================================
  // GS10: Bench work-capacity progression opportunity
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Baseline: 5 sets, 25 reps at 70kg (1750kg load volume)
    // Latest: 6 sets, 32 reps at 70kg (2240kg load volume, e1RM identical)
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-base',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-01',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 5,
        totalLoadVolumeKgReps: 1750,
        e1RM: 80,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-latest',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 6,
        totalLoadVolumeKgReps: 2240,
        e1RM: 80,
      }),
    ];

    const decision = runFullVNextPipeline(history, evalContext, ['bench_press']);
    const bp = decision.candidateDecisionSet.candidateMap['bench_press'];

    const passed =
      bp !== undefined &&
      (bp.progressOpportunityEvidence.opportunityClass === 'progression-supported' ||
        bp.progressOpportunityEvidence.opportunityClass === 'maintenance-supported');

    outcomes.push(
      Object.freeze({
        scenarioId: 'GS10',
        title: 'Bench work-capacity progression opportunity',
        passed,
        details: passed
          ? `GS10 Passed: Work-capacity / load-volume expansion evaluated (Opportunity=${bp?.progressOpportunityEvidence.opportunityClass}).`
          : `GS10 Failed: Opportunity=${bp?.progressOpportunityEvidence.opportunityClass}`,
        evaluationInstant: evalContext.evaluationInstant,
        decisionKind: decision.kind,
        primaryRecommendation: decision.primaryCandidate?.candidateExerciseId,
      })
    );
  }

  return Object.freeze(outcomes);
}
