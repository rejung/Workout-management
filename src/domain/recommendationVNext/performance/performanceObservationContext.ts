/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../../types';
import { StrengthEvidenceQuality } from '../types/performanceEligibility.types';
import {
  PerformanceObservationContext,
  SameDaySessionContext,
  SameDaySessionOrderingRelation,
  SameWorkoutLogOtherExerciseContext,
  TargetCompletenessFacts,
  TargetPerformanceObservationIdentity,
  TargetRoleEvidenceComposition,
} from '../types/performanceObservationContext.types';
import { buildCanonicalSessionRefs } from '../normalization/sessionOrdering';
import { determineDayTimeOrderingStatus } from '../normalization/trainingDayState';
import {
  isCardioExercise,
  normalizeSessionSetRoles,
} from '../normalization/setRoleNormalization';

/**
 * Options for customizing or injecting observation details during context derivation.
 */
export interface DerivePerformanceObservationContextOptions {
  /**
   * Optional list of underlying performance observations (e.g. StandardStrengthPerformanceObservation)
   * used to populate roleEvidenceComposition accurately.
   */
  readonly observations?: readonly { readonly roleEvidenceQuality: StrengthEvidenceQuality }[];
}

/**
 * Derives a structured, dispassionate PerformanceObservationContext fact object
 * for a specific strength performance observation.
 * 
 * Rules & Invariants:
 * 1. Missing Target Source: If no WorkoutLog matches `target.sourceLogId`, throws an explicit Error.
 * 2. Duplicate sourceLogId Ambiguity: If multiple WorkoutLogs share `target.sourceLogId`, throws an explicit Error
 *    (refuses ambiguous context creation without silent arbitrary selection).
 * 3. Date Integrity: If the target WorkoutLog's date does not match `target.date`, throws an explicit Error.
 * 4. Exercise Existence: If `target.exerciseId` is not found in the target WorkoutLog, throws an explicit Error.
 * 5. Same-Day Multi-Session Facts:
 *    - Identifies all distinct WorkoutLogs recorded on the exact same date.
 *    - Reuses CU1 chronology contract (`determineDayTimeOrderingStatus`) for day-level certainty.
 *    - Computes target-relative pairwise relations ('before', 'after', 'ordering-unknown') strictly from distinct startTimes.
 *    - Missing or identical startTimes strictly yield 'ordering-unknown' without time fabrication or ID-based sorting.
 * 6. Same WorkoutLog Exercise Facts:
 *    - Identifies all other exercises co-existing in the same WorkoutLog container.
 *    - Array order is preserved factually without assuming execution chronology.
 * 7. Dispassionate Fact Representation:
 *    - Does NOT compute confidence scores, reliability tiers, or trust ratings.
 *    - Does NOT compute fatigue scores, CNS load, recovery status, or interference penalties.
 *    - Does NOT adjust or mutate raw performance observation values.
 *    - Pure function: zero mutation of input logs or options.
 * 
 * @param target Identity of the target observation (sourceLogId, exerciseId, date, optional startTime)
 * @param workoutLogs Complete collection of available WorkoutLogs
 * @param options Optional overrides/observations for role evidence composition
 * @returns Immutable PerformanceObservationContext fact container
 */
export function derivePerformanceObservationContext(
  target: TargetPerformanceObservationIdentity,
  workoutLogs: readonly WorkoutLog[],
  options?: DerivePerformanceObservationContextOptions
): PerformanceObservationContext {
  // 1. Validate Target Identity Inputs
  if (!target || typeof target.sourceLogId !== 'string' || typeof target.exerciseId !== 'string' || typeof target.date !== 'string') {
    throw new Error(
      'derivePerformanceObservationContext contract violation: target identity must contain valid sourceLogId, exerciseId, and date.'
    );
  }

  if (!Array.isArray(workoutLogs)) {
    throw new Error(
      'derivePerformanceObservationContext contract violation: workoutLogs must be an array.'
    );
  }

  // 2. Locate Matching WorkoutLog & Handle Duplicate sourceLogId Ambiguity
  const matchingLogs = workoutLogs.filter((log) => log && log.id === target.sourceLogId);

  if (matchingLogs.length === 0) {
    throw new Error(
      `derivePerformanceObservationContext contract violation: target sourceLogId '${target.sourceLogId}' not found in provided workout logs.`
    );
  }

  if (matchingLogs.length > 1) {
    throw new Error(
      `derivePerformanceObservationContext contract violation: duplicate sourceLogId ambiguity detected (${matchingLogs.length} logs found with id '${target.sourceLogId}'). Context construction rejected.`
    );
  }

  const targetLog = matchingLogs[0];

  // 3. Validate Date Integrity
  if (targetLog.date !== target.date) {
    throw new Error(
      `derivePerformanceObservationContext contract violation: target date '${target.date}' does not match WorkoutLog date '${targetLog.date}' for sourceLogId '${target.sourceLogId}'.`
    );
  }

  // 4. Locate Target Exercise within Target WorkoutLog
  const targetExercise = targetLog.exercises?.find(
    (ex) => ex && (ex.exerciseId === target.exerciseId || (ex as any).id === target.exerciseId)
  );

  if (!targetExercise) {
    throw new Error(
      `derivePerformanceObservationContext contract violation: target exerciseId '${target.exerciseId}' not found in WorkoutLog '${target.sourceLogId}'.`
    );
  }

  // 5. Aggregate Same-Day WorkoutLogs & Day-Level Chronology
  const sameDayLogs = workoutLogs.filter((log) => log && log.date === target.date);
  const sameDayWorkoutLogCount = sameDayLogs.length;
  const hasOtherSameDayWorkoutLogs = sameDayWorkoutLogCount > 1;

  // Derive day-level ordering status via CU1 contract
  const canonicalSameDayRefs = buildCanonicalSessionRefs(sameDayLogs);
  const sameDaySessionOrderingStatus = determineDayTimeOrderingStatus(canonicalSameDayRefs);

  // 6. Compute Target-Relative Pairwise Relation for Other Same-Day Sessions
  const targetStartTime = (targetLog.startTime || target.startTime)?.trim();

  const otherSameDaySessions: SameDaySessionContext[] = [];

  for (const otherLog of sameDayLogs) {
    // Skip the target session itself (identity check by reference and ID)
    if (otherLog === targetLog || otherLog.id === targetLog.id) {
      continue;
    }

    const otherStartTime = otherLog.startTime?.trim();

    let relationToTarget: SameDaySessionOrderingRelation = 'ordering-unknown';

    if (targetStartTime && otherStartTime) {
      if (otherStartTime < targetStartTime) {
        relationToTarget = 'before';
      } else if (otherStartTime > targetStartTime) {
        relationToTarget = 'after';
      } else {
        // Identical start times -> strictly ordering-unknown per CU1 contract
        relationToTarget = 'ordering-unknown';
      }
    } else {
      // Missing start time in either session -> strictly ordering-unknown
      relationToTarget = 'ordering-unknown';
    }

    const exercises = otherLog.exercises || [];
    const exerciseNames: string[] = exercises.map((e) => e.exerciseName || e.exerciseId || 'Unnamed');
    const categories: string[] = Array.from(
      new Set(exercises.map((e) => e.category).filter((c): c is string => Boolean(c && c.trim())))
    );
    const logTypes: string[] = Array.from(
      new Set(
        exercises.map((e) =>
          e.logType || (isCardioExercise(e.exerciseName, e.category) ? 'CARDIO' : 'STANDARD')
        )
      )
    );

    const hasCardio = exercises.some((e) =>
      isCardioExercise(e.exerciseName, e.category, e.logType)
    );
    const hasStrength = exercises.some(
      (e) => !isCardioExercise(e.exerciseName, e.category, e.logType)
    );

    otherSameDaySessions.push(
      Object.freeze({
        sourceLogId: otherLog.id,
        date: otherLog.date,
        startTime: otherLog.startTime,
        relationToTarget,
        exerciseCount: exercises.length,
        exerciseNames: Object.freeze(exerciseNames),
        categories: Object.freeze(categories),
        logTypes: Object.freeze(logTypes),
        hasCardio,
        hasStrength,
      })
    );
  }

  // 7. Same WorkoutLog Exercise Facts
  const targetLogExercises = targetLog.exercises || [];
  const sameWorkoutLogExerciseCount = targetLogExercises.length;
  const hasOtherExercisesInWorkoutLog = sameWorkoutLogExerciseCount > 1;

  const otherExercisesInSameWorkoutLog: SameWorkoutLogOtherExerciseContext[] = [];

  for (const ex of targetLogExercises) {
    // Skip the target exercise instance
    if (ex === targetExercise || ex.exerciseId === target.exerciseId) {
      continue;
    }

    const category = ex.category || '';
    const logType =
      ex.logType || (isCardioExercise(ex.exerciseName, ex.category) ? 'CARDIO' : 'STANDARD');
    const setCount = Array.isArray(ex.sets) ? ex.sets.length : 0;

    otherExercisesInSameWorkoutLog.push(
      Object.freeze({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName || ex.exerciseId,
        category,
        logType,
        setCount,
      })
    );
  }

  // 8. Role Evidence Composition
  let roleEvidenceComposition: TargetRoleEvidenceComposition | undefined;

  if (options?.observations && options.observations.length > 0) {
    let high = 0;
    let limited = 0;
    for (const obs of options.observations) {
      if (obs.roleEvidenceQuality === 'high') {
        high++;
      } else if (obs.roleEvidenceQuality === 'limited') {
        limited++;
      }
    }
    roleEvidenceComposition = Object.freeze({
      highEvidenceCount: high,
      limitedEvidenceCount: limited,
      totalObservationCount: options.observations.length,
    });
  } else {
    // Derive from normalized sets of target exercise
    const normalizedSets = normalizeSessionSetRoles(targetExercise);
    if (normalizedSets.length > 0) {
      let high = 0;
      let limited = 0;
      for (const set of normalizedSets) {
        if (set.evidence.role === 'explicit-working-set') {
          if (set.evidence.sourceConfidence === 'high') {
            high++;
          } else {
            limited++;
          }
        } else if (set.evidence.role === 'unknown-set-role') {
          limited++;
        }
      }
      const total = high + limited;
      if (total > 0) {
        roleEvidenceComposition = Object.freeze({
          highEvidenceCount: high,
          limitedEvidenceCount: limited,
          totalObservationCount: total,
        });
      }
    }
  }

  // 9. Data Completeness Facts
  const completenessFacts: TargetCompletenessFacts = Object.freeze({
    hasStartTime: Boolean(targetStartTime && targetStartTime.length > 0),
    hasValidDate: Boolean(targetLog.date && /^\d{4}-\d{2}-\d{2}$/.test(targetLog.date)),
    hasExerciseId: Boolean(targetExercise.exerciseId && targetExercise.exerciseId.length > 0),
    hasSetEntries: Boolean(Array.isArray(targetExercise.sets) && targetExercise.sets.length > 0),
  });

  // 10. Return Frozen Context Fact Container
  return Object.freeze({
    sourceLogId: target.sourceLogId,
    exerciseId: target.exerciseId,
    exerciseName: targetExercise.exerciseName || target.exerciseId,
    category: targetExercise.category || '',
    date: target.date,
    startTime: targetLog.startTime || target.startTime,
    sameDayWorkoutLogCount,
    hasOtherSameDayWorkoutLogs,
    sameDaySessionOrderingStatus,
    otherSameDaySessions: Object.freeze(otherSameDaySessions),
    sameWorkoutLogExerciseCount,
    hasOtherExercisesInWorkoutLog,
    otherExercisesInSameWorkoutLog: Object.freeze(otherExercisesInSameWorkoutLog),
    roleEvidenceComposition,
    completenessFacts,
  });
}
