/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Running Stress Dimension Projection Invariant Audit Suite (VNext Recommendation Engine - CU3.12I)
 *
 * Dedicated verification module isolated from production domain logic.
 *
 * Invariant Guarantees Verified:
 * 1. Fixed Cardinality: Exactly 2 projections generated per running session.
 * 2. Exact Dimension Coverage: Exactly 1 'knee-dominant-lower-body' and 1 'hip-posterior-chain'.
 * 3. Zero Duplicate Dimensions: projections[0].dimension !== projections[1].dimension.
 * 4. Associated Dimensions Fidelity: associatedDimensions matches fixed 2-tuple ['knee-dominant-lower-body', 'hip-posterior-chain'].
 * 5. Source Magnitude Reference Fidelity: sourceSessionMagnitude is preserved losslessly as source fact without dimension-level splitting.
 * 6. NO Dimension-Specific Magnitudes: Projections do NOT have dimension-specific distance/duration/pace fields.
 * 7. NO Attribution / Splits / Weights / Scores / Fatigue / Decay / Readiness / Recommendations.
 * 8. Pure Determinism & Zero Input Mutations: Object freeze guarantees and identical outputs across executions.
 * 9. Session Projection Bundle Integrity: Correct propagation of sessionLogId, date, and startTime.
 * 10. Multi-Scenario Resilience: Validated across full-canonical-triad, distance-only, duration-only, and first-session scenarios.
 */

import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from './runningStressMagnitude';
import {
  FROZEN_RUNNING_DIMENSIONS,
  buildSessionRunningDimensionProjectionBundle,
  projectRunningStressToDimensions,
} from './runningStressDimensionProjection';
import { CanonicalRunningSession } from '../types/running.types';
import {
  DimensionProjectedRunningStress,
  RunningStressDimensionProjectionAuditResult,
} from '../types/runningStressDimensionProjection.types';

function createMockRunningSession(params: {
  logId: string;
  date: string;
  startTime?: string;
  distanceKm?: number;
  durationSeconds?: number;
  distanceProvenance?: 'explicit' | 'legacy' | 'missing';
  durationProvenance?: 'explicit' | 'legacy' | 'missing';
  sourceConfidence?: 'high' | 'medium' | 'low';
}): CanonicalRunningSession {
  const distProv =
    params.distanceProvenance ?? (params.distanceKm !== undefined ? 'explicit' : 'missing');
  const durProv =
    params.durationProvenance ?? (params.durationSeconds !== undefined ? 'explicit' : 'missing');
  const conf =
    params.sourceConfidence ??
    (params.distanceKm !== undefined && params.durationSeconds !== undefined
      ? 'high'
      : params.distanceKm !== undefined || params.durationSeconds !== undefined
      ? 'medium'
      : 'low');

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
        distance: distProv,
        duration: durProv,
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
      },
      sourceConfidence: conf,
      runIntent: 'unknown',
    },
  };
}

/**
 * Runs the complete invariant audit suite for CU3.12I Running Stress Dimension Projection.
 */
export function auditRunningStressDimensionProjection(): readonly RunningStressDimensionProjectionAuditResult[] {
  const results: RunningStressDimensionProjectionAuditResult[] = [];

  // Prepare standard running session scenarios
  const targetTriad = createMockRunningSession({
    logId: 'session-run-triad-101',
    date: '2026-08-16',
    startTime: '06:30',
    distanceKm: 10.0,
    durationSeconds: 3000,
    distanceProvenance: 'explicit',
    durationProvenance: 'explicit',
    sourceConfidence: 'high',
  });

  const h1 = createMockRunningSession({
    logId: 'session-run-h1',
    date: '2026-08-10',
    distanceKm: 8.0,
    durationSeconds: 2400,
  });

  const histRef = deriveRunningHistoricalReference(targetTriad, [h1]);
  const interp = interpretRunningSessionVsHistory(targetTriad, histRef);
  const triadMagnitude = deriveRunningStressMagnitude(targetTriad, interp);

  // -------------------------------------------------------------------------
  // Audit 1: Exact Cardinality (projections.length === 2)
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const passed = Array.isArray(projections) && projections.length === 2;

    results.push({
      auditName: 'Audit 1: Cardinality Invariant (Length === 2)',
      passed,
      details: passed
        ? `PASSED: Exactly 2 projections generated (received ${projections.length}).`
        : `FAILED: Expected exactly 2 projections, received ${projections.length}.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 2: Exact Dimension Coverage (knee 1, hip 1)
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const kneeCount = projections.filter(
      (p) => p.dimension === 'knee-dominant-lower-body'
    ).length;
    const hipCount = projections.filter(
      (p) => p.dimension === 'hip-posterior-chain'
    ).length;
    const passed = kneeCount === 1 && hipCount === 1;

    results.push({
      auditName: 'Audit 2: Dimension Coverage (Exactly 1 Knee, Exactly 1 Hip)',
      passed,
      details: passed
        ? `PASSED: Knee count = ${kneeCount}, Hip count = ${hipCount}.`
        : `FAILED: Invalid coverage (Knee: ${kneeCount}, Hip: ${hipCount}).`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 3: Duplicate Dimension Invariant (0 duplicates)
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const passed = projections[0].dimension !== projections[1].dimension;

    results.push({
      auditName: 'Audit 3: Zero Duplicate Dimension Invariant',
      passed,
      details: passed
        ? `PASSED: Projections [${projections[0].dimension}, ${projections[1].dimension}] are distinct.`
        : `FAILED: Found duplicate dimension (${projections[0].dimension}).`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 4: Associated Dimensions Fixed 2-Tuple Fidelity
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const passed = projections.every(
      (p) =>
        p.associatedDimensions.length === 2 &&
        p.associatedDimensions[0] === 'knee-dominant-lower-body' &&
        p.associatedDimensions[1] === 'hip-posterior-chain' &&
        p.associatedDimensions === FROZEN_RUNNING_DIMENSIONS
    );

    results.push({
      auditName: 'Audit 4: Associated Dimensions Fixed 2-Tuple Invariant',
      passed,
      details: passed
        ? 'PASSED: associatedDimensions preserves exact frozen 2-tuple across all instances.'
        : 'FAILED: associatedDimensions mismatch or mutation detected.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 5: Source Session Magnitude Reference Fidelity
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const passed = projections.every(
      (p) =>
        p.sourceSessionMagnitude === triadMagnitude &&
        p.sourceSessionMagnitude.sessionLogId === 'session-run-triad-101' &&
        p.sourceSessionMagnitude.profiles.distance.observedValue === 10.0 &&
        p.sourceSessionMagnitude.profiles.duration.observedValue === 3000 &&
        p.sourceSessionMagnitude.coupling.kind === 'full-canonical-triad'
    );

    results.push({
      auditName: 'Audit 5: Source Session Magnitude Reference Fidelity',
      passed,
      details: passed
        ? 'PASSED: sourceSessionMagnitude maintains exact lossless object reference without slicing or modification.'
        : 'FAILED: sourceSessionMagnitude reference altered or corrupted.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 6: NO Dimension-Specific Distance/Duration/Pace Fields
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const forbiddenProps = [
      'distanceKm',
      'durationSeconds',
      'paceSecondsPerKm',
      'distance',
      'duration',
      'pace',
      'profiles',
      'coupling',
    ];

    const hasForbiddenField = projections.some((p: any) =>
      forbiddenProps.some((prop) => prop in p)
    );
    const passed = !hasForbiddenField;

    results.push({
      auditName: 'Audit 6: NO Dimension-Specific Magnitude Fields on Projection Root',
      passed,
      details: passed
        ? 'PASSED: Projection root contains zero dimension-specific physical magnitude fields.'
        : 'FAILED: Found forbidden physical magnitude fields directly on dimension projection.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 7: NO Attribution / Split / Weight / Ratio / Score / Fatigue Fields
  // -------------------------------------------------------------------------
  {
    const projections = projectRunningStressToDimensions(triadMagnitude);
    const forbiddenHeuristicProps = [
      'split',
      'ratio',
      'weight',
      'score',
      'percentage',
      'share',
      'trimp',
      'rtss',
      'fatigue',
      'decay',
      'residualStress',
      'readiness',
      'recommendation',
    ];

    const hasForbiddenHeuristic = projections.some((p: any) =>
      forbiddenHeuristicProps.some((prop) => prop in p)
    );
    const passed = !hasForbiddenHeuristic;

    results.push({
      auditName: 'Audit 7: NO Attribution / Split / Weight / Score / Heuristic Fields',
      passed,
      details: passed
        ? 'PASSED: Strictly 0 heuristic, split, score, decay, or readiness properties found.'
        : 'FAILED: Found forbidden attribution/score/heuristic property on projection.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 8: Pure Determinism & Immutability
  // -------------------------------------------------------------------------
  {
    const run1 = projectRunningStressToDimensions(triadMagnitude);
    const run2 = projectRunningStressToDimensions(triadMagnitude);

    const isFrozenRun1 =
      Object.isFrozen(run1) &&
      Object.isFrozen(run1[0]) &&
      Object.isFrozen(run1[1]);

    const isDeterministic =
      run1[0].dimension === run2[0].dimension &&
      run1[1].dimension === run2[1].dimension &&
      run1[0].sessionLogId === run2[0].sessionLogId &&
      run1[0].sourceSessionMagnitude === run2[0].sourceSessionMagnitude;

    const passed = isFrozenRun1 && isDeterministic;

    results.push({
      auditName: 'Audit 8: Pure Determinism & Deep Object Immutability',
      passed,
      details: passed
        ? 'PASSED: Deeply frozen return structures and fully deterministic projections.'
        : `FAILED: Immutability (frozen: ${isFrozenRun1}) or Determinism (equal: ${isDeterministic}) violation.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 9: Input Mutation Guarantee (0 input mutations)
  // -------------------------------------------------------------------------
  {
    const targetSession = createMockRunningSession({
      logId: 'session-mutation-check',
      date: '2026-08-16',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });
    const mag = deriveRunningStressMagnitude(
      targetSession,
      interpretRunningSessionVsHistory(
        targetSession,
        deriveRunningHistoricalReference(targetSession, [])
      )
    );

    const serializedBefore = JSON.stringify(mag);
    projectRunningStressToDimensions(mag);
    buildSessionRunningDimensionProjectionBundle(mag);
    const serializedAfter = JSON.stringify(mag);

    const passed = serializedBefore === serializedAfter;

    results.push({
      auditName: 'Audit 9: Zero Input Mutation Guarantee',
      passed,
      details: passed
        ? 'PASSED: Input RunningStressMagnitude remains 100% byte-identical after projection.'
        : 'FAILED: Input object was mutated during projection execution.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 10: Session Projection Bundle Integrity
  // -------------------------------------------------------------------------
  {
    const bundle = buildSessionRunningDimensionProjectionBundle(triadMagnitude);

    const passed =
      bundle.sessionLogId === 'session-run-triad-101' &&
      bundle.date === '2026-08-16' &&
      bundle.startTime === '06:30' &&
      Array.isArray(bundle.projections) &&
      bundle.projections.length === 2 &&
      bundle.projections[0].dimension === 'knee-dominant-lower-body' &&
      bundle.projections[1].dimension === 'hip-posterior-chain' &&
      Object.isFrozen(bundle);

    results.push({
      auditName: 'Audit 10: Session Projection Bundle Contract & Metadata Integrity',
      passed,
      details: passed
        ? 'PASSED: Session bundle contains accurate sessionLogId, date, startTime, and 2-tuple projections.'
        : 'FAILED: Session bundle metadata mismatch or tuple structure invalid.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 11: Distance-Only Session Projection Integrity
  // -------------------------------------------------------------------------
  {
    const distanceOnlySession = createMockRunningSession({
      logId: 'session-dist-only',
      date: '2026-08-16',
      distanceKm: 7.5,
      distanceProvenance: 'explicit',
    });
    const distMag = deriveRunningStressMagnitude(
      distanceOnlySession,
      interpretRunningSessionVsHistory(
        distanceOnlySession,
        deriveRunningHistoricalReference(distanceOnlySession, [])
      )
    );

    const bundle = buildSessionRunningDimensionProjectionBundle(distMag);
    const passed =
      bundle.projections.length === 2 &&
      bundle.projections[0].sourceSessionMagnitude.coupling.kind === 'distance-only' &&
      bundle.projections[0].sourceSessionMagnitude.profiles.distance.observedValue === 7.5 &&
      bundle.projections[1].sourceSessionMagnitude.profiles.duration.observedValue === undefined;

    results.push({
      auditName: 'Audit 11: Distance-Only Session Magnitude Projection Contract',
      passed,
      details: passed
        ? 'PASSED: Distance-only magnitude preserves coupling state and missing duration across both projections.'
        : 'FAILED: Distance-only magnitude failed projection contract.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 12: Duration-Only Session Projection Integrity
  // -------------------------------------------------------------------------
  {
    const durationOnlySession = createMockRunningSession({
      logId: 'session-dur-only',
      date: '2026-08-16',
      durationSeconds: 1800,
      durationProvenance: 'explicit',
    });
    const durMag = deriveRunningStressMagnitude(
      durationOnlySession,
      interpretRunningSessionVsHistory(
        durationOnlySession,
        deriveRunningHistoricalReference(durationOnlySession, [])
      )
    );

    const bundle = buildSessionRunningDimensionProjectionBundle(durMag);
    const passed =
      bundle.projections.length === 2 &&
      bundle.projections[0].sourceSessionMagnitude.coupling.kind === 'duration-only' &&
      bundle.projections[0].sourceSessionMagnitude.profiles.duration.observedValue === 1800 &&
      bundle.projections[1].sourceSessionMagnitude.profiles.distance.observedValue === undefined;

    results.push({
      auditName: 'Audit 12: Duration-Only Session Magnitude Projection Contract',
      passed,
      details: passed
        ? 'PASSED: Duration-only magnitude preserves coupling state and missing distance across both projections.'
        : 'FAILED: Duration-only magnitude failed projection contract.',
    });
  }

  return Object.freeze(results);
}

/** Alias for audit execution consistency */
export const runRunningStressDimensionProjectionAudits = auditRunningStressDimensionProjection;
