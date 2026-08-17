/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../../types';
import { CanonicalSessionRef } from '../types/canonicalSession.types';
import {
  TrainingDayState,
  TrainingCalendarState,
  DayTimeOrderingStatus,
  DateRangeWorkoutSummary,
} from '../types/trainingDay.types';
import {
  buildCanonicalSessionRefs,
  compareCanonicalSessionsChronologicalDesc,
} from './sessionOrdering';

/**
 * Determines the chronological ordering certainty for multiple sessions on the same date.
 * Pure function based on pairwise strict ordering certainty.
 * 
 * Algorithm:
 * - 0 sessions -> Domain invariant error (TrainingDay must contain >= 1 session).
 * - 1 session -> 'single-session'
 * - 2+ sessions:
 *   - Let TotalPairs = N * (N - 1) / 2
 *   - Let ComparablePairs = Count of pairs (s_i, s_j) where both have valid startTimes and startTimes are distinct.
 *   - If ComparablePairs === 0 -> 'unordered'
 *   - If ComparablePairs === TotalPairs -> 'fully-ordered'
 *   - If 0 < ComparablePairs < TotalPairs -> 'partially-ordered'
 */
export function determineDayTimeOrderingStatus(
  sessions: readonly CanonicalSessionRef[]
): DayTimeOrderingStatus {
  if (!sessions || sessions.length === 0) {
    throw new Error(
      'determineDayTimeOrderingStatus: domain invariant violation - sessions array must not be empty'
    );
  }

  const n = sessions.length;
  if (n === 1) {
    return 'single-session';
  }

  const totalPairs = (n * (n - 1)) / 2;
  let comparablePairCount = 0;

  for (let i = 0; i < n; i++) {
    const timeA = sessions[i].startTime?.trim();
    if (!timeA) continue;

    for (let j = i + 1; j < n; j++) {
      const timeB = sessions[j].startTime?.trim();
      if (!timeB) continue;

      if (timeA !== timeB) {
        comparablePairCount++;
      }
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
 * Extracts a normalized, day-level aggregated TrainingCalendarState from workout sessions.
 * 
 * Guarantees:
 * - Completely independent of legacy recommendation engines.
 * - Pure function: Inputs are NEVER mutated.
 * - Preserves all sessions across same-day multi-session workouts.
 * - Accurately separates total `sessionCount` from `uniqueWorkoutDayCount`.
 * - Orders `trainingDays` chronologically descending (newest date first).
 * - Preserves uncertainty metadata for missing/identical start times.
 */
export function extractTrainingCalendarState(
  input: readonly CanonicalSessionRef[] | readonly WorkoutLog[]
): TrainingCalendarState {
  if (!input || input.length === 0) {
    return {
      sessionCount: 0,
      uniqueWorkoutDayCount: 0,
      trainingDays: [],
    };
  }

  // 1. Ensure input is canonical session references
  const canonicalSessions: readonly CanonicalSessionRef[] =
    input.length > 0 && 'sourceLogId' in input[0]
      ? (input as readonly CanonicalSessionRef[])
      : buildCanonicalSessionRefs(input as readonly WorkoutLog[]);

  // 2. Group sessions by date
  const dateMap = new Map<string, CanonicalSessionRef[]>();

  for (const session of canonicalSessions) {
    const existing = dateMap.get(session.date);
    if (existing) {
      existing.push(session);
    } else {
      dateMap.set(session.date, [session]);
    }
  }

  // 3. Sort dates in descending chronological order
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));

  // 4. Construct TrainingDayState for each date
  const trainingDays: TrainingDayState[] = sortedDates.map((date) => {
    const rawSessionsForDate = dateMap.get(date)!;
    // Stable sort within day using CU1.1 comparator
    const sessionsForDate = rawSessionsForDate.slice().sort(compareCanonicalSessionsChronologicalDesc);

    return {
      date,
      sessions: Object.freeze(sessionsForDate),
      sessionCount: sessionsForDate.length,
      timeOrderingStatus: determineDayTimeOrderingStatus(sessionsForDate),
      hasDuplicateIdCandidates: sessionsForDate.some((s) => s.isDuplicateIdCandidate),
    };
  });

  const totalSessionCount = canonicalSessions.length;
  const uniqueWorkoutDayCount = trainingDays.length;

  return {
    sessionCount: totalSessionCount,
    uniqueWorkoutDayCount,
    trainingDays: Object.freeze(trainingDays),
  };
}

/**
 * Counts unique workout days and session density within a specified inclusive date range.
 * 
 * Boundary: `startDate <= session.date <= endDate`
 * Pure function without side effects or date parsing distortions.
 */
export function countUniqueWorkoutDaysInRange(
  input: readonly CanonicalSessionRef[] | readonly WorkoutLog[] | TrainingCalendarState,
  startDate: string,
  endDate: string
): DateRangeWorkoutSummary {
  // If already a TrainingCalendarState, query its trainingDays directly
  let calendar: TrainingCalendarState;
  if ('trainingDays' in input && typeof (input as any).uniqueWorkoutDayCount === 'number') {
    calendar = input as TrainingCalendarState;
  } else {
    calendar = extractTrainingCalendarState(input as readonly CanonicalSessionRef[] | readonly WorkoutLog[]);
  }

  const inRangeDays = calendar.trainingDays.filter(
    (day) => day.date >= startDate && day.date <= endDate
  );

  const sessionCount = inRangeDays.reduce((acc, day) => acc + day.sessionCount, 0);
  const uniqueWorkoutDays = inRangeDays.length;

  return {
    startDate,
    endDate,
    sessionCount,
    uniqueWorkoutDays,
  };
}
