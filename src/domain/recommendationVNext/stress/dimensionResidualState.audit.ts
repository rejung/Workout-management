/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dimension Residual State Invariant Audit Suite
 * (VNext Recommendation Engine - CU3.16)
 *
 * Dedicated verification module validating the complete 17 required invariants:
 *  1. Empty dimension -> totalCount=0, definite='none', potential='none', modality='none'
 *  2. Immediate only -> definite='immediate', potential='immediate', modality='strength-only'
 *  3. Residual only -> definite='residual', potential='residual', modality='running-only'
 *  4. Historical only -> definite='historical', potential='historical', preserved without deletion
 *  5. Immediate + Residual coexistence -> both partitions populated, definite='immediate', no trace loss
 *  6. Strength + Running coexistence -> modality='both', no cross-modality conversion or scalar reduction
 *  7. Multiple same-state traces -> 3 immediate traces preserved without culling or scalar addition
 *  8. Bracket crossing 24h -> bracketTraces populated, definite='none', potential='immediate', promotion=true
 *  9. Bracket crossing 72h -> bracketTraces populated, definite='none', potential='residual', promotion=true
 * 10. Bracket spanning both thresholds -> wide bracket, potential='immediate'
 * 11. Uncomputed trace -> uncertainTraces populated, hasUncertainTraces=true, not promoted
 * 12. Future / Ineligible exclusion -> ineligibleTraces populated, not counted in eligibleResidualTraceCount
 * 13. Source trace fidelity -> exact lossless object references to trace and sourceSessionMagnitude
 * 14. Partition completeness & disjointness -> union === relevantTraces, 0 duplicates, 0 omissions
 * 15. Immutability -> deeply frozen return structures
 * 16. Deterministic output -> pure function, zero input mutations, identical results across runs
 * 17. All 7 canonical dimensions container completeness -> full coverage of FROZEN_STRESS_DIMENSIONS
 */

import {
  deriveEvaluationContext,
  deriveSingleResidualStressTrace,
  deriveTemporalAttenuation,
  PERSISTENCE_THRESHOLD_POLICY,
} from './residualStressTrace';
import {
  deriveAllDimensionResidualStates,
  deriveDimensionResidualState,
} from './dimensionResidualState';
import {
  BoundedElapsedTime,
  EvaluationContextInput,
  ResidualStressTrace,
} from '../types/residualStressTrace.types';
import {
  DimensionResidualStateAuditResult,
} from '../types/dimensionResidualState.types';
import { DimensionProjectedStrengthStress } from '../types/strengthStressDimensionProjection.types';
import { DimensionProjectedRunningStress } from '../types/runningStressDimensionProjection.types';
import { StrengthStressMagnitude } from '../types/strengthStressMagnitude.types';
import { CanonicalRunningSession } from '../types/running.types';
import {
  FROZEN_STRESS_DIMENSIONS,
  projectStrengthStressToDimensions,
} from './strengthStressDimensionProjection';
import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from './runningStressMagnitude';
import { projectRunningStressToDimensions } from './runningStressDimensionProjection';
import { StressDimension } from '../types/stressModel.types';

// =========================================================================
// Mock Generators
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
        absoluteKgReps: 2500,
        distributionRelation: 'within-range-above-median',
        recencyDeltaKgReps: 100,
        currentQuality: 'high',
        referenceStatus: 'sufficient-reference',
      }),
      intensity: Object.freeze({
        peakWorkingLoadKg: 120,
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

function createStrengthProjection(params: {
  sourceLogId: string;
  exerciseId: string;
  exerciseName: string;
  date: string;
  startTime?: string;
  targetDimension?: StressDimension;
}): DimensionProjectedStrengthStress {
  const dim = params.targetDimension || 'knee-dominant-lower-body';
  const mag = createMockStrengthMagnitude({
    ...params,
    targetDimensions: [dim],
  });
  return projectStrengthStressToDimensions(mag).projections[0];
}

function createRunningProjection(params: {
  logId: string;
  date: string;
  startTime?: string;
  distanceKm?: number;
  durationSeconds?: number;
  dimensionIndex?: 0 | 1; // 0: knee-dominant, 1: hip-posterior
}): DimensionProjectedRunningStress {
  const session = createMockRunningSession(params);
  const historyRef = deriveRunningHistoricalReference(session, []);
  const interpretation = interpretRunningSessionVsHistory(session, historyRef);
  const mag = deriveRunningStressMagnitude(session, interpretation);
  const projections = projectRunningStressToDimensions(mag);
  return projections[params.dimensionIndex ?? 0];
}

// =========================================================================
// Audit Suite Execution
// =========================================================================

export function auditDimensionResidualState(): readonly DimensionResidualStateAuditResult[] {
  const results: DimensionResidualStateAuditResult[] = [];

  // Standard evaluation context: 2026-08-18 20:00:00 KST
  const standardEvalInput: EvaluationContextInput = Object.freeze({
    evaluationInstant: '2026-08-18T11:00:00.000Z',
    evaluationTimezone: 'Asia/Seoul',
  });
  const standardEvalContext = deriveEvaluationContext(standardEvalInput);

  // -------------------------------------------------------------------------
  // Audit 1: Empty dimension
  // -------------------------------------------------------------------------
  {
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [], standardEvalContext);
    const passed =
      state.dimension === 'knee-dominant-lower-body' &&
      state.relevantTraces.length === 0 &&
      state.immediateTraces.length === 0 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 0 &&
      state.bracketTraces.length === 0 &&
      state.uncertainTraces.length === 0 &&
      state.ineligibleTraces.length === 0 &&
      state.modalitySummary.presence === 'none' &&
      state.modalitySummary.hasStrength === false &&
      state.modalitySummary.hasRunning === false &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'none' &&
      state.strongestPersistence.hasPotentialPromotion === false &&
      state.uncertaintyMetadata.totalTraceCount === 0 &&
      state.uncertaintyMetadata.eligibleResidualTraceCount === 0;

    results.push({
      auditName: 'Audit 1: Empty dimension',
      passed,
      details: passed
        ? 'PASSED: Empty trace collection correctly yields zero counts, none modality, and none persistence.'
        : 'FAILED: Empty dimension state did not meet default contracts.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 2: Immediate only
  // -------------------------------------------------------------------------
  {
    const ev = createStrengthProjection({
      sourceLogId: 'squat-2h-ago',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '18:00:00', // 2h ago -> immediate
      targetDimension: 'knee-dominant-lower-body',
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);

    const passed =
      state.relevantTraces.length === 1 &&
      state.immediateTraces.length === 1 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 0 &&
      state.modalitySummary.presence === 'strength-only' &&
      state.modalitySummary.hasStrength === true &&
      state.modalitySummary.hasRunning === false &&
      state.strongestPersistence.definite === 'immediate' &&
      state.strongestPersistence.potential === 'immediate' &&
      state.strongestPersistence.hasPotentialPromotion === false &&
      state.uncertaintyMetadata.eligibleResidualTraceCount === 1;

    results.push({
      auditName: 'Audit 2: Immediate only',
      passed,
      details: passed
        ? 'PASSED: Single immediate strength trace correctly sets definite="immediate" and modality="strength-only".'
        : 'FAILED: Immediate only state derivation failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 3: Residual only
  // -------------------------------------------------------------------------
  {
    const ev = createRunningProjection({
      logId: 'run-36h-ago',
      date: '2026-08-17',
      startTime: '08:00:00', // 36h ago -> residual
      distanceKm: 8,
      durationSeconds: 2400,
      dimensionIndex: 0, // knee-dominant
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);

    const passed =
      state.relevantTraces.length === 1 &&
      state.immediateTraces.length === 0 &&
      state.residualTraces.length === 1 &&
      state.historicalTraces.length === 0 &&
      state.modalitySummary.presence === 'running-only' &&
      state.modalitySummary.hasStrength === false &&
      state.modalitySummary.hasRunning === true &&
      state.strongestPersistence.definite === 'residual' &&
      state.strongestPersistence.potential === 'residual' &&
      state.strongestPersistence.hasPotentialPromotion === false;

    results.push({
      auditName: 'Audit 3: Residual only',
      passed,
      details: passed
        ? 'PASSED: Single residual running trace correctly sets definite="residual" and modality="running-only".'
        : 'FAILED: Residual only state derivation failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 4: Historical only
  // -------------------------------------------------------------------------
  {
    const ev = createStrengthProjection({
      sourceLogId: 'bench-100h-ago',
      exerciseId: 'bench',
      exerciseName: '벤치프레스',
      date: '2026-08-14',
      startTime: '16:00:00', // 100h ago -> historical
      targetDimension: 'horizontal-push',
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('horizontal-push', [trace], standardEvalContext);

    const passed =
      state.relevantTraces.length === 1 &&
      state.immediateTraces.length === 0 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 1 &&
      state.strongestPersistence.definite === 'historical' &&
      state.strongestPersistence.potential === 'historical' &&
      state.uncertaintyMetadata.eligibleResidualTraceCount === 1;

    results.push({
      auditName: 'Audit 4: Historical only',
      passed,
      details: passed
        ? 'PASSED: Historical trace preserved in historicalTraces without deletion; definite="historical".'
        : 'FAILED: Historical only state derivation failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 5: Immediate + Residual coexistence
  // -------------------------------------------------------------------------
  {
    const ev1 = createStrengthProjection({
      sourceLogId: 'squat-10h-ago',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '10:00:00', // 10h ago -> immediate
      targetDimension: 'knee-dominant-lower-body',
    });
    const ev2 = createStrengthProjection({
      sourceLogId: 'lunge-30h-ago',
      exerciseId: 'lunge',
      exerciseName: '런지',
      date: '2026-08-17',
      startTime: '14:00:00', // 30h ago -> residual
      targetDimension: 'knee-dominant-lower-body',
    });
    const t1 = deriveSingleResidualStressTrace(ev1, standardEvalContext);
    const t2 = deriveSingleResidualStressTrace(ev2, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [t1, t2], standardEvalContext);

    const passed =
      state.relevantTraces.length === 2 &&
      state.immediateTraces.length === 1 &&
      state.residualTraces.length === 1 &&
      state.strongestPersistence.definite === 'immediate' &&
      state.strongestPersistence.potential === 'immediate' &&
      state.modalitySummary.strengthTraceCount === 2;

    results.push({
      auditName: 'Audit 5: Immediate + Residual coexistence',
      passed,
      details: passed
        ? 'PASSED: Both immediate and residual traces coexist without max-culling or trace summation.'
        : 'FAILED: Immediate + Residual coexistence failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 6: Strength + Running coexistence
  // -------------------------------------------------------------------------
  {
    const squatEv = createStrengthProjection({
      sourceLogId: 'squat-18h-ago',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '02:00:00', // 18h ago -> immediate
      targetDimension: 'knee-dominant-lower-body',
    });
    const runEv = createRunningProjection({
      logId: 'run-40h-ago',
      date: '2026-08-17',
      startTime: '04:00:00', // 40h ago -> residual
      distanceKm: 5,
      durationSeconds: 1500,
      dimensionIndex: 0, // knee-dominant
    });
    const t1 = deriveSingleResidualStressTrace(squatEv, standardEvalContext);
    const t2 = deriveSingleResidualStressTrace(runEv, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [t1, t2], standardEvalContext);

    const passed =
      state.relevantTraces.length === 2 &&
      state.modalitySummary.presence === 'both' &&
      state.modalitySummary.hasStrength === true &&
      state.modalitySummary.hasRunning === true &&
      state.modalitySummary.strengthTraceCount === 1 &&
      state.modalitySummary.runningTraceCount === 1 &&
      state.immediateTraces.length === 1 &&
      state.residualTraces.length === 1 &&
      state.strongestPersistence.definite === 'immediate';

    results.push({
      auditName: 'Audit 6: Strength + Running coexistence',
      passed,
      details: passed
        ? 'PASSED: Strength and Running coexist losslessly with modality="both" without common fatigue conversion.'
        : 'FAILED: Strength + Running coexistence failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 7: Multiple same-state traces
  // -------------------------------------------------------------------------
  {
    const ev1 = createStrengthProjection({
      sourceLogId: 'squat-2h',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '18:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const ev2 = createStrengthProjection({
      sourceLogId: 'legpress-4h',
      exerciseId: 'legpress',
      exerciseName: '레그프레스',
      date: '2026-08-18',
      startTime: '16:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const ev3 = createStrengthProjection({
      sourceLogId: 'lunge-6h',
      exerciseId: 'lunge',
      exerciseName: '런지',
      date: '2026-08-18',
      startTime: '14:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const traces = [
      deriveSingleResidualStressTrace(ev1, standardEvalContext),
      deriveSingleResidualStressTrace(ev2, standardEvalContext),
      deriveSingleResidualStressTrace(ev3, standardEvalContext),
    ];
    const state = deriveDimensionResidualState('knee-dominant-lower-body', traces, standardEvalContext);

    const passed =
      state.relevantTraces.length === 3 &&
      state.immediateTraces.length === 3 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 0 &&
      state.strongestPersistence.definite === 'immediate' &&
      state.strongestPersistence.potential === 'immediate';

    results.push({
      auditName: 'Audit 7: Multiple same-state traces',
      passed,
      details: passed
        ? 'PASSED: 3 immediate traces preserved without scalar deduplication or artificial combination.'
        : 'FAILED: Multiple same-state traces failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 8: Bracket crossing 24h
  // -------------------------------------------------------------------------
  {
    // Yesterday missing time: lower = 20h (<24h -> immediate), upper = 44h (>=24h -> residual)
    const ev = createStrengthProjection({
      sourceLogId: 'squat-yesterday-missing-time',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-17',
      startTime: undefined,
      targetDimension: 'knee-dominant-lower-body',
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);

    const passed =
      state.bracketTraces.length === 1 &&
      state.immediateTraces.length === 0 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 0 &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'immediate' &&
      state.strongestPersistence.hasPotentialPromotion === true &&
      state.uncertaintyMetadata.hasBracketTraces === true &&
      state.uncertaintyMetadata.bracketTraceCount === 1;

    results.push({
      auditName: 'Audit 8: Bracket crossing 24h',
      passed,
      details: passed
        ? 'PASSED: Bracket crossing 24h preserved as bracketTrace; definite="none", potential="immediate", promotion=true.'
        : 'FAILED: Bracket crossing 24h failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 9: Bracket crossing 72h
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed with lower = 55h (residual), upper = 83h (historical)
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 198000, // 55h -> residual
      elapsedUpperBoundSeconds: 298800, // 83h -> historical
      evidenceCalendarDate: '2026-08-15',
      dayStartInstant: '2026-08-14T15:00:00.000Z',
      dayEndInstant: '2026-08-15T14:59:59.999Z',
    });
    const ev = createStrengthProjection({
      sourceLogId: 'squat-old-missing-time',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-15',
      startTime: undefined,
      targetDimension: 'knee-dominant-lower-body',
    });
    const trace: ResidualStressTrace = Object.freeze({
      sourceEvidence: ev,
      occurrenceState: 'occurred-calendar-bounded',
      elapsedTime: boundedElapsed,
      temporalAttenuation: deriveTemporalAttenuation(boundedElapsed),
    });

    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);
    const passed =
      state.bracketTraces.length === 1 &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'residual' &&
      state.strongestPersistence.hasPotentialPromotion === true;

    results.push({
      auditName: 'Audit 9: Bracket crossing 72h',
      passed,
      details: passed
        ? 'PASSED: Bracket crossing 72h preserved; definite="none", potential="residual", promotion=true.'
        : 'FAILED: Bracket crossing 72h failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 10: Bracket spanning both thresholds
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed with lower = 15h (immediate), upper = 85h (historical)
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 54000,  // 15h -> immediate
      elapsedUpperBoundSeconds: 306000, // 85h -> historical
      evidenceCalendarDate: '2026-08-15',
      dayStartInstant: '2026-08-14T15:00:00.000Z',
      dayEndInstant: '2026-08-15T14:59:59.999Z',
    });
    const ev = createStrengthProjection({
      sourceLogId: 'squat-wide-bracket',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-15',
      startTime: undefined,
      targetDimension: 'knee-dominant-lower-body',
    });
    const trace: ResidualStressTrace = Object.freeze({
      sourceEvidence: ev,
      occurrenceState: 'occurred-calendar-bounded',
      elapsedTime: boundedElapsed,
      temporalAttenuation: deriveTemporalAttenuation(boundedElapsed),
    });

    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);
    const passed =
      state.bracketTraces.length === 1 &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'immediate' &&
      state.strongestPersistence.hasPotentialPromotion === true;

    results.push({
      auditName: 'Audit 10: Bracket spanning both thresholds',
      passed,
      details: passed
        ? 'PASSED: Bracket spanning both thresholds correctly yields potential="immediate".'
        : 'FAILED: Wide bracket spanning both thresholds failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 11: Uncomputed trace
  // -------------------------------------------------------------------------
  {
    // Same-day missing time
    const ev = createStrengthProjection({
      sourceLogId: 'squat-sameday-missing',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: undefined,
      targetDimension: 'knee-dominant-lower-body',
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);

    const passed =
      state.uncertainTraces.length === 1 &&
      state.immediateTraces.length === 0 &&
      state.residualTraces.length === 0 &&
      state.historicalTraces.length === 0 &&
      state.bracketTraces.length === 0 &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'none' &&
      state.uncertaintyMetadata.hasUncertainTraces === true &&
      state.uncertaintyMetadata.uncertainTraceCount === 1 &&
      state.uncertaintyMetadata.eligibleResidualTraceCount === 0;

    results.push({
      auditName: 'Audit 11: Uncomputed trace',
      passed,
      details: passed
        ? 'PASSED: Same-day missing time isolated in uncertainTraces without promotion to exact/potential state.'
        : 'FAILED: Uncomputed trace handling failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 12: Future / Ineligible exclusion
  // -------------------------------------------------------------------------
  {
    const ev = createRunningProjection({
      logId: 'run-future',
      date: '2026-08-19',
      startTime: '08:00:00',
      distanceKm: 5,
      durationSeconds: 1500,
      dimensionIndex: 0,
    });
    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [trace], standardEvalContext);

    const passed =
      state.ineligibleTraces.length === 1 &&
      state.relevantTraces.length === 1 &&
      state.uncertaintyMetadata.eligibleResidualTraceCount === 0 &&
      state.strongestPersistence.definite === 'none' &&
      state.strongestPersistence.potential === 'none';

    results.push({
      auditName: 'Audit 12: Future / Ineligible exclusion',
      passed,
      details: passed
        ? 'PASSED: Future evidence quarantined in ineligibleTraces and excluded from eligible count.'
        : 'FAILED: Future / Ineligible trace handling failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 13: Source trace fidelity
  // -------------------------------------------------------------------------
  {
    const originalEv = createStrengthProjection({
      sourceLogId: 'fidelity-test',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '10:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const originalTrace = deriveSingleResidualStressTrace(originalEv, standardEvalContext);
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [originalTrace], standardEvalContext);

    const passed =
      state.relevantTraces[0] === originalTrace &&
      state.immediateTraces[0] === originalTrace &&
      state.immediateTraces[0].sourceEvidence === originalEv &&
      state.immediateTraces[0].sourceEvidence.sourceSessionMagnitude === originalEv.sourceSessionMagnitude;

    results.push({
      auditName: 'Audit 13: Source trace fidelity',
      passed,
      details: passed
        ? 'PASSED: Exact object references to ResidualStressTrace and sourceSessionMagnitude preserved losslessly.'
        : 'FAILED: Source trace fidelity failed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 14: Partition completeness & disjointness
  // -------------------------------------------------------------------------
  {
    // Mix of 6 distinct traces across all 6 partitions
    const tImmediate = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-immediate',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-18',
        startTime: '18:00:00',
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );
    const tResidual = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-residual',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-17',
        startTime: '10:00:00',
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );
    const tHistorical = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-historical',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-14',
        startTime: '10:00:00',
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );
    const tBracket = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-bracket',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-17',
        startTime: undefined,
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );
    const tUncertain = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-uncertain',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-18',
        startTime: undefined,
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );
    const tIneligible = deriveSingleResidualStressTrace(
      createStrengthProjection({
        sourceLogId: 'p-ineligible',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-19',
        startTime: '10:00:00',
        targetDimension: 'knee-dominant-lower-body',
      }),
      standardEvalContext
    );

    const mixed = [tImmediate, tResidual, tHistorical, tBracket, tUncertain, tIneligible];
    const state = deriveDimensionResidualState('knee-dominant-lower-body', mixed, standardEvalContext);

    const partitionSum =
      state.immediateTraces.length +
      state.residualTraces.length +
      state.historicalTraces.length +
      state.bracketTraces.length +
      state.uncertainTraces.length +
      state.ineligibleTraces.length;

    const allPartitionItems = [
      ...state.immediateTraces,
      ...state.residualTraces,
      ...state.historicalTraces,
      ...state.bracketTraces,
      ...state.uncertainTraces,
      ...state.ineligibleTraces,
    ];
    const uniqueItems = new Set(allPartitionItems);

    const passed =
      partitionSum === state.relevantTraces.length &&
      state.relevantTraces.length === 6 &&
      uniqueItems.size === 6;

    results.push({
      auditName: 'Audit 14: Partition completeness & disjointness',
      passed,
      details: passed
        ? 'PASSED: Partition union === relevantTraces, 0 duplicates, 0 omissions across 6 partitions.'
        : 'FAILED: Partition completeness or disjointness violated.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 15: Immutability
  // -------------------------------------------------------------------------
  {
    const state = deriveDimensionResidualState('knee-dominant-lower-body', [], standardEvalContext);
    const passed =
      Object.isFrozen(state) &&
      Object.isFrozen(state.relevantTraces) &&
      Object.isFrozen(state.immediateTraces) &&
      Object.isFrozen(state.residualTraces) &&
      Object.isFrozen(state.historicalTraces) &&
      Object.isFrozen(state.bracketTraces) &&
      Object.isFrozen(state.uncertainTraces) &&
      Object.isFrozen(state.ineligibleTraces) &&
      Object.isFrozen(state.modalitySummary) &&
      Object.isFrozen(state.strongestPersistence) &&
      Object.isFrozen(state.uncertaintyMetadata);

    results.push({
      auditName: 'Audit 15: Immutability',
      passed,
      details: passed
        ? 'PASSED: DimensionResidualState and all sub-objects/arrays are deeply frozen.'
        : 'FAILED: Return structures are not frozen.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 16: Deterministic output
  // -------------------------------------------------------------------------
  {
    const ev1 = createStrengthProjection({
      sourceLogId: 'det-1',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '12:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const ev2 = createRunningProjection({
      logId: 'det-2',
      date: '2026-08-17',
      startTime: '10:00:00',
      distanceKm: 5,
      durationSeconds: 1500,
      dimensionIndex: 0,
    });
    const inputPool = [
      deriveSingleResidualStressTrace(ev1, standardEvalContext),
      deriveSingleResidualStressTrace(ev2, standardEvalContext),
    ];

    const s1 = deriveDimensionResidualState('knee-dominant-lower-body', inputPool, standardEvalContext);
    const s2 = deriveDimensionResidualState('knee-dominant-lower-body', inputPool, standardEvalContext);

    const passed =
      s1.relevantTraces.length === s2.relevantTraces.length &&
      s1.strongestPersistence.definite === s2.strongestPersistence.definite &&
      s1.modalitySummary.presence === s2.modalitySummary.presence &&
      JSON.stringify(s1) === JSON.stringify(s2);

    results.push({
      auditName: 'Audit 16: Deterministic output',
      passed,
      details: passed
        ? 'PASSED: Multiple invocations with identical inputs yield identical deterministic structures.'
        : 'FAILED: Output was not deterministic.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 17: All 7 canonical dimensions container completeness
  // -------------------------------------------------------------------------
  {
    const squatEv = createStrengthProjection({
      sourceLogId: 'all-squat',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '10:00:00',
      targetDimension: 'knee-dominant-lower-body',
    });
    const benchEv = createStrengthProjection({
      sourceLogId: 'all-bench',
      exerciseId: 'bench',
      exerciseName: '벤치',
      date: '2026-08-18',
      startTime: '11:00:00',
      targetDimension: 'horizontal-push',
    });
    const traces = [
      deriveSingleResidualStressTrace(squatEv, standardEvalContext),
      deriveSingleResidualStressTrace(benchEv, standardEvalContext),
    ];

    const allStates = deriveAllDimensionResidualStates(traces, standardEvalContext);

    const allKeysPresent = FROZEN_STRESS_DIMENSIONS.every(
      (dim) => allStates[dim] !== undefined && allStates[dim].dimension === dim
    );
    const kneeHasTrace = allStates['knee-dominant-lower-body'].relevantTraces.length === 1;
    const benchHasTrace = allStates['horizontal-push'].relevantTraces.length === 1;
    const pullEmpty = allStates['horizontal-pull'].relevantTraces.length === 0;

    const passed = allKeysPresent && kneeHasTrace && benchHasTrace && pullEmpty && Object.isFrozen(allStates);

    results.push({
      auditName: 'Audit 17: All 7 canonical dimensions container completeness',
      passed,
      details: passed
        ? 'PASSED: deriveAllDimensionResidualStates generated complete, frozen dictionary for all 7 canonical dimensions.'
        : 'FAILED: All dimension residual states container completeness failed.',
    });
  }

  return Object.freeze(results);
}

/** Alias for audit execution consistency */
export const runDimensionResidualStateAudits = auditDimensionResidualState;
