/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Estimated1RMObservation } from './estimated1RM.types';

/**
 * Evidence tier selected for determining the session peak e1RM.
 * 
 * - 'high': The peak was selected strictly from observations with 'high' role evidence quality.
 * - 'limited': No 'high' observations existed in the session, so the peak was selected from 'limited' observations.
 */
export type PeakEvidenceTier = 'high' | 'limited';

/**
 * An immutable performance observation representing both the overall numerical peak e1RM
 * and the policy-selected peak e1RM observed within a single session exercise group
 * (same sourceLogId and exerciseId).
 * 
 * Strict Invariants:
 * - Distinguishes between pure mathematical/numerical maximum and evidence-tier-selected maximum.
 * - Does NOT represent "true 1RM capability", PR, historical best, or physiological capacity.
 * - Does NOT perform trend comparison against past sessions.
 * - Does NOT apply fatigue adjustments or RPE corrections.
 * - Retains all tied peak observations in both `numericalPeakObservations` and `selectedPeakObservations`
 *   to preserve complete provenance without arbitrary tie-breaking.
 */
export interface SessionPeakE1RMObservation {
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
   * The absolute numerical maximum estimated 1RM in kilograms observed across all
   * valid e1RM observations in the session (regardless of evidence tier).
   */
  readonly numericalPeakEstimated1RMKg: number;

  /**
   * All Estimated1RMObservations matching the absolute numerical maximum value (within floating-point tolerance).
   */
  readonly numericalPeakObservations: readonly Estimated1RMObservation[];

  /**
   * The maximum estimated 1RM in kilograms observed within the policy-selected evidence tier
   * ('high' tier if any high quality observations exist, otherwise 'limited' tier).
   */
  readonly selectedPeakEstimated1RMKg: number;

  /**
   * The evidence quality tier from which the policy-selected peak was chosen.
   */
  readonly selectedEvidenceQuality: PeakEvidenceTier;

  /**
   * All Estimated1RMObservations within the selected tier that match the selected peak value (within floating-point tolerance).
   * Multiple items represent exact ties without arbitrary tie-breaking.
   */
  readonly selectedPeakObservations: readonly Estimated1RMObservation[];
}
