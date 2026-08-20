/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Readiness Types (VNext Recommendation Engine - CU4.0)
 *
 * Defines the structural contract for Candidate-Specific Readiness Evaluation,
 * comparing candidate-required StressDimensions against current DimensionResidualStates
 * without numerical fatigue scoring, arbitrary recovery percentages, or global readiness collapse.
 *
 * Strict Invariants:
 * 1. Candidate-Specific Scope: Readiness is strictly relative to a specific candidate exercise's
 *    required dimensions. Never calculate a single global readiness score.
 * 2. Frozen Stress Vocabulary: Dimension membership is drawn directly from CU3.1 Frozen Stress
 *    Vocabulary (ExerciseStressProfile). No arbitrary interference matrices.
 * 3. Zero Numeric Scoring: No 0-100 scores, recovery %, fatigue metrics, or arbitrary penalties.
 * 4. Ordered Categorical Taxonomy: 'constrained' > 'caution' > 'clear' (plus 'unmapped').
 * 5. Uncertainty & Bracket Preservation: Uncertainty is never treated as clear/ready;
 *    potential bracket promotions are preserved as caution without false confirmation.
 * 6. Historical Non-Overstatement: Historical-only evidence (>=72h) is preserved losslessly
 *    without being exaggerated into acute residual constraint (evaluates to 'clear').
 * 7. Hard Constraint Minimization: Future evidence, uncertainty, or residual evidence alone
 *    do not trigger arbitrary hard blocks.
 * 8. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile, StressDimension } from './stressModel.types';
import {
  EvaluationContext,
  PersistenceState,
  ResidualStressTrace,
} from './residualStressTrace.types';
import {
  AllDimensionResidualStates,
  DimensionModalityPresence,
  DimensionResidualState,
} from './dimensionResidualState.types';

// =========================================================================
// 1. Ordered Categorical Readiness Taxonomy
// =========================================================================

/**
 * Ordered categorical readiness classification for candidate exercises.
 * Total order: 'constrained' > 'caution' > 'clear' (and 'unmapped' for unclassified movements).
 *
 * - 'constrained': Definite immediate evidence (<24h) exists on at least one required dimension.
 *   Represents acute active stress overlap. Does not automatically hard-block execution.
 * - 'caution': Definite residual evidence (24h-72h), potential bracket promotion, or same-day
 *   chronological uncertainty exists on at least one required dimension (and no definite immediate).
 * - 'clear': All required dimensions have either no relevant traces or strictly historical evidence
 *   (>=72h), with zero acute, residual, bracket, or uncertain trace overlap.
 * - 'unmapped': The candidate exercise has no mapped stress dimensions in the vocabulary.
 */
export type CandidateReadinessClass =
  | 'constrained'
  | 'caution'
  | 'clear'
  | 'unmapped';

export type DimensionReadinessStatus = 'constrained' | 'caution' | 'clear';

// =========================================================================
// 2. Candidate Modality Context
// =========================================================================

export interface CandidateModalityContext {
  /** High-level modality presence across all required dimensions */
  readonly presence: DimensionModalityPresence;

  /** True if at least one strength trace is present across required dimensions */
  readonly hasStrength: boolean;

  /** True if at least one running trace is present across required dimensions */
  readonly hasRunning: boolean;

  /** Total count of strength traces across all required dimensions */
  readonly totalStrengthTraces: number;

  /** Total count of running traces across all required dimensions */
  readonly totalRunningTraces: number;
}

// =========================================================================
// 3. Dimension-Level Readiness Assessment
// =========================================================================

export interface CandidateDimensionReadinessAssessment {
  /** The specific stress dimension evaluated */
  readonly dimension: StressDimension;

  /** Dimension-level readiness status */
  readonly dimensionReadinessStatus: DimensionReadinessStatus;

  /** Direct reference to underlying DimensionResidualState */
  readonly residualState: DimensionResidualState;

  /** True if definite immediate evidence (<24h) is present */
  readonly hasImmediateEvidence: boolean;

  /** True if definite residual evidence (24h-72h) is present */
  readonly hasResidualEvidence: boolean;

  /** True if all present traces are strictly historical (>=72h) */
  readonly isHistoricalOnly: boolean;

  /** True if bracket traces could potentially promote this dimension to a stronger state */
  readonly hasPotentialPromotion: boolean;

  /** Potential strongest persistence state considering bracket bounds */
  readonly potentialPersistenceState: PersistenceState | 'none';

  /** True if occurrence uncertainty (e.g. same-day missing time) is present */
  readonly hasUncertainty: boolean;

  /** Modality presence on this specific dimension */
  readonly modalityPresence: DimensionModalityPresence;

  /** True if strength evidence exists on this dimension */
  readonly hasStrengthEvidence: boolean;

  /** True if running evidence exists on this dimension */
  readonly hasRunningEvidence: boolean;

  /** Total relevant trace count on this dimension */
  readonly totalRelevantTraceCount: number;

  /** Traces partitioned by temporal attenuation */
  readonly immediateTraces: readonly ResidualStressTrace[];
  readonly residualTraces: readonly ResidualStressTrace[];
  readonly historicalTraces: readonly ResidualStressTrace[];
  readonly bracketTraces: readonly ResidualStressTrace[];
  readonly uncertainTraces: readonly ResidualStressTrace[];

  /** Factual, non-scoring structural observations for explainability */
  readonly structuralNotes: readonly string[];
}

// =========================================================================
// 4. Hard Constraint Boundary
// =========================================================================

export interface CandidateHardConstraintBoundary {
  /**
   * True if a formal invariant hard blocks this candidate.
   * In CU4.0, this is false by default as residual/uncertain evidence does not trigger auto-blocking.
   */
  readonly isHardBlocked: boolean;

  /** Explicit rationale if hard blocked; undefined otherwise */
  readonly infeasibilityReason?: string;
}

// =========================================================================
// 5. Structural Readiness Overlap (CU4.0A)
// =========================================================================

/**
 * Minimal structural overlap relation vocabulary.
 * Strictly limited to kinesiological pattern relationships without arbitrary penalties.
 */
export type StructuralOverlapRelation = 'press-pattern-overlap';

export interface StructuralReadinessOverlap {
  /** The specific structural relationship */
  readonly relation: StructuralOverlapRelation;

  /** Source exercise ID generating the structural overlap (e.g. 'overhead_press') */
  readonly sourceExerciseId: string;

  /** Source exercise display name */
  readonly sourceExerciseName: string;

  /** Source stress dimension where the evidence originated (e.g. 'vertical-push') */
  readonly sourceDimension: StressDimension;

  /** Target required stress dimension on the candidate exercise (e.g. 'horizontal-push') */
  readonly targetDimension: StressDimension;

  /** Strongest persistence state of the overlapping evidence */
  readonly persistence: PersistenceState | 'bracket' | 'uncertain';

  /** Direct lossless reference to overlapping residual stress traces */
  readonly sourceTraceRefs: readonly ResidualStressTrace[];

  /** Factual rationale describing the structural overlap context */
  readonly rationale: string;
}

// =========================================================================
// 6. Explainability Summary
// =========================================================================

export interface CandidateReadinessExplainabilitySummary {
  /** High-level factual headline describing candidate readiness state */
  readonly headline: string;

  /** Factual bulleted observations detailing dimension states without scores */
  readonly factualObservations: readonly string[];
}

// =========================================================================
// 7. Candidate Readiness Evidence Contract
// =========================================================================

export interface CandidateReadinessEvidence {
  readonly kind: 'candidate-readiness-evidence';

  /** Candidate exercise identifier */
  readonly candidateExerciseId: string;

  /** Candidate exercise display name */
  readonly candidateExerciseName: string;

  /** Canonical stress profile SSOT */
  readonly exerciseProfile: ExerciseStressProfile;

  /** All StressDimensions required by this candidate exercise */
  readonly requiredDimensions: readonly StressDimension[];

  /** Individual assessments for each required dimension */
  readonly dimensionAssessments: readonly CandidateDimensionReadinessAssessment[];

  /** Quick lookup map of dimension assessments by StressDimension */
  readonly dimensionAssessmentMap: Readonly<
    Partial<Record<StressDimension, CandidateDimensionReadinessAssessment>>
  >;

  /** Required dimensions with definite immediate evidence (<24h) */
  readonly definiteImmediateDimensions: readonly StressDimension[];

  /** Required dimensions with definite residual evidence (24h-72h) and no immediate */
  readonly definiteResidualDimensions: readonly StressDimension[];

  /** Required dimensions where evidence is strictly historical (>=72h) */
  readonly historicalOnlyDimensions: readonly StressDimension[];

  /** Required dimensions with occurrence uncertainty or potential bracket promotion */
  readonly uncertainDimensions: readonly StressDimension[];

  /** Required dimensions with no acute/residual trace overlap (clear or historical-only) */
  readonly clearDimensions: readonly StressDimension[];

  /** Non-numeric structural readiness overlaps across related dimensions (CU4.0A) */
  readonly structuralOverlaps: readonly StructuralReadinessOverlap[];

  /** True if any active structural overlap is present */
  readonly hasStructuralOverlap: boolean;

  /** Modality context across all required dimensions */
  readonly modalityContext: CandidateModalityContext;

  /** Overall ordered categorical readiness classification */
  readonly overallReadinessClass: CandidateReadinessClass;

  /** Canonical evaluation context SSOT */
  readonly evaluationContext: EvaluationContext;

  /** Factual explainability summary */
  readonly explainabilitySummary: CandidateReadinessExplainabilitySummary;

  /** Explicit hard constraint boundary contract */
  readonly hardConstraintBoundary: CandidateHardConstraintBoundary;
}

// =========================================================================
// 8. Multi-Candidate Evaluation Set
// =========================================================================

export interface CandidateReadinessEvaluationSet {
  /** Canonical evaluation context SSOT */
  readonly evaluationContext: EvaluationContext;

  /** All evaluated candidate readiness evidences in deterministic order */
  readonly candidates: readonly CandidateReadinessEvidence[];

  /** Lookup map by candidate exercise ID */
  readonly candidateMap: Readonly<Record<string, CandidateReadinessEvidence>>;

  /** Total count of evaluated candidates */
  readonly totalCandidatesCount: number;
}

// =========================================================================
// 9. Audit Result Contract
// =========================================================================

export interface CandidateReadinessAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
