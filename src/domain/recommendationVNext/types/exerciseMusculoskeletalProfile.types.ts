/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Musculoskeletal Profile & Body Partitioning Types (VNext Recommendation Engine - Phase 1)
 *
 * Defines the structural contract for muscle involvement, torso stabilization demands,
 * and display groupings across canonical exercises.
 *
 * Strict Architectural Invariants:
 * 1. 13 Muscle Regions & 11 Display Groups:
 *    - 13 distinct anatomical regions.
 *    - 11 display groups (shoulders groups anterior, lateral, and posterior deltoids;
 *      remaining 10 regions map 1:1 to their own group).
 *    - Each region belongs to exactly one display group.
 * 2. Pure Categorical Roles:
 *    - Strictly 'primary-target' | 'synergist' | 'stabilizer'.
 *    - ZERO numeric fatigue weights, percentage contributions, or arbitrary multipliers.
 * 3. Separation of Concerns:
 *    - Muscle involvement is a kinesiological classification, NOT a fatigue recovery engine.
 *    - 7 canonical StressDimensions remain intact; muscle regions supplement rather than replace them.
 *    - Erector spinae involvement is NOT equated with axial-systemic-loading or central systemic fatigue.
 * 4. Explicit Status Taxonomy for Lookups:
 *    - Unsupported exercises, unconfirmed variations, and empty inputs return explicit
 *      discriminated status records. NEVER return empty list or zero burden.
 * 5. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

// =========================================================================
// 1. 13 Muscle Regions
// =========================================================================

export const CANONICAL_MUSCLE_REGIONS = [
  'pectoralis-major',
  'anterior-deltoid',
  'lateral-deltoid',
  'posterior-deltoid',
  'biceps-elbow-flexors',
  'triceps-brachii',
  'upper-back-scapular',
  'latissimus-dorsi',
  'erector-spinae',
  'quadriceps',
  'hamstrings',
  'gluteals',
  'calves',
] as const;

export type MuscleRegionId = (typeof CANONICAL_MUSCLE_REGIONS)[number];

// =========================================================================
// 2. 11 Display Groups
// =========================================================================

export const CANONICAL_MUSCLE_DISPLAY_GROUPS = [
  'chest',
  'shoulders',
  'biceps-elbow-flexors',
  'triceps-brachii',
  'upper-back-scapular',
  'latissimus-dorsi',
  'erector-spinae',
  'quadriceps',
  'hamstrings',
  'gluteals',
  'calves',
] as const;

export type MuscleDisplayGroupId = (typeof CANONICAL_MUSCLE_DISPLAY_GROUPS)[number];

export interface MuscleRegionMetadata {
  readonly regionId: MuscleRegionId;
  readonly koreanName: string;
  readonly anatomicalDescription: string;
  readonly displayGroupId: MuscleDisplayGroupId;
}

export interface MuscleDisplayGroupMetadata {
  readonly groupId: MuscleDisplayGroupId;
  readonly koreanName: string;
  readonly description: string;
  readonly memberRegionIds: readonly MuscleRegionId[];
}

// =========================================================================
// 3. Involvement Roles
// =========================================================================

/**
 * Functional involvement role of a muscle region within an exercise pattern.
 *
 * - 'primary-target': 주된 대상 (주동근 / Primary prime mover or primary target)
 * - 'synergist': 협력 (협동근 / Secondary mover assisting in the movement plane)
 * - 'stabilizer': 자세 유지 (안정근 / Isometric posture or joint stabilization)
 */
export type MuscleInvolvementRole =
  | 'primary-target'
  | 'synergist'
  | 'stabilizer';

export interface MuscleInvolvement {
  readonly regionId: MuscleRegionId;
  readonly role: MuscleInvolvementRole;
  readonly functionalRoleDescription?: string;
}

// =========================================================================
// 4. Torso Stabilization & External Support
// =========================================================================

export type TorsoSupportDemandLevel =
  | 'minimal-external-support'
  | 'moderate-dynamic-stabilization'
  | 'high-isometric-stabilization';

export interface TorsoSupportDemand {
  readonly demandLevel: TorsoSupportDemandLevel;
  readonly description: string;
  /**
   * Explains how the erector spinae and core musculature are involved,
   * explicitly maintaining separation from systemic axial compressive loading.
   */
  readonly erectorSpinaeContext: string;
}

export type ExternalSupportType =
  | 'unsupported-free-weight'
  | 'bench-supported'
  | 'chest-supported'
  | 'bodyweight-locomotion'
  | 'machine-guided'
  | 'unknown';

export interface ExternalSupportOrVariationStatus {
  readonly supportType: ExternalSupportType;
  readonly isChestSupported: boolean;
  /**
   * Indicates that this profile models the verified reference baseline definition of the foundation lift
   * (e.g., flat barbell bench press, conventional floor deadlift, standing free OHP).
   *
   * CONTRACTUAL CLARIFICATION:
   * This flag specifies the domain knowledge profile's baseline specification only.
   * It DOES NOT assert verification or compliance of an actual user's workout log or performance record.
   */
  readonly isReferenceBaselineProfile: boolean;
  /**
   * @deprecated Retained for backwards compatibility. Alias for isReferenceBaselineProfile.
   * Does NOT indicate verification of actual user workout logs.
   */
  readonly isVariationExplicitlyVerified: boolean;
  readonly variationDistinctionNotes?: string;
}

// =========================================================================
// 5. Exercise Musculoskeletal Profile
// =========================================================================

export interface ExerciseMusculoskeletalProfile {
  readonly exerciseId: string;
  readonly canonicalName: string;
  readonly movementPlane: string;
  readonly muscleInvolvements: readonly MuscleInvolvement[];
  readonly torsoSupportDemand: TorsoSupportDemand;
  readonly externalSupportOrVariation: ExternalSupportOrVariationStatus;
  readonly interpretationNotes: string;
}

// =========================================================================
// 6. Discriminated Lookup Result Taxonomy
// =========================================================================

export type ExerciseMusculoskeletalLookupResult =
  | {
      readonly status: 'supported';
      readonly profile: ExerciseMusculoskeletalProfile;
    }
  | {
      readonly status: 'unsupported';
      readonly queriedKey: string;
      readonly reason: string;
    }
  | {
      readonly status: 'unconfirmed-variation';
      readonly queriedKey: string;
      readonly matchedBaseCandidate?: string;
      readonly reason: string;
    }
  | {
      readonly status: 'empty-input';
      readonly reason: string;
    };
