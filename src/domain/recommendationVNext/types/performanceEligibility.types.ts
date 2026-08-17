/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogType } from '../../../types';

/**
 * Disaggregated analytical purposes for strength performance evaluation.
 * 
 * We explicitly do not collapse performance eligibility into a single boolean,
 * because a set may be valid for volume/capacity calculation while unsuitable
 * for 1RM estimation (e.g. 50kg x 30 reps, or unweighted pull-ups).
 */
export type StrengthPerformancePurpose =
  | 'estimated-1rm'
  | 'load-volume'
  | 'work-capacity';

/**
 * Quality / certainty level of the data evidence backing an eligibility decision.
 * 
 * - 'high': Explicit, unambiguous evidence (e.g. stored `isWarmup: false` on valid standard lift).
 * - 'limited': Historical or unconfirmed evidence that is structurally candidate-eligible
 *              (e.g. legacy migrated sets with `unknown-set-role`).
 * - 'insufficient': The set does not satisfy eligibility criteria for the given purpose.
 * 
 * IMPORTANT: Evidence quality measures data certainty, NOT physical performance quality,
 * athlete strength, or effort level.
 */
export type StrengthEvidenceQuality = 'high' | 'limited' | 'insufficient';

/**
 * Machine-readable and human-explainable reason codes for eligibility decisions.
 */
export type StrengthEligibilityReason =
  | 'eligible-explicit-working-set'
  | 'eligible-legacy-role-unknown'
  | 'excluded-warmup'
  | 'excluded-not-strength-applicable'
  | 'excluded-cardio'
  | 'excluded-time-based'
  | 'excluded-bodyweight-for-external-load-metric'
  | 'excluded-invalid-load'
  | 'excluded-invalid-reps'
  | 'excluded-e1rm-rep-range';

/**
 * Result of an eligibility evaluation for a specific performance purpose.
 */
export interface EligibilityDecision {
  readonly eligible: boolean;
  readonly evidenceQuality: StrengthEvidenceQuality;
  readonly reasons: readonly StrengthEligibilityReason[];
}

/**
 * Full purpose-disaggregated eligibility decisions for a single workout set.
 */
export interface StrengthSetPerformanceEligibility {
  readonly estimated1RM: EligibilityDecision;
  readonly loadVolume: EligibilityDecision;
  readonly workCapacity: EligibilityDecision;
}

/**
 * Contextual exercise metadata needed for evaluating set performance eligibility.
 */
export interface StrengthExerciseContext {
  readonly exerciseId?: string;
  readonly exerciseName?: string;
  readonly category?: string;
  readonly logType?: LogType;
}
