/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Decision & Synthesis Types (VNext Recommendation Engine - CU4.2)
 *
 * Defines the structural contract for Candidate Synthesis, Pairwise Comparison,
 * and Today's Session Decision without numeric scoring, arbitrary multipliers,
 * or arithmetic collapse (Readiness + Need + Opportunity != 90).
 *
 * Strict Invariants:
 * 1. Independent Axis Preservation: ReadinessEvidence, TrainingNeedEvidence, and
 *    ProgressOpportunityEvidence are preserved losslessly as first-class objects.
 * 2. Zero Arithmetic Synthesis: No weighted sums, normalized priority scores, 0-100 scores,
 *    rotation bonuses, goal-gap weights, or fatigue penalties.
 * 3. Lexicographic & Rule-Based Synthesis: Comparisons follow deterministic priority rules.
 * 4. Non-Dominant Readiness: Readiness does not blindly override Need (e.g., a 'caution'
 *    candidate with 'due' need can be preferred over a 'clear' candidate with 'recently-addressed' need).
 * 5. Decision Taxonomy: 'preferred' | 'viable' | 'deferred' | 'unsupported'.
 * 6. Structured Pairwise Comparisons: Pairwise comparisons return explicit contrast facts and deciding axis.
 * 7. Rest Boundary Separation: Rest is a top-level session decision (TodayDecision), NOT a fake exercise log.
 * 8. Pure Immutability: Deeply frozen structures.
 */

import { CandidateReadinessEvidence } from './candidateReadiness.types';
import { CandidateTrainingNeedEvidence } from './candidateTrainingNeed.types';
import { CandidateProgressOpportunityEvidence } from './candidateProgressOpportunity.types';
import { EvaluationContext } from './residualStressTrace.types';

// =========================================================================
// 1. Decision Taxonomy
// =========================================================================

/**
 * Categorical decision class assigned to a candidate exercise.
 *
 * - 'preferred': High recommendation priority. Candidate is structurally ready (clear or mild caution),
 *   addresses an active training need ('due' or 'available'), and/or possesses progression support.
 * - 'viable': Sound candidate. Feasible to perform without acute conflict, fitting normal rotation or maintenance.
 * - 'deferred': Lower immediate suitability. Subject to acute residual stress ('constrained') or recently
 *   addressed today when superior viable candidates exist.
 * - 'unsupported': Infeasible due to hard constraint or unmapped stress profile.
 */
export type CandidateDecisionClass =
  | 'preferred'
  | 'viable'
  | 'deferred'
  | 'unsupported';

/**
 * Comparison Axis used in pairwise arbitration.
 */
export type DecisionComparisonAxis =
  | 'hard-constraint'
  | 'readiness'
  | 'training-need'
  | 'progress-opportunity'
  | 'none-tie';

// =========================================================================
// 2. Candidate Decision Evidence
// =========================================================================

/**
 * High-level explainability summary for a candidate decision.
 */
export interface CandidateDecisionExplainabilitySummary {
  readonly headline: string;
  readonly synthesisRationale: string;
  readonly readinessSummary: string;
  readonly needSummary: string;
  readonly opportunitySummary: string;
  readonly keyFactualFactors: readonly string[];
}

/**
 * Synthesis comparison facts capturing the essential status of each axis.
 */
export interface CandidateComparisonFacts {
  readonly readinessClass: string;
  readonly needClass: string;
  readonly opportunityClass: string;
  readonly calendarDaysSinceLastPerformed: number | undefined;
  readonly hasAcuteStressConflict: boolean;
  readonly hasStructuralOverlap: boolean;
  readonly isProgressionSupported: boolean;
  readonly isIntensityShift: boolean;
}

/**
 * Comprehensive synthesized decision evidence for a single candidate exercise.
 * Preserves all three foundational evidence objects losslessly.
 */
export interface CandidateDecisionEvidence {
  readonly kind: 'candidate-decision-evidence';
  readonly candidateExerciseId: string;
  readonly candidateExerciseName: string;

  /** Losslessly preserved raw evidence across the three independent axes */
  readonly readinessEvidence: CandidateReadinessEvidence;
  readonly trainingNeedEvidence: CandidateTrainingNeedEvidence;
  readonly progressOpportunityEvidence: CandidateProgressOpportunityEvidence;

  /** Synthesized categorical decision classification */
  readonly decisionClass: CandidateDecisionClass;

  /** Factual reasons supporting this decision */
  readonly decisionReasons: readonly string[];

  /** Structured factual comparison summary */
  readonly comparisonFacts: CandidateComparisonFacts;

  /** Hard constraint status */
  readonly hardConstraintStatus: {
    readonly isHardBlocked: boolean;
    readonly infeasibilityReason?: string;
  };

  /** Explainability details */
  readonly explainabilitySummary: CandidateDecisionExplainabilitySummary;
}

// =========================================================================
// 3. Pairwise Comparison Contract
// =========================================================================

/**
 * Single axis comparison breakdown in pairwise arbitration.
 */
export interface AxisComparisonDetail {
  readonly axis: DecisionComparisonAxis;
  readonly candidateAState: string;
  readonly candidateBState: string;
  readonly favoredCandidate: 'candidateA' | 'candidateB' | 'tied';
  readonly contrastDescription: string;
}

/**
 * Deterministic pairwise comparison result between two candidates.
 */
export interface PairwiseComparisonResult {
  readonly candidateAId: string;
  readonly candidateBId: string;
  readonly candidateAName: string;
  readonly candidateBName: string;

  /** Winner identifier, or 'tie' if strictly equivalent */
  readonly winnerId: string | 'tie';
  readonly isTie: boolean;

  /** The primary axis that broke the tie or determined preference */
  readonly decidingAxis: DecisionComparisonAxis;

  /** Specific human-readable rule that settled the comparison */
  readonly decidingRule: string;

  /** Detailed comparison breakdown across each independent axis */
  readonly axisComparisons: {
    readonly readiness: AxisComparisonDetail;
    readonly trainingNeed: AxisComparisonDetail;
    readonly progressOpportunity: AxisComparisonDetail;
  };

  /** List of axes where candidates were considered tied */
  readonly tiedAxes: readonly DecisionComparisonAxis[];

  /** Full narrative explanation of the pairwise decision */
  readonly narrativeRationale: string;
}

// =========================================================================
// 4. Today Decision (Rest vs Train Boundary)
// =========================================================================

/**
 * Categorical cause for a 'rest' TodayDecision.
 *
 * - 'completed-session-boundary': Workout already performed on current evaluation calendar date.
 * - 'no-viable-candidates': All candidate exercises evaluated are constrained or recently addressed.
 * - 'hardblocked-boundary': All candidate exercises blocked by hard safety/injury boundaries.
 * - 'elective-rest': Deliberate recovery day requested or scheduled.
 */
export type RestDecisionCategory =
  | 'completed-session-boundary'
  | 'no-viable-candidates'
  | 'hardblocked-boundary'
  | 'elective-rest';

/**
 * High-level session recommendation for the current evaluation context.
 * Distinct from WorkoutLog. Rest is a session decision, NOT a fake workout.
 */
export interface TodayDecision {
  readonly kind: 'train' | 'rest';
  readonly evaluationContext: EvaluationContext;
  readonly summaryHeadline: string;

  /** Primary categorical reason if kind === 'rest' */
  readonly restCategory?: RestDecisionCategory;

  /** Primary recommended exercise candidate (if kind === 'train') */
  readonly primaryCandidate?: CandidateDecisionEvidence;

  /** Categorized candidate lists */
  readonly preferredCandidates: readonly CandidateDecisionEvidence[];
  readonly viableAlternatives: readonly CandidateDecisionEvidence[];
  readonly deferredCandidates: readonly CandidateDecisionEvidence[];

  /** Factual rationale if rest is recommended (e.g. same-day session already completed) */
  readonly restRationale?: string;

  /** All evaluated candidates in stable deterministic order */
  readonly allCandidates: readonly CandidateDecisionEvidence[];

  /** Audit trail of synthesis rules evaluated */
  readonly synthesisAuditTrail: readonly string[];
}

/**
 * Container collection for a multi-candidate evaluation set.
 */
export interface CandidateDecisionEvaluationSet {
  readonly evaluationContext: EvaluationContext;
  readonly candidates: readonly CandidateDecisionEvidence[];
  readonly candidateMap: Record<string, CandidateDecisionEvidence>;
  readonly preferredCount: number;
  readonly viableCount: number;
  readonly deferredCount: number;
  readonly unsupportedCount: number;
  readonly todayDecision: TodayDecision;
}
