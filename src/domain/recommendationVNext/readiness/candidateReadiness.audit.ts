/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Readiness Invariant & Golden Scenario Audit Suite
 * (VNext Recommendation Engine - CU4.0)
 *
 * Dedicated verification module validating the candidate-specific readiness evaluation framework:
 *
 * Golden Scenarios:
 *  - GS1: 8/10 Deadlift -> Bench (clear) vs Squat (constrained) candidate readiness comparison.
 *  - GS2: Deadlift -> Squat temporal evolution (D+0 constrained -> D+1/D+2 caution -> D+3 clear).
 *  - GS3: OHP -> Bench mild kinesiological relation without hardblock or false acute overlap.
 *  - GS4: Deadlift does NOT pollute Barbell Row (horizontal-pull) readiness.
 *  - GS5: Running + lower-body candidate (Running evidence structurally reflected in knee/hip).
 *  - GS6: Same-day Running + OHP multi-modality coexistence (knee/hip from Run, axial from OHP).
 *  - GS7: Uncertain / Bracket evidence (No false confirmation as clear, preserved as caution).
 *
 * Core Architectural Invariants:
 *  - Audit 8: Unmapped candidate exercise handling (unmapped status, empty required dimensions).
 *  - Audit 9: Zero scalar scoring verification (no 0-100 scores, recovery %, fatigue numbers).
 *  - Audit 10: Source trace fidelity and explainability structural integrity.
 *  - Audit 11: Pure immutability and deterministic idempotency.
 *  - Audit 12: Multi-candidate evaluation set container completeness.
 */

import {
  deriveEvaluationContext,
  deriveSingleResidualStressTrace,
  deriveTemporalAttenuation,
} from '../stress/residualStressTrace';
import {
  deriveAllDimensionResidualStates,
  deriveDimensionResidualState,
} from '../stress/dimensionResidualState';
import {
  BoundedElapsedTime,
  EvaluationContextInput,
  ResidualStressTrace,
} from '../types/residualStressTrace.types';
import {
  CandidateReadinessAuditResult,
} from '../types/candidateReadiness.types';
import { DimensionProjectedStrengthStress } from '../types/strengthStressDimensionProjection.types';
import { DimensionProjectedRunningStress } from '../types/runningStressDimensionProjection.types';
import { StrengthStressMagnitude } from '../types/strengthStressMagnitude.types';
import { CanonicalRunningSession } from '../types/running.types';
import {
  FROZEN_STRESS_DIMENSIONS,
  projectStrengthStressToDimensions,
} from '../stress/strengthStressDimensionProjection';
import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from '../stress/runningStressMagnitude';
import { projectRunningStressToDimensions } from '../stress/runningStressDimensionProjection';
import { StressDimension } from '../types/stressModel.types';
import {
  DEFAULT_FOUNDATION_CANDIDATE_IDS,
  deriveCandidateDimensionReadinessAssessment,
  deriveCandidateReadinessEvidence,
  evaluateCandidateReadinessSet,
} from './candidateReadiness';

// =========================================================================
// Mock Evidence Generators
// =========================================================================

function createMockStrengthMagnitude(params: {
  exerciseId: string;
  exerciseName: string;
  date: string;
  startTime?: string;
  sourceLogId: string;
  targetDimensions: StressDimension[];
}): StrengthStressMagnitude {
  return Object.freeze({
    kind: 'strength-stress-magnitude',
    exerciseId: params.exerciseId,
    exerciseName: params.exerciseName,
    date: params.date,
    startTime: params.startTime,
    sourceLogId: params.sourceLogId,
    targetDimensions: Object.freeze([...params.targetDimensions]),
    historyState: 'single-session-reference',
    totalHistoricalSessionCount: 1,
    factorProfiles: Object.freeze({
      volume: Object.freeze({
        absoluteKgReps: 3000,
        distributionRelation: 'within-range-above-median',
        recencyDeltaKgReps: 100,
        currentQuality: 'high',
        referenceStatus: 'sufficient-reference',
      }),
      intensity: Object.freeze({
        peakWorkingLoadKg: 140,
        workingLoads: Object.freeze([]),
        referenceStatus: 'sufficient-reference',
      }),
      repeatedWork: Object.freeze({
        totalWorkingSets: 5,
        totalReps: 25,
        setCountRelation: 'within-range',
        repCountRelation: 'within-range',
        loadGroupStructure: Object.freeze([]),
        referenceStatus: 'sufficient-reference',
      }),
    }),
    couplingContract: Object.freeze({
      sharedDerivationBasis: 'working-sets',
      factorDependencies: Object.freeze([]),
      additiveCombinationAllowed: false,
      underlyingMetrics: Object.freeze({
        totalWorkingSets: 5,
        totalReps: 25,
        distinctLoadCount: 1,
      }),
    }),
  });
}

function createMockRunningSession(params: {
  logId: string;
  date: string;
  startTime?: string;
  distanceKm?: number;
  durationSeconds?: number;
}): CanonicalRunningSession {
  const paceSecondsPerKm =
    params.distanceKm !== undefined &&
    params.durationSeconds !== undefined &&
    params.distanceKm > 0
      ? params.durationSeconds / params.distanceKm
      : undefined;

  return {
    logId: params.logId,
    date: params.date,
    startTime: params.startTime,
    exerciseName: '야외 러닝',
    metrics: {
      distanceKm: params.distanceKm,
      durationSeconds: params.durationSeconds,
      paceSecondsPerKm,
      sourceFormat: 'explicit-cardio-fields',
      provenance: {
        distance: params.distanceKm !== undefined ? 'explicit' : 'missing',
        duration: params.durationSeconds !== undefined ? 'explicit' : 'missing',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
      },
      sourceConfidence: 'high',
      runIntent: 'unknown',
    },
  };
}

function createDeadliftProjections(params: {
  sourceLogId: string;
  date: string;
  startTime?: string;
}): DimensionProjectedStrengthStress[] {
  const mag = createMockStrengthMagnitude({
    exerciseId: 'deadlift',
    exerciseName: '데드리프트',
    date: params.date,
    startTime: params.startTime,
    sourceLogId: params.sourceLogId,
    targetDimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
  });
  return [...projectStrengthStressToDimensions(mag).projections];
}

function createOHPProjections(params: {
  sourceLogId: string;
  date: string;
  startTime?: string;
}): DimensionProjectedStrengthStress[] {
  const mag = createMockStrengthMagnitude({
    exerciseId: 'overhead_press',
    exerciseName: '오버헤드 프레스',
    date: params.date,
    startTime: params.startTime,
    sourceLogId: params.sourceLogId,
    targetDimensions: ['vertical-push', 'axial-systemic-loading'],
  });
  return [...projectStrengthStressToDimensions(mag).projections];
}

function createRunningProjections(params: {
  logId: string;
  date: string;
  startTime?: string;
  distanceKm?: number;
  durationSeconds?: number;
}): DimensionProjectedRunningStress[] {
  const session = createMockRunningSession(params);
  const historyRef = deriveRunningHistoricalReference(session, []);
  const interpretation = interpretRunningSessionVsHistory(session, historyRef);
  const mag = deriveRunningStressMagnitude(session, interpretation);
  return [...projectRunningStressToDimensions(mag)];
}

// =========================================================================
// Audit Suite Implementation
// =========================================================================

export function auditCandidateReadiness(): readonly CandidateReadinessAuditResult[] {
  const results: CandidateReadinessAuditResult[] = [];

  // Canonical evaluation instant: 2026-08-18 20:00:00 KST
  const standardEvalInput: EvaluationContextInput = Object.freeze({
    evaluationInstant: '2026-08-18T11:00:00.000Z',
    evaluationTimezone: 'Asia/Seoul',
  });
  const standardEvalContext = deriveEvaluationContext(standardEvalInput);

  // -------------------------------------------------------------------------
  // GS1: 8/10 Deadlift -> Bench vs Squat readiness structural comparison
  // -------------------------------------------------------------------------
  {
    // Recent Deadlift (2h ago: 18:00:00 KST on same day)
    const deadliftProjections = createDeadliftProjections({
      sourceLogId: 'deadlift-2h-ago',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = deadliftProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const benchReadiness = deriveCandidateReadinessEvidence(
      'bench_press',
      allStates,
      standardEvalContext
    );
    const squatReadiness = deriveCandidateReadinessEvidence(
      'squat',
      allStates,
      standardEvalContext
    );

    const benchPassed =
      benchReadiness.candidateExerciseId === 'bench_press' &&
      benchReadiness.requiredDimensions.length === 1 &&
      benchReadiness.requiredDimensions[0] === 'horizontal-push' &&
      benchReadiness.overallReadinessClass === 'clear' &&
      benchReadiness.definiteImmediateDimensions.length === 0 &&
      benchReadiness.definiteResidualDimensions.length === 0 &&
      benchReadiness.clearDimensions.includes('horizontal-push');

    const squatPassed =
      squatReadiness.candidateExerciseId === 'squat' &&
      squatReadiness.requiredDimensions.length === 3 &&
      squatReadiness.overallReadinessClass === 'constrained' &&
      squatReadiness.definiteImmediateDimensions.includes('hip-posterior-chain') &&
      squatReadiness.definiteImmediateDimensions.includes('axial-systemic-loading') &&
      squatReadiness.clearDimensions.includes('knee-dominant-lower-body');

    const passed = benchPassed && squatPassed;

    results.push({
      auditName: 'GS1: Deadlift -> Bench (clear) vs Squat (constrained) candidate-specific comparison',
      passed,
      details: passed
        ? 'PASSED: Deadlift creates immediate hip/axial stress; Bench (horizontal-push) is clear while Squat (knee/hip/axial) is constrained.'
        : 'FAILED: GS1 candidate-specific comparison failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS2: Deadlift -> Squat temporal evolution (D+0 / D+1 / D+2 / D+3)
  // -------------------------------------------------------------------------
  {
    // D+0: 2h ago (immediate)
    const tD0 = createDeadliftProjections({
      sourceLogId: 'dl-d0',
      date: '2026-08-18',
      startTime: '18:00:00',
    }).map((p) => deriveSingleResidualStressTrace(p, standardEvalContext));
    const statesD0 = deriveAllDimensionResidualStates(tD0, standardEvalContext);
    const squatD0 = deriveCandidateReadinessEvidence('squat', statesD0, standardEvalContext);

    // D+1: 30h ago (residual)
    const tD1 = createDeadliftProjections({
      sourceLogId: 'dl-d1',
      date: '2026-08-17',
      startTime: '14:00:00',
    }).map((p) => deriveSingleResidualStressTrace(p, standardEvalContext));
    const statesD1 = deriveAllDimensionResidualStates(tD1, standardEvalContext);
    const squatD1 = deriveCandidateReadinessEvidence('squat', statesD1, standardEvalContext);

    // D+2: 54h ago (residual)
    const tD2 = createDeadliftProjections({
      sourceLogId: 'dl-d2',
      date: '2026-08-16',
      startTime: '14:00:00',
    }).map((p) => deriveSingleResidualStressTrace(p, standardEvalContext));
    const statesD2 = deriveAllDimensionResidualStates(tD2, standardEvalContext);
    const squatD2 = deriveCandidateReadinessEvidence('squat', statesD2, standardEvalContext);

    // D+3+: 86h ago (historical)
    const tD3 = createDeadliftProjections({
      sourceLogId: 'dl-d3',
      date: '2026-08-15',
      startTime: '06:00:00',
    }).map((p) => deriveSingleResidualStressTrace(p, standardEvalContext));
    const statesD3 = deriveAllDimensionResidualStates(tD3, standardEvalContext);
    const squatD3 = deriveCandidateReadinessEvidence('squat', statesD3, standardEvalContext);

    const passed =
      squatD0.overallReadinessClass === 'constrained' &&
      squatD0.definiteImmediateDimensions.length === 2 &&
      squatD1.overallReadinessClass === 'caution' &&
      squatD1.definiteResidualDimensions.length === 2 &&
      squatD2.overallReadinessClass === 'caution' &&
      squatD2.definiteResidualDimensions.length === 2 &&
      squatD3.overallReadinessClass === 'clear' &&
      squatD3.historicalOnlyDimensions.includes('hip-posterior-chain') &&
      squatD3.historicalOnlyDimensions.includes('axial-systemic-loading') &&
      squatD3.clearDimensions.length === 3;

    results.push({
      auditName: 'GS2: Deadlift -> Squat temporal evolution (D0 constrained -> D1/D2 caution -> D3 clear)',
      passed,
      details: passed
        ? 'PASSED: Squat readiness transitions smoothly from constrained (<24h) to caution (24h-72h) to clear (>=72h) with historical traces preserved.'
        : 'FAILED: GS2 temporal evolution failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS3: OHP -> Bench: mild overlap preserved without hardblock
  // -------------------------------------------------------------------------
  {
    // Recent OHP (2h ago: vertical-push + axial)
    const ohpProjections = createOHPProjections({
      sourceLogId: 'ohp-2h-ago',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = ohpProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const benchReadiness = deriveCandidateReadinessEvidence(
      'bench_press',
      allStates,
      standardEvalContext
    );

    const passed =
      benchReadiness.candidateExerciseId === 'bench_press' &&
      benchReadiness.requiredDimensions.length === 1 &&
      benchReadiness.requiredDimensions[0] === 'horizontal-push' &&
      // Direct dimension conflict is clear
      benchReadiness.definiteImmediateDimensions.length === 0 &&
      benchReadiness.definiteResidualDimensions.length === 0 &&
      benchReadiness.clearDimensions.includes('horizontal-push') &&
      // Structural press overlap is present and preserved
      benchReadiness.hasStructuralOverlap === true &&
      benchReadiness.structuralOverlaps.length === 1 &&
      benchReadiness.structuralOverlaps[0].relation === 'press-pattern-overlap' &&
      benchReadiness.structuralOverlaps[0].sourceExerciseId === 'overhead_press' &&
      benchReadiness.structuralOverlaps[0].sourceDimension === 'vertical-push' &&
      benchReadiness.structuralOverlaps[0].targetDimension === 'horizontal-push' &&
      benchReadiness.structuralOverlaps[0].persistence === 'immediate' &&
      // Overall classification is caution (not wiped out to clear, not auto-constrained)
      benchReadiness.overallReadinessClass === 'caution' &&
      // Zero hardblock
      benchReadiness.hardConstraintBoundary.isHardBlocked === false;

    results.push({
      auditName: 'GS3: OHP -> Bench mild structural overlap preserved (caution, no hardblock)',
      passed,
      details: passed
        ? 'PASSED: OHP vertical-push does not direct-conflict with Bench horizontal-push, but creates structural press-pattern-overlap evaluating to caution without hardblock.'
        : 'FAILED: GS3 OHP -> Bench structural overlap handling failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS4: Deadlift does NOT pollute horizontal-pull (Barbell Row)
  // -------------------------------------------------------------------------
  {
    // Heavy Deadlift 2h ago
    const dlProjections = createDeadliftProjections({
      sourceLogId: 'dl-heavy',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = dlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const rowReadiness = deriveCandidateReadinessEvidence(
      'barbell_row',
      allStates,
      standardEvalContext
    );

    const passed =
      rowReadiness.candidateExerciseId === 'barbell_row' &&
      rowReadiness.requiredDimensions.length === 1 &&
      rowReadiness.requiredDimensions[0] === 'horizontal-pull' &&
      rowReadiness.overallReadinessClass === 'clear' &&
      rowReadiness.clearDimensions.includes('horizontal-pull') &&
      rowReadiness.definiteImmediateDimensions.length === 0 &&
      rowReadiness.hasStructuralOverlap === false &&
      rowReadiness.structuralOverlaps.length === 0;

    results.push({
      auditName: 'GS4: Deadlift does NOT pollute horizontal-pull (Barbell Row) readiness',
      passed,
      details: passed
        ? 'PASSED: Deadlift contains zero horizontal-pull projection and zero structural overlap; Barbell Row remains completely clear.'
        : 'FAILED: GS4 Barbell Row pollution isolation failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS5: Running + lower-body candidate (Squat)
  // -------------------------------------------------------------------------
  {
    // Recent Running (4h ago: knee-dominant + hip-posterior)
    const runProjections = createRunningProjections({
      logId: 'run-4h-ago',
      date: '2026-08-18',
      startTime: '16:00:00',
      distanceKm: 7,
      durationSeconds: 2100,
    });
    const traces = runProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const squatReadiness = deriveCandidateReadinessEvidence(
      'squat',
      allStates,
      standardEvalContext
    );
    const benchReadiness = deriveCandidateReadinessEvidence(
      'bench_press',
      allStates,
      standardEvalContext
    );

    const squatPassed =
      squatReadiness.overallReadinessClass === 'constrained' &&
      squatReadiness.definiteImmediateDimensions.includes('knee-dominant-lower-body') &&
      squatReadiness.definiteImmediateDimensions.includes('hip-posterior-chain') &&
      squatReadiness.clearDimensions.includes('axial-systemic-loading') &&
      squatReadiness.modalityContext.presence === 'running-only' &&
      squatReadiness.modalityContext.hasRunning === true &&
      squatReadiness.modalityContext.hasStrength === false;

    const benchPassed = benchReadiness.overallReadinessClass === 'clear';

    const passed = squatPassed && benchPassed;

    results.push({
      auditName: 'GS5: Running + lower-body candidate (Running evidence reflected in knee/hip)',
      passed,
      details: passed
        ? 'PASSED: Running stress is structurally mapped to Squats knee and hip dimensions with modality="running-only"; Bench remains clear.'
        : 'FAILED: GS5 Running + lower-body candidate failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS6: Same-day Running + OHP multi-modality coexistence
  // -------------------------------------------------------------------------
  {
    const runProjections = createRunningProjections({
      logId: 'run-sameday',
      date: '2026-08-18',
      startTime: '08:00:00', // 12h ago
      distanceKm: 5,
      durationSeconds: 1500,
    });
    const ohpProjections = createOHPProjections({
      sourceLogId: 'ohp-sameday',
      date: '2026-08-18',
      startTime: '18:00:00', // 2h ago
    });

    const traces = [
      ...runProjections.map((p) => deriveSingleResidualStressTrace(p, standardEvalContext)),
      ...ohpProjections.map((p) => deriveSingleResidualStressTrace(p, standardEvalContext)),
    ];
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const squatReadiness = deriveCandidateReadinessEvidence(
      'squat',
      allStates,
      standardEvalContext
    );

    const passed =
      squatReadiness.overallReadinessClass === 'constrained' &&
      squatReadiness.definiteImmediateDimensions.length === 3 &&
      squatReadiness.definiteImmediateDimensions.includes('knee-dominant-lower-body') &&
      squatReadiness.definiteImmediateDimensions.includes('hip-posterior-chain') &&
      squatReadiness.definiteImmediateDimensions.includes('axial-systemic-loading') &&
      squatReadiness.modalityContext.presence === 'both' &&
      squatReadiness.modalityContext.hasStrength === true &&
      squatReadiness.modalityContext.hasRunning === true &&
      squatReadiness.modalityContext.totalRunningTraces === 2 &&
      squatReadiness.modalityContext.totalStrengthTraces === 1;

    results.push({
      auditName: 'GS6: Same-day Running + OHP multi-modality coexistence',
      passed,
      details: passed
        ? 'PASSED: Squat evaluates knee/hip from running and axial from OHP, with modalityContext="both" and all traces preserved.'
        : 'FAILED: GS6 multi-modality coexistence failed.',
    });
  }

  // -------------------------------------------------------------------------
  // GS7: Uncertain / Bracket evidence (No false confirmation as clear)
  // -------------------------------------------------------------------------
  {
    // Scenario A: Same-day missing time Deadlift -> uncomputed uncertain trace
    const uncertainDlProjections = createDeadliftProjections({
      sourceLogId: 'dl-sameday-missing-time',
      date: '2026-08-18',
      startTime: undefined,
    });
    const uncertainTraces = uncertainDlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const uncertainStates = deriveAllDimensionResidualStates(
      uncertainTraces,
      standardEvalContext
    );
    const squatUncertain = deriveCandidateReadinessEvidence(
      'squat',
      uncertainStates,
      standardEvalContext
    );

    // Scenario B: Yesterday missing time Deadlift -> bracket trace crossing 24h
    const bracketDlProjections = createDeadliftProjections({
      sourceLogId: 'dl-yesterday-missing-time',
      date: '2026-08-17',
      startTime: undefined,
    });
    const bracketTraces = bracketDlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const bracketStates = deriveAllDimensionResidualStates(
      bracketTraces,
      standardEvalContext
    );
    const squatBracket = deriveCandidateReadinessEvidence(
      'squat',
      bracketStates,
      standardEvalContext
    );

    const passedA =
      squatUncertain.overallReadinessClass === 'caution' &&
      squatUncertain.uncertainDimensions.includes('hip-posterior-chain') &&
      squatUncertain.uncertainDimensions.includes('axial-systemic-loading') &&
      squatUncertain.definiteImmediateDimensions.length === 0;

    const passedB =
      squatBracket.overallReadinessClass === 'caution' &&
      squatBracket.uncertainDimensions.includes('hip-posterior-chain') &&
      squatBracket.uncertainDimensions.includes('axial-systemic-loading') &&
      squatBracket.dimensionAssessmentMap['hip-posterior-chain']?.hasPotentialPromotion ===
        true;

    const passed = passedA && passedB;

    results.push({
      auditName: 'GS7: Uncertain / Bracket evidence (Preserved as caution, no false clear)',
      passed,
      details: passed
        ? 'PASSED: Timestamp uncertainty and bracket ranges are preserved as caution and never falsely classified as clear.'
        : 'FAILED: GS7 uncertain/bracket handling failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 8: Unmapped candidate exercise handling
  // -------------------------------------------------------------------------
  {
    const emptyStates = deriveAllDimensionResidualStates([], standardEvalContext);
    const unmappedEvidence = deriveCandidateReadinessEvidence(
      'Unlisted_Bizarre_Lift',
      emptyStates,
      standardEvalContext
    );

    const passed =
      unmappedEvidence.overallReadinessClass === 'unmapped' &&
      unmappedEvidence.requiredDimensions.length === 0 &&
      unmappedEvidence.dimensionAssessments.length === 0 &&
      unmappedEvidence.exerciseProfile.mappingStatus === 'unmapped';

    results.push({
      auditName: 'Audit 8: Unmapped candidate exercise handling',
      passed,
      details: passed
        ? 'PASSED: Unmapped exercises receive overallReadinessClass="unmapped" and empty dimension assessments.'
        : 'FAILED: Unmapped candidate handling failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 9: Zero scalar scoring verification
  // -------------------------------------------------------------------------
  {
    const dlProjections = createDeadliftProjections({
      sourceLogId: 'dl-audit-9',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = dlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);
    const evidence = deriveCandidateReadinessEvidence('squat', allStates, standardEvalContext);

    // Verify evidence object does not have any score, percentage, or fatigue numeric fields
    const evidenceKeys = Object.keys(evidence);
    const forbiddenKeyNames = [
      'score',
      'recoveryScore',
      'recoveryPercentage',
      'recoveryPercent',
      'fatigueScore',
      'fatiguePercent',
      'readinessScore',
      'numericValue',
    ];

    const hasForbiddenKeys = forbiddenKeyNames.some((k) => evidenceKeys.includes(k));
    const passed =
      !hasForbiddenKeys &&
      typeof (evidence as unknown as { score?: unknown }).score === 'undefined';

    results.push({
      auditName: 'Audit 9: Zero scalar scoring verification',
      passed,
      details: passed
        ? 'PASSED: Zero numerical scores, recovery %, or fatigue metrics exist in CandidateReadinessEvidence.'
        : 'FAILED: Scalar scoring keys found in readiness evidence.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 10: Source trace fidelity and explainability structural integrity
  // -------------------------------------------------------------------------
  {
    const dlProjections = createDeadliftProjections({
      sourceLogId: 'dl-fidelity',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = dlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);
    const evidence = deriveCandidateReadinessEvidence('squat', allStates, standardEvalContext);

    const hipAssessment = evidence.dimensionAssessmentMap['hip-posterior-chain'];
    const passed =
      hipAssessment !== undefined &&
      hipAssessment.immediateTraces[0] === traces[0] &&
      evidence.explainabilitySummary.headline.length > 0 &&
      evidence.explainabilitySummary.factualObservations.length > 0 &&
      !evidence.explainabilitySummary.headline.includes('%') &&
      !evidence.explainabilitySummary.headline.toLowerCase().includes('score');

    results.push({
      auditName: 'Audit 10: Source trace fidelity and explainability structural integrity',
      passed,
      details: passed
        ? 'PASSED: Lossless object references preserved to source traces; explainability summary is factual and score-free.'
        : 'FAILED: Trace fidelity or explainability failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 11: Pure immutability and deterministic idempotency
  // -------------------------------------------------------------------------
  {
    const dlProjections = createDeadliftProjections({
      sourceLogId: 'dl-immutability',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = dlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const e1 = deriveCandidateReadinessEvidence('squat', allStates, standardEvalContext);
    const e2 = deriveCandidateReadinessEvidence('squat', allStates, standardEvalContext);

    const isFrozen =
      Object.isFrozen(e1) &&
      Object.isFrozen(e1.requiredDimensions) &&
      Object.isFrozen(e1.dimensionAssessments) &&
      Object.isFrozen(e1.definiteImmediateDimensions) &&
      Object.isFrozen(e1.definiteResidualDimensions) &&
      Object.isFrozen(e1.historicalOnlyDimensions) &&
      Object.isFrozen(e1.uncertainDimensions) &&
      Object.isFrozen(e1.clearDimensions) &&
      Object.isFrozen(e1.structuralOverlaps) &&
      Object.isFrozen(e1.modalityContext) &&
      Object.isFrozen(e1.explainabilitySummary);

    const isDeterministic = JSON.stringify(e1) === JSON.stringify(e2);
    const passed = isFrozen && isDeterministic;

    results.push({
      auditName: 'Audit 11: Pure immutability and deterministic idempotency',
      passed,
      details: passed
        ? 'PASSED: CandidateReadinessEvidence is deeply frozen and pure function execution is idempotent.'
        : 'FAILED: Immutability or determinism failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 12: Multi-candidate evaluation set container completeness
  // -------------------------------------------------------------------------
  {
    const dlProjections = createDeadliftProjections({
      sourceLogId: 'dl-sweep',
      date: '2026-08-18',
      startTime: '18:00:00',
    });
    const traces = dlProjections.map((p) =>
      deriveSingleResidualStressTrace(p, standardEvalContext)
    );
    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const evalSet = evaluateCandidateReadinessSet(
      DEFAULT_FOUNDATION_CANDIDATE_IDS,
      allStates,
      standardEvalContext
    );

    const allKeysPresent = DEFAULT_FOUNDATION_CANDIDATE_IDS.every(
      (id) => evalSet.candidateMap[id] !== undefined
    );
    const totalMatches = evalSet.candidates.length === DEFAULT_FOUNDATION_CANDIDATE_IDS.length;
    const squatConstrained = evalSet.candidateMap.squat.overallReadinessClass === 'constrained';
    const deadliftConstrained = evalSet.candidateMap.deadlift.overallReadinessClass === 'constrained';
    const benchClear = evalSet.candidateMap.bench_press.overallReadinessClass === 'clear';
    const rowClear = evalSet.candidateMap.barbell_row.overallReadinessClass === 'clear';
    const ohpConstrained = evalSet.candidateMap.overhead_press.overallReadinessClass === 'constrained'; // has axial

    const passed =
      allKeysPresent &&
      totalMatches &&
      squatConstrained &&
      deadliftConstrained &&
      benchClear &&
      rowClear &&
      ohpConstrained &&
      Object.isFrozen(evalSet);

    results.push({
      auditName: 'Audit 12: Multi-candidate evaluation set container completeness',
      passed,
      details: passed
        ? 'PASSED: evaluateCandidateReadinessSet successfully evaluated all 6 foundation candidates with correct candidate-specific readiness.'
        : 'FAILED: Multi-candidate evaluation set failed.',
    });
  }

  return Object.freeze(results);
}

/** Alias for audit execution consistency */
export const runCandidateReadinessAudits = auditCandidateReadiness;
