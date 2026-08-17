/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Categorical certainty status of temporal / chronological relationships for sessions on the same calendar day.
 * 
 * - 'not-applicable': Only a single workout session exists on this date.
 * - 'clear': Multiple sessions exist on this date and all pairwise chronological orderings are strictly known ('fully-ordered').
 * - 'partial': Multiple sessions exist, some pairwise orderings are known, but some are missing start times ('partially-ordered').
 * - 'unknown': Multiple sessions exist but temporal precedence cannot be established ('unordered' due to missing or identical start times).
 */
export type ChronologyInterpretability =
  | 'clear'
  | 'partial'
  | 'unknown'
  | 'not-applicable';

/**
 * Categorical assessment of whether the observation's recorded context provides complete metadata
 * for downstream temporal and session-level analysis under current policy.
 * 
 * - 'complete-for-current-policy': All essential fields (date, exercise, sets) are valid, and multi-session chronology is either not-applicable or fully clear.
 * - 'partial': Context contains missing fields or multi-session temporal uncertainty (e.g. missing start times on a multi-session day).
 */
export type ContextCompleteness =
  | 'complete-for-current-policy'
  | 'partial';

/**
 * Structured, dispassionate categorical metadata describing the degree to which a Performance Observation's
 * Context can be interpreted in downstream analyses.
 * 
 * Strict Invariants:
 * - Focuses strictly on Context Interpretability (chronology, completeness, session co-existence).
 * - Metric-specific evidence provenance (Set roleEvidenceQuality, e1RM selectedEvidenceQuality, Load-Volume high/limited contributions, Work-Capacity high/limited sets/reps)
 *   remains in the SSOT of each respective domain model and is NOT collapsed into a single summary field here.
 * - Dimensions remain orthogonal and are NEVER collapsed into a single scalar confidence score, percentage, or overall tier.
 * - Does NOT compute or contain fatigue scores, CNS load, readiness, recovery, or interference penalties.
 * - Does NOT modify or adjust raw performance metric values (e1RM, load-volume, work-capacity).
 * - Retains target identity traceability (sourceLogId, exerciseId, date, startTime).
 */
export interface PerformanceObservationInterpretability {
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
   * Session date (YYYY-MM-DD).
   */
  readonly date: string;

  /**
   * Session start time (HH:mm), if recorded.
   */
  readonly startTime?: string;

  /**
   * Categorical interpretability of same-day session chronology.
   */
  readonly chronologyInterpretability: ChronologyInterpretability;

  /**
   * Categorical context completeness fact for downstream analysis.
   */
  readonly contextCompleteness: ContextCompleteness;

  /**
   * Boolean fact: whether other WorkoutLogs exist on this same calendar date.
   * Invariant: Existence of other sessions is a factual descriptor and does NOT automatically degrade observation validity.
   */
  readonly hasOtherSameDayWorkoutLogs: boolean;

  /**
   * Boolean fact: whether other exercises co-exist within the same WorkoutLog container.
   */
  readonly hasOtherExercisesInWorkoutLog: boolean;
}
