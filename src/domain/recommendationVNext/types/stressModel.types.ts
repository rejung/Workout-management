/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ============================================================================
 * Recommendation Engine VNext — Stress Model Domain Vocabulary & Types
 * Change Unit 3.1.1: Stress Profile Magnitude-Free Semantics
 * ============================================================================
 * 
 * CORE DEFINITION:
 * Residual Stress is the relative residual state of training burden inferred from
 * recent actual training records, which may influence subsequent exercise
 * performance interpretation.
 * 
 * STRICT INVARIANTS:
 * 1. Stress ≠ Readiness (Stress is recent training burden; Readiness is the subsequent
 *    evaluation of appropriateness for a specific target exercise).
 * 2. Stress ≠ Training Need (Stress is burden; Need is strategic demand driven by
 *    goals, frequency, and movement balance).
 * 3. Multidimensional Vector: Stress is NOT a single 0-100 scalar score or global
 *    collapsed number. It is tracked across orthogonal/functional dimensions.
 * 4. Dimension Membership Only: Profiles express WHICH stress dimensions an exercise
 *    relates to. They do NOT express ordinal magnitude (no primary/secondary) or
 *    numeric magnitude (no weights, coefficients, or recovery percentages).
 * 5. Multi-dimensional Contribution: A single exercise may have membership in multiple
 *    stress dimensions (e.g. Squat -> knee-dominant, hip-posterior-chain, axial-systemic).
 * 6. No Hard Blocks: Stress overlap is an analytical input for downstream readiness,
 *    never an automatic veto or hard constraint.
 * 7. Non-Physiological Precision: Avoids false biological precision (no "CNS fatigue %",
 *    no "muscle damage %", no "18 hours to fully recovered").
 * 8. Golden Relations preserved:
 *    - Deadlift ↔ Squat (share posterior/axial context, but Squat has knee-dominant)
 *    - Running ↔ Squat/Deadlift (Running contributes to lower body stress dimensions
 *      without being a Strength Performance observation)
 *    - OHP ↔ Bench (share upper pressing context, but verticalPush ≠ horizontalPush)
 *    - Deadlift ≠ Horizontal Pull (Deadlift does NOT satisfy or replace Horizontal Pull)
 *    - Row ≠ Deadlift (Row is Horizontal Pull; Deadlift is Hip/Posterior + Axial)
 * ============================================================================
 */

/**
 * Minimal sufficient set of canonical stress dimensions capable of capturing
 * movement patterns and structural loading without arbitrary collapse or
 * excessive muscle-by-muscle over-segmentation.
 */
export type StressDimension =
  | 'knee-dominant-lower-body'
  | 'hip-posterior-chain'
  | 'horizontal-push'
  | 'vertical-push'
  | 'horizontal-pull'
  | 'vertical-pull'
  | 'axial-systemic-loading';

/**
 * Functional metadata and semantic role of a canonical stress dimension.
 */
export interface StressDimensionMetadata {
  /**
   * Unique dimension identifier.
   */
  readonly dimension: StressDimension;

  /**
   * Human-readable display label.
   */
  readonly displayName: string;

  /**
   * Functional description of the movement pattern or loading mechanism.
   */
  readonly description: string;

  /**
   * Primary kinesiological / structural loading context.
   * Note: Purely functional reference, not a medical or biological diagnosis.
   */
  readonly functionalContext: string;
}

/**
 * Categorization of cross-dimension structural relationship.
 * Used for relational analysis between distinct dimensions without
 * creating redundant duplicate macro-dimensions (e.g. 'sharedLegs' or 'sharedPress').
 * 
 * Note: 'partial-overlap' indicates two dimensions share musculature or structural
 * pathways and should not be assumed completely independent in downstream readiness
 * interpretation. It does NOT represent a numeric percentage or hard block.
 */
export type StressDimensionRelationshipType =
  | 'same-dimension'
  | 'partial-overlap'
  | 'distinct';

/**
 * Explicit pairwise relationship between two stress dimensions.
 */
export interface StressDimensionRelationship {
  /**
   * Source dimension.
   */
  readonly sourceDimension: StressDimension;

  /**
   * Target dimension.
   */
  readonly targetDimension: StressDimension;

  /**
   * Relationship classification.
   */
  readonly relationship: StressDimensionRelationshipType;

  /**
   * Explicit domain rationale for the relationship.
   */
  readonly rationale: string;
}

/**
 * Mapping status of an exercise to the Stress Model.
 */
export type ExerciseMappingStatus = 'mapped' | 'unmapped';

/**
 * Dispassionate, immutable definition of how an exercise contributes to the
 * multidimensional Stress Model.
 * 
 * Strict Invariants:
 * - NO ordinal magnitude or hierarchy (NO primary / secondary / major / minor / dominant).
 * - NO numeric magnitude or fatigue weights (e.g. 0.8, 1.2, percentages).
 * - NO readiness or recovery recommendation.
 * - NO priority ranking or candidate filtering.
 * - Expresses dimension membership only.
 */
export interface ExerciseStressProfile {
  /**
   * Exercise identifier or normalized slug.
   */
  readonly exerciseId: string;

  /**
   * Standard exercise display name.
   */
  readonly exerciseName: string;

  /**
   * Mapping status indicating whether this exercise is canonical/known or unmapped.
   */
  readonly mappingStatus: ExerciseMappingStatus;

  /**
   * List of stress dimensions with which this exercise is associated.
   * Order within this list conveys NO magnitude or priority.
   */
  readonly dimensions: readonly StressDimension[];

  /**
   * Analytical domain notes regarding this exercise's profile.
   */
  readonly domainNotes?: string;
}
