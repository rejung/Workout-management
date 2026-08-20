/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Dimension-Linked Stress Evidence Types (VNext Recommendation Engine - CU3.13 / CU3.13B)
 *
 * Defines the unified contract connecting Strength (CU3.11) and Running (CU3.12I)
 * dimension projections into a single downstream-consumable evidence representation.
 *
 * Strict Invariants:
 * 1. Modality Discriminator: Discriminated union of DimensionProjectedStrengthStress and DimensionProjectedRunningStress.
 * 2. Target Membership Only: Evidence represents dimension membership; NO magnitude attribution or scalar conversion.
 * 3. Lossless Source Reference: Full sourceSessionMagnitude (StrengthStressMagnitude / RunningStressMagnitude) preserved intact.
 * 4. Multi-Dimension Awareness: associatedDimensions preserves the complete sibling dimension context of the session.
 * 5. Frozen Chronology Semantics: DayTimeOrderingStatus (CU1.2) explicitly tracks ordering certainty; deterministic array order !== temporal certainty.
 * 6. Zero Cross-Dimension Summation / Scoring / Conversion / Fatigue / Decay / Residual / Readiness / Recommendations.
 */

import { StressDimension } from './stressModel.types';
import { DayTimeOrderingStatus } from './trainingDay.types';
import { DimensionProjectedStrengthStress } from './strengthStressDimensionProjection.types';
import { DimensionProjectedRunningStress } from './runningStressDimensionProjection.types';

// =========================================================================
// 1. Unified Dimension Projected Stress (Discriminated Union)
// =========================================================================

export type UnifiedDimensionProjectedStress =
  | DimensionProjectedStrengthStress
  | DimensionProjectedRunningStress;

// =========================================================================
// 2. Dimension Stress Evidence Slice
// =========================================================================

export interface DimensionStressEvidenceSlice {
  /** The specific stress dimension of this evidence slice */
  readonly dimension: StressDimension;

  /**
   * Complete list of projection evidence items for this dimension.
   * [INVARIANT]: Deterministic storage ordering does NOT imply temporal certainty.
   */
  readonly evidence: readonly UnifiedDimensionProjectedStress[];

  /** Strength-only evidence partition (type-safe view) */
  readonly strengthEvidence: readonly DimensionProjectedStrengthStress[];

  /** Running-only evidence partition (type-safe view) */
  readonly runningEvidence: readonly DimensionProjectedRunningStress[];

  /**
   * Chronological certainty status across all evidence items in this slice (Frozen CU1.2).
   */
  readonly orderingState: DayTimeOrderingStatus;

  /**
   * Total count of UnifiedDimensionProjectedStress items in this slice (evidence.length).
   * [INVARIANT]: Item count fact only; NOT unique sessions, unique days, or stress magnitude amount.
   */
  readonly totalEvidenceCount: number;
}

// =========================================================================
// 3. All Dimension Stress Evidence Slices Container
// =========================================================================

export type AllDimensionStressEvidenceSlices = {
  readonly [D in StressDimension]: DimensionStressEvidenceSlice;
};

// =========================================================================
// 4. Audit Result Contract
// =========================================================================

export interface UnifiedStressEvidenceAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
