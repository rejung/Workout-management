/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from './performanceObservation.types';

/**
 * Counts of eligible observations disaggregated by analytical purpose.
 * 
 * Strict Invariant:
 * These are strictly counts of candidate observations, NOT performance scores,
 * volume metrics, or effectiveness ratings.
 */
export interface StrengthPurposeObservationCounts {
  /**
   * Number of observations eligible for 1RM estimation formulas (1-10 reps, valid load).
   */
  readonly estimated1RM: number;

  /**
   * Number of observations eligible for external load-volume calculation.
   */
  readonly loadVolume: number;

  /**
   * Number of observations eligible for work-capacity analysis.
   */
  readonly workCapacity: number;
}

/**
 * An immutable container aggregating all eligible STANDARD strength performance
 * observations for a specific exercise within a specific workout session.
 * 
 * Strict Invariants:
 * - Does NOT compute derived metrics (e1RM, tonnage, session volume, average load, max load).
 * - Does NOT rank or designate "top set", "best set", or "primary set".
 * - Does NOT evaluate fatigue, readiness, trend, or performance score.
 * - Preserves exact setIndex sequence and individual observation evidence quality.
 * - Grouped strictly by (sourceLogId, exerciseId).
 */
export interface StrengthSessionPerformanceObservation {
  /**
   * Source log identifier of the workout session.
   */
  readonly sourceLogId: string;

  /**
   * Session date (YYYY-MM-DD).
   */
  readonly date: string;

  /**
   * Session start time (HH:mm), if recorded.
   */
  readonly startTime?: string;

  /**
   * Canonical exercise identifier.
   */
  readonly exerciseId: string;

  /**
   * Exercise display name.
   */
  readonly exerciseName: string;

  /**
   * Exercise category (e.g. Chest, Legs, Shoulders, Back).
   */
  readonly category: string;

  /**
   * Exercise modality. Strictly 'STANDARD' for this container.
   */
  readonly logType: 'STANDARD';

  /**
   * Immutable list of individual eligible observations in original set index sequence.
   */
  readonly observations: readonly StandardStrengthPerformanceObservation[];

  /**
   * Total count of eligible observations in this session group (observations.length).
   * Note: This is NOT an "effective set count" or "hypertrophy volume" rating.
   */
  readonly observationCount: number;

  /**
   * Count of observations eligible for each specific performance purpose.
   */
  readonly purposeCounts: StrengthPurposeObservationCounts;
}
