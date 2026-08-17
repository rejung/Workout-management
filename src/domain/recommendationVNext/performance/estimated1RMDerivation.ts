/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from '../types/performanceObservation.types';
import {
  E1RMDerivationMethod,
  Estimated1RMObservation
} from '../types/estimated1RM.types';

/**
 * Derives a single Estimated1RMObservation from an eligible STANDARD strength set observation.
 * 
 * Rules & Invariants:
 * - Pure function, zero mutations.
 * - Requires 'estimated-1rm' to be present in observation.eligiblePurposes.
 * - Invariant Guard: observedReps must be between 1 and 10, and observedLoadKg > 0.
 * - For reps === 1: derivationMethod = 'observed-single', estimated1RMKg = observedLoadKg.
 * - For 2 <= reps <= 10: derivationMethod = 'epley', estimated1RMKg = observedLoadKg * (1 + observedReps / 30).
 * - Retains raw numeric floating-point precision without premature domain rounding.
 * - Does NOT evaluate "best set", "max e1RM", PRs, or trends.
 * 
 * @param observation A StandardStrengthPerformanceObservation
 * @returns Estimated1RMObservation if eligible and valid, or null if ineligible or contract-violating
 */
export function deriveEstimated1RMObservation(
  observation: StandardStrengthPerformanceObservation
): Estimated1RMObservation | null {
  // 1. Eligibility Check: If not eligible for 'estimated-1rm', return null (Normal Ineligible)
  if (!observation.eligiblePurposes.includes('estimated-1rm')) {
    return null;
  }

  const { observedLoadKg, observedReps } = observation;

  // 2. Defensive Contract Invariant Guard
  // When an observation claims 'estimated-1rm' eligibility, it MUST satisfy the frozen
  // upstream CU2.1 contract: positive finite load and 1 <= integer reps <= 10.
  // Violations indicate broken upstream contracts and must throw explicitly rather than
  // being silently hidden as null.
  if (typeof observedLoadKg !== 'number' || !Number.isFinite(observedLoadKg) || observedLoadKg <= 0) {
    throw new Error(
      `e1RM derivation contract violation: 'estimated-1rm' eligible observation has invalid load (${observedLoadKg}). SourceLog: ${observation.sourceLogId}, Exercise: ${observation.exerciseId}, SetIndex: ${observation.setIndex}`
    );
  }

  if (
    typeof observedReps !== 'number' ||
    !Number.isFinite(observedReps) ||
    !Number.isInteger(observedReps) ||
    observedReps < 1 ||
    observedReps > 10
  ) {
    throw new Error(
      `e1RM derivation contract violation: 'estimated-1rm' eligible observation has invalid reps (${observedReps}). Reps must be an integer between 1 and 10. SourceLog: ${observation.sourceLogId}, Exercise: ${observation.exerciseId}, SetIndex: ${observation.setIndex}`
    );
  }

  // 3. Formula Application
  let estimated1RMKg: number;
  let derivationMethod: E1RMDerivationMethod;

  if (observedReps === 1) {
    estimated1RMKg = observedLoadKg;
    derivationMethod = 'observed-single';
  } else {
    estimated1RMKg = observedLoadKg * (1 + observedReps / 30);
    derivationMethod = 'epley';
  }

  return Object.freeze({
    sourceLogId: observation.sourceLogId,
    date: observation.date,
    startTime: observation.startTime,
    exerciseId: observation.exerciseId,
    exerciseName: observation.exerciseName,
    setId: observation.setId,
    setIndex: observation.setIndex,
    observedLoadKg,
    observedReps,
    estimated1RMKg,
    derivationMethod,
    roleEvidenceQuality: observation.roleEvidenceQuality,
    setRole: observation.setRole,
  });
}

/**
 * Derives a collection of Estimated1RMObservations from an array of set observations.
 * 
 * Invariants:
 * - Preserves the exact input order (original chronological set index order).
 * - Does NOT sort by estimated1RM value or pick a maximum / best set.
 * - Ineligible observations are filtered out cleanly.
 * 
 * @param observations List of StandardStrengthPerformanceObservation items
 * @returns Immutable array of Estimated1RMObservation items
 */
export function deriveEstimated1RMObservations(
  observations: readonly StandardStrengthPerformanceObservation[]
): readonly Estimated1RMObservation[] {
  if (observations.length === 0) {
    return Object.freeze([]);
  }

  const results: Estimated1RMObservation[] = [];

  for (const obs of observations) {
    const derived = deriveEstimated1RMObservation(obs);
    if (derived !== null) {
      results.push(derived);
    }
  }

  return Object.freeze(results);
}
