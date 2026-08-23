/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temporal Eligibility Framework (VNext Recommendation Engine - CU4.x)
 *
 * Implements the Single Source of Truth (SSOT) for temporal session eligibility across
 * Training Need, Progress Opportunity, Stress Traces, and TodayDecision.
 *
 * Strict Invariants:
 * 1. Single Evaluation Temporal Frame SSOT:
 *    - All evaluations anchor on evaluationCalendarDate and evaluationLocalTime derived
 *      from evaluationInstant + evaluationTimezone.
 * 2. Strict Past Eligibility:
 *    - Sessions on prior calendar dates (date < evalDate) are strictly eligible.
 *    - Sessions on the same calendar date with startTime <= evalLocalTime are strictly eligible.
 * 3. Strict Future Exclusion:
 *    - Sessions on future calendar dates (date > evalDate) are strictly excluded.
 *    - Sessions on the same calendar date with startTime > evalLocalTime are strictly excluded.
 * 4. Same-Day Missing Time Uncertainty:
 *    - Sessions on the same calendar date with no startTime cannot be assumed to be prior.
 *    - Marked as 'uncertain-same-day-missing-time' and excluded from definite historical calculations.
 * 5. Zero Input Mutation & Pure Determinism.
 */

import { EvaluationContext } from '../types/residualStressTrace.types';
import { computeCalendarDayDelta } from '../need/candidateTrainingNeed';

export type TemporalOccurrenceEligibility =
  | 'eligible-prior-date'
  | 'eligible-same-day-exact'
  | 'ineligible-same-day-future'
  | 'ineligible-future-date'
  | 'uncertain-same-day-missing-time';

export interface TemporalEligibilityResult {
  readonly eligibility: TemporalOccurrenceEligibility;
  readonly isEligible: boolean;
  readonly isFuture: boolean;
  readonly isUncertain: boolean;
  readonly reason: string;
}

/**
 * Evaluates the temporal occurrence eligibility of any session record relative to the evaluation context.
 */
export function evaluateSessionTemporalEligibility(
  session: { readonly date: string; readonly startTime?: string },
  evalContext: EvaluationContext
): TemporalEligibilityResult {
  const dayDelta = computeCalendarDayDelta(evalContext.evaluationCalendarDate, session.date);

  // Case 1: Future calendar date (session.date > evalContext.evaluationCalendarDate)
  if (dayDelta < 0) {
    return Object.freeze({
      eligibility: 'ineligible-future-date',
      isEligible: false,
      isFuture: true,
      isUncertain: false,
      reason: `Session date (${session.date}) is in the future relative to evaluation date (${evalContext.evaluationCalendarDate}).`,
    });
  }

  // Case 2: Prior calendar date (session.date < evalContext.evaluationCalendarDate)
  if (dayDelta > 0) {
    return Object.freeze({
      eligibility: 'eligible-prior-date',
      isEligible: true,
      isFuture: false,
      isUncertain: false,
      reason: `Session date (${session.date}) is strictly prior to evaluation date (${evalContext.evaluationCalendarDate}) (${dayDelta}d prior).`,
    });
  }

  // Case 3: Same calendar date (session.date === evalContext.evaluationCalendarDate)
  if (!session.startTime) {
    return Object.freeze({
      eligibility: 'uncertain-same-day-missing-time',
      isEligible: false,
      isFuture: false,
      isUncertain: true,
      reason: `Session occurred on evaluation date (${session.date}) but lacks startTime; cannot verify whether it occurred prior to evaluation instant (${evalContext.evaluationLocalTime}).`,
    });
  }

  const sessionTimeNorm = session.startTime.length === 5 ? `${session.startTime}:00` : session.startTime;
  const evalTimeNorm = evalContext.evaluationLocalTime.length === 5 ? `${evalContext.evaluationLocalTime}:00` : evalContext.evaluationLocalTime;

  if (sessionTimeNorm <= evalTimeNorm) {
    return Object.freeze({
      eligibility: 'eligible-same-day-exact',
      isEligible: true,
      isFuture: false,
      isUncertain: false,
      reason: `Session occurred on evaluation date (${session.date}) at ${session.startTime}, which is prior to or at evaluation instant (${evalContext.evaluationLocalTime}).`,
    });
  } else {
    return Object.freeze({
      eligibility: 'ineligible-same-day-future',
      isEligible: false,
      isFuture: true,
      isUncertain: false,
      reason: `Session occurred on evaluation date (${session.date}) at ${session.startTime}, which is in the future relative to evaluation instant (${evalContext.evaluationLocalTime}).`,
    });
  }
}

/**
 * Filters any collection of session records to only include temporally eligible sessions.
 */
export function filterTemporallyEligibleSessions<T extends { readonly date: string; readonly startTime?: string }>(
  sessions: readonly T[],
  evalContext: EvaluationContext
): readonly T[] {
  return Object.freeze(
    sessions.filter((s) => evaluateSessionTemporalEligibility(s, evalContext).isEligible)
  );
}
