/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Progress Opportunity Types (VNext Recommendation Engine - CU4.1)
 *
 * Defines the structural contract for Candidate-Specific Progress Opportunity evaluation,
 * deriving progression signals, baseline support, and intensity shift context from
 * frozen performance foundations without numerical scoring, arbitrary weights, or false regression penalties.
 *
 * Strict Invariants:
 * 1. Independent from Need & Readiness: Progress opportunity captures whether current historical
 *    records structurally support progression or stimulus advancement.
 * 2. Zero Numeric Scoring: No 0-100 scores, progression %, or arbitrary multipliers.
 * 3. Categorical Opportunity Taxonomy: 'progression-supported' | 'maintenance-supported' | 'exploratory-supported' | 'insufficient-evidence' | 'unmapped'.
 * 4. GS9 Intensity Shift Preservation: Lower volume accompanied by higher load/intensity is an
 *    intensity shift, NEVER an automated regression.
 * 5. Running Triad Isolation: Distance, duration, and pace are preserved independently without scalar summation.
 * 6. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile } from './stressModel.types';
import { EvaluationContext } from './residualStressTrace.types';
import {
  DirectionalComparison,
  DurationDirectionalComparison,
  MetricProvenance,
  MetricRangePosition,
  PaceDirectionalComparison,
  PaceRangePosition,
  RunningMetricInterpretation,
  RunningMetricProvenance,
} from './running.types';

// =========================================================================
// 1. Categorical Progress Opportunity Taxonomy
// =========================================================================

/**
 * Categorical classification of candidate progress opportunity.
 *
 * - 'progression-supported': Historical progression evidence structurally supports seeking
 *   higher stimulus / progression (e.g. rising e1RM, increased work capacity, volume stability
 *   with load advancement opportunity, running pace/distance milestones).
 * - 'maintenance-supported': Established historical baseline supports consistent work at
 *   current capacity without immediate progression pressure.
 * - 'exploratory-supported': Single-session reference or early baseline exploration.
 * - 'insufficient-evidence': Cold start or zero interpretable records (no false certainty).
 * - 'unmapped': Exercise has no profile mapping or unknown identity.
 */
export type ProgressOpportunityClass =
  | 'progression-supported'
  | 'maintenance-supported'
  | 'exploratory-supported'
  | 'insufficient-evidence'
  | 'unmapped';

// =========================================================================
// 2. Strength Progress Context
// =========================================================================

export type E1RMTrend =
  | 'rising'
  | 'stable'
  | 'below-baseline'
  | 'insufficient-history';

export type WorkCapacityTrend =
  | 'increasing'
  | 'stable'
  | 'decreasing'
  | 'insufficient-history';

export interface StrengthProgressOpportunityContext {
  /** Latest observed peak e1RM in kilograms */
  readonly latestPeakE1RMKg?: number;

  /** Historical median peak e1RM reference */
  readonly baselineMedianE1RMKg?: number;

  /** Historical maximum peak e1RM reference */
  readonly historicalMaxE1RMKg?: number;

  /** e1RM relationship trend */
  readonly e1RMTrend: E1RMTrend;

  /** Latest observed session volume in kg*reps */
  readonly latestVolumeKgReps?: number;

  /** Historical median volume reference */
  readonly baselineMedianVolumeKgReps?: number;

  /** Latest working set count */
  readonly latestWorkingSets?: number;

  /** Latest total reps */
  readonly latestTotalReps?: number;

  /** Work capacity trend */
  readonly workCapacityTrend: WorkCapacityTrend;

  /**
   * GS9 / GS-F: Intensity shift indicator.
   * True if volume decreased but peak working load or intensity increased.
   */
  readonly isIntensityShift: boolean;

  /** Factual rationale if intensity shift is present */
  readonly intensityShiftRationale?: string;
}

// =========================================================================
// 3. Running Progress Context
// =========================================================================

export interface RunningProgressOpportunityContext {
  readonly distanceInterpretation?: RunningMetricInterpretation<
    DirectionalComparison,
    MetricRangePosition,
    MetricProvenance
  >;
  readonly durationInterpretation?: RunningMetricInterpretation<
    DurationDirectionalComparison,
    MetricRangePosition,
    MetricProvenance
  >;
  readonly paceInterpretation?: RunningMetricInterpretation<
    PaceDirectionalComparison,
    PaceRangePosition,
    RunningMetricProvenance
  >;

  /** True if pace interpretation indicates faster or fastest on record */
  readonly hasPaceProgression: boolean;

  /** True if distance interpretation indicates above median or at/above max */
  readonly hasDistanceProgression: boolean;

  /** Factual running progression observations */
  readonly runningProgressionNotes: readonly string[];
}

// =========================================================================
// 4. Explainability Summary
// =========================================================================

export interface ProgressOpportunityExplainabilitySummary {
  readonly headline: string;
  readonly factualObservations: readonly string[];
}

// =========================================================================
// 5. Candidate Progress Opportunity Evidence Contract
// =========================================================================

export interface CandidateProgressOpportunityEvidence {
  readonly kind: 'candidate-progress-opportunity-evidence';

  /** Candidate exercise identifier */
  readonly candidateExerciseId: string;

  /** Candidate exercise display name */
  readonly candidateExerciseName: string;

  /** Canonical stress profile SSOT */
  readonly exerciseProfile: ExerciseStressProfile;

  /** Modality type */
  readonly modality: 'strength' | 'running' | 'unmapped';

  /** Categorical opportunity classification */
  readonly opportunityClass: ProgressOpportunityClass;

  /** Strength-specific performance & progression context (if strength modality) */
  readonly strengthContext?: StrengthProgressOpportunityContext;

  /** Running-specific performance & progression context (if running modality) */
  readonly runningContext?: RunningProgressOpportunityContext;

  /** Factual explainability summary */
  readonly explainabilitySummary: ProgressOpportunityExplainabilitySummary;

  /** Canonical evaluation context SSOT */
  readonly evaluationContext: EvaluationContext;
}

// =========================================================================
// 6. Multi-Candidate Progress Opportunity Evaluation Set
// =========================================================================

export interface CandidateProgressOpportunityEvaluationSet {
  readonly evaluationContext: EvaluationContext;
  readonly candidates: readonly CandidateProgressOpportunityEvidence[];
  readonly candidateMap: Readonly<Record<string, CandidateProgressOpportunityEvidence>>;
  readonly totalCandidatesCount: number;
}

// =========================================================================
// 7. Audit Result Contract
// =========================================================================

export interface CandidateProgressOpportunityAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
