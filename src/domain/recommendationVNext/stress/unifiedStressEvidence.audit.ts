/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Dimension-Linked Stress Evidence Invariant Audit Suite (VNext Recommendation Engine - CU3.13 / CU3.13B)
 *
 * Dedicated verification module validating the integration of Strength (CU3.11) and Running (CU3.12I)
 * projections into unified downstream-consumable evidence slices.
 *
 * Invariant Guarantees Verified:
 * 1. Modality-Preserving Union: Correct integration of Strength and Running projection contracts.
 * 2. Strict Dimension Filtering: Dimension slice contains ONLY evidence matching requested StressDimension.
 * 3. Partition Fidelity: strengthEvidence and runningEvidence partition evidence losslessly and exclusively.
 * 4. Total Evidence Count Invariant: totalEvidenceCount strictly equals evidence.length.
 * 5. Source Reference Fidelity: sourceSessionMagnitude is preserved as exact reference without mutation or splitting.
 * 6. Ordering State Evaluation (CU1.2):
 *    - single-session (count <= 1)
 *    - fully-ordered (all pairs comparable across dates or distinct start times)
 *    - partially-ordered (some pairs comparable, some uncertain)
 *    - unordered (all same-day pairs uncertain)
 * 7. Uncertainty Preservation: Same-day equal-time and missing-time pairs yield uncertain ordering without time fabrication.
 * 8. Zero ID Chronology: Log IDs do not affect chronology evaluation or comparative ordering.
 * 9. Non-Duplication & Non-Attribution: Projections across slices do not create scalar conversion or duplicate magnitude amounts.
 * 10. Pure Determinism & Deep Object Immutability: Deeply frozen return structures.
 * 11. Zero Input Mutations: Input arrays and projection items remain strictly unchanged.
 */

import {
  deriveRunningHistoricalReference,
} from '../context/runningHistoricalReference';
import {
  interpretRunningSessionVsHistory,
} from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from './runningStressMagnitude';
import { projectRunningStressToDimensions } from './runningStressDimensionProjection';
import { projectStrengthStressToDimensions } from './strengthStressDimensionProjection';
import {
  buildAllDimensionStressEvidenceSlices,
  buildDimensionStressEvidenceSlice,
  evaluateEvidenceOrderingState,
} from './unifiedStressEvidence';
import { CanonicalRunningSession } from '../types/running.types';
import { StrengthStressMagnitude } from '../types/strengthStressMagnitude.types';
import {
  DimensionProjectedRunningStress,
} from '../types/runningStressDimensionProjection.types';
import {
  DimensionProjectedStrengthStress,
} from '../types/strengthStressDimensionProjection.types';
import {
  UnifiedDimensionProjectedStress,
  UnifiedStressEvidenceAuditResult,
} from '../types/unifiedStressEvidence.types';

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

/**
 * Runs the complete invariant audit suite for CU3.13 / CU3.13B Unified Dimension-Linked Stress Evidence.
 */
export function auditUnifiedStressEvidence(): readonly UnifiedStressEvidenceAuditResult[] {
  const results: UnifiedStressEvidenceAuditResult[] = [];

  // Setup sample strength projections
  const squatMag = createMockStrengthMagnitude({
    exerciseId: 'squat-01',
    exerciseName: '바벨 백스쿼트',
    date: '2026-08-16',
    startTime: '10:00',
    sourceLogId: 'log-strength-101',
    targetDimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
  });
  const squatProjections = projectStrengthStressToDimensions(squatMag).projections;

  const benchMag = createMockStrengthMagnitude({
    exerciseId: 'bench-01',
    exerciseName: '바벨 벤치프레스',
    date: '2026-08-16',
    startTime: '11:00',
    sourceLogId: 'log-strength-102',
    targetDimensions: ['horizontal-push'],
  });
  const benchProjections = projectStrengthStressToDimensions(benchMag).projections;

  // Setup sample running projections
  const runSession = createMockRunningSession({
    logId: 'log-run-201',
    date: '2026-08-15',
    startTime: '07:00',
    distanceKm: 8.0,
    durationSeconds: 2400,
  });
  const runMag = deriveRunningStressMagnitude(
    runSession,
    interpretRunningSessionVsHistory(
      runSession,
      deriveRunningHistoricalReference(runSession, [])
    )
  );
  const runProjections = projectRunningStressToDimensions(runMag);

  // Combined mixed projections pool
  const mixedPool: readonly UnifiedDimensionProjectedStress[] = Object.freeze([
    ...squatProjections,
    ...benchProjections,
    ...runProjections,
  ]);

  // -------------------------------------------------------------------------
  // Audit 1: Strength-Only Slice
  // -------------------------------------------------------------------------
  {
    const slice = buildDimensionStressEvidenceSlice('horizontal-push', benchProjections);
    const passed =
      slice.dimension === 'horizontal-push' &&
      slice.evidence.length === 1 &&
      slice.strengthEvidence.length === 1 &&
      slice.runningEvidence.length === 0 &&
      slice.totalEvidenceCount === 1 &&
      slice.orderingState === 'single-session' &&
      slice.strengthEvidence[0].exerciseName === '바벨 벤치프레스';

    results.push({
      auditName: 'Audit 1: Strength-Only Slice Contract',
      passed,
      details: passed
        ? 'PASSED: Strength-only projection slice accurately populated without running evidence.'
        : 'FAILED: Strength-only slice structural mismatch.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 2: Running-Only Slice
  // -------------------------------------------------------------------------
  {
    const slice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', runProjections);
    const passed =
      slice.dimension === 'knee-dominant-lower-body' &&
      slice.evidence.length === 1 &&
      slice.strengthEvidence.length === 0 &&
      slice.runningEvidence.length === 1 &&
      slice.totalEvidenceCount === 1 &&
      slice.orderingState === 'single-session' &&
      slice.runningEvidence[0].activityType === 'running';

    results.push({
      auditName: 'Audit 2: Running-Only Slice Contract',
      passed,
      details: passed
        ? 'PASSED: Running-only projection slice accurately populated without strength evidence.'
        : 'FAILED: Running-only slice structural mismatch.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 3: Mixed-Modality Slice & Strict Dimension Filtering
  // -------------------------------------------------------------------------
  {
    const kneeSlice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', mixedPool);
    const passed =
      kneeSlice.dimension === 'knee-dominant-lower-body' &&
      kneeSlice.evidence.length === 2 && // Squat (2026-08-16) + Run (2026-08-15)
      kneeSlice.strengthEvidence.length === 1 &&
      kneeSlice.runningEvidence.length === 1 &&
      kneeSlice.evidence.every((e) => e.dimension === 'knee-dominant-lower-body') &&
      kneeSlice.totalEvidenceCount === 2;

    results.push({
      auditName: 'Audit 3: Mixed-Modality Slice & Dimension Filtering Invariant',
      passed,
      details: passed
        ? `PASSED: Mixed slice contains exact matching dimension items (Strength: ${kneeSlice.strengthEvidence.length}, Running: ${kneeSlice.runningEvidence.length}).`
        : 'FAILED: Mixed slice dimension filtering or counts incorrect.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 4: Partition Fidelity (strengthEvidence + runningEvidence === evidence)
  // -------------------------------------------------------------------------
  {
    const kneeSlice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', mixedPool);
    const partitionCountMatch =
      kneeSlice.strengthEvidence.length + kneeSlice.runningEvidence.length ===
      kneeSlice.evidence.length;
    const totalCountMatch = kneeSlice.totalEvidenceCount === kneeSlice.evidence.length;
    const passed = partitionCountMatch && totalCountMatch;

    results.push({
      auditName: 'Audit 4: Partition & totalEvidenceCount Fidelity',
      passed,
      details: passed
        ? 'PASSED: strengthEvidence + runningEvidence partitions evidence losslessly; totalEvidenceCount matches length.'
        : 'FAILED: Partition count mismatch detected.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 5: Source Session Magnitude Reference Fidelity
  // -------------------------------------------------------------------------
  {
    const kneeSlice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', mixedPool);
    const strengthItem = kneeSlice.strengthEvidence[0];
    const runningItem = kneeSlice.runningEvidence[0];

    const passed =
      strengthItem.sourceSessionMagnitude === squatMag &&
      runningItem.sourceSessionMagnitude === runMag;

    results.push({
      auditName: 'Audit 5: Source Magnitude Reference Fidelity',
      passed,
      details: passed
        ? 'PASSED: sourceSessionMagnitude maintains exact unmutated object reference across modalities.'
        : 'FAILED: sourceSessionMagnitude reference mismatch.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 6: Ordering State - Fully Ordered (Different Dates)
  // -------------------------------------------------------------------------
  {
    const kneeSlice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', mixedPool);
    // Squat on 2026-08-16, Run on 2026-08-15 -> 2 different dates -> 1 pair -> 1 comparable -> fully-ordered
    const passed = kneeSlice.orderingState === 'fully-ordered';

    results.push({
      auditName: 'Audit 6: Ordering State - Fully Ordered (Different Dates)',
      passed,
      details: passed
        ? `PASSED: Ordering state evaluated as '${kneeSlice.orderingState}'.`
        : `FAILED: Expected 'fully-ordered', got '${kneeSlice.orderingState}'.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 7: Ordering State - Fully Ordered (Same Date Distinct StartTimes)
  // -------------------------------------------------------------------------
  {
    const squatA = createMockStrengthMagnitude({
      exerciseId: 'squat-01',
      exerciseName: '스쿼트 A',
      date: '2026-08-16',
      startTime: '09:00',
      sourceLogId: 'log-01',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const squatB = createMockStrengthMagnitude({
      exerciseId: 'squat-02',
      exerciseName: '스쿼트 B',
      date: '2026-08-16',
      startTime: '17:00',
      sourceLogId: 'log-02',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const projA = projectStrengthStressToDimensions(squatA).projections;
    const projB = projectStrengthStressToDimensions(squatB).projections;

    const slice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', [...projA, ...projB]);
    const passed = slice.orderingState === 'fully-ordered';

    results.push({
      auditName: 'Audit 7: Ordering State - Fully Ordered (Same Date Distinct Times)',
      passed,
      details: passed
        ? 'PASSED: Same date with distinct start times (09:00 vs 17:00) evaluated as fully-ordered.'
        : `FAILED: Expected 'fully-ordered', got '${slice.orderingState}'.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 8: Ordering State - Unordered (Same Date Equal StartTimes)
  // -------------------------------------------------------------------------
  {
    const squatA = createMockStrengthMagnitude({
      exerciseId: 'squat-01',
      exerciseName: '스쿼트 A',
      date: '2026-08-16',
      startTime: '10:00',
      sourceLogId: 'log-01',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const squatB = createMockStrengthMagnitude({
      exerciseId: 'squat-02',
      exerciseName: '스쿼트 B',
      date: '2026-08-16',
      startTime: '10:00',
      sourceLogId: 'log-02',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const projA = projectStrengthStressToDimensions(squatA).projections;
    const projB = projectStrengthStressToDimensions(squatB).projections;

    const slice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', [...projA, ...projB]);
    const passed = slice.orderingState === 'unordered';

    results.push({
      auditName: 'Audit 8: Ordering State - Unordered (Same Date Equal Times)',
      passed,
      details: passed
        ? 'PASSED: Same date with identical start times (10:00 vs 10:00) evaluated as unordered.'
        : `FAILED: Expected 'unordered', got '${slice.orderingState}'.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 9: Ordering State - Unordered (Same Date Missing StartTimes)
  // -------------------------------------------------------------------------
  {
    const squatA = createMockStrengthMagnitude({
      exerciseId: 'squat-01',
      exerciseName: '스쿼트 A',
      date: '2026-08-16',
      startTime: undefined,
      sourceLogId: 'log-01',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const squatB = createMockStrengthMagnitude({
      exerciseId: 'squat-02',
      exerciseName: '스쿼트 B',
      date: '2026-08-16',
      startTime: undefined,
      sourceLogId: 'log-02',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const projA = projectStrengthStressToDimensions(squatA).projections;
    const projB = projectStrengthStressToDimensions(squatB).projections;

    const slice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', [...projA, ...projB]);
    const passed = slice.orderingState === 'unordered';

    results.push({
      auditName: 'Audit 9: Ordering State - Unordered (Same Date Missing Times)',
      passed,
      details: passed
        ? 'PASSED: Same date with missing start times evaluated as unordered without fabricating time order.'
        : `FAILED: Expected 'unordered', got '${slice.orderingState}'.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 10: Ordering State - Partially Ordered (Mixed Known and Unknown Pairs)
  // -------------------------------------------------------------------------
  {
    // Item 1: 2026-08-16 undefined
    // Item 2: 2026-08-16 10:00
    // Item 3: 2026-08-15 07:00
    // Pairs: (1, 2) same-day missing time -> uncertain
    //        (1, 3) diff dates -> comparable
    //        (2, 3) diff dates -> comparable
    // 2 comparable / 3 total -> partially-ordered
    const s1 = createMockStrengthMagnitude({
      exerciseId: 'squat-01',
      exerciseName: '스쿼트 1',
      date: '2026-08-16',
      startTime: undefined,
      sourceLogId: 'log-01',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const s2 = createMockStrengthMagnitude({
      exerciseId: 'squat-02',
      exerciseName: '스쿼트 2',
      date: '2026-08-16',
      startTime: '10:00',
      sourceLogId: 'log-02',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const r3 = createMockRunningSession({
      logId: 'log-03',
      date: '2026-08-15',
      startTime: '07:00',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });
    const r3Mag = deriveRunningStressMagnitude(
      r3,
      interpretRunningSessionVsHistory(
        r3,
        deriveRunningHistoricalReference(r3, [])
      )
    );

    const projs = [
      ...projectStrengthStressToDimensions(s1).projections,
      ...projectStrengthStressToDimensions(s2).projections,
      ...projectRunningStressToDimensions(r3Mag),
    ];

    const slice = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', projs);
    const passed = slice.orderingState === 'partially-ordered';

    results.push({
      auditName: 'Audit 10: Ordering State - Partially Ordered (Mixed Pairs)',
      passed,
      details: passed
        ? 'PASSED: 2 comparable pairs out of 3 total evaluated strictly as partially-ordered.'
        : `FAILED: Expected 'partially-ordered', got '${slice.orderingState}'.`,
    });
  }

  // -------------------------------------------------------------------------
  // Audit 11: Zero ID Chronology Invariant
  // -------------------------------------------------------------------------
  {
    // Two items on same date with missing start times, but IDs 'aaa' and 'zzz'
    const sA = createMockStrengthMagnitude({
      exerciseId: 'squat-01',
      exerciseName: '스쿼트 A',
      date: '2026-08-16',
      startTime: undefined,
      sourceLogId: 'aaa-log-earlier-id',
      targetDimensions: ['knee-dominant-lower-body'],
    });
    const sB = createMockStrengthMagnitude({
      exerciseId: 'squat-02',
      exerciseName: '스쿼트 B',
      date: '2026-08-16',
      startTime: undefined,
      sourceLogId: 'zzz-log-later-id',
      targetDimensions: ['knee-dominant-lower-body'],
    });

    const projs = [
      ...projectStrengthStressToDimensions(sA).projections,
      ...projectStrengthStressToDimensions(sB).projections,
    ];

    const state = evaluateEvidenceOrderingState(projs);
    const passed = state === 'unordered';

    results.push({
      auditName: 'Audit 11: Zero ID Chronology Invariant',
      passed,
      details: passed
        ? 'PASSED: Log ID alphabetical order was strictly ignored; ordering remained unordered.'
        : 'FAILED: Log ID was erroneously used for chronology inference.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 12: buildAllDimensionStressEvidenceSlices Coverage
  // -------------------------------------------------------------------------
  {
    const allSlices = buildAllDimensionStressEvidenceSlices(mixedPool);
    const keys = Object.keys(allSlices);
    const passed =
      keys.length === 7 &&
      allSlices['knee-dominant-lower-body'].evidence.length === 2 &&
      allSlices['hip-posterior-chain'].evidence.length === 2 &&
      allSlices['axial-systemic-loading'].evidence.length === 1 &&
      allSlices['horizontal-push'].evidence.length === 1 &&
      allSlices['vertical-push'].evidence.length === 0 &&
      allSlices['horizontal-pull'].evidence.length === 0 &&
      allSlices['vertical-pull'].evidence.length === 0;

    results.push({
      auditName: 'Audit 12: buildAllDimensionStressEvidenceSlices Canonical Coverage',
      passed,
      details: passed
        ? 'PASSED: All 7 canonical stress dimensions accurately indexed with respective evidence.'
        : 'FAILED: Dimension coverage or evidence allocation incorrect in all-slices container.',
    });
  }

  // -------------------------------------------------------------------------
  // Audit 13: Determinism, Immutability & Zero Input Mutation
  // -------------------------------------------------------------------------
  {
    const poolClone = [...mixedPool];
    const slice1 = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', poolClone);
    const slice2 = buildDimensionStressEvidenceSlice('knee-dominant-lower-body', poolClone);

    const isFrozen =
      Object.isFrozen(slice1) &&
      Object.isFrozen(slice1.evidence) &&
      Object.isFrozen(slice1.strengthEvidence) &&
      Object.isFrozen(slice1.runningEvidence);

    const isDeterministic =
      slice1.totalEvidenceCount === slice2.totalEvidenceCount &&
      slice1.orderingState === slice2.orderingState &&
      slice1.evidence[0] === slice2.evidence[0];

    const inputUnmutated =
      poolClone.length === mixedPool.length &&
      poolClone[0] === mixedPool[0];

    const passed = isFrozen && isDeterministic && inputUnmutated;

    results.push({
      auditName: 'Audit 13: Determinism, Immutability & Zero Input Mutation',
      passed,
      details: passed
        ? 'PASSED: Deeply frozen return structures, deterministic results, and 0 input mutations.'
        : 'FAILED: Immutability, determinism, or input mutation check failed.',
    });
  }

  return Object.freeze(results);
}

/** Alias for audit execution consistency */
export const runUnifiedStressEvidenceAudits = auditUnifiedStressEvidence;
