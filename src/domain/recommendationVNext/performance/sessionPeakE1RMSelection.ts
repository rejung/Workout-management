/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Estimated1RMObservation } from '../types/estimated1RM.types';
import {
  PeakEvidenceTier,
  SessionPeakE1RMObservation
} from '../types/sessionPeakE1RM.types';

/**
 * Machine floating-point epsilon used strictly to stabilize IEEE 754 comparisons
 * during tie detection. This is NOT a domain rounding tolerance.
 */
const FLOATING_POINT_EPSILON = 1e-9;

/**
 * Selects the session peak e1RM observation from a collection of e1RM observations
 * belonging to a single Session Exercise Group.
 * 
 * Selection Policy Rules:
 * 1. Empty Input: Returns `null` if observations array is empty.
 * 2. Group Contract Guard: All observations must share the same `sourceLogId` and `exerciseId`.
 *    Contract violations throw an explicit Error.
 * 3. Overall Numerical Peak:
 *    - Finds the absolute maximum `estimated1RMKg` across all valid input observations.
 *    - Collects all observations matching the numerical maximum in `numericalPeakObservations`.
 * 4. Evidence Tier Selection:
 *    - If any 'high' role evidence quality observations exist, selection pool is restricted ONLY to 'high' tier.
 *    - If no 'high' observations exist, selection falls back to 'limited' tier.
 * 5. Within-Tier Selected Peak:
 *    - Finds the maximum `estimated1RMKg` within the selected tier pool.
 *    - Collects all observations matching the selected maximum in `selectedPeakObservations`.
 * 6. Floating-point Tie Preservation:
 *    - All observations matching peak values (within FLOATING_POINT_EPSILON) are preserved in their respective arrays.
 *    - Preserves original input order without arbitrary tie-breaker selection.
 * 7. Non-goals / Exclusions:
 *    - Does NOT compute trend, PR, progress, or session deltas.
 *    - Does NOT apply fatigue, readiness, or RPE adjustments.
 *    - Does NOT alter original observation objects (pure function, zero mutation).
 * 
 * @param observations An immutable array of Estimated1RMObservation items for one session exercise.
 * @returns SessionPeakE1RMObservation if valid observations exist, or null if empty.
 */
export function selectSessionPeakE1RMObservation(
  observations: readonly Estimated1RMObservation[]
): SessionPeakE1RMObservation | null {
  if (observations.length === 0) {
    return null;
  }

  // 1. Group Contract Invariant Check
  const first = observations[0];
  const expectedSourceLogId = first.sourceLogId;
  const expectedExerciseId = first.exerciseId;

  for (let i = 1; i < observations.length; i++) {
    const current = observations[i];
    if (current.sourceLogId !== expectedSourceLogId) {
      throw new Error(
        `e1RM session peak selection contract violation: observations have mismatched sourceLogId ('${expectedSourceLogId}' vs '${current.sourceLogId}'). Grouping is the responsibility of upstream layers.`
      );
    }
    if (current.exerciseId !== expectedExerciseId) {
      throw new Error(
        `e1RM session peak selection contract violation: observations have mismatched exerciseId ('${expectedExerciseId}' vs '${current.exerciseId}'). Multiple exercises cannot be mixed in single peak selection.`
      );
    }
  }

  // 2. Absolute Numerical Maximum across all observations
  let numericalPeak = -Infinity;
  for (const obs of observations) {
    if (obs.estimated1RMKg > numericalPeak) {
      numericalPeak = obs.estimated1RMKg;
    }
  }

  const numericalPeakObservations: Estimated1RMObservation[] = [];
  for (const obs of observations) {
    if (Math.abs(obs.estimated1RMKg - numericalPeak) <= FLOATING_POINT_EPSILON) {
      numericalPeakObservations.push(obs);
    }
  }

  // 3. Evidence Tier Selection
  const highTierObservations = observations.filter(
    (obs) => obs.roleEvidenceQuality === 'high'
  );

  let selectedEvidenceQuality: PeakEvidenceTier;
  let candidatePool: readonly Estimated1RMObservation[];

  if (highTierObservations.length > 0) {
    selectedEvidenceQuality = 'high';
    candidatePool = highTierObservations;
  } else {
    selectedEvidenceQuality = 'limited';
    candidatePool = observations;
  }

  // 4. Find Selected Maximum e1RM within Selected Tier
  let selectedPeak = -Infinity;
  for (const obs of candidatePool) {
    if (obs.estimated1RMKg > selectedPeak) {
      selectedPeak = obs.estimated1RMKg;
    }
  }

  // 5. Collect All Tied Observations in Selected Tier (within IEEE 754 epsilon)
  const selectedPeakObservations: Estimated1RMObservation[] = [];
  for (const obs of candidatePool) {
    if (Math.abs(obs.estimated1RMKg - selectedPeak) <= FLOATING_POINT_EPSILON) {
      selectedPeakObservations.push(obs);
    }
  }

  return Object.freeze({
    sourceLogId: first.sourceLogId,
    date: first.date,
    startTime: first.startTime,
    exerciseId: first.exerciseId,
    exerciseName: first.exerciseName,
    numericalPeakEstimated1RMKg: numericalPeak,
    numericalPeakObservations: Object.freeze(numericalPeakObservations),
    selectedPeakEstimated1RMKg: selectedPeak,
    selectedEvidenceQuality,
    selectedPeakObservations: Object.freeze(selectedPeakObservations),
  });
}
