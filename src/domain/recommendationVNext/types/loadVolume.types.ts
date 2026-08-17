/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanonicalSetRole } from './setRole.types';
import { StrengthEvidenceQuality } from './performanceEligibility.types';

/**
 * An immutable performance observation representing the single-set external load-volume
 * derived from a single eligible STANDARD strength set observation.
 * 
 * Strict Invariants:
 * - Represents pure mechanical metric: observedLoadKg * observedReps (kg·reps).
 * - Does NOT compute session totals, exercise sums, weekly volume, or tonnage aggregates.
 * - Does NOT rank sets (no "top volume set", "best volume set").
 * - Does NOT interpret volume physiologically (no "effective volume", "stimulus score", "fatigue score").
 * - Retains full traceability to source observation, raw load, and raw reps.
 * - Retains raw numeric precision without premature domain rounding.
 */
export interface SetLoadVolumeObservation {
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
   * Raw set identifier, if present on the source record.
   */
  readonly setId?: string;

  /**
   * 0-based index of the set within the source exercise session.
   */
  readonly setIndex: number;

  /**
   * Unaltered, observed external load in kilograms.
   */
  readonly observedLoadKg: number;

  /**
   * Unaltered, observed completed repetition count.
   */
  readonly observedReps: number;

  /**
   * Pure mechanical load-volume product in kg·reps (observedLoadKg * observedReps).
   */
  readonly loadVolumeKgReps: number;

  /**
   * Data certainty level of the underlying evidence from CU2.1 ('high' or 'limited').
   * IMPORTANT: Measures evidence certainty, NOT volume efficacy or athlete effort.
   */
  readonly roleEvidenceQuality: StrengthEvidenceQuality;

  /**
   * Role evidence from CU1 normalization ('explicit-working-set' or 'unknown-set-role').
   */
  readonly setRole: CanonicalSetRole;
}
