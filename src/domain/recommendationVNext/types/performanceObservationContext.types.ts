/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DayTimeOrderingStatus } from './trainingDay.types';
import { StrengthEvidenceQuality } from './performanceEligibility.types';

/**
 * Temporal chronological relationship of another same-day session relative to the target session.
 * 
 * Strict Invariants:
 * - 'before': Other session has a valid startTime strictly earlier than target session's startTime.
 * - 'after': Other session has a valid startTime strictly later than target session's startTime.
 * - 'ordering-unknown': Pairwise relationship cannot be strictly proven (e.g. missing startTime in either session, or identical startTimes).
 * - Temporal relation is strictly target-relative.
 * - Invariant: WorkoutLog IDs, UUIDs, or array indices are NEVER used to infer chronological ordering.
 */
export type SameDaySessionOrderingRelation =
  | 'before'
  | 'after'
  | 'ordering-unknown';

/**
 * Dispassionate factual context describing another distinct workout session recorded on the exact same date.
 */
export interface SameDaySessionContext {
  /**
   * Source log identifier of the other same-day session.
   */
  readonly sourceLogId: string;

  /**
   * Session date (YYYY-MM-DD).
   */
  readonly date: string;

  /**
   * Session start time (HH:mm), if recorded.
   */
  readonly startTime?: string;

  /**
   * Pairwise chronological relation relative to the target session.
   */
  readonly relationToTarget: SameDaySessionOrderingRelation;

  /**
   * Total number of exercises recorded in this other session.
   */
  readonly exerciseCount: number;

  /**
   * Display names of exercises in this other session.
   */
  readonly exerciseNames: readonly string[];

  /**
   * Distinct categories of exercises in this other session (e.g. ['Cardio'], ['Back', 'Shoulders']).
   */
  readonly categories: readonly string[];

  /**
   * Distinct log types present in this other session (e.g. ['CARDIO'], ['STANDARD']).
   */
  readonly logTypes: readonly string[];

  /**
   * Whether this other session contains any cardio exercises.
   */
  readonly hasCardio: boolean;

  /**
   * Whether this other session contains any strength exercises.
   */
  readonly hasStrength: boolean;
}

/**
 * Contextual fact describing another exercise within the same WorkoutLog as the target.
 * 
 * Strict Invariants:
 * - Expresses co-existence within the same WorkoutLog container.
 * - Array order in the WorkoutLog is NOT assumed to represent chronological execution precedence.
 */
export interface SameWorkoutLogOtherExerciseContext {
  /**
   * Canonical exercise identifier.
   */
  readonly exerciseId: string;

  /**
   * Exercise display name.
   */
  readonly exerciseName: string;

  /**
   * Exercise category (e.g. Chest, Back, Shoulders, Core, Cardio).
   */
  readonly category: string;

  /**
   * Log type modality (e.g. STANDARD, BODYWEIGHT_REPS, TIME_BASED, CARDIO).
   */
  readonly logType: string;

  /**
   * Total sets recorded for this exercise in the WorkoutLog.
   */
  readonly setCount: number;
}

/**
 * Provenance breakdown of role evidence quality for the target exercise observation(s).
 */
export interface TargetRoleEvidenceComposition {
  /**
   * Number of observations with 'high' role evidence quality.
   */
  readonly highEvidenceCount: number;

  /**
   * Number of observations with 'limited' role evidence quality.
   */
  readonly limitedEvidenceCount: number;

  /**
   * Total number of observations evaluated.
   */
  readonly totalObservationCount: number;
}

/**
 * Data completeness facts for the target session (presence of key fields without scoring).
 */
export interface TargetCompletenessFacts {
  readonly hasStartTime: boolean;
  readonly hasValidDate: boolean;
  readonly hasExerciseId: boolean;
  readonly hasSetEntries: boolean;
}

/**
 * Target observation identity input for context derivation.
 */
export interface TargetPerformanceObservationIdentity {
  /**
   * Source log identifier of the workout session.
   */
  readonly sourceLogId: string;

  /**
   * Canonical exercise identifier.
   */
  readonly exerciseId: string;

  /**
   * Session date (YYYY-MM-DD).
   */
  readonly date: string;

  /**
   * Optional session start time (HH:mm).
   */
  readonly startTime?: string;
}

/**
 * Dispassionate structural context describing the workout session and calendar day
 * circumstances under which a performance observation was recorded.
 * 
 * Strict Invariants:
 * - Contains pure factual existence and chronological relations without subjective rating.
 * - Does NOT compute confidence score, certainty rating, or reliability tier.
 * - Does NOT compute fatigue score, CNS load, recovery status, readiness, or interference penalty.
 * - Does NOT adjust or mutate raw performance observation values (e1RM, load-volume, work-capacity).
 * - Does NOT couple with recommendation candidate generation or scoring.
 * - Retains full backward traceability to target sourceLogId, exerciseId, and date.
 */
export interface PerformanceObservationContext {
  /**
   * Source log identifier of the target workout session.
   */
  readonly sourceLogId: string;

  /**
   * Canonical exercise identifier.
   */
  readonly exerciseId: string;

  /**
   * Exercise display name.
   */
  readonly exerciseName: string;

  /**
   * Exercise category.
   */
  readonly category: string;

  /**
   * Session date (YYYY-MM-DD).
   */
  readonly date: string;

  /**
   * Session start time (HH:mm), if recorded.
   */
  readonly startTime?: string;

  /**
   * Total number of distinct WorkoutLogs on this date (including the target session).
   */
  readonly sameDayWorkoutLogCount: number;

  /**
   * Boolean flag indicating whether there are other WorkoutLogs on this same date (sameDayWorkoutLogCount > 1).
   */
  readonly hasOtherSameDayWorkoutLogs: boolean;

  /**
   * Chronological certainty status for multi-session ordering on this day from CU1 TrainingDayState.
   * ('single-session' | 'fully-ordered' | 'partially-ordered' | 'unordered')
   */
  readonly sameDaySessionOrderingStatus: DayTimeOrderingStatus;

  /**
   * Factual context for all other distinct sessions on the same date.
   */
  readonly otherSameDaySessions: readonly SameDaySessionContext[];

  /**
   * Total number of exercises recorded within the target WorkoutLog (including the target exercise).
   */
  readonly sameWorkoutLogExerciseCount: number;

  /**
   * Boolean flag indicating whether the target WorkoutLog contains other exercises (sameWorkoutLogExerciseCount > 1).
   */
  readonly hasOtherExercisesInWorkoutLog: boolean;

  /**
   * Factual list of other exercises recorded within the same WorkoutLog (order reflects log structure, not execution sequence).
   */
  readonly otherExercisesInSameWorkoutLog: readonly SameWorkoutLogOtherExerciseContext[];

  /**
   * Provenance role evidence composition for target exercise observations, if provided or derived.
   */
  readonly roleEvidenceComposition?: TargetRoleEvidenceComposition;

  /**
   * Data completeness facts (field presence verification without scoring).
   */
  readonly completenessFacts: TargetCompletenessFacts;
}
