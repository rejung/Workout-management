/**
 * Running Stress Dimension Projection Types (VNext Recommendation Engine - CU3.12I)
 *
 * Defines the contract for projecting CU3.12G RunningStressMagnitude into
 * frozen CU3.1 Stress Dimension target memberships.
 *
 * Strict Invariants:
 * 1. Target Membership Only: Declares relevance/membership to stress dimensions ('knee-dominant-lower-body' and 'hip-posterior-chain').
 * 2. NO Dimension-Specific Magnitudes: Does NOT split, fractionally weigh, or attribute distance/duration/pace to dimensions.
 * 3. Lossless Source Reference: Full CU3.12G RunningStressMagnitude linked as sourceSessionMagnitude.
 * 4. Multi-Dimension Awareness: Preserves associatedDimensions as fixed 2-tuple ['knee-dominant-lower-body', 'hip-posterior-chain'].
 * 5. Fixed Cardinality: Exactly 2 projections (knee, hip) per running session.
 * 6. Zero Cross-Dimension Summation / Scoring / Weighting / Splits / Fatigue / Decay / Readiness / Recommendations.
 */

import { StressDimension } from './stressModel.types';
import { RunningStressMagnitude } from './running.types';

// =========================================================================
// 1. Associated Dimensions Contract
// =========================================================================

export type RunningAssociatedDimensions = readonly [
  'knee-dominant-lower-body',
  'hip-posterior-chain'
];

// =========================================================================
// 2. Single Dimension Projection Contract
// =========================================================================

export interface DimensionProjectedRunningStress {
  readonly kind: 'dimension-projected-running-stress';

  /** The specific stress dimension of this projection instance ('knee-dominant-lower-body' | 'hip-posterior-chain') */
  readonly dimension: StressDimension;

  /** Identity & Timing facts */
  readonly sessionLogId: string;
  readonly activityType: 'running';
  readonly date: string;
  readonly startTime?: string;

  /** Sibling dimensions associated with this running session (strictly fixed 2-tuple) */
  readonly associatedDimensions: RunningAssociatedDimensions;

  /**
   * Source session magnitude reference.
   *
   * [STRICT INVARIANT]:
   * This is NOT a dimension-attributed magnitude. It represents the full session-level
   * RunningStressMagnitude profile preserved losslessly as a source fact.
   */
  readonly sourceSessionMagnitude: RunningStressMagnitude;
}

// =========================================================================
// 3. Session-Level Dimension Projection Bundle
// =========================================================================

export interface SessionRunningDimensionProjectionBundle {
  readonly sessionLogId: string;
  readonly date: string;
  readonly startTime?: string;

  /**
   * Exactly 2 projections in fixed tuple:
   * [knee-dominant-lower-body, hip-posterior-chain]
   */
  readonly projections: readonly [
    DimensionProjectedRunningStress,
    DimensionProjectedRunningStress
  ];
}

// =========================================================================
// 4. Audit Result Contract
// =========================================================================

export interface RunningStressDimensionProjectionAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
