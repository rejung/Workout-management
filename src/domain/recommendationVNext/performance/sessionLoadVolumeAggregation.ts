/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SetLoadVolumeObservation } from '../types/loadVolume.types';
import { SessionLoadVolumeObservation } from '../types/sessionLoadVolume.types';

/**
 * Aggregates a list of SetLoadVolumeObservations belonging to the same session exercise group
 * into a single SessionLoadVolumeObservation container.
 * 
 * Rules & Invariants:
 * 1. Empty Input: Returns `null` if observations array is empty.
 * 2. Group Contract Guard: All observations MUST share the same `sourceLogId`, `exerciseId`, and `date`.
 *    Contract violations throw an explicit Error.
 * 3. Numerical Total: Sums `loadVolumeKgReps` across all observations.
 * 4. Evidence Contributions:
 *    - `highEvidenceLoadVolumeKgReps`: Sum of observations with `roleEvidenceQuality === 'high'`.
 *    - `limitedEvidenceLoadVolumeKgReps`: Sum of observations with `roleEvidenceQuality === 'limited'`.
 *    - Invariant: `totalLoadVolumeKgReps === highEvidenceLoadVolumeKgReps + limitedEvidenceLoadVolumeKgReps`
 * 5. Observation Counts:
 *    - `highEvidenceObservationCount`: Count of 'high' evidence observations.
 *    - `limitedEvidenceObservationCount`: Count of 'limited' evidence observations.
 *    - Invariant: `observationCount === highEvidenceObservationCount + limitedEvidenceObservationCount`
 * 6. Provenance Preservation: Embeds all input observations in their exact original order.
 * 7. Non-goals / Exclusions:
 *    - Does NOT compute trend, PR, weekly/monthly totals, or session comparisons.
 *    - Does NOT interpret volume physiologically (no effective volume, stimulus scores, fatigue costs).
 *    - Does NOT couple with e1RM or work capacity domains.
 *    - Does NOT alter original observation objects (pure function, zero mutation).
 * 
 * @param observations List of SetLoadVolumeObservation items for a single session exercise group
 * @returns SessionLoadVolumeObservation container, or null if input is empty
 */
export function aggregateSessionLoadVolume(
  observations: readonly SetLoadVolumeObservation[]
): SessionLoadVolumeObservation | null {
  // 1. Empty Input Guard
  if (observations.length === 0) {
    return null;
  }

  // 2. Group Contract Guard & Defensive Verification
  const first = observations[0];
  const { sourceLogId, exerciseId, date, exerciseName } = first;

  let totalLoadVolumeKgReps = 0;
  let highEvidenceLoadVolumeKgReps = 0;
  let limitedEvidenceLoadVolumeKgReps = 0;
  let highEvidenceObservationCount = 0;
  let limitedEvidenceObservationCount = 0;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];

    if (obs.sourceLogId !== sourceLogId) {
      throw new Error(
        `Session load-volume aggregation contract violation: observations have mismatched sourceLogId ('${sourceLogId}' vs '${obs.sourceLogId}'). Grouping is the responsibility of upstream layers.`
      );
    }

    if (obs.exerciseId !== exerciseId) {
      throw new Error(
        `Session load-volume aggregation contract violation: observations have mismatched exerciseId ('${exerciseId}' vs '${obs.exerciseId}'). Multiple exercises cannot be mixed in a single session volume aggregation.`
      );
    }

    if (obs.date !== date) {
      throw new Error(
        `Session load-volume aggregation contract violation: observations have mismatched date ('${date}' vs '${obs.date}'). SourceLog: ${sourceLogId}, Exercise: ${exerciseId}`
      );
    }

    // Defensive check on derived metric
    if (
      typeof obs.loadVolumeKgReps !== 'number' ||
      !Number.isFinite(obs.loadVolumeKgReps) ||
      obs.loadVolumeKgReps <= 0
    ) {
      throw new Error(
        `Session load-volume aggregation contract violation: invalid loadVolumeKgReps (${obs.loadVolumeKgReps}) at index ${i}. SourceLog: ${sourceLogId}, Exercise: ${exerciseId}`
      );
    }

    totalLoadVolumeKgReps += obs.loadVolumeKgReps;

    if (obs.roleEvidenceQuality === 'high') {
      highEvidenceLoadVolumeKgReps += obs.loadVolumeKgReps;
      highEvidenceObservationCount += 1;
    } else if (obs.roleEvidenceQuality === 'limited') {
      limitedEvidenceLoadVolumeKgReps += obs.loadVolumeKgReps;
      limitedEvidenceObservationCount += 1;
    } else {
      throw new Error(
        `Session load-volume aggregation contract violation: unknown roleEvidenceQuality '${(obs as any).roleEvidenceQuality}' at index ${i}.`
      );
    }
  }

  return Object.freeze({
    sourceLogId,
    date,
    startTime: first.startTime,
    exerciseId,
    exerciseName,
    totalLoadVolumeKgReps,
    highEvidenceLoadVolumeKgReps,
    limitedEvidenceLoadVolumeKgReps,
    observationCount: observations.length,
    highEvidenceObservationCount,
    limitedEvidenceObservationCount,
    observations: Object.freeze([...observations]),
  });
}
