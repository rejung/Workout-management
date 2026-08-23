/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Final TodayDecision Integration Types (VNext Recommendation Engine - CU4.4)
 *
 * Defines the structural contract for the final synthesized session recommendation (FinalTodayDecision).
 * Integrates the Frozen Candidate Decision Landscape and Frozen RestDecisionEvidence
 * without creating new evidence or introducing numeric scores, weights, or biological guessing.
 *
 * Strict Invariants:
 * 1. Rest is NOT a WorkoutLog: Rest is a top-level session decision ('train' vs 'rest'),
 *    never an exercise entity, fake log, or entry in the workout history.
 * 2. Completed Session Boundary First: An already-completed session on the evaluation calendar date
 *    strictly commands a Rest decision ('completed-session-boundary') to preserve the session boundary.
 * 3. Pure Rule-Based Hierarchy: Arbitration follows deterministic, explicit priority tiers.
 * 4. Viable-Only Discipline: No arbitrary auto-Train or auto-Rest for viable-only candidate landscapes.
 * 5. True Tie Preservation: If top preferred candidates are strictly equal across all axes,
 *    tiedPrimaryCandidates is returned without semantic ID prioritization.
 * 6. Zero Biological Guessing: No CNS fatigue, recovery %, muscle damage, or unrecorded sleep/HRV.
 * 7. Pure Immutability: Deeply frozen return objects.
 */

import { EvaluationContext } from './residualStressTrace.types';
import {
  CandidateDecisionEvaluationSet,
  CandidateDecisionEvidence,
  RestDecisionCategory,
} from './candidateDecision.types';
import { RestDecisionEvidence } from './restDecision.types';

export type FinalDecisionKind = 'train' | 'rest';

/**
 * Structured uncertainty context for final decision arbitration.
 */
export interface FinalDecisionUncertaintyContext {
  readonly hasUncertainSameDaySessions: boolean;
  readonly uncertainSessionCount: number;
  readonly hasSparseHistory: boolean;
  readonly isTiePreserved: boolean;
  readonly factualNotes: readonly string[];
}

/**
 * Structured explainability narrative.
 */
export interface FinalDecisionExplainability {
  readonly headline: string;
  readonly whyTrainOrRest: string;
  readonly primaryAttribution?: string;
  readonly restCounterEvidence?: string;
  readonly candidateLandscapeSummary: string;
  readonly systemicDemandSummary?: string;
  readonly decisionReasons: readonly string[];
}

/**
 * Final immutable session decision resulting from synthesizing CandidateDecisionEvaluationSet
 * and RestDecisionEvidence.
 */
export interface FinalTodayDecision {
  readonly kind: FinalDecisionKind;
  readonly evaluationContext: EvaluationContext;

  /** Primary recommended candidate (if kind === 'train' and no tie) */
  readonly primaryCandidate?: CandidateDecisionEvidence;

  /** Tied top candidates if kind === 'train' and a true tie occurred */
  readonly tiedPrimaryCandidates?: readonly CandidateDecisionEvidence[];

  /** Alternative viable / preferred candidates (excluding primary) */
  readonly alternativeCandidates: readonly CandidateDecisionEvidence[];

  /** Primary categorical rest reason (if kind === 'rest') */
  readonly restCategory?: RestDecisionCategory;

  /** Losslessly preserved RestDecisionEvidence */
  readonly restEvidence?: RestDecisionEvidence;

  /** Losslessly preserved candidate evaluation set */
  readonly candidateDecisionSet: CandidateDecisionEvaluationSet;

  /** Factual textual explanation of the final decision */
  readonly decisionRationale: string;

  /** Explainability structured object */
  readonly explainability: FinalDecisionExplainability;

  /** Structured uncertainty context */
  readonly uncertaintyContext: FinalDecisionUncertaintyContext;

  /** Synthesis arbitration audit trail */
  readonly arbitrationAuditTrail: readonly string[];
}
