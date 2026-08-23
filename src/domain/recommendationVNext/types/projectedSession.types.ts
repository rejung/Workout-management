/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NextProjectedSession Domain Types (VNext Recommendation Engine - CU9.0)
 *
 * Defines the structural contract for forward-projected training session opportunities.
 *
 * Core Concept:
 * NextProjectedSession represents the earliest meaningful training opportunity observed
 * at a future evaluation instant under the explicit conditional assumption that no new
 * actual WorkoutLogs are recorded between now and then.
 *
 * Invariants:
 * 1. Dedicated Domain Type: Independent from WorkoutLog and FinalTodayDecision.
 * 2. Zero Hypothetical Workout Injection: Never creates or assumes fake workouts between evaluations.
 * 3. Conditional Assumption Preservation: Explicitly tagged with 'no-new-actual-workout-logs'.
 * 4. Strictly Future Evaluation: Evaluates only strictly future evaluation instants relative to source time.
 * 5. First-Class Rest Preservation: Future Rest evaluations are not converted into fake exercise sessions.
 * 6. True Tie Preservation: Preserves tied candidate sets without arbitrary tie-breaking.
 * 7. Qualitative Uncertainty: Uses structured uncertainty flags, never biological % guesses or scores.
 * 8. Pure Immutability: Deeply frozen return objects.
 */

import {
  CandidateDecisionEvaluationSet,
  CandidateDecisionEvidence,
} from './candidateDecision.types';
import { FinalTodayDecision } from './finalTodayDecision.types';

export type ProjectedDecisionClass =
  | 'train'
  | 'no-projected-session-within-horizon';

export type ProjectionAssumption = 'no-new-actual-workout-logs';

export type ProjectionUncertaintyFlag =
  | 'assumption-dependent'
  | 'actual-log-sensitive'
  | 'chronology-limited'
  | 'insufficient-evidence'
  | 'horizon-exhausted';

/**
 * Audit and provenance reference to the exact source state used for projection.
 */
export interface SourceEvaluationReference {
  readonly evaluationInstant: string;
  readonly evaluationCalendarDate: string;
  readonly evaluationTimezone: string;
  readonly actualLogCount: number;
  readonly latestActualLogDate?: string;
  readonly latestActualLogStartTime?: string;
  readonly workoutLogFingerprint: string;
}

/**
 * Exact future evaluation point context where the projected opportunity was discovered.
 */
export interface ProjectedEvaluationContext {
  readonly pointId: string;
  readonly evaluationInstant: string;
  readonly evaluationCalendarDate: string;
  readonly evaluationLocalTime: string;
  readonly evaluationTimezone: string;
  readonly daysFromSource: number;
}

/**
 * Complete immutable contract for a forward-projected training session.
 */
export interface NextProjectedSession {
  /** Provenance of the evaluation state at the moment of projection */
  readonly sourceEvaluation: SourceEvaluationReference;

  /** Mandatory conditional assumption contract */
  readonly projectionAssumption: ProjectionAssumption;

  /** Resulting classification of the forward search */
  readonly projectedDecisionClass: ProjectedDecisionClass;

  /** Future evaluation point context where training opportunity was found (if train) */
  readonly projectedEvaluation?: ProjectedEvaluationContext;

  /** Projected calendar date in 'YYYY-MM-DD' format (if train) */
  readonly projectedDate?: string;

  /** Recommended primary candidate (if train and no tie) */
  readonly projectedCandidate?: CandidateDecisionEvidence;

  /** Tied candidate set (if train and true tie exists) */
  readonly tiedCandidates?: readonly CandidateDecisionEvidence[];

  /** Alternative viable candidates at the projected evaluation point */
  readonly alternativeCandidates: readonly CandidateDecisionEvidence[];

  /** Human-readable factual rationale for the projected recommendation */
  readonly projectionBasis: string;

  /** Structured qualitative uncertainty flags */
  readonly uncertaintyFlags: readonly ProjectionUncertaintyFlag[];

  /** Explicit list of conditions under which this projection is invalidated */
  readonly invalidationPolicy: readonly string[];

  /** Configured search horizon window in days */
  readonly searchHorizonDays: number;

  /** Total number of future evaluation points evaluated during search */
  readonly evaluationsCheckedCount: number;

  /** Underlying Frozen FinalTodayDecision at the projected point (for deep auditing) */
  readonly underlyingTodayDecision?: FinalTodayDecision;

  /** Underlying Frozen CandidateDecisionEvaluationSet at the projected point */
  readonly underlyingCandidateSet?: CandidateDecisionEvaluationSet;
}

/**
 * Options for configuring forward session projection.
 */
export interface NextProjectedSessionOptions {
  readonly sourceEvaluationInstant?: string;
  readonly sourceCalendarDate?: string;
  readonly timezone?: string;
  readonly searchHorizonDays?: number;
  readonly evaluationLocalTime?: string;
  readonly candidateIds?: readonly string[];
}
