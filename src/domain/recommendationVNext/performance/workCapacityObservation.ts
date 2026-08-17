/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from '../types/performanceObservation.types';
import {
  LoadWorkCapacityObservation,
  SessionWorkCapacityObservation
} from '../types/workCapacity.types';

/**
 * Derives a SessionWorkCapacityObservation from a list of StandardStrengthPerformanceObservation items
 * belonging to a single Session Exercise Group.
 * 
 * Rules & Invariants:
 * 1. Empty Input: Returns `null` if observations array is empty or contains no work-capacity eligible observations.
 * 2. Group Contract Guard: All observations MUST share the same `sourceLogId`, `exerciseId`, and `date`.
 *    Contract violations throw an explicit Error.
 * 3. Log Type Guard: All observations must have `logType === 'STANDARD'`.
 * 4. Purpose Eligibility:
 *    - Consumes CU2.1 eligibility: only observations where `eligiblePurposes.includes('work-capacity')` are aggregated.
 *    - Ineligible observations are gracefully skipped.
 * 5. Defensive Contract Checks on eligible observations:
 *    - `observedLoadKg` must be a positive finite number (> 0).
 *    - `observedReps` must be a positive finite integer (> 0).
 *    - If an observation marked as `work-capacity` eligible has invalid load or reps, an explicit Error is thrown.
 * 6. Exact Load Grouping:
 *    - Observations are partitioned by exact `observedLoadKg` value (no tolerance buckets, e.g. 69.5~70.5 is forbidden).
 *    - Non-contiguous sets at the same load are collected into the same load group while preserving each set's setIndex.
 * 7. Group Ordering:
 *    - Load groups are ordered chronologically by the `firstSetIndex` (the earliest setIndex observed for that load).
 * 8. Set Ordering within Load Group:
 *    - Observations within each load group maintain their original chronological `setIndex` order.
 * 9. Evidence Contributions & Invariants:
 *    - `setCount === highEvidenceSetCount + limitedEvidenceSetCount === observations.length`
 *    - `totalRepsAtLoad === highEvidenceReps + limitedEvidenceReps === sum(repsSeries)`
 *    - `totalSetCount === sum(loadObservations.map(l => l.setCount))`
 *    - `totalReps === sum(loadObservations.map(l => l.totalRepsAtLoad))`
 * 10. Non-goals / Exclusions:
 *    - Does NOT compute work capacity scores, endurance scores, fatigue drop, or rep drop percentages.
 *    - Does NOT rank load groups (no best/heaviest load, no primary load).
 *    - Does NOT couple with e1RM or load-volume domains.
 *    - Does NOT mutate input arrays or objects (pure function, zero mutation).
 * 
 * @param observations List of StandardStrengthPerformanceObservation items for a single session exercise group
 * @returns SessionWorkCapacityObservation container, or null if empty/ineligible
 */
export function deriveSessionWorkCapacityObservation(
  observations: readonly StandardStrengthPerformanceObservation[]
): SessionWorkCapacityObservation | null {
  // 1. Empty Input Guard
  if (observations.length === 0) {
    return null;
  }

  // 2. Group Contract Guard & Identity Consistency
  const first = observations[0];
  const { sourceLogId, exerciseId, date, exerciseName, category } = first;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];

    if (obs.sourceLogId !== sourceLogId) {
      throw new Error(
        `Session work-capacity observation contract violation: observations have mismatched sourceLogId ('${sourceLogId}' vs '${obs.sourceLogId}'). Grouping is the responsibility of upstream layers.`
      );
    }

    if (obs.exerciseId !== exerciseId) {
      throw new Error(
        `Session work-capacity observation contract violation: observations have mismatched exerciseId ('${exerciseId}' vs '${obs.exerciseId}'). Multiple exercises cannot be mixed in a single session work-capacity observation.`
      );
    }

    if (obs.date !== date) {
      throw new Error(
        `Session work-capacity observation contract violation: observations have mismatched date ('${date}' vs '${obs.date}'). SourceLog: ${sourceLogId}, Exercise: ${exerciseId}`
      );
    }

    if (obs.logType !== 'STANDARD') {
      throw new Error(
        `Session work-capacity observation contract violation: expected logType 'STANDARD', received '${obs.logType}' at index ${i}. SourceLog: ${sourceLogId}, Exercise: ${exerciseId}`
      );
    }
  }

  // 3. Filter for work-capacity eligible observations
  const eligibleObs: StandardStrengthPerformanceObservation[] = [];
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    if (obs.eligiblePurposes.includes('work-capacity')) {
      // 4. Defensive validation on eligible observation
      if (
        typeof obs.observedLoadKg !== 'number' ||
        !Number.isFinite(obs.observedLoadKg) ||
        obs.observedLoadKg <= 0
      ) {
        throw new Error(
          `Session work-capacity observation contract violation: eligible observation at setIndex ${obs.setIndex} has invalid observedLoadKg (${obs.observedLoadKg}).`
        );
      }

      if (
        typeof obs.observedReps !== 'number' ||
        !Number.isFinite(obs.observedReps) ||
        !Number.isInteger(obs.observedReps) ||
        obs.observedReps <= 0
      ) {
        throw new Error(
          `Session work-capacity observation contract violation: eligible observation at setIndex ${obs.setIndex} has invalid observedReps (${obs.observedReps}).`
        );
      }

      eligibleObs.push(obs);
    }
  }

  if (eligibleObs.length === 0) {
    return null;
  }

  // 5. Partition by exact observedLoadKg
  interface MutableLoadGroup {
    observedLoadKg: number;
    firstSetIndex: number;
    observations: StandardStrengthPerformanceObservation[];
  }

  const loadGroupMap = new Map<number, MutableLoadGroup>();
  const loadGroupList: MutableLoadGroup[] = [];

  for (const obs of eligibleObs) {
    const load = obs.observedLoadKg;
    let group = loadGroupMap.get(load);
    if (!group) {
      group = {
        observedLoadKg: load,
        firstSetIndex: obs.setIndex,
        observations: [],
      };
      loadGroupMap.set(load, group);
      loadGroupList.push(group);
    } else {
      if (obs.setIndex < group.firstSetIndex) {
        group.firstSetIndex = obs.setIndex;
      }
    }
    group.observations.push(obs);
  }

  // Sort groups chronologically by firstSetIndex
  loadGroupList.sort((a, b) => a.firstSetIndex - b.firstSetIndex);

  let totalSessionSets = 0;
  let totalSessionReps = 0;

  const loadObservations: LoadWorkCapacityObservation[] = [];

  for (const group of loadGroupList) {
    // Ensure observations within the group are ordered by setIndex
    const sortedObs = [...group.observations].sort((a, b) => a.setIndex - b.setIndex);

    let highEvidenceSetCount = 0;
    let limitedEvidenceSetCount = 0;
    let highEvidenceReps = 0;
    let limitedEvidenceReps = 0;
    let totalRepsAtLoad = 0;

    const repsSeries: number[] = [];

    for (const obs of sortedObs) {
      repsSeries.push(obs.observedReps);
      totalRepsAtLoad += obs.observedReps;

      if (obs.roleEvidenceQuality === 'high') {
        highEvidenceSetCount += 1;
        highEvidenceReps += obs.observedReps;
      } else if (obs.roleEvidenceQuality === 'limited') {
        limitedEvidenceSetCount += 1;
        limitedEvidenceReps += obs.observedReps;
      } else {
        throw new Error(
          `Session work-capacity observation contract violation: unknown roleEvidenceQuality '${(obs as any).roleEvidenceQuality}' at setIndex ${obs.setIndex}.`
        );
      }
    }

    const setCount = sortedObs.length;
    totalSessionSets += setCount;
    totalSessionReps += totalRepsAtLoad;

    loadObservations.push(
      Object.freeze({
        observedLoadKg: group.observedLoadKg,
        firstSetIndex: group.firstSetIndex,
        setCount,
        repsSeries: Object.freeze(repsSeries),
        totalRepsAtLoad,
        highEvidenceSetCount,
        limitedEvidenceSetCount,
        highEvidenceReps,
        limitedEvidenceReps,
        observations: Object.freeze(sortedObs),
      })
    );
  }

  return Object.freeze({
    sourceLogId,
    date,
    startTime: first.startTime,
    exerciseId,
    exerciseName,
    category,
    loadObservations: Object.freeze(loadObservations),
    totalSetCount: totalSessionSets,
    totalReps: totalSessionReps,
  });
}
