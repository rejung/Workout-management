/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical representation of the role evidence of a strength training set.
 * 
 * - 'explicit-warmup': The source record explicitly contains stored boolean `true` (isWarmup === true).
 * - 'explicit-working-set': The source record explicitly contains stored boolean `false` (isWarmup === false on strength-applicable set).
 *   Note: Represents storage-level non-warmup fact, NOT manual user-confirmation provenance.
 * - 'unknown-set-role': The source record does not provide definitive role evidence (property absent, undefined, null, invalid, or cardio).
 */
export type CanonicalSetRole =
  | 'explicit-warmup'
  | 'explicit-working-set'
  | 'unknown-set-role';

/**
 * Origin and nature of the source evidence used to determine set role.
 * 
 * - 'isWarmup-true': Exact stored boolean `true` was present on the source record.
 * - 'isWarmup-false': Exact stored boolean `false` was present on the source record (storage-level evidence).
 * - 'isWarmup-missing': The `isWarmup` property was absent, `undefined`, or `null`.
 * - 'isWarmup-invalid': The `isWarmup` property had an invalid non-boolean runtime value (e.g. string, number, object).
 * - 'not-applicable-cardio': The set belongs to a cardio activity, for which strength set role is not applicable.
 */
export type SetRoleEvidenceSource =
  | 'isWarmup-true'
  | 'isWarmup-false'
  | 'isWarmup-missing'
  | 'isWarmup-invalid'
  | 'not-applicable-cardio';

/**
 * Source extraction certainty level.
 * 
 * - 'high': Explicit, unambiguous boolean evidence was read directly from source (`true` or `false`).
 * - 'low': Evidence is missing, invalid, or ambiguous (`missing`, `invalid`, or `not-applicable-cardio`).
 * 
 * Note: This expresses only the certainty of the extracted role evidence from data,
 * not physical performance quality, RPE, or training stimulus.
 */
export type SetRoleSourceConfidence = 'high' | 'low';

/**
 * Canonical evidence fact for a single workout set.
 * 
 * Pure evidence representation:
 * - Does NOT calculate tonnage or e1RM.
 * - Does NOT perform weight-progression inference (e.g. 20kg -> 40kg -> 60kg).
 * - Separates Set Role Evidence from downstream Performance Eligibility.
 */
export interface CanonicalSetRoleEvidence {
  /**
   * The canonical role supported by source evidence.
   */
  readonly role: CanonicalSetRole;

  /**
   * Raw source representation format / trigger.
   */
  readonly source: SetRoleEvidenceSource;

  /**
   * Confidence level of the source evidence extraction.
   */
  readonly sourceConfidence: SetRoleSourceConfidence;

  /**
   * Indicates whether this set is structurally compatible with strength set roles.
   * False for cardio modalities (e.g. running, cycling, rowing).
   */
  readonly applicableToStrength: boolean;
}

/**
 * Contextual normalized set holding raw set identifier, weight, reps, and canonical role evidence.
 */
export interface CanonicalNormalizedSet {
  readonly setId?: string;
  readonly weight: number;
  readonly reps: number;
  readonly timeSeconds?: number;
  readonly distanceKm?: number;
  readonly evidence: CanonicalSetRoleEvidence;
}

/**
 * Contextual normalized exercise session holding exercise identifiers and its normalized sets.
 */
export interface CanonicalNormalizedExerciseSession {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly category: string;
  readonly sets: readonly CanonicalNormalizedSet[];
}
