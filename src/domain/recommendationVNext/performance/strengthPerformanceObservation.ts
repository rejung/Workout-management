/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../../types';
import {
  CanonicalNormalizedExerciseSession,
  CanonicalNormalizedSet
} from '../types/setRole.types';
import {
  StrengthExerciseContext,
  StrengthPerformancePurpose,
  StrengthSetPerformanceEligibility
} from '../types/performanceEligibility.types';
import { StandardStrengthPerformanceObservation } from '../types/performanceObservation.types';
import {
  evaluateNormalizedSetEligibility,
  evaluateStrengthSetEligibility
} from './strengthPerformanceEligibility';

/**
 * Contextual metadata about the session required to construct an observation.
 */
export interface StandardStrengthObservationContext {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly category: string;
}

/**
 * Extracts a StandardStrengthPerformanceObservation from a single set if it is eligible
 * for at least one performance purpose in a STANDARD strength modality.
 * 
 * Invariants:
 * - Pure function, zero mutations.
 * - Does NOT calculate derived metrics (e1RM, volume, tonnage).
 * - Does NOT rank or evaluate performance quality.
 * - Excludes explicit-warmups, cardio, time-based, and non-STANDARD sets.
 * - Preserves legacy unknown set role without unauthorized elevation to working set.
 * 
 * @param set The raw set record containing weight and reps
 * @param eligibility The purpose-specific eligibility decisions from CU2.1
 * @param context Session and exercise traceability context
 * @param setIndex The index of the set in the exercise session
 * @param setId Optional raw set id
 */
export function extractStandardStrengthSetObservation(
  set: { weight: number; reps: number },
  normalizedSet: CanonicalNormalizedSet,
  eligibility: StrengthSetPerformanceEligibility,
  context: StandardStrengthObservationContext,
  setIndex: number,
  setId?: string
): StandardStrengthPerformanceObservation | null {
  // Collect all purposes for which this set is eligible
  const eligiblePurposes: StrengthPerformancePurpose[] = [];

  if (eligibility.estimated1RM.eligible) {
    eligiblePurposes.push('estimated-1rm');
  }
  if (eligibility.loadVolume.eligible) {
    eligiblePurposes.push('load-volume');
  }
  if (eligibility.workCapacity.eligible) {
    eligiblePurposes.push('work-capacity');
  }

  // If the set is not eligible for ANY strength performance purpose, it yields no observation
  if (eligiblePurposes.length === 0) {
    return null;
  }

  // Determine the overall role evidence quality from the eligible decisions
  // In CU2.1, standard strength sets have consistent base evidence quality across eligible purposes
  const primaryDecision =
    eligibility.estimated1RM.eligible ? eligibility.estimated1RM
    : eligibility.loadVolume.eligible ? eligibility.loadVolume
    : eligibility.workCapacity;

  return Object.freeze({
    sourceLogId: context.sourceLogId,
    date: context.date,
    startTime: context.startTime,
    exerciseId: context.exerciseId,
    exerciseName: context.exerciseName,
    category: context.category,
    logType: 'STANDARD',
    setId,
    setIndex,
    observedLoadKg: set.weight,
    observedReps: set.reps,
    setRole: normalizedSet.evidence.role,
    roleEvidenceQuality: primaryDecision.evidenceQuality,
    eligiblePurposes: Object.freeze(eligiblePurposes),
  });
}

/**
 * Extracts all STANDARD strength performance observations from a normalized exercise session.
 * 
 * @param normalizedExercise Normalized exercise session with role evidence from CU1
 * @param sessionContext Traceability context (sourceLogId, date, startTime)
 * @param exerciseContext Modality metadata (category, logType, etc.)
 */
export function extractStandardStrengthObservationsFromExerciseSession(
  normalizedExercise: CanonicalNormalizedExerciseSession,
  sessionContext: { sourceLogId: string; date: string; startTime?: string },
  exerciseContextOverride?: Partial<StrengthExerciseContext>
): readonly StandardStrengthPerformanceObservation[] {
  const logType = exerciseContextOverride?.logType || 'STANDARD';

  // This extractor strictly focuses on STANDARD strength modalities
  // BODYWEIGHT_REPS, TIME_BASED, and CARDIO are deliberately not handled here
  if (logType !== 'STANDARD') {
    return Object.freeze([]);
  }

  const context: StrengthExerciseContext = {
    exerciseId: normalizedExercise.exerciseId,
    exerciseName: normalizedExercise.exerciseName,
    category: normalizedExercise.category,
    logType: 'STANDARD',
    ...exerciseContextOverride,
  };

  const obsContext: StandardStrengthObservationContext = {
    sourceLogId: sessionContext.sourceLogId,
    date: sessionContext.date,
    startTime: sessionContext.startTime,
    exerciseId: normalizedExercise.exerciseId,
    exerciseName: normalizedExercise.exerciseName,
    category: normalizedExercise.category,
  };

  const observations: StandardStrengthPerformanceObservation[] = [];

  normalizedExercise.sets.forEach((set, index) => {
    const eligibility = evaluateNormalizedSetEligibility(set, context);
    const observation = extractStandardStrengthSetObservation(
      { weight: set.weight, reps: set.reps },
      set,
      eligibility,
      obsContext,
      index,
      set.setId
    );

    if (observation !== null) {
      observations.push(observation);
    }
  });

  return Object.freeze(observations);
}

/**
 * Extracts all STANDARD strength performance observations from a full WorkoutLog.
 * 
 * @param log Raw WorkoutLog
 * @param normalizedExercises Array of normalized exercises matching the log
 */
export function extractStandardStrengthObservationsFromWorkoutLog(
  log: WorkoutLog,
  normalizedExercises: readonly CanonicalNormalizedExerciseSession[]
): readonly StandardStrengthPerformanceObservation[] {
  const sessionContext = {
    sourceLogId: log.id,
    date: log.date,
    startTime: log.startTime,
  };

  const allObservations: StandardStrengthPerformanceObservation[] = [];

  normalizedExercises.forEach((normEx) => {
    const observations = extractStandardStrengthObservationsFromExerciseSession(
      normEx,
      sessionContext,
      { logType: 'STANDARD' }
    );
    allObservations.push(...observations);
  });

  return Object.freeze(allObservations);
}
