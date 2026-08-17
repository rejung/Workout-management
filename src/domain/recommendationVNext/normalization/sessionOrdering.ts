/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../../types';
import { CanonicalSessionRef } from '../types/canonicalSession.types';

/**
 * Creates a CanonicalSessionRef from an actual WorkoutLog and its original index.
 * Pure function: Does not mutate the source log.
 */
export function toCanonicalSessionRef(
  log: Readonly<WorkoutLog>,
  originalIndex: number,
  isDuplicateIdCandidate: boolean = false
): CanonicalSessionRef {
  return {
    sourceLogId: log.id,
    date: log.date,
    startTime: log.startTime,
    originalIndex,
    isDuplicateIdCandidate,
    rawLog: log,
  };
}

/**
 * Chronological comparator for CanonicalSessionRefs in descending order (newest first).
 * 
 * Rules:
 * 1. Primary: Compare `date` descending (e.g. '2026-08-10' before '2026-08-09').
 * 2. Secondary (when dates are identical):
 *    - If both have `startTime`: Compare `startTime` descending (e.g. '18:00' before '10:00').
 *    - If both lack `startTime` or have identical `startTime`: Return 0 (no chronological difference inferred).
 *    - If one has `startTime` and the other does not: Return 0 (no temporal precedence fabricated for missing times).
 * 3. Invariant: WorkoutLog ID is NEVER used as a proxy for chronology.
 */
export function compareCanonicalSessionsChronologicalDesc(
  a: Readonly<CanonicalSessionRef>,
  b: Readonly<CanonicalSessionRef>
): number {
  // 1. Primary: Date comparison (descending)
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }

  // 2. Secondary: StartTime comparison on identical date (descending)
  if (a.startTime && b.startTime) {
    if (a.startTime !== b.startTime) {
      return b.startTime.localeCompare(a.startTime);
    }
    // Exactly identical date and startTime -> return 0 (no temporal inference)
    return 0;
  }

  // If one or both lack startTime, we do not fabricate temporal precedence on the same date.
  return 0;
}

/**
 * Helper to identify duplicate WorkoutLog IDs across a dataset without mutating or filtering.
 */
export function identifyDuplicateLogIds(logs: readonly WorkoutLog[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const log of logs) {
    if (log && typeof log.id === 'string') {
      if (seen.has(log.id)) {
        duplicates.add(log.id);
      } else {
        seen.add(log.id);
      }
    }
  }

  return duplicates;
}

/**
 * Builds an immutable, chronologically ordered array of CanonicalSessionRefs from WorkoutLogs.
 * 
 * Guarantees:
 * - Pure function: `logs` input array and items are NEVER mutated.
 * - Detects duplicate IDs as candidates without deleting any records.
 * - Sorts descending by date and known start time using stable chronological comparator.
 * - Preserves all sessions (including multiple sessions on the same date).
 */
export function buildCanonicalSessionRefs(
  logs: readonly WorkoutLog[]
): CanonicalSessionRef[] {
  if (!logs || logs.length === 0) {
    return [];
  }

  const duplicateIds = identifyDuplicateLogIds(logs);

  // 1. Create canonical references preserving original index and duplicate flags
  const refs: CanonicalSessionRef[] = logs.map((log, index) =>
    toCanonicalSessionRef(log, index, duplicateIds.has(log.id))
  );

  // 2. Stable sort using pure chronological comparator
  return refs.slice().sort(compareCanonicalSessionsChronologicalDesc);
}
