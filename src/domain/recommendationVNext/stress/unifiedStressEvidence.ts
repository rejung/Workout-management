/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Dimension-Linked Stress Evidence (VNext Recommendation Engine - CU3.13 / CU3.13B)
 *
 * Pure domain implementation to index, slice, and bundle Strength (CU3.11) and Running (CU3.12I)
 * dimension projections into unified downstream-consumable evidence representations.
 *
 * Strict Invariants:
 * 1. Modality-Preserving Union: Consumes DimensionProjectedStrengthStress and DimensionProjectedRunningStress directly.
 * 2. Dimension Membership Only: Strictly filters by target StressDimension without magnitude attribution or scaling.
 * 3. Lossless Source Reference: Preserves sourceSessionMagnitude without modification or conversion.
 * 4. Multi-Dimension Awareness: associatedDimensions preserved intact.
 * 5. Frozen Chronology Contract: Evaluates DayTimeOrderingStatus (CU1.2) across evidence items without ID-based ordering claims.
 * 6. Deterministic Storage: Output arrays are deterministically ordered descending by date and valid start times.
 * 7. Non-Duplication: totalEvidenceCount reflects item count only; NO cross-dimension or cross-modality scalar summation.
 * 8. Pure Functions & Immutability: Zero input mutations; deeply frozen return structures.
 */

import { StressDimension } from '../types/stressModel.types';
import { DayTimeOrderingStatus } from '../types/trainingDay.types';
import { DimensionProjectedStrengthStress } from '../types/strengthStressDimensionProjection.types';
import { DimensionProjectedRunningStress } from '../types/runningStressDimensionProjection.types';
import {
  AllDimensionStressEvidenceSlices,
  DimensionStressEvidenceSlice,
  UnifiedDimensionProjectedStress,
} from '../types/unifiedStressEvidence.types';
import { FROZEN_STRESS_DIMENSIONS } from './strengthStressDimensionProjection';

/**
 * Pure chronological comparator for UnifiedDimensionProjectedStress in descending order (newest first).
 *
 * Rules:
 * 1. Primary: Compare `date` descending (e.g. '2026-08-16' before '2026-08-10').
 * 2. Secondary (when dates are identical):
 *    - If both have `startTime`: Compare `startTime` descending (e.g. '18:00' before '06:30').
 *    - If one or both lack `startTime` or have identical `startTime`: Return 0 (no temporal precedence fabricated).
 * 3. Invariant: WorkoutLog ID / SessionLog ID is NEVER used as a proxy for chronology.
 */
export function compareUnifiedEvidenceChronologicalDesc(
  a: Readonly<UnifiedDimensionProjectedStress>,
  b: Readonly<UnifiedDimensionProjectedStress>
): number {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }

  const timeA = a.startTime?.trim();
  const timeB = b.startTime?.trim();

  if (timeA && timeB) {
    if (timeA !== timeB) {
      return timeB.localeCompare(timeA);
    }
    return 0;
  }

  return 0;
}

/**
 * Determines the chronological ordering certainty for an evidence collection based on pairwise comparisons (CU1.2).
 *
 * Rules:
 * - <= 1 evidence item -> 'single-session'
 * - >= 2 evidence items:
 *   - Let TotalPairs = N * (N - 1) / 2
 *   - Pair (a, b) is comparable if:
 *     1. a.date !== b.date (calendar date difference), OR
 *     2. a.date === b.date AND both have valid distinct startTimes (a.startTime !== b.startTime).
 *   - If ComparablePairs === 0 -> 'unordered'
 *   - If ComparablePairs === TotalPairs -> 'fully-ordered'
 *   - If 0 < ComparablePairs < TotalPairs -> 'partially-ordered'
 */
export function evaluateEvidenceOrderingState(
  evidence: readonly UnifiedDimensionProjectedStress[]
): DayTimeOrderingStatus {
  const n = evidence.length;
  if (n <= 1) {
    return 'single-session';
  }

  const totalPairs = (n * (n - 1)) / 2;
  let comparablePairCount = 0;

  for (let i = 0; i < n; i++) {
    const itemA = evidence[i];
    const timeA = itemA.startTime?.trim();

    for (let j = i + 1; j < n; j++) {
      const itemB = evidence[j];
      const timeB = itemB.startTime?.trim();

      if (itemA.date !== itemB.date) {
        // Different dates are strictly comparable by calendar date
        comparablePairCount++;
      } else if (timeA && timeB && timeA !== timeB) {
        // Same date with distinct valid start times is strictly comparable
        comparablePairCount++;
      }
      // Same date with identical times or missing times -> uncertain (not counted)
    }
  }

  if (comparablePairCount === 0) {
    return 'unordered';
  }

  if (comparablePairCount === totalPairs) {
    return 'fully-ordered';
  }

  return 'partially-ordered';
}

/**
 * Builds an immutable, unified DimensionStressEvidenceSlice for a single stress dimension.
 *
 * Filters the input projections strictly to the requested dimension, sorts deterministically,
 * partitions by modality (Strength / Running), and evaluates chronological ordering certainty.
 */
export function buildDimensionStressEvidenceSlice(
  dimension: StressDimension,
  projections: readonly UnifiedDimensionProjectedStress[]
): DimensionStressEvidenceSlice {
  if (!projections || projections.length === 0) {
    return Object.freeze({
      dimension,
      evidence: Object.freeze([]),
      strengthEvidence: Object.freeze([]),
      runningEvidence: Object.freeze([]),
      orderingState: 'single-session',
      totalEvidenceCount: 0,
    });
  }

  // 1. Filter strictly to requested dimension
  const matchingEvidence = projections.filter((p) => p.dimension === dimension);

  if (matchingEvidence.length === 0) {
    return Object.freeze({
      dimension,
      evidence: Object.freeze([]),
      strengthEvidence: Object.freeze([]),
      runningEvidence: Object.freeze([]),
      orderingState: 'single-session',
      totalEvidenceCount: 0,
    });
  }

  // 2. Stable deterministic sort descending
  const sortedEvidence = matchingEvidence
    .slice()
    .sort(compareUnifiedEvidenceChronologicalDesc);

  // 3. Partition by modality
  const strengthEvidence: DimensionProjectedStrengthStress[] = [];
  const runningEvidence: DimensionProjectedRunningStress[] = [];

  for (const item of sortedEvidence) {
    if (item.kind === 'dimension-projected-strength-stress') {
      strengthEvidence.push(item);
    } else if (item.kind === 'dimension-projected-running-stress') {
      runningEvidence.push(item);
    }
  }

  // 4. Evaluate chronological ordering state
  const orderingState = evaluateEvidenceOrderingState(sortedEvidence);

  return Object.freeze({
    dimension,
    evidence: Object.freeze(sortedEvidence),
    strengthEvidence: Object.freeze(strengthEvidence),
    runningEvidence: Object.freeze(runningEvidence),
    orderingState,
    totalEvidenceCount: sortedEvidence.length,
  });
}

/**
 * Builds all 7 DimensionStressEvidenceSlices across all canonical frozen stress dimensions.
 */
export function buildAllDimensionStressEvidenceSlices(
  projections: readonly UnifiedDimensionProjectedStress[]
): AllDimensionStressEvidenceSlices {
  const result: Partial<Record<StressDimension, DimensionStressEvidenceSlice>> = {};

  for (const dim of FROZEN_STRESS_DIMENSIONS) {
    result[dim] = buildDimensionStressEvidenceSlice(dim, projections);
  }

  return Object.freeze(result as AllDimensionStressEvidenceSlices);
}
