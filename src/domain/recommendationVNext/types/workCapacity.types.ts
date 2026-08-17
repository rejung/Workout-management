/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardStrengthPerformanceObservation } from './performanceObservation.types';

/**
 * Dispassionate, immutable record of actual repetition performances observed
 * at a specific external load within a single session exercise group.
 * 
 * Strict Invariants:
 * - Represents pure mechanical observations at a single exact load (observedLoadKg).
 * - Preserves unaltered repetition sequence (repsSeries) in chronological setIndex order.
 * - Invariant: setCount === observations.length === repsSeries.length.
 * - Invariant: setCount === highEvidenceSetCount + limitedEvidenceSetCount.
 * - Invariant: totalRepsAtLoad === highEvidenceReps + limitedEvidenceReps.
 * - Invariant: totalRepsAtLoad === sum(repsSeries).
 * - Does NOT compute work-capacity score, strength-endurance score, or fatigue drop percentage.
 * - Does NOT designate or rank "best load", "hardest load", or "top capacity".
 * - Does NOT couple with e1RM or load-volume metrics.
 * - Retains full provenance by embedding all source StandardStrengthPerformanceObservation items.
 */
export interface LoadWorkCapacityObservation {
  /**
   * The exact numerical external load in kilograms.
   */
  readonly observedLoadKg: number;

  /**
   * 0-based setIndex of the first observation at this load within the session exercise group.
   * Used for deterministic chronological ordering and tracking.
   */
  readonly firstSetIndex: number;

  /**
   * Total number of sets completed at this load (observations.length).
   */
  readonly setCount: number;

  /**
   * Raw completed repetition count for each set in chronological set order.
   * e.g. [5, 5, 4]
   */
  readonly repsSeries: readonly number[];

  /**
   * Total sum of completed repetitions across all sets at this exact load.
   */
  readonly totalRepsAtLoad: number;

  /**
   * Number of sets at this load with 'high' role evidence quality.
   */
  readonly highEvidenceSetCount: number;

  /**
   * Number of sets at this load with 'limited' role evidence quality.
   */
  readonly limitedEvidenceSetCount: number;

  /**
   * Total repetitions at this load derived strictly from sets with 'high' role evidence quality.
   */
  readonly highEvidenceReps: number;

  /**
   * Total repetitions at this load derived strictly from sets with 'limited' role evidence quality.
   */
  readonly limitedEvidenceReps: number;

  /**
   * All constituent StandardStrengthPerformanceObservation records at this load in set order.
   */
  readonly observations: readonly StandardStrengthPerformanceObservation[];
}

/**
 * An immutable performance observation representing the session-level work-capacity
 * observations partitioned by distinct external loads for a single session exercise group
 * (same sourceLogId and exerciseId).
 * 
 * Strict Invariants:
 * - Groups observations strictly by exact observedLoadKg without arbitrary tolerance buckets.
 * - Orders load observations deterministically by earliest set appearance (firstSetIndex).
 * - Invariant: totalSetCount === sum(loadObservations.map(l => l.setCount)).
 * - Invariant: totalReps === sum(loadObservations.map(l => l.totalRepsAtLoad)).
 * - Does NOT score work capacity or compare between sessions.
 * - Does NOT rank load groups (no "best load" or "primary load").
 * - Does NOT compute rep-drop or fatigue indices.
 * - Does NOT couple with e1RM or load-volume metrics.
 */
export interface SessionWorkCapacityObservation {
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
   * Distinct external load capacity observations, ordered chronologically by firstSetIndex.
   */
  readonly loadObservations: readonly LoadWorkCapacityObservation[];

  /**
   * Total number of work-capacity eligible sets across all load groups in this session exercise.
   */
  readonly totalSetCount: number;

  /**
   * Total repetitions performed across all load groups in this session exercise.
   */
  readonly totalReps: number;
}
