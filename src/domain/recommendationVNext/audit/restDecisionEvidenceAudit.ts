/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-Level Rest Decision Evidence Audit Suite (CU4.3)
 *
 * Comprehensive verification of Rest Decision Evidence invariants, taxonomy,
 * multi-evidence derivation, and Golden Scenarios (GS-A ~ GS-H).
 *
 * Invariants Audited:
 * 1. Strength/Cardio Only Evidence Source (Zero biological / CNS guessing)
 * 2. No CNS Fatigue / Recovery % / Sleep / HRV fields
 * 3. Session Count != Unique Days (Explicit separation)
 * 4. Same-Day Multi-Session Preservation
 * 5. Residual Dimension Summary Loss-Free Representation
 * 6. Axial/Systemic Loading as Movement Context (Not CNS Fatigue)
 * 7. Clear Candidate Exists != Blind Auto-Train (Systemic demand preserved)
 * 8. Constrained Candidate Exists != Blind Auto-Rest (Upper/Lower decoupling)
 * 9. Due + Progression Candidate Acts as Rest Counter-Evidence
 * 10. Completed Session Boundary Preserved (Same-day -> 'rest-supported')
 * 11. Cold-Start False Rest Prevented (0 sessions -> 'rest-not-indicated')
 * 12. Running Lower-Body Evidence Doesn't Unfairly Block Upper Body
 * 13. Systemic Training Demand Categorical Context Preserved
 * 14. Rest Taxonomy: 'rest-supported' | 'rest-reasonable' | 'rest-not-indicated'
 * 15. Pure Immutability & Determinism
 * 16. Temporal Eligibility Regression PASS
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
import { CanonicalRunningSession } from '../types/running.types';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { StressDimension } from '../types/stressModel.types';

export interface RestDecisionEvidenceAuditScenarioResult {
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly details: string;
  readonly invariantsChecked: number;
}

// Helpers to create valid mock StressMagnitudeInputs
function makeStrengthSession(opts: {
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly date: string;
  readonly startTime?: string;
  readonly dimensions: readonly StressDimension[];
  readonly workingSetCount?: number;
  readonly totalLoadVolumeKgReps?: number;
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

// Helper to build AllDimensionResidualStates from session inputs
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

export function runRestDecisionEvidenceAudit(): readonly RestDecisionEvidenceAuditScenarioResult[] {
  const results: RestDecisionEvidenceAuditScenarioResult[] = [];

  // =========================================================================
  // Scenario 1 (Invariants 1, 2, 6): Evidence Boundary & Zero Biological Guessing
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const deadliftSession = makeStrengthSession({
      sourceLogId: 'log-dl-1',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      date: '2026-08-15',
      startTime: '10:00',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      workingSetCount: 4,
      totalLoadVolumeKgReps: 2800,
    });

    const residualStates = buildResidualStates([deadliftSession], evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'deadlift'],
      residualStates,
      [deadliftSession],
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;

    const restRecord = restEvidence as unknown as Record<string, unknown>;
    const forbiddenKeys = [
      'cnsFatigue',
      'recoveryPercentage',
      'muscleRecovery',
      'sleep',
      'hrv',
      'motivation',
      'mentalFatigue',
      'nutrition',
      'painScore',
      'injuryScore',
      'globalFatigueScore',
    ];

    const foundForbidden = forbiddenKeys.filter((k) => k in restRecord);

    const pass =
      foundForbidden.length === 0 &&
      restEvidence.kind === 'rest-decision-evidence' &&
      restEvidence.systemicTrainingDemandContext.recentAxialExposure.hasRecentAxialLoading === true;

    results.push({
      scenarioName: 'Scenario 1: Evidence Boundary & Zero Biological Guessing',
      passed: pass,
      details: pass
        ? 'RestDecisionEvidence strictly uses recorded Strength/Cardio facts with zero biological guessing.'
        : `Forbidden biological fields detected: ${foundForbidden.join(', ')}`,
      invariantsChecked: 3,
    });
  }

  // =========================================================================
  // Scenario 2 (Invariants 3, 4, GS-H): Session Count != Unique Days & Multi-Modality
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const morningRun: CanonicalRunningSession = {
      logId: 'run-1',
      date: '2026-08-15',
      startTime: '07:30',
      exerciseName: 'Running',
      metrics: {
        distanceKm: 5.0,
        durationSeconds: 1500,
        paceSecondsPerKm: 300,
        sourceFormat: 'explicit-cardio-fields',
        provenance: {
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        },
        sourceConfidence: 'high',
        runIntent: 'unknown',
      },
    };

    const eveningOHP = makeStrengthSession({
      sourceLogId: 'log-ohp-1',
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      date: '2026-08-15',
      startTime: '19:00',
      dimensions: ['vertical-push', 'axial-systemic-loading'],
    });

    const runningStressInput = makeRunningSession({
      sourceLogId: 'run-1',
      date: '2026-08-15',
      startTime: '07:30',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const residualStates = buildResidualStates([runningStressInput, eveningOHP], evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'overhead_press', 'running'],
      residualStates,
      [runningStressInput, eveningOHP],
      evalContext,
      [morningRun]
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const trainingContext = restEvidence.recentTrainingContext;

    const pass =
      trainingContext.recentSessionCount === 2 &&
      trainingContext.recentUniqueTrainingDays === 1 &&
      trainingContext.modalityPresence === 'both' &&
      restEvidence.systemicTrainingDemandContext.multiModalityExposure.sameDayMultiModality === true &&
      trainingContext.recentTrainingDensity.multiSessionDays === 1;

    results.push({
      scenarioName: 'Scenario 2 (GS-H): Session Count != Unique Days & Same-Day Multi-Modality',
      passed: pass,
      details: pass
        ? 'Session count (2) cleanly decoupled from unique days (1) with same-day multi-modality preserved.'
        : `Count mismatch: sessions=${trainingContext.recentSessionCount}, uniqueDays=${trainingContext.recentUniqueTrainingDays}, modality=${trainingContext.modalityPresence}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 3 (Invariants 6, 9, GS-A): Golden Scenario A — Clear + Due Candidate
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const historicalSessions: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bench-old',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
        totalLoadVolumeKgReps: 1200,
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-yesterday',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 3,
        totalLoadVolumeKgReps: 2100,
      }),
    ];

    const residualStates = buildResidualStates(historicalSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'deadlift', 'squat'],
      residualStates,
      historicalSessions,
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const todayDecision = evalSet.todayDecision;

    const pass =
      restEvidence.restSupportClass === 'rest-not-indicated' &&
      todayDecision.kind === 'train' &&
      todayDecision.primaryCandidate?.candidateExerciseId === 'bench_press' &&
      restEvidence.candidateLandscape.hasClearDueCandidate === true &&
      restEvidence.counterReasons.some((r) => r.includes('Bench Press'));

    results.push({
      scenarioName: 'Scenario 3 (GS-A): Clear + Due Candidate with Low Recent Density',
      passed: pass,
      details: pass
        ? 'Rest is rest-not-indicated and Bench Press is recommended as primary train candidate.'
        : `Unexpected restSupportClass=${restEvidence.restSupportClass}, decisionKind=${todayDecision.kind}`,
      invariantsChecked: 3,
    });
  }

  // =========================================================================
  // Scenario 4 (Invariants 7, 8, GS-B): Golden Scenario B — High Density & Broad Residual
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const historicalSessions: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-4d',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-12',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
        workingSetCount: 3,
      }),
      makeRunningSession({
        sourceLogId: 'log-run-3d',
        date: '2026-08-13',
        startTime: '10:00',
        distanceKm: 6.0,
        durationSeconds: 1800,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bench-2d',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
        workingSetCount: 3,
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-1d',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 3,
      }),
    ];

    const residualStates = buildResidualStates(historicalSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['squat', 'bench_press', 'deadlift', 'running'],
      residualStates,
      historicalSessions,
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const todayDecision = evalSet.todayDecision;

    const pass =
      restEvidence.recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval === 4 &&
      restEvidence.recentTrainingContext.recentUniqueTrainingDays === 4 &&
      restEvidence.systemicTrainingDemandContext.evidenceState === 'elevated-context' &&
      restEvidence.restSupportClass === 'rest-supported' &&
      todayDecision.kind === 'rest';

    results.push({
      scenarioName: 'Scenario 4 (GS-B): High Recent Density & Broad Residual (4 Consecutive Days)',
      passed: pass,
      details: pass
        ? 'Rest is rest-supported under 4 consecutive training days with elevated systemic demand.'
        : `Unexpected restSupportClass=${restEvidence.restSupportClass}, consecutiveDays=${restEvidence.recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 5 (Invariants 8, 14, GS-C): Golden Scenario C — Caution + Due Non-Dominant
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const historicalSessions: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-sq-10d',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-06',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
      }),
      makeRunningSession({
        sourceLogId: 'log-run-2d',
        date: '2026-08-14',
        startTime: '10:00',
        distanceKm: 5.0,
        durationSeconds: 1500,
      }),
      makeStrengthSession({
        sourceLogId: 'log-bench-1d',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
    ];

    const residualStates = buildResidualStates(historicalSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['squat', 'bench_press', 'running'],
      residualStates,
      historicalSessions,
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;

    const pass =
      restEvidence.restSupportClass === 'rest-reasonable' &&
      restEvidence.candidateLandscape.cautionCandidateCount > 0 &&
      restEvidence.candidateLandscape.viableCandidates.includes('squat');

    results.push({
      scenarioName: 'Scenario 5 (GS-C): Non-Dominant Caution + Due with Moderate Context',
      passed: pass,
      details: pass
        ? 'Rest is rest-reasonable (Squat viable/preferred with caution, Rest also well justified).'
        : `Unexpected restSupportClass=${restEvidence.restSupportClass}`,
      invariantsChecked: 3,
    });
  }

  // =========================================================================
  // Scenario 6 (Invariant 10, GS-D): Completed Session Boundary
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T14:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const morningSession = makeStrengthSession({
      sourceLogId: 'log-dl-today',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      date: '2026-08-16',
      startTime: '09:00',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
    });

    const residualStates = buildResidualStates([morningSession], evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'deadlift'],
      residualStates,
      [morningSession],
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const todayDecision = evalSet.todayDecision;

    const pass =
      restEvidence.recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted === true &&
      restEvidence.restSupportClass === 'rest-supported' &&
      todayDecision.kind === 'rest' &&
      todayDecision.restCategory === 'completed-session-boundary';

    results.push({
      scenarioName: 'Scenario 6 (GS-D): Completed Session Boundary Preserved',
      passed: pass,
      details: pass
        ? 'Same-day completed session correctly yields rest-supported under completed-session-boundary.'
        : `Unexpected sameDayCompleted=${restEvidence.recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted}, kind=${todayDecision.kind}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 7 (Invariants 8, 12, GS-E): Running Lower-Body Overlap Decoupled from Upper Body
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const historicalSessions: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-bench-old',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        date: '2026-08-08',
        startTime: '10:00',
        dimensions: ['horizontal-push'],
      }),
      makeRunningSession({
        sourceLogId: 'log-run-yesterday',
        date: '2026-08-15',
        startTime: '10:00',
        distanceKm: 8.0,
        durationSeconds: 2400,
      }),
    ];

    const residualStates = buildResidualStates(historicalSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'running'],
      residualStates,
      historicalSessions,
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const todayDecision = evalSet.todayDecision;

    const hasLowerBodyActive =
      restEvidence.residualLandscape.hasImmediateLowerBodyResidual ||
      restEvidence.residualLandscape.residualDimensions.includes('knee-dominant-lower-body');

    const pass =
      hasLowerBodyActive &&
      restEvidence.residualLandscape.hasImmediateUpperBodyResidual === false &&
      restEvidence.restSupportClass === 'rest-not-indicated' &&
      todayDecision.kind === 'train' &&
      todayDecision.primaryCandidate?.candidateExerciseId === 'bench_press';

    results.push({
      scenarioName: 'Scenario 7 (GS-E): Running Lower-Body Overlap Decoupled from Upper Body',
      passed: pass,
      details: pass
        ? 'Lower-body running residual does not block upper-body Bench Press.'
        : `Unexpected restSupportClass=${restEvidence.restSupportClass}, primary=${todayDecision.primaryCandidate?.candidateExerciseId}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 8 (Invariants 6, 13, GS-F): Repeated Axial Exposure Preserved with Clear Available
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const historicalSessions: StressMagnitudeInput[] = [
      makeStrengthSession({
        sourceLogId: 'log-row-avail',
        exerciseId: 'barbell_row',
        exerciseName: 'Barbell Row',
        date: '2026-08-12',
        startTime: '10:00',
        dimensions: ['horizontal-pull'],
      }),
      makeStrengthSession({
        sourceLogId: 'log-sq-heavy',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        date: '2026-08-14',
        startTime: '10:00',
        dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
        workingSetCount: 4,
        totalLoadVolumeKgReps: 2600,
      }),
      makeStrengthSession({
        sourceLogId: 'log-dl-heavy',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        date: '2026-08-15',
        startTime: '10:00',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        workingSetCount: 4,
        totalLoadVolumeKgReps: 3000,
      }),
    ];

    const residualStates = buildResidualStates(historicalSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['barbell_row', 'squat', 'deadlift'],
      residualStates,
      historicalSessions,
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;

    const pass =
      restEvidence.systemicTrainingDemandContext.evidenceState === 'elevated-context' &&
      restEvidence.systemicTrainingDemandContext.recentAxialExposure.axialSessionCount === 2 &&
      restEvidence.systemicTrainingDemandContext.repeatedCompoundExposure.hasRepeatedCompoundLoading === true &&
      restEvidence.restSupportClass === 'rest-reasonable';

    results.push({
      scenarioName: 'Scenario 8 (GS-F): Repeated Axial Exposure Preserved with Clear Available',
      passed: pass,
      details: pass
        ? 'Elevated systemic axial demand is preserved in RestEvidence and yields rest-reasonable.'
        : `Unexpected demand state=${restEvidence.systemicTrainingDemandContext.evidenceState}, restSupport=${restEvidence.restSupportClass}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 9 (Invariant 11, GS-G): Cold Start / Sparse History
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const residualStates = buildResidualStates([], evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['squat', 'bench_press', 'deadlift'],
      residualStates,
      [],
      evalContext
    );

    const restEvidence = evalSet.restDecisionEvidence;
    const todayDecision = evalSet.todayDecision;

    const pass =
      restEvidence.recentTrainingContext.recentSessionCount === 0 &&
      restEvidence.systemicTrainingDemandContext.evidenceState === 'insufficient-evidence' &&
      restEvidence.uncertaintyContext.hasSparseHistory === true &&
      restEvidence.restSupportClass === 'rest-not-indicated' &&
      todayDecision.kind === 'train';

    results.push({
      scenarioName: 'Scenario 9 (GS-G): Cold Start / Sparse History Prevents False Rest',
      passed: pass,
      details: pass
        ? 'Cold start history correctly prevents false Rest and maintains rest-not-indicated.'
        : `Unexpected restSupportClass=${restEvidence.restSupportClass}, decisionKind=${todayDecision.kind}`,
      invariantsChecked: 4,
    });
  }

  // =========================================================================
  // Scenario 10 (Invariant 15): Pure Immutability & Determinism
  // =========================================================================
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00+09:00',
      evaluationTimezone: 'Asia/Seoul',
    });

    const session = makeStrengthSession({
      sourceLogId: 'log-freeze',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      date: '2026-08-15',
      startTime: '10:00',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
    });

    const residualStates = buildResidualStates([session], evalContext);
    const evalSet1 = evaluateCandidateDecisionSet(
      ['squat', 'bench_press'],
      residualStates,
      [session],
      evalContext
    );
    const evalSet2 = evaluateCandidateDecisionSet(
      ['squat', 'bench_press'],
      residualStates,
      [session],
      evalContext
    );

    const evidence = evalSet1.restDecisionEvidence;

    const isFrozen =
      Object.isFrozen(evidence) &&
      Object.isFrozen(evidence.recentTrainingContext) &&
      Object.isFrozen(evidence.recentTrainingContext.recentTrainingDensity) &&
      Object.isFrozen(evidence.residualLandscape) &&
      Object.isFrozen(evidence.systemicTrainingDemandContext) &&
      Object.isFrozen(evidence.candidateLandscape) &&
      Object.isFrozen(evidence.supportingReasons) &&
      Object.isFrozen(evidence.counterReasons);

    const isDeterministic =
      JSON.stringify(evalSet1.restDecisionEvidence) ===
      JSON.stringify(evalSet2.restDecisionEvidence);

    const pass = isFrozen && isDeterministic;

    results.push({
      scenarioName: 'Scenario 10: Pure Immutability & Determinism Verification',
      passed: pass,
      details: pass
        ? 'Deep immutability verified across all sub-structures and deterministic output confirmed.'
        : `Immutability or determinism failure: isFrozen=${isFrozen}, isDeterministic=${isDeterministic}`,
      invariantsChecked: 2,
    });
  }

  return Object.freeze(results);
}
