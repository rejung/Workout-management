/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Final TodayDecision Integration Audit Suite (VNext Recommendation Engine - CU4.4)
 *
 * Verifies that the FinalTodayDecision synthesis engine:
 * 1. Prioritizes Completed Session Boundary above all candidate landscape rankings.
 * 2. Excludes same-day future sessions from completed boundary.
 * 3. Correctly arbitrates rest-not-indicated, rest-supported, and rest-reasonable.
 * 4. Strictly enforces Rule 6 viable-only arbitration without arbitrary auto-Train or auto-Rest.
 * 5. Deterministically preserves true ties without semantic ID prioritization.
 * 6. Enforces strict evidence boundaries with zero biological / CNS guessing.
 * 7. Correctly categorizes Rest (completed-session-boundary, no-viable-candidates, hardblocked-boundary, session-level-rest-supported).
 * 8. Validates all 9 Golden Scenarios (GS-A through GS-I).
 * 9. Guarantees pure immutability and determinism.
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
import { StressDimension } from '../types/stressModel.types';

export interface FinalTodayDecisionAuditResult {
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly details: string;
}

// ---------------------------------------------------------------------------
// Helper Fixture Builders
// ---------------------------------------------------------------------------

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
    loadVolumeEvidence: opts.totalLoadVolumeKgReps
      ? {
          totalLoadVolumeKgReps: opts.totalLoadVolumeKgReps,
          highEvidenceLoadVolumeKgReps: opts.totalLoadVolumeKgReps,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: workingCount,
        }
      : undefined,
    peakE1RMEvidence: opts.e1RM
      ? {
          peakEstimated1RMKg: opts.e1RM,
          sourceSetIndex: 1,
          reps: 5,
          weightKg: opts.e1RM * 0.85,
          formulaUsed: 'epley',
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

function buildResidualStates(
  sessions: readonly StressMagnitudeInput[],
  evalContext: EvaluationContext
) {
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
  return deriveAllDimensionResidualStates(traceCollection.traces, evalContext);
}

function computeFinalDecision(
  sessions: readonly StressMagnitudeInput[],
  evalContext: EvaluationContext,
  candidateIds?: readonly string[]
): FinalTodayDecision {
  const residualStates = buildResidualStates(sessions, evalContext);
  const evalSet = evaluateCandidateDecisionSet(
    candidateIds,
    residualStates,
    sessions,
    evalContext
  );
  return deriveFinalTodayDecision(evalSet);
}

// ---------------------------------------------------------------------------
// Main Audit Suite Implementation
// ---------------------------------------------------------------------------

export function runFinalTodayDecisionAudit(): FinalTodayDecisionAuditResult[] {
  const results: FinalTodayDecisionAuditResult[] = [];

  // =========================================================================
  // GS-A: Bench clear + due + progression, low recent density -> Train Bench
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Bench was done 9 days ago (due). Baseline was 95kg, latest was 100kg (progression).
    // Deadlift was done 4 days ago (no active residual today).
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-01',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
        e1RM: 95,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-2',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-07',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
        e1RM: 100,
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-12',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 3,
        e1RM: 140,
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    const pass =
      decision.kind === 'train' &&
      decision.primaryCandidate?.candidateExerciseId === 'bench_press' &&
      decision.restEvidence?.restSupportClass === 'rest-not-indicated' &&
      !decision.arbitrationAuditTrail.some((t) => t.includes('CNS'));

    results.push({
      scenarioName: 'GS-A: Bench Clear + Due + Progression under Low Recent Density',
      passed: pass,
      details: pass
        ? `Train Bench Press selected (Rest=${decision.restEvidence?.restSupportClass}, Primary=${decision.primaryCandidate?.candidateExerciseName}).`
        : `Failed: kind=${decision.kind}, primary=${decision.primaryCandidate?.candidateExerciseId}, rest=${decision.restEvidence?.restSupportClass}`,
    });
  }

  // =========================================================================
  // GS-B: 4 Consecutive Days High Density, Broad Residual, No Due Candidate -> Rest
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // 4 consecutive days leading up to eval: Aug 12, 13, 14, 15
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-12',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-13',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-ohp-1',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['vertical-push'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    const pass =
      decision.kind === 'rest' &&
      decision.restCategory === 'session-level-rest-supported' &&
      decision.primaryCandidate === undefined &&
      decision.restEvidence?.restSupportClass === 'rest-supported' &&
      decision.restEvidence?.recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval === 4;

    results.push({
      scenarioName: 'GS-B: High Recent Density (4 Consecutive Days) & Broad Residual -> Rest',
      passed: pass,
      details: pass
        ? `Rest selected under 'session-level-rest-supported' (Consecutive Days=4, RestSupport=${decision.restEvidence?.restSupportClass}).`
        : `Failed: kind=${decision.kind}, category=${decision.restCategory}, rest=${decision.restEvidence?.restSupportClass}`,
    });
  }

  // =========================================================================
  // GS-C: Squat caution + due, others recently addressed, Rest reasonable -> Train Squat
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Deadlift 2 days ago (Aug 14) -> posterior chain residual caution on Squat (not constrained <24h).
    // Bench Press and Overhead Press done yesterday (Aug 15) -> recently-addressed.
    // Squat was done 9 days ago (Aug 7) -> Due.
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-07',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-ohp-1',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-15',
        startTime: '18:00',
        dimensions: ['vertical-push'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext, [
      'squat',
      'bench_press',
      'overhead_press',
    ]);

    const pass =
      decision.kind === 'train' &&
      decision.primaryCandidate?.candidateExerciseId === 'squat' &&
      decision.primaryCandidate.decisionClass === 'viable' &&
      decision.restEvidence?.restSupportClass === 'rest-reasonable';

    results.push({
      scenarioName: 'GS-C: Non-Dominant Caution + Due with Moderate Context -> Train Squat',
      passed: pass,
      details: pass
        ? `Train Squat correctly arbitrated under rest-reasonable (Primary=Squat, Need=${decision.primaryCandidate?.comparisonFacts.needClass}, Rest=${decision.restEvidence?.restSupportClass}).`
        : `Failed: kind=${decision.kind}, primary=${decision.primaryCandidate?.candidateExerciseId}, rest=${decision.restEvidence?.restSupportClass}`,
    });
  }

  // =========================================================================
  // GS-D: Actual Deadlift Session Completed Today -> completed-session-boundary Rest
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T14:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Deadlift completed this morning at 09:00
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-10',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-today',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-16',
        startTime: '09:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    const pass =
      decision.kind === 'rest' &&
      decision.restCategory === 'completed-session-boundary' &&
      decision.primaryCandidate === undefined &&
      decision.decisionRationale.includes('already completed on 2026-08-16');

    results.push({
      scenarioName: 'GS-D: Completed Session Boundary Preserved -> Rest',
      passed: pass,
      details: pass
        ? `Completed session boundary preserved (kind=rest, category=completed-session-boundary).`
        : `Failed: kind=${decision.kind}, category=${decision.restCategory}`,
    });
  }

  // =========================================================================
  // GS-E: Running Lower-Body Overlap Decoupled from Upper Body -> Train Bench
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Yesterday run at 10:00 -> lower body acute residual on knee/hip
    // Bench was done 8 days ago -> due
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
        e1RM: 100,
      }),
      makeRunningSession({
        sourceLogId: 'log-run-yesterday',
        date: '2026-08-15',
        startTime: '18:00',
        distanceKm: 6.0,
        durationSeconds: 1800,
      }),
    ];

    const decision = computeFinalDecision(history, evalContext, ['squat', 'bench_press']);

    const pass =
      decision.kind === 'train' &&
      decision.primaryCandidate?.candidateExerciseId === 'bench_press' &&
      decision.candidateDecisionSet.candidateMap['squat'].decisionClass === 'deferred';

    results.push({
      scenarioName: 'GS-E: Running Lower-Body Residual Decoupled from Upper Body -> Train Bench',
      passed: pass,
      details: pass
        ? `Bench Press selected (kind=train, Squat deferred due to lower body running residual).`
        : `Failed: kind=${decision.kind}, primary=${decision.primaryCandidate?.candidateExerciseId}`,
    });
  }

  // =========================================================================
  // GS-F: Heavy Squat + Deadlift Recent, Barbell Row Clear + Available -> Rest
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Aug 14: Heavy Squat 150kg
    // Aug 15: Heavy Deadlift 180kg (repeated heavy axial loading, 2 consecutive sessions)
    // Barbell Row: performed 4 days ago (Aug 12) -> available (NOT due).
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-row-1',
        exerciseId: 'barbell_row',
        exerciseName: 'Barbell Row',
        date: '2026-08-12',
        startTime: '10:00',
        dimensions: ['horizontal-pull'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
        totalLoadVolumeKgReps: 3000,
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        totalLoadVolumeKgReps: 3500,
      }),
    ];

    const decision = computeFinalDecision(history, evalContext, [
      'squat',
      'deadlift',
      'barbell_row',
    ]);

    const pass =
      decision.kind === 'rest' &&
      decision.restCategory === 'session-level-rest-supported' &&
      decision.restEvidence?.systemicTrainingDemandContext.recentAxialExposure.hasRecentAxialLoading === true &&
      decision.restEvidence?.systemicTrainingDemandContext.recentAxialExposure.axialSessionCount >= 2;

    results.push({
      scenarioName: 'GS-F: Repeated Axial Exposure with Non-Due Candidate -> Rest Supported',
      passed: pass,
      details: pass
        ? `Rest supported (Axial sessions=${decision.restEvidence?.systemicTrainingDemandContext.recentAxialExposure.axialSessionCount}, Row available but not due).`
        : `Failed: kind=${decision.kind}, category=${decision.restCategory}, primary=${decision.primaryCandidate?.candidateExerciseId}`,
    });
  }

  // =========================================================================
  // GS-G: Cold-Start / Sparse History Prevents False Rest -> Train
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const history: StressMagnitudeInput[] = [];

    const decision = computeFinalDecision(history, evalContext, [
      'squat',
      'bench_press',
    ]);

    const pass =
      decision.kind === 'train' &&
      decision.restEvidence?.restSupportClass === 'rest-not-indicated' &&
      decision.uncertaintyContext.hasSparseHistory === true;

    results.push({
      scenarioName: 'GS-G: Cold-Start / Sparse History Prevents False Rest',
      passed: pass,
      details: pass
        ? `Cold start correctly yields kind=train (Rest=${decision.restEvidence?.restSupportClass}, hasSparseHistory=true).`
        : `Failed: kind=${decision.kind}, rest=${decision.restEvidence?.restSupportClass}`,
    });
  }

  // =========================================================================
  // GS-H: Same-Day Running + OHP Dual Exposure Preserved
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // On Aug 14: Morning Run (07:00) + Afternoon OHP (16:00) = 2 sessions, 1 unique day
    const history: StressMagnitudeInput[] = [
      makeRunningSession({
        sourceLogId: 'log-run-1',
        date: '2026-08-14',
        startTime: '07:00',
        distanceKm: 5.0,
        durationSeconds: 1500,
      }),
      makeStrengthSession({
        sourceLogId: 'log-ohp-1',
        exerciseId: 'overhead_press',
        exerciseName: 'Overhead Press',
        date: '2026-08-14',
        startTime: '16:00',
        dimensions: ['vertical-push'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    const breakdown = decision.restEvidence?.recentTrainingContext.recentTrainingDensity.sessionsByCalendarDay.find(
      (d) => d.calendarDate === '2026-08-14'
    );

    const pass =
      breakdown !== undefined &&
      breakdown.sessionCount === 2 &&
      breakdown.strengthSessionCount === 1 &&
      breakdown.cardioSessionCount === 1 &&
      breakdown.isMultiSessionDay === true &&
      decision.restEvidence?.systemicTrainingDemandContext.multiModalityExposure.sameDayMultiModality === true;

    results.push({
      scenarioName: 'GS-H: Same-Day Running + OHP Dual Exposure Preserved',
      passed: pass,
      details: pass
        ? `Aug 14 breakdown preserved (sessions=2, strength=1, cardio=1, multiModality=true).`
        : `Failed: breakdown=${JSON.stringify(breakdown)}`,
    });
  }

  // =========================================================================
  // GS-I: True Tie Between 2 Preferred Candidates Preserves Tie Without ID Bias
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Cold start with Bench Press and Barbell Row both available with identical exploratory profile
    const history: StressMagnitudeInput[] = [];

    const decision = computeFinalDecision(history, evalContext, [
      'bench_press',
      'barbell_row',
    ]);

    const pass =
      decision.kind === 'train' &&
      decision.primaryCandidate === undefined &&
      decision.tiedPrimaryCandidates !== undefined &&
      decision.tiedPrimaryCandidates.length === 2 &&
      decision.uncertaintyContext.isTiePreserved === true;

    results.push({
      scenarioName: 'GS-I: True Tie Preservation (Zero Semantic ID Priority)',
      passed: pass,
      details: pass
        ? `True tie preserved (primary=undefined, tiedPrimaryCandidates=[${decision.tiedPrimaryCandidates?.map((c) => c.candidateExerciseName).join(', ')}], isTiePreserved=true).`
        : `Failed: primary=${decision.primaryCandidate?.candidateExerciseId}, tied=${decision.tiedPrimaryCandidates?.length}`,
    });
  }

  // =========================================================================
  // Audit 10: Same-Day Future Session Exclusion from Completed Boundary
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    // Session logged for today at 18:00 (future relative to 12:00 eval)
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-10',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-future',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-16',
        startTime: '18:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    const pass =
      decision.kind === 'train' &&
      decision.restCategory !== 'completed-session-boundary' &&
      decision.restEvidence?.recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted === false;

    results.push({
      scenarioName: 'Audit 10: Same-Day Future Session Exclusion from Completed Boundary',
      passed: pass,
      details: pass
        ? `Future same-day session correctly excluded from completed boundary (isSameDayCompleted=false, decision=train).`
        : `Failed: kind=${decision.kind}, category=${decision.restCategory}`,
    });
  }

  // =========================================================================
  // Audit 11: Pure Immutability & Deep Freeze Verification
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bp-1',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-10',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);

    let isFrozen = true;
    try {
      (decision as any).kind = 'rest';
      isFrozen = false;
    } catch {
      // Expected frozen throw in strict mode
    }

    try {
      (decision.arbitrationAuditTrail as any).push('tamper');
      isFrozen = false;
    } catch {
      // Expected frozen throw
    }

    const pass =
      Object.isFrozen(decision) &&
      Object.isFrozen(decision.arbitrationAuditTrail) &&
      Object.isFrozen(decision.explainability) &&
      Object.isFrozen(decision.uncertaintyContext) &&
      Object.isFrozen(decision.alternativeCandidates);

    results.push({
      scenarioName: 'Audit 11: Pure Immutability & Deep Freeze Verification',
      passed: pass,
      details: pass
        ? 'Deep immutability confirmed on FinalTodayDecision and all nested arrays/objects.'
        : 'Failed: Object was not completely frozen.',
    });
  }

  // =========================================================================
  // Audit 12: Zero Biological / CNS Guessing Boundary Verification
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });
    const history: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-1',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      }),
    ];

    const decision = computeFinalDecision(history, evalContext);
    const jsonStr = JSON.stringify(decision).toLowerCase();

    const forbiddenTerms = [
      'cns fatigue',
      'recovery %',
      'recovery score',
      'fatigue score',
      'muscle damage',
      'muscles are not fully',
      'glycogen',
    ];

    const foundForbidden = forbiddenTerms.filter((term) => jsonStr.includes(term));

    const pass = foundForbidden.length === 0;

    results.push({
      scenarioName: 'Audit 12: Zero Biological / CNS Guessing Evidence Boundary',
      passed: pass,
      details: pass
        ? 'Strict evidence boundary verified: 0 unobservable biological terms in final decision structure.'
        : `Failed: Found forbidden biological terms: [${foundForbidden.join(', ')}]`,
    });
  }

  return results;
}
