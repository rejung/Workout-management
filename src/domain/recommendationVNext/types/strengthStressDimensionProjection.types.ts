/**
 * Strength Stress Dimension Projection Types (VNext Recommendation Engine - CU3.11)
 *
 * Defines the contract for projecting CU3.10 StrengthStressMagnitude into
 * frozen CU3.1 Stress Dimension target memberships.
 *
 * Strict Invariants:
 * 1. Target Membership Only: Dimension projections declare relevance/membership to stress dimensions.
 * 2. NO Dimension-Specific Magnitudes: Does NOT split, fractionally weigh, or attribute kg·reps to dimensions.
 * 3. Source Reference Fidelity: Connects full CU3.10 StrengthStressMagnitude as sourceSessionMagnitude.
 * 4. Multi-Dimension Awareness: Preserves associatedDimensions (all target dimensions of the exercise).
 * 5. Canonical Mappings:
 *    - Squat: knee-dominant-lower-body, hip-posterior-chain, axial-systemic-loading
 *    - Deadlift: hip-posterior-chain, axial-systemic-loading (NEVER horizontal-pull)
 *    - OHP: vertical-push, axial-systemic-loading
 *    - Bench: horizontal-push
 * 6. Unmapped Isolation: Unmapped exercises (targetDimensions.length === 0) are cleanly quarantined.
 * 7. Zero Cross-Dimension Summation / Scoring / Decay / Residual Stress / Readiness / Recommendation.
 */

import { StressDimension } from './stressModel.types';
import { StrengthStressMagnitude } from './strengthStressMagnitude.types';

// =========================================================================
// 1. Single Dimension Projection Contract
// =========================================================================

export interface DimensionProjectedStrengthStress {
  readonly kind: 'dimension-projected-strength-stress';

  /** The specific stress dimension of this projection instance */
  readonly dimension: StressDimension;

  /** Identity & Timing facts */
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly date: string;
  readonly startTime?: string;

  /** All sibling dimensions associated with this exercise session */
  readonly associatedDimensions: readonly StressDimension[];

  /**
   * Source session magnitude reference.
   *
   * [STRICT INVARIANT]:
   * This is NOT a dimension-attributed magnitude. It represents the full exercise-level
   * session magnitude profile preserved losslessly as a source fact.
   */
  readonly sourceSessionMagnitude: StrengthStressMagnitude;
}

// =========================================================================
// 2. Unmapped Exercise Quarantine Record
// =========================================================================

export interface UnmappedExerciseDimensionRecord {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly sourceMagnitude: StrengthStressMagnitude;
  readonly reason: 'unmapped-dimension-tag';
}

// =========================================================================
// 3. Session-Level Dimension Projection Bundle
// =========================================================================

export interface SessionDimensionProjectionBundle {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;

  /** All successful dimension projections across exercises in the session */
  readonly projections: readonly DimensionProjectedStrengthStress[];

  /** Quarantined exercises with no valid dimension mappings */
  readonly unmappedExercises: readonly UnmappedExerciseDimensionRecord[];
}

export interface StrengthStressDimensionProjectionAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
