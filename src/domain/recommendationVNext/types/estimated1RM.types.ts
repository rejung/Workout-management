/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanonicalSetRole } from './setRole.types';
import { StrengthEvidenceQuality } from './performanceEligibility.types';

/**
 * Calculation / derivation method applied to compute estimated 1RM.
 * 
 * - 'observed-single': 1 repetition maximum observed directly (estimated1RMKg = observedLoadKg).
 * - 'epley': Submaximal 1RM estimation via standard Epley equation (1 + reps / 30) for 2-10 reps.
 */
export type E1RMDerivationMethod = 'observed-single' | 'epley';

/**
 * An immutable performance observation representing an estimated 1RM derived from a
 * single eligible STANDARD strength set observation.
 * 
 * Strict Invariants:
 * - Does NOT designate "best e1RM", "max e1RM", or "session representative e1RM".
 * - Does NOT perform PR determination, progression delta, or trend calculation.
 * - Does NOT apply fatigue, readiness, or RPE adjustments.
 * - Retains full traceability to source observation, raw load, and raw reps.
 * - Retains raw floating-point numeric precision (no premature domain rounding).
 */
export interface Estimated1RMObservation {
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
   * Raw set identifier, if present on source record.
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
   * Unaltered, observed completed repetition count (1-10 reps).
   */
  readonly observedReps: number;

  /**
   * Mathematically derived estimated 1RM in kilograms.
   * Note: For 1 rep, equals observedLoadKg exactly. For 2-10 reps, computed via Epley.
   */
  readonly estimated1RMKg: number;

  /**
   * Specific calculation formula / method utilized.
   */
  readonly derivationMethod: E1RMDerivationMethod;

  /**
   * Data certainty level of the underlying evidence from CU2.1 ('high' or 'limited').
   * IMPORTANT: Measures evidence certainty, NOT formula precision or athlete capability.
   */
  readonly roleEvidenceQuality: StrengthEvidenceQuality;

  /**
   * Role evidence from CU1 normalization ('explicit-working-set' or 'unknown-set-role').
   */
  readonly setRole: CanonicalSetRole;
}
