/**
 * Strength Stress Factor Vocabulary & Invariants Types (VNext Recommendation Engine - CU3.4)
 *
 * Defines the analytical factor vocabulary and invariant rules for interpreting
 * strength session training stress inputs prior to relative normalization.
 *
 * Strict constraints:
 * - NO numeric scores, coefficients, or weighted sum formulas.
 * - NO dimension stress calculations, global fatigue ratings, or readiness determinations.
 * - NO running modality cross-contamination.
 */

import { StrengthStressMagnitudeInput } from './stressMagnitudeInput.types';

/**
 * Distinct analytical factor dimensions explaining the observable physical stress
 * of a strength workout session.
 *
 * These factors are distinct interpretive lenses, not mathematically orthogonal variables.
 */
export type StrengthStressFactor =
  | 'volume-exposure'
  | 'intensity-exposure'
  | 'repeated-work-exposure';

/**
 * Upstream input channels from StrengthStressMagnitudeInput that provide
 * empirical facts for factor evaluation.
 */
export type StrengthStressInputChannel =
  | 'set-evidence'
  | 'e1rm-evidence'
  | 'load-volume-evidence'
  | 'work-capacity-evidence';

/**
 * Metadata definition for a Strength Stress Factor.
 */
export interface StrengthStressFactorDefinition {
  readonly factor: StrengthStressFactor;
  readonly name: string;
  readonly description: string;
  /** Primary upstream input channels providing facts for this factor */
  readonly primarySourceChannels: readonly StrengthStressInputChannel[];
  /** Secondary or context upstream channels */
  readonly contextSourceChannels: readonly StrengthStressInputChannel[];
  /** The specific observable physical facet captured by this factor */
  readonly physicalFacet: string;
  /** Architectural notes on non-orthogonality and double-counting prevention */
  readonly nonOrthogonalityNote: string;
}

/**
 * Factor presence assessment for a specific StrengthStressMagnitudeInput session.
 * Captures whether facts exist to evaluate a factor without computing numeric scores.
 */
export type FactorAvailabilityStatus =
  | 'available'
  | 'insufficient-evidence'
  | 'not-applicable';

export interface FactorAvailabilityAssessment {
  readonly factor: StrengthStressFactor;
  readonly status: FactorAvailabilityStatus;
  readonly sourceEvidenceDescription: string;
}

/**
 * Complete session factor availability profile.
 */
export interface StrengthSessionFactorProfile {
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly factorAssessments: readonly FactorAvailabilityAssessment[];
  readonly availableFactorCount: number;
}

/**
 * Invariant audit rule interface for validation.
 */
export interface StrengthFactorInvariantCheck {
  readonly invariantName: string;
  readonly satisfied: boolean;
  readonly details: string;
}
