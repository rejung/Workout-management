/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SetLoadVolumeObservation } from './loadVolume.types';

/**
 * An immutable performance observation representing the aggregated session-level
 * external load-volume for a single session exercise group (same sourceLogId and exerciseId).
 * 
 * Strict Invariants:
 * - Represents pure mechanical metric in kg·reps.
 * - Invariant: totalLoadVolumeKgReps = highEvidenceLoadVolumeKgReps + limitedEvidenceLoadVolumeKgReps
 * - Invariant: observationCount = highEvidenceObservationCount + limitedEvidenceObservationCount
 * - Does NOT compute weekly/monthly volume, trends, or volume PRs.
 * - Does NOT interpret volume physiologically (no "effective volume", "stimulus score", "fatigue cost", "hard sets").
 * - Does NOT couple with e1RM or work capacity domains.
 * - Retains full provenance by embedding all source SetLoadVolumeObservation items in their original order.
 */
export interface SessionLoadVolumeObservation {
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
   * Total numerical load-volume in kg·reps across all valid set observations in the session.
   */
  readonly totalLoadVolumeKgReps: number;

  /**
   * Load-volume contribution in kg·reps derived strictly from sets with 'high' role evidence quality.
   */
  readonly highEvidenceLoadVolumeKgReps: number;

  /**
   * Load-volume contribution in kg·reps derived strictly from sets with 'limited' role evidence quality.
   */
  readonly limitedEvidenceLoadVolumeKgReps: number;

  /**
   * Total number of set load-volume observations included in this session aggregation.
   */
  readonly observationCount: number;

  /**
   * Number of set load-volume observations with 'high' role evidence quality.
   */
  readonly highEvidenceObservationCount: number;

  /**
   * Number of set load-volume observations with 'limited' role evidence quality.
   */
  readonly limitedEvidenceObservationCount: number;

  /**
   * All constituent SetLoadVolumeObservation records in their original input order.
   */
  readonly observations: readonly SetLoadVolumeObservation[];
}
