/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Running Stress Dimension Projection (VNext Recommendation Engine - CU3.12I)
 *
 * Pure domain implementation projecting CU3.12G RunningStressMagnitude into
 * frozen CU3.1 Stress Dimension target memberships.
 *
 * Strict Invariants:
 * 1. Target Membership Only: Declares relevance/membership to stress dimensions ('knee-dominant-lower-body' and 'hip-posterior-chain').
 * 2. NO Dimension-Specific Magnitudes: Does NOT split, fractionally weigh, or attribute distance/duration/pace to dimensions.
 * 3. Lossless Source Reference: Full CU3.12G RunningStressMagnitude linked as sourceSessionMagnitude.
 * 4. Fixed Cardinality: Exactly 2 projections (knee, hip) per running session.
 * 5. Multi-Dimension Awareness: associatedDimensions preserves fixed 2-tuple ['knee-dominant-lower-body', 'hip-posterior-chain'].
 * 6. Zero Cross-Dimension Summation / Scoring / Weighting / Splits / Fatigue / Decay / Readiness / Recommendations.
 * 7. Pure function with zero input mutations and deeply frozen return structures.
 */

import { RunningStressMagnitude } from '../types/running.types';
import {
  DimensionProjectedRunningStress,
  RunningAssociatedDimensions,
  SessionRunningDimensionProjectionBundle,
} from '../types/runningStressDimensionProjection.types';

/**
 * Canonical frozen target stress dimensions for running (CU3.1 / CU3.12H).
 */
export const FROZEN_RUNNING_DIMENSIONS: RunningAssociatedDimensions = Object.freeze([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
] as const);

/**
 * Pure function to project a single RunningStressMagnitude into exactly 2 fixed stress dimension memberships.
 *
 * Enforces:
 * - Exactly 2 projections (knee-dominant-lower-body, hip-posterior-chain)
 * - 0 duplicate dimensions
 * - Lossless source reference fidelity
 * - 0 dimension-specific magnitude fields
 * - 0 input mutations
 */
export function projectRunningStressToDimensions(
  magnitude: Readonly<RunningStressMagnitude>
): readonly [DimensionProjectedRunningStress, DimensionProjectedRunningStress] {
  const kneeProjection: DimensionProjectedRunningStress = Object.freeze({
    kind: 'dimension-projected-running-stress',
    dimension: 'knee-dominant-lower-body',
    sessionLogId: magnitude.sessionLogId,
    activityType: 'running',
    date: magnitude.sessionDate,
    startTime: magnitude.sessionStartTime,
    associatedDimensions: FROZEN_RUNNING_DIMENSIONS,
    sourceSessionMagnitude: magnitude,
  });

  const hipProjection: DimensionProjectedRunningStress = Object.freeze({
    kind: 'dimension-projected-running-stress',
    dimension: 'hip-posterior-chain',
    sessionLogId: magnitude.sessionLogId,
    activityType: 'running',
    date: magnitude.sessionDate,
    startTime: magnitude.sessionStartTime,
    associatedDimensions: FROZEN_RUNNING_DIMENSIONS,
    sourceSessionMagnitude: magnitude,
  });

  return Object.freeze([kneeProjection, hipProjection]);
}

/**
 * Pure master function to build a complete SessionRunningDimensionProjectionBundle
 * from a RunningStressMagnitude record.
 */
export function buildSessionRunningDimensionProjectionBundle(
  magnitude: Readonly<RunningStressMagnitude>
): SessionRunningDimensionProjectionBundle {
  const projections = projectRunningStressToDimensions(magnitude);

  return Object.freeze({
    sessionLogId: magnitude.sessionLogId,
    date: magnitude.sessionDate,
    startTime: magnitude.sessionStartTime,
    projections,
  });
}
