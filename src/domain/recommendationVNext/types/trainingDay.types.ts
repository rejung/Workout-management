/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanonicalSessionRef } from './canonicalSession.types';

/**
 * Chronological certainty metadata for same-day sessions based on pairwise strict ordering.
 * 
 * Expresses whether the relative execution order of sessions on a given day
 * is strictly provable from distinct recorded start times or contains ambiguity:
 * 
 * - 'single-session': Exactly 1 session on this date (no pairs exist to compare).
 * - 'fully-ordered': 2+ sessions, and EVERY session pair has a provable strict chronological
 *   relation (i.e. all sessions have start times and all start times are unique; comparable pairs = total pairs).
 * - 'partially-ordered': 2+ sessions, and AT LEAST ONE session pair has a provable strict
 *   chronological relation, but NOT ALL pairs are provable (0 < comparable pairs < total pairs).
 * - 'unordered': 2+ sessions, but ZERO session pairs have a provable strict chronological
 *   relation (comparable pairs = 0; e.g. all missing, all identical timestamps, or only 1 known timestamp with unknown peers).
 */
export type DayTimeOrderingStatus =
  | 'single-session'
  | 'fully-ordered'
  | 'partially-ordered'
  | 'unordered';

/**
 * Represents a single training day (date) and all actual sessions recorded on that day.
 * 
 * This is a derived aggregation layer. It NEVER merges multiple sessions into one,
 * nor does it fabricate missing timestamps.
 */
export interface TrainingDayState {
  /**
   * The training date in YYYY-MM-DD format (mandatory).
   */
  readonly date: string;

  /**
   * All actual canonical sessions that occurred on this date.
   * Preserved completely without merging or deletion.
   */
  readonly sessions: readonly CanonicalSessionRef[];

  /**
   * Total number of actual sessions on this specific day.
   */
  readonly sessionCount: number;

  /**
   * Chronological certainty status for multi-session ordering on this day.
   */
  readonly timeOrderingStatus: DayTimeOrderingStatus;

  /**
   * Indicates whether any session on this day is flagged as a duplicate ID candidate.
   */
  readonly hasDuplicateIdCandidates: boolean;
}

/**
 * Top-level calendar-level aggregate state for VNext.
 * 
 * Strictly separates total session count from unique workout days.
 */
export interface TrainingCalendarState {
  /**
   * Total number of actual sessions across all dates.
   */
  readonly sessionCount: number;

  /**
   * Total number of unique workout days (dates with at least 1 session).
   */
  readonly uniqueWorkoutDayCount: number;

  /**
   * Aggregated training days ordered chronologically descending (newest date first).
   */
  readonly trainingDays: readonly TrainingDayState[];
}

/**
 * Result of querying workout density in a specific date range.
 */
export interface DateRangeWorkoutSummary {
  readonly startDate: string;
  readonly endDate: string;
  readonly sessionCount: number;
  readonly uniqueWorkoutDays: number;
}
