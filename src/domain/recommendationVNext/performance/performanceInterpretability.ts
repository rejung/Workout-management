/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PerformanceObservationContext } from '../types/performanceObservationContext.types';
import {
  ChronologyInterpretability,
  ContextCompleteness,
  PerformanceObservationInterpretability,
} from '../types/performanceInterpretability.types';

/**
 * Derives structured, dispassionate categorical interpretability metadata for a Performance Observation
 * based on its objective PerformanceObservationContext facts.
 * 
 * Strict Invariants:
 * 1. Orthogonal Categorical Dimensions:
 *    - chronologyInterpretability ('clear' | 'partial' | 'unknown' | 'not-applicable')
 *    - contextCompleteness ('complete-for-current-policy' | 'partial')
 * 2. SSOT Evidence Provenance:
 *    - Does NOT collapse or re-summarize metric-specific evidence provenance into a single field.
 *      Set role evidence, e1RM selectedEvidenceQuality, Load-Volume contributions, and Work-Capacity compositions
 *      remain in their respective metric domain models.
 * 3. No Score Collapse:
 *    - Never collapses dimensions into a single numeric confidence score (0-100), weighted percentage, or overall tier (high/medium/low).
 * 4. No Physiological Inference:
 *    - Does NOT compute fatigue, CNS burden, recovery status, readiness, or interference penalties.
 * 5. No Metric Mutation:
 *    - Does NOT adjust, scale, or penalize raw performance values (e1RM, load-volume, work capacity reps).
 * 6. Unknown Preservation:
 *    - Unordered or missing temporal data is faithfully recorded as 'unknown' or 'partial' without arbitrary promotion.
 * 7. Pure Function:
 *    - Zero mutation of input parameters. Returns a deeply frozen immutable object.
 * 
 * @param context The factual PerformanceObservationContext container derived from CU2.9
 * @returns Immutable PerformanceObservationInterpretability metadata container
 */
export function derivePerformanceObservationInterpretability(
  context: PerformanceObservationContext
): PerformanceObservationInterpretability {
  // 1. Contract Validation
  if (
    !context ||
    typeof context !== 'object' ||
    typeof context.sourceLogId !== 'string' ||
    typeof context.exerciseId !== 'string' ||
    typeof context.date !== 'string' ||
    typeof context.sameDaySessionOrderingStatus !== 'string' ||
    !context.completenessFacts
  ) {
    throw new Error(
      'derivePerformanceObservationInterpretability contract violation: invalid or incomplete PerformanceObservationContext provided.'
    );
  }

  // 2. Resolve Chronology Interpretability from CU1 / CU2.9 DayTimeOrderingStatus
  let chronologyInterpretability: ChronologyInterpretability;

  switch (context.sameDaySessionOrderingStatus) {
    case 'single-session':
      chronologyInterpretability = 'not-applicable';
      break;
    case 'fully-ordered':
      chronologyInterpretability = 'clear';
      break;
    case 'partially-ordered':
      chronologyInterpretability = 'partial';
      break;
    case 'unordered':
      chronologyInterpretability = 'unknown';
      break;
    default:
      chronologyInterpretability = 'unknown';
      break;
  }

  // 3. Resolve Context Completeness
  const facts = context.completenessFacts;
  const isEssentialDataPresent = Boolean(
    facts.hasValidDate && facts.hasExerciseId && facts.hasSetEntries
  );

  let contextCompleteness: ContextCompleteness = 'partial';

  if (isEssentialDataPresent) {
    if (context.sameDayWorkoutLogCount <= 1) {
      // Single-session day: full record of the session constitutes complete context for current policy.
      // Missing startTime does not degrade completeness because chronology is 'not-applicable'.
      contextCompleteness = 'complete-for-current-policy';
    } else {
      // Multi-session day: requires fully clear chronological ordering and target startTime presence
      if (context.sameDaySessionOrderingStatus === 'fully-ordered' && facts.hasStartTime) {
        contextCompleteness = 'complete-for-current-policy';
      } else {
        contextCompleteness = 'partial';
      }
    }
  } else {
    contextCompleteness = 'partial';
  }

  // 4. Construct and Return Immutable Result Container
  return Object.freeze({
    sourceLogId: context.sourceLogId,
    exerciseId: context.exerciseId,
    exerciseName: context.exerciseName,
    date: context.date,
    startTime: context.startTime,
    chronologyInterpretability,
    contextCompleteness,
    hasOtherSameDayWorkoutLogs: context.hasOtherSameDayWorkoutLogs,
    hasOtherExercisesInWorkoutLog: context.hasOtherExercisesInWorkoutLog,
  });
}
