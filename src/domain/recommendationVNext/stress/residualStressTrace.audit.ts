/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Residual Stress Trace & Ordinal Persistence Invariant Audit Suite
 * (VNext Recommendation Engine - CU3.14 / CU3.14A / CU3.14B / CU3.15 / CU3.15A / CU3.15B / CU3.15C)
 *
 * Dedicated verification module validating the complete 16 required invariants:
 *  1. 0h -> immediate
 *  2. 23:59:59 -> immediate
 *  3. exactly 24h -> residual
 *  4. 71:59:59 -> residual
 *  5. exactly 72h -> historical
 *  6. >72h -> historical
 *  7. bounded wholly immediate
 *  8. bounded crossing 24h
 *  9. bounded wholly residual
 * 10. bounded crossing 72h
 * 11. bounded spanning both thresholds
 * 12. same-day missing -> uncomputed
 * 13. future -> ineligible
 * 14. source trace immutability
 * 15. deterministic output
 * 16. existing VNext regression PASS (timezone, DST, collection partition, SSOT)
 */

import {
  deriveEvaluationContext,
  deriveResidualStressTraces,
  deriveSingleResidualStressTrace,
  deriveTemporalAttenuation,
  isResidualCandidateOccurrence,
  mapElapsedSecondsToOrdinalState,
  parseWallClockInTimezone,
  PERSISTENCE_THRESHOLD_POLICY,
  THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS,
  THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS,
} from './residualStressTrace';
import {
  BoundedElapsedTime,
  EvaluationContextInput,
  ExactElapsedTime,
  ResidualStressTraceAuditResult,
} from '../types/residualStressTrace.types';
import { DimensionProjectedStrengthStress } from '../types/strengthStressDimensionProjection.types';
import { DimensionProjectedRunningStress } from '../types/runningStressDimensionProjection.types';
import { StrengthStressMagnitude } from '../types/strengthStressMagnitude.types';
import { CanonicalRunningSession } from '../types/running.types';
import { projectStrengthStressToDimensions } from './strengthStressDimensionProjection';
import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from './runningStressMagnitude';
import { projectRunningStressToDimensions } from './runningStressDimensionProjection';

// =========================================================================
// Mock Evidence Generators
// =========================================================================

function createMockStrengthMagnitude(params: {
  exerciseId: string;
  exerciseName: string;
  date: string;
  startTime?: string;
  sourceLogId: string;
  targetDimensions: ('knee-dominant-lower-body' | 'hip-posterior-chain' | 'axial-systemic-loading' | 'horizontal-push')[];
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
        absoluteKgReps: 2000,
        distributionRelation: 'within-range-above-median',
        recencyDeltaKgReps: 100,
        currentQuality: 'high',
        referenceStatus: 'sufficient-reference',
      }),
      intensity: Object.freeze({
        peakWorkingLoadKg: 100,
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
}): DimensionProjectedStrengthStress {
  const mag = createMockStrengthMagnitude({
    ...params,
    targetDimensions: ['knee-dominant-lower-body'],
  });
  return projectStrengthStressToDimensions(mag).projections[0];
}

function createRunningProjection(params: {
  logId: string;
  date: string;
  startTime?: string;
  distanceKm?: number;
  durationSeconds?: number;
}): DimensionProjectedRunningStress {
  const session = createMockRunningSession(params);
  const historyRef = deriveRunningHistoricalReference(session, []);
  const interpretation = interpretRunningSessionVsHistory(session, historyRef);
  const mag = deriveRunningStressMagnitude(session, interpretation);
  return projectRunningStressToDimensions(mag)[0]; // knee-dominant-lower-body
}

// =========================================================================
// Invariant Audit Execution
// =========================================================================

export function auditResidualStressTrace(): readonly ResidualStressTraceAuditResult[] {
  const results: ResidualStressTraceAuditResult[] = [];

  // Standard evaluation context: 2026-08-18 20:00:00 in Asia/Seoul (UTC: 2026-08-18T11:00:00.000Z)
  const standardEvalInput: EvaluationContextInput = Object.freeze({
    evaluationInstant: '2026-08-18T11:00:00.000Z',
    evaluationTimezone: 'Asia/Seoul',
  });
  const standardEvalContext = deriveEvaluationContext(standardEvalInput);

  // -------------------------------------------------------------------------
  // Audit 1: 0h -> immediate
  // -------------------------------------------------------------------------
  {
    const ev = createStrengthProjection({
      sourceLogId: 'log-0h',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '20:00:00', // exact same instant -> elapsedSeconds === 0
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 0 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'immediate' &&
      trace.temporalAttenuation.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 1: 0h -> immediate',
      passed,
      details: passed
        ? 'PASSED: 0h elapsed mapped to exact-ordinal state "immediate".'
        : 'FAILED: 0h did not map to immediate.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 2: 23:59:59 (86399s) -> immediate
  // -------------------------------------------------------------------------
  {
    // 2026-08-17 20:00:01 in Asia/Seoul (exactly 86399 seconds before 2026-08-18 20:00:00)
    const ev = createStrengthProjection({
      sourceLogId: 'log-23h-59m-59s',
      exerciseId: 'bench',
      exerciseName: '벤치프레스',
      date: '2026-08-17',
      startTime: '20:00:01',
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 86399 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'immediate';

    results.push({
      auditName: 'Audit 2: 23:59:59 -> immediate',
      passed,
      details: passed
        ? `PASSED: 23:59:59 elapsed (86399s < 86400s) mapped to exact-ordinal state "immediate".`
        : 'FAILED: 23:59:59 did not map to immediate.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 3: exactly 24h (86400s) -> residual
  // -------------------------------------------------------------------------
  {
    // 2026-08-17 20:00:00 in Asia/Seoul (exactly 86400 seconds before 2026-08-18 20:00:00)
    const ev = createStrengthProjection({
      sourceLogId: 'log-exact-24h',
      exerciseId: 'deadlift',
      exerciseName: '데드리프트',
      date: '2026-08-17',
      startTime: '20:00:00',
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 86400 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'residual';

    results.push({
      auditName: 'Audit 3: exactly 24h -> residual',
      passed,
      details: passed
        ? 'PASSED: Exactly 24h (86400s) mapped to exact-ordinal state "residual".'
        : 'FAILED: Exactly 24h did not map to residual.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 4: 71:59:59 (259199s) -> residual
  // -------------------------------------------------------------------------
  {
    // 2026-08-15 20:00:01 in Asia/Seoul (exactly 259199 seconds = 71h 59m 59s before)
    const ev = createStrengthProjection({
      sourceLogId: 'log-71h-59m-59s',
      exerciseId: 'ohp',
      exerciseName: '오버헤드프레스',
      date: '2026-08-15',
      startTime: '20:00:01',
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 259199 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'residual';

    results.push({
      auditName: 'Audit 4: 71:59:59 -> residual',
      passed,
      details: passed
        ? 'PASSED: 71:59:59 elapsed (259199s < 259200s) mapped to exact-ordinal state "residual".'
        : 'FAILED: 71:59:59 did not map to residual.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 5: exactly 72h (259200s) -> historical
  // -------------------------------------------------------------------------
  {
    // 2026-08-15 20:00:00 in Asia/Seoul (exactly 259200 seconds = 72h before)
    const ev = createStrengthProjection({
      sourceLogId: 'log-exact-72h',
      exerciseId: 'row',
      exerciseName: '바벨로우',
      date: '2026-08-15',
      startTime: '20:00:00',
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 259200 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'historical';

    results.push({
      auditName: 'Audit 5: exactly 72h -> historical',
      passed,
      details: passed
        ? 'PASSED: Exactly 72h (259200s) mapped to exact-ordinal state "historical".'
        : 'FAILED: Exactly 72h did not map to historical.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 6: >72h (100h / 360000s) -> historical
  // -------------------------------------------------------------------------
  {
    // 2026-08-14 16:00:00 in Asia/Seoul (100 hours = 360000s before)
    const ev = createRunningProjection({
      logId: 'run-100h-ago',
      date: '2026-08-14',
      startTime: '16:00:00',
      distanceKm: 10,
      durationSeconds: 3000,
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-exact' &&
      trace.elapsedTime.kind === 'exact' &&
      trace.elapsedTime.elapsedSeconds === 360000 &&
      trace.temporalAttenuation.kind === 'exact-ordinal' &&
      trace.temporalAttenuation.state === 'historical';

    results.push({
      auditName: 'Audit 6: >72h -> historical',
      passed,
      details: passed
        ? 'PASSED: >72h elapsed (100h = 360000s) mapped to exact-ordinal state "historical".'
        : 'FAILED: >72h did not map to historical.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 7: bounded wholly immediate
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed with lower = 10,000s, upper = 50,000s (both < 86,400s)
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 10000,
      elapsedUpperBoundSeconds: 50000,
      evidenceCalendarDate: '2026-08-18',
      dayStartInstant: '2026-08-17T15:00:00.000Z',
      dayEndInstant: '2026-08-18T14:59:59.999Z',
    });

    const att = deriveTemporalAttenuation(boundedElapsed);
    const passed =
      att.kind === 'exact-ordinal' &&
      att.state === 'immediate' &&
      att.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 7: bounded wholly immediate',
      passed,
      details: passed
        ? 'PASSED: Bounded interval wholly within <24h resolved to exact-ordinal "immediate".'
        : 'FAILED: Wholly immediate bounded interval did not resolve to exact-ordinal immediate.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 8: bounded crossing 24h
  // -------------------------------------------------------------------------
  {
    // Yesterday missing time: eval 2026-08-18 20:00:00 KST, evidence 2026-08-17
    // elapsedLowerBound = 72,000s (20h < 24h -> immediate)
    // elapsedUpperBound = 158,400s (44h >= 24h, < 72h -> residual)
    const ev = createStrengthProjection({
      sourceLogId: 'log-yesterday-crossing-24h',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-17',
      startTime: undefined,
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurred-calendar-bounded' &&
      trace.elapsedTime.kind === 'bounded' &&
      trace.temporalAttenuation.kind === 'bracket-ordinal' &&
      trace.temporalAttenuation.lowerBoundState === 'residual' &&
      trace.temporalAttenuation.upperBoundState === 'immediate' &&
      trace.temporalAttenuation.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 8: bounded crossing 24h',
      passed,
      details: passed
        ? 'PASSED: Bounded interval crossing 24h resolved to bracket { lowerBound: "residual", upperBound: "immediate" } without midpoint guess.'
        : 'FAILED: Bounded interval crossing 24h did not form correct bracket.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 9: bounded wholly residual
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed with lower = 100,000s (~27.7h), upper = 200,000s (~55.5h) (both in [24h, 72h))
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 100000,
      elapsedUpperBoundSeconds: 200000,
      evidenceCalendarDate: '2026-08-16',
      dayStartInstant: '2026-08-15T15:00:00.000Z',
      dayEndInstant: '2026-08-16T14:59:59.999Z',
    });

    const att = deriveTemporalAttenuation(boundedElapsed);
    const passed =
      att.kind === 'exact-ordinal' &&
      att.state === 'residual' &&
      att.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 9: bounded wholly residual',
      passed,
      details: passed
        ? 'PASSED: Bounded interval wholly within [24h, 72h) resolved to exact-ordinal "residual".'
        : 'FAILED: Wholly residual bounded interval did not resolve to exact-ordinal residual.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 10: bounded crossing 72h
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed with lower = 200,000s (~55.5h, residual), upper = 300,000s (~83.3h, historical)
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 200000,
      elapsedUpperBoundSeconds: 300000,
      evidenceCalendarDate: '2026-08-15',
      dayStartInstant: '2026-08-14T15:00:00.000Z',
      dayEndInstant: '2026-08-15T14:59:59.999Z',
    });

    const att = deriveTemporalAttenuation(boundedElapsed);
    const passed =
      att.kind === 'bracket-ordinal' &&
      att.lowerBoundState === 'historical' &&
      att.upperBoundState === 'residual' &&
      att.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 10: bounded crossing 72h',
      passed,
      details: passed
        ? 'PASSED: Bounded interval crossing 72h resolved to bracket { lowerBound: "historical", upperBound: "residual" }.'
        : 'FAILED: Bounded interval crossing 72h did not form correct bracket.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 11: bounded spanning both thresholds
  // -------------------------------------------------------------------------
  {
    // Bounded elapsed spanning both 24h and 72h: lower = 50,000s (immediate), upper = 300,000s (historical)
    const boundedElapsed: BoundedElapsedTime = Object.freeze({
      kind: 'bounded',
      elapsedLowerBoundSeconds: 50000,
      elapsedUpperBoundSeconds: 300000,
      evidenceCalendarDate: '2026-08-15',
      dayStartInstant: '2026-08-14T15:00:00.000Z',
      dayEndInstant: '2026-08-15T14:59:59.999Z',
    });

    const att = deriveTemporalAttenuation(boundedElapsed);
    const passed =
      att.kind === 'bracket-ordinal' &&
      att.lowerBoundState === 'historical' &&
      att.upperBoundState === 'immediate' &&
      att.thresholdPolicy === PERSISTENCE_THRESHOLD_POLICY;

    results.push({
      auditName: 'Audit 11: bounded spanning both thresholds',
      passed,
      details: passed
        ? 'PASSED: Bounded interval spanning both thresholds resolved to wide bracket { lowerBound: "historical", upperBound: "immediate" }.'
        : 'FAILED: Bounded interval spanning both thresholds did not form correct bracket.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 12: same-day missing -> uncomputed
  // -------------------------------------------------------------------------
  {
    const ev = createStrengthProjection({
      sourceLogId: 'log-sameday-missing',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: undefined,
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'occurrence-uncertain' &&
      trace.elapsedTime.kind === 'unavailable' &&
      trace.elapsedTime.reason === 'missing-same-day-time' &&
      trace.temporalAttenuation.kind === 'uncomputed' &&
      trace.temporalAttenuation.reason === 'missing-same-day-time';

    results.push({
      auditName: 'Audit 12: same-day missing -> uncomputed',
      passed,
      details: passed
        ? 'PASSED: Same-day missing time preserved as occurrence-uncertain and temporal attenuation "uncomputed".'
        : 'FAILED: Same-day missing time was not mapped to uncomputed.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 13: future -> ineligible
  // -------------------------------------------------------------------------
  {
    const ev = createRunningProjection({
      logId: 'run-future',
      date: '2026-08-19',
      startTime: '08:00:00',
      distanceKm: 5,
      durationSeconds: 1500,
    });

    const trace = deriveSingleResidualStressTrace(ev, standardEvalContext);
    const passed =
      trace.occurrenceState === 'future-evidence' &&
      trace.elapsedTime.kind === 'unavailable' &&
      trace.elapsedTime.reason === 'future-evidence' &&
      trace.temporalAttenuation.kind === 'ineligible' &&
      trace.temporalAttenuation.reason === 'future-evidence';

    results.push({
      auditName: 'Audit 13: future -> ineligible',
      passed,
      details: passed
        ? 'PASSED: Future evidence quarantined as future-evidence and temporal attenuation "ineligible".'
        : 'FAILED: Future evidence was not mapped to ineligible.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 14: source trace immutability
  // -------------------------------------------------------------------------
  {
    const originalStrength = createStrengthProjection({
      sourceLogId: 'fidelity-strength-log',
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      date: '2026-08-18',
      startTime: '08:00:00',
    });

    const collection = deriveResidualStressTraces([originalStrength], standardEvalInput);
    const trace = collection.traces[0];

    const isSourceIdentical = trace.sourceEvidence === originalStrength;
    const isMagnitudeIdentical =
      trace.sourceEvidence.sourceSessionMagnitude === originalStrength.sourceSessionMagnitude;
    const isDeepFrozen =
      Object.isFrozen(trace) &&
      Object.isFrozen(trace.elapsedTime) &&
      Object.isFrozen(trace.temporalAttenuation);

    const passed = isSourceIdentical && isMagnitudeIdentical && isDeepFrozen;

    results.push({
      auditName: 'Audit 14: source trace immutability',
      passed,
      details: passed
        ? 'PASSED: sourceEvidence and sourceSessionMagnitude preserved via exact lossless references; return trees deeply frozen.'
        : 'FAILED: Source reference was mutated or cloned.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 15: deterministic output
  // -------------------------------------------------------------------------
  {
    const inputPool = [
      createStrengthProjection({
        sourceLogId: 'det-1',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-17',
        startTime: '10:00:00',
      }),
      createRunningProjection({
        logId: 'det-2',
        date: '2026-08-18',
        startTime: '12:00:00',
        distanceKm: 5,
        durationSeconds: 1500,
      }),
    ];

    const col1 = deriveResidualStressTraces(inputPool, standardEvalInput);
    const col2 = deriveResidualStressTraces(inputPool, standardEvalInput);

    const isDeterministic =
      col1.totalCount === col2.totalCount &&
      col1.traces[0].occurrenceState === col2.traces[0].occurrenceState &&
      col1.traces[0].temporalAttenuation.kind === col2.traces[0].temporalAttenuation.kind &&
      JSON.stringify(col1.traces) === JSON.stringify(col2.traces);

    const passed = isDeterministic;

    results.push({
      auditName: 'Audit 15: deterministic output',
      passed,
      details: passed
        ? 'PASSED: Multiple invocations with identical inputs produce identical deterministic traces and attenuation representations.'
        : 'FAILED: Invocations produced non-deterministic outputs.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 16: existing VNext regression PASS (Timezone, DST, Partition, SSOT)
  // -------------------------------------------------------------------------
  {
    // Check SSOT derivation
    const ssotPassed =
      standardEvalContext.evaluationInstant === '2026-08-18T11:00:00.000Z' &&
      standardEvalContext.evaluationTimezone === 'Asia/Seoul' &&
      standardEvalContext.evaluationCalendarDate === '2026-08-18' &&
      standardEvalContext.evaluationLocalTime === '20:00:00';

    // Check Timezone Wall-Clock
    const nyWallClock = parseWallClockInTimezone('2026-08-18', '10:00:00', 'America/New_York');
    const seoulWallClock = parseWallClockInTimezone('2026-08-18', '10:00:00', 'Asia/Seoul');
    const timezonePassed = (nyWallClock.instantMs - seoulWallClock.instantMs) / (1000 * 3600) === 13;

    // Check DST 23h and 25h
    const springDayStart = parseWallClockInTimezone('2026-03-08', '00:00:00.000', 'America/New_York');
    const springDayEnd = parseWallClockInTimezone('2026-03-08', '23:59:59.999', 'America/New_York');
    const spring23h = Math.round((springDayEnd.instantMs - springDayStart.instantMs) / 1000) === 23 * 3600;

    const fallDayStart = parseWallClockInTimezone('2026-11-01', '00:00:00.000', 'America/New_York');
    const fallDayEnd = parseWallClockInTimezone('2026-11-01', '23:59:59.999', 'America/New_York');
    const fall25h = Math.round((fallDayEnd.instantMs - fallDayStart.instantMs) / 1000) === 25 * 3600;

    const dstPassed = spring23h && fall25h;

    // Check Partition
    const mixedEvidence = [
      createStrengthProjection({
        sourceLogId: 'reg-1',
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        date: '2026-08-18',
        startTime: '10:00:00',
      }),
      createRunningProjection({
        logId: 'reg-2',
        date: '2026-08-16',
        startTime: undefined,
        distanceKm: 5,
        durationSeconds: 1500,
      }),
      createStrengthProjection({
        sourceLogId: 'reg-3',
        exerciseId: 'bench',
        exerciseName: '벤치',
        date: '2026-08-18',
        startTime: undefined,
      }),
      createStrengthProjection({
        sourceLogId: 'reg-4',
        exerciseId: 'deadlift',
        exerciseName: '데드리프트',
        date: '2026-08-18',
        startTime: '23:00:00',
      }),
    ];

    const collection = deriveResidualStressTraces(mixedEvidence, standardEvalInput);
    const partitionPassed =
      collection.validCount === 2 &&
      collection.uncertainCount === 1 &&
      collection.futureCount === 1 &&
      collection.validCount + collection.uncertainCount + collection.futureCount === collection.totalCount;

    const passed = ssotPassed && timezonePassed && dstPassed && partitionPassed;

    results.push({
      auditName: 'Audit 16: existing VNext regression PASS',
      passed,
      details: passed
        ? 'PASSED: All baseline VNext regressions (SSOT, Timezone 13h, DST 23h/25h, Partition Invariants) passed 100%.'
        : 'FAILED: Baseline regression check failed.',
    });
  }

  return Object.freeze(results);
}

/** Alias for audit execution consistency */
export const runResidualStressTraceAudits = auditResidualStressTrace;
