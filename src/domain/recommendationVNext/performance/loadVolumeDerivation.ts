/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from '../types/performanceObservation.types';
import { SetLoadVolumeObservation } from '../types/loadVolume.types';

/**
 * Derives a single SetLoadVolumeObservation from an eligible STANDARD strength set observation.
 * 
 * Rules & Invariants:
 * - Pure function, zero mutations.
 * - Requires 'load-volume' to be present in observation.eligiblePurposes.
 *   If not present, returns null (Normal Ineligible, e.g., bodyweight, cardio, time-based, warm-up).
 * - Defensive Contract Invariant Guard:
 *   If 'load-volume' is claimed, observation MUST have positive finite load and positive finite integer reps.
 *   Contract violations throw an explicit Error rather than returning null.
 * - Calculation: loadVolumeKgReps = observedLoadKg * observedReps.
 * - Retains raw numeric precision and source identity.
 * - Does NOT perform session aggregation, ranking, or physiological interpretations.
 * 
 * @param observation A StandardStrengthPerformanceObservation
 * @returns SetLoadVolumeObservation if eligible and valid, or null if normal ineligible
 */
export function deriveSetLoadVolumeObservation(
  observation: StandardStrengthPerformanceObservation
): SetLoadVolumeObservation | null {
  // 1. Eligibility Check: If not eligible for 'load-volume', return null (Normal Ineligible)
  if (!observation.eligiblePurposes.includes('load-volume')) {
    return null;
  }

  const { observedLoadKg, observedReps } = observation;

  // 2. Defensive Contract Invariant Guard
  // When an observation claims 'load-volume' eligibility, it MUST satisfy the frozen
  // upstream CU2.1 contract: positive finite load and positive integer reps.
  // Violations indicate broken upstream contracts and must throw explicitly rather than
  // being silently hidden as null.
  if (typeof observedLoadKg !== 'number' || !Number.isFinite(observedLoadKg) || observedLoadKg <= 0) {
    throw new Error(
      `Load-volume derivation contract violation: 'load-volume' eligible observation has invalid load (${observedLoadKg}). SourceLog: ${observation.sourceLogId}, Exercise: ${observation.exerciseId}, SetIndex: ${observation.setIndex}`
    );
  }

  if (
    typeof observedReps !== 'number' ||
    !Number.isFinite(observedReps) ||
    !Number.isInteger(observedReps) ||
    observedReps <= 0
  ) {
    throw new Error(
      `Load-volume derivation contract violation: 'load-volume' eligible observation has invalid reps (${observedReps}). Reps must be a positive integer. SourceLog: ${observation.sourceLogId}, Exercise: ${observation.exerciseId}, SetIndex: ${observation.setIndex}`
    );
  }

  // 3. Calculation
  const loadVolumeKgReps = observedLoadKg * observedReps;

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
    loadVolumeKgReps,
    roleEvidenceQuality: observation.roleEvidenceQuality,
    setRole: observation.setRole,
  });
}

/**
 * Derives a collection of SetLoadVolumeObservations from an array of set observations.
 * 
 * Invariants:
 * - Preserves the exact input order (original chronological set index order).
 * - Does NOT sort by loadVolume value or pick a maximum / best set.
 * - Ineligible observations are filtered out cleanly.
 * - Contract violation Errors are NOT caught or swallowed.
 * 
 * @param observations List of StandardStrengthPerformanceObservation items
 * @returns Immutable array of SetLoadVolumeObservation items
 */
export function deriveSetLoadVolumeObservations(
  observations: readonly StandardStrengthPerformanceObservation[]
): readonly SetLoadVolumeObservation[] {
  if (observations.length === 0) {
    return Object.freeze([]);
  }

  const results: SetLoadVolumeObservation[] = [];

  for (const obs of observations) {
    const derived = deriveSetLoadVolumeObservation(obs);
    if (derived !== null) {
      results.push(derived);
    }
  }

  return Object.freeze(results);
}
