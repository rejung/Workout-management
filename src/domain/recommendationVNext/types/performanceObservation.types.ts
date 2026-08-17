/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanonicalSetRole } from './setRole.types';
import {
  StrengthEvidenceQuality,
  StrengthPerformancePurpose
} from './performanceEligibility.types';

/**
 * Dispassionate, immutable record of an observed strength set that satisfies
 * performance eligibility for at least one analytical purpose.
 * 
 * Strict Invariants:
 * - Does NOT calculate e1RM (Epley/Brzycki).
 * - Does NOT calculate tonnage or volume.
 * - Does NOT rank or designate "top set", "best set", or "primary set".
 * - Does NOT evaluate performance quality, strength score, or athlete effort.
 * - Preserves full identity traceability to source workout log and set index.
 */
export interface StandardStrengthPerformanceObservation {
  /**
   * Source log identifier for full traceability.
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
   * Exercise modality. In this observation extractor, strictly 'STANDARD'.
   */
  readonly logType: 'STANDARD';

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
   * Role evidence from CU1 normalization ('explicit-working-set' or 'unknown-set-role').
   * Note: 'explicit-warmup' is excluded from performance observation collection.
   */
  readonly setRole: CanonicalSetRole;

  /**
   * Data certainty level of the underlying evidence from CU2.1 ('high' or 'limited').
   * IMPORTANT: Measures data certainty, NOT athlete physical performance.
   */
  readonly roleEvidenceQuality: StrengthEvidenceQuality;

  /**
   * List of specific analytical purposes for which this observed set is eligible.
   * e.g. ['estimated-1rm', 'load-volume', 'work-capacity'] or ['load-volume', 'work-capacity']
   */
  readonly eligiblePurposes: readonly StrengthPerformancePurpose[];
}
