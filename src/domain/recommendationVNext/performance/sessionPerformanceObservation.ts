/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from '../types/performanceObservation.types';
import {
  StrengthPurposeObservationCounts,
  StrengthSessionPerformanceObservation
} from '../types/sessionPerformanceObservation.types';

/**
 * Counts the occurrences of each eligible purpose across a set of observations.
 * 
 * @param observations List of observations in the group
 */
export function countStrengthObservationPurposes(
  observations: readonly StandardStrengthPerformanceObservation[]
): StrengthPurposeObservationCounts {
  let estimated1RM = 0;
  let loadVolume = 0;
  let workCapacity = 0;

  for (const obs of observations) {
    if (obs.eligiblePurposes.includes('estimated-1rm')) {
      estimated1RM += 1;
    }
    if (obs.eligiblePurposes.includes('load-volume')) {
      loadVolume += 1;
    }
    if (obs.eligiblePurposes.includes('work-capacity')) {
      workCapacity += 1;
    }
  }

  return Object.freeze({
    estimated1RM,
    loadVolume,
    workCapacity,
  });
}

/**
 * Constructs a single StrengthSessionPerformanceObservation container from a non-empty
 * homogeneous list of observations belonging to the same (sourceLogId, exerciseId) group.
 * 
 * Invariants:
 * - Pure function, zero mutations.
 * - Does NOT compute derived performance metrics (e1RM, tonnage, volume, averages, max).
 * - Does NOT rank observations or select top/best sets.
 * - Preserves setIndex sequence and individual role evidence quality.
 * 
 * @param observations Homogeneous observations sharing sourceLogId and exerciseId
 */
export function buildStrengthSessionPerformanceObservation(
  observations: readonly StandardStrengthPerformanceObservation[]
): StrengthSessionPerformanceObservation | null {
  if (observations.length === 0) {
    return null;
  }

  // Use the identity context of the first observation
  const first = observations[0];

  // Ensure deterministic sort by setIndex to guarantee original chronological set order
  const sortedObs = [...observations].sort((a, b) => a.setIndex - b.setIndex);

  const purposeCounts = countStrengthObservationPurposes(sortedObs);

  return Object.freeze({
    sourceLogId: first.sourceLogId,
    date: first.date,
    startTime: first.startTime,
    exerciseId: first.exerciseId,
    exerciseName: first.exerciseName,
    category: first.category,
    logType: 'STANDARD',
    observations: Object.freeze(sortedObs),
    observationCount: sortedObs.length,
    purposeCounts,
  });
}

/**
 * Aggregates a flat list of STANDARD strength performance observations into
 * session-level exercise observation containers, partitioned strictly by
 * (sourceLogId, exerciseId).
 * 
 * Invariants:
 * - Pure function, deterministic output.
 * - Distinct WorkoutLogs on the same date are NOT merged.
 * - Multiple exercises in the same WorkoutLog are partitioned into separate containers.
 * - Empty input produces an empty array.
 * 
 * @param observations Flat collection of StandardStrengthPerformanceObservation items
 */
export function aggregateStrengthPerformanceObservations(
  observations: readonly StandardStrengthPerformanceObservation[]
): readonly StrengthSessionPerformanceObservation[] {
  if (observations.length === 0) {
    return Object.freeze([]);
  }

  // Group by composite key: sourceLogId::exerciseId to guarantee session & exercise isolation
  const groupMap = new Map<string, StandardStrengthPerformanceObservation[]>();
  const groupOrder: string[] = [];

  for (const obs of observations) {
    const key = `${obs.sourceLogId}::${obs.exerciseId}`;
    let group = groupMap.get(key);
    if (!group) {
      group = [];
      groupMap.set(key, group);
      groupOrder.push(key);
    }
    group.push(obs);
  }

  const results: StrengthSessionPerformanceObservation[] = [];

  for (const key of groupOrder) {
    const groupObs = groupMap.get(key);
    if (groupObs && groupObs.length > 0) {
      const sessionObs = buildStrengthSessionPerformanceObservation(groupObs);
      if (sessionObs) {
        results.push(sessionObs);
      }
    }
  }

  return Object.freeze(results);
}
