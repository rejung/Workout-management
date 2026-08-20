/**
 * Strength Stress Dimension Projection (VNext Recommendation Engine - CU3.11)
 *
 * Pure function pipeline to project CU3.10 StrengthStressMagnitude into
 * frozen CU3.1 Stress Dimension target memberships.
 *
 * Strict Invariants:
 * 1. Target Membership Only: Declares membership of an exercise session to Stress Dimensions.
 * 2. NO Dimension-Specific Magnitudes: Does NOT divide, split, or weight kg·reps across dimensions.
 * 3. Lossless Source Reference: Full CU3.10 StrengthStressMagnitude linked as sourceSessionMagnitude.
 * 4. Multi-Dimension Awareness: associatedDimensions preserves the complete set of target dimensions.
 * 5. Canonical Mappings strictly respected.
 * 6. Unmapped exercises quarantined without fake dimension assignments.
 * 7. NO Fatigue / Decay / Residual Stress / Readiness / Recommendations.
 */

import {
  StrengthStressMagnitude
} from '../types/strengthStressMagnitude.types';
import {
  StressDimension
} from '../types/stressModel.types';
import {
  DimensionProjectedStrengthStress,
  UnmappedExerciseDimensionRecord,
  SessionDimensionProjectionBundle
} from '../types/strengthStressDimensionProjection.types';

/**
 * Valid frozen CU3.1 stress dimension tags set.
 */
export const FROZEN_STRESS_DIMENSIONS: readonly StressDimension[] = Object.freeze([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
  'horizontal-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'axial-systemic-loading'
]);

const VALID_DIMENSIONS_SET = new Set<StressDimension>(FROZEN_STRESS_DIMENSIONS);

/**
 * Pure function to project a single StrengthStressMagnitude into its target dimensions.
 */
export function projectStrengthStressToDimensions(
  magnitude: StrengthStressMagnitude
): {
  readonly projections: readonly DimensionProjectedStrengthStress[];
  readonly unmappedRecord?: UnmappedExerciseDimensionRecord;
} {
  const validTargetDimensions = (magnitude.targetDimensions || []).filter(
    (dim): dim is StressDimension => VALID_DIMENSIONS_SET.has(dim)
  );

  // If no valid dimensions exist, quarantine as unmapped
  if (validTargetDimensions.length === 0) {
    const unmappedRecord: UnmappedExerciseDimensionRecord = Object.freeze({
      exerciseId: magnitude.exerciseId,
      exerciseName: magnitude.exerciseName,
      sourceMagnitude: magnitude,
      reason: 'unmapped-dimension-tag'
    });

    return Object.freeze({
      projections: Object.freeze([]),
      unmappedRecord
    });
  }

  const associatedDimensions: readonly StressDimension[] = Object.freeze([...validTargetDimensions]);

  const projections: DimensionProjectedStrengthStress[] = validTargetDimensions.map(dim =>
    Object.freeze({
      kind: 'dimension-projected-strength-stress',
      dimension: dim,
      sourceLogId: magnitude.sourceLogId,
      exerciseId: magnitude.exerciseId,
      exerciseName: magnitude.exerciseName,
      date: magnitude.date,
      startTime: magnitude.startTime,
      associatedDimensions,
      sourceSessionMagnitude: magnitude
    })
  );

  return Object.freeze({
    projections: Object.freeze(projections)
  });
}

/**
 * Pure master function to build a complete SessionDimensionProjectionBundle
 * from a list of StrengthStressMagnitude records belonging to a session.
 */
export function buildSessionDimensionProjectionBundle(
  magnitudes: readonly StrengthStressMagnitude[]
): SessionDimensionProjectionBundle {
  if (magnitudes.length === 0) {
    return Object.freeze({
      sourceLogId: '',
      date: '',
      startTime: undefined,
      projections: Object.freeze([]),
      unmappedExercises: Object.freeze([])
    });
  }

  const first = magnitudes[0];
  const sourceLogId = first.sourceLogId;
  const date = first.date;
  const startTime = first.startTime;

  const allProjections: DimensionProjectedStrengthStress[] = [];
  const unmappedExercises: UnmappedExerciseDimensionRecord[] = [];

  for (const mag of magnitudes) {
    const { projections, unmappedRecord } = projectStrengthStressToDimensions(mag);
    for (const p of projections) {
      allProjections.push(p);
    }
    if (unmappedRecord) {
      unmappedExercises.push(unmappedRecord);
    }
  }

  return Object.freeze({
    sourceLogId,
    date,
    startTime,
    projections: Object.freeze(allProjections),
    unmappedExercises: Object.freeze(unmappedExercises)
  });
}
