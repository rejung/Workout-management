/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Training Need Types (VNext Recommendation Engine - CU4.1)
 *
 * Defines the structural contract for Candidate-Specific Training Need evaluation,
 * deriving training opportunity, historical cadence, and dimension exposure facts
 * without numerical scoring, arbitrary rotation bonuses, or recovery kinetics conflation.
 *
 * Strict Invariants:
 * 1. Independent from Readiness: Readiness evaluates "is it appropriate right now".
 *    Need evaluates "is there structural training need / cadence opportunity".
 * 2. Zero Numeric Scoring: No 0-100 scores, rotation bonus points, or frequency penalties.
 * 3. Categorical Need Taxonomy: 'due' | 'available' | 'recently-addressed' | 'insufficient-history' | 'unmapped'.
 * 4. Exercise Need vs Dimension Need: Direct exercise history and StressDimension exposures
 *    are distinct and tracked separately (e.g. Deadlift does not fulfill horizontal-pull need).
 * 5. Frequency Context: Session counts and unique training days are cleanly distinguished.
 * 6. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile, StressDimension } from './stressModel.types';
import { EvaluationContext } from './residualStressTrace.types';
import { StrengthHistoryState } from './strengthStressBaseline.types';

// =========================================================================
// 1. Categorical Training Need Taxonomy
// =========================================================================

/**
 * Categorical classification of candidate training need.
 *
 * - 'due': Candidate exercise has established historical practice, but has not been trained
 *   recently relative to habitual frequency or relative to other candidates, OR its required
 *   dimensions have had low recent exposure. (Factual structural status, NOT an automated forced rank).
 * - 'available': Candidate is in normal training rotation / available for execution without
 *   excessive gap or excessive acute repetition.
 * - 'recently-addressed': Candidate exercise itself or its primary required dimensions were
 *   executed recently in the immediate/recent training window.
 * - 'insufficient-history': Insufficient prior records (< 1 session) to reliably establish
 *   a habitual cadence pattern (cold start).
 * - 'unmapped': Exercise has no profile mapping or unknown identity.
 */
export type CandidateTrainingNeedClass =
  | 'due'
  | 'available'
  | 'recently-addressed'
  | 'insufficient-history'
  | 'unmapped';

// =========================================================================
// 2. Recency Context
// =========================================================================

export interface ExerciseRecencyContext {
  /** Date string (YYYY-MM-DD) of the most recent prior execution */
  readonly lastPerformedDate?: string;

  /** Start time string (HH:MM:SS) of the most recent prior execution */
  readonly lastPerformedStartTime?: string;

  /** Source log identifier of the most recent prior execution */
  readonly lastPerformedSourceLogId?: string;

  /** Pure calendar-day delta between evaluation date and lastPerformedDate (0 for same day) */
  readonly calendarDaysSinceLastPerformed?: number;
}

// =========================================================================
// 3. Dimension-Level Exposure Summary
// =========================================================================

export interface DimensionExposureSummary {
  readonly dimension: StressDimension;

  /** Most recent date this specific dimension was stimulated by ANY exercise */
  readonly lastDimensionTrainedDate?: string;

  /** Pure calendar-day delta since this dimension was stimulated */
  readonly calendarDaysSinceLastTrained?: number;

  /** Count of sessions stimulating this dimension in the recent evaluation window */
  readonly recentSessionCount: number;

  /** Distinct exercise IDs that stimulated this dimension in the recent window */
  readonly contributingExerciseIds: readonly string[];

  /** True if this dimension was addressed in the recent window */
  readonly isRecentlyAddressed: boolean;
}

// =========================================================================
// 4. Frequency Context
// =========================================================================

export interface CandidateFrequencyContext {
  /** Lifetime total sessions recorded for this candidate */
  readonly lifetimeSessionCount: number;

  /** Lifetime total unique calendar days trained for this candidate */
  readonly lifetimeUniqueDaysCount: number;

  /** Sessions recorded in recent observation window (e.g. last 14 days) */
  readonly recentSessionCount: number;

  /** Unique calendar days trained in recent observation window */
  readonly recentUniqueDaysCount: number;

  /** Dimension-level exposure summaries for all required dimensions */
  readonly dimensionExposures: readonly DimensionExposureSummary[];
}

// =========================================================================
// 5. Long-Term History Context
// =========================================================================

export interface CandidateLongTermHistoryContext {
  readonly historyState: StrengthHistoryState;
  readonly totalHistoricalSessionCount: number;
  readonly firstRecordedDate?: string;
  readonly lastRecordedDate?: string;
  readonly isColdStart: boolean;
}

// =========================================================================
// 6. Explainability Summary
// =========================================================================

export interface CandidateNeedExplainabilitySummary {
  readonly headline: string;
  readonly factualObservations: readonly string[];
}

// =========================================================================
// 7. Candidate Training Need Evidence Contract
// =========================================================================

export interface CandidateTrainingNeedEvidence {
  readonly kind: 'candidate-training-need-evidence';

  /** Candidate exercise identifier */
  readonly candidateExerciseId: string;

  /** Candidate exercise display name */
  readonly candidateExerciseName: string;

  /** Canonical stress profile SSOT */
  readonly exerciseProfile: ExerciseStressProfile;

  /** Required StressDimensions for this candidate */
  readonly requiredDimensions: readonly StressDimension[];

  /** Long-term historical context and baseline facts */
  readonly historicalContext: CandidateLongTermHistoryContext;

  /** Candidate-specific recency metadata */
  readonly recency: ExerciseRecencyContext;

  /** Detailed frequency and dimension exposure context */
  readonly frequencyContext: CandidateFrequencyContext;

  /** Categorical need classification */
  readonly needClass: CandidateTrainingNeedClass;

  /** Factual explainability summary */
  readonly explainabilitySummary: CandidateNeedExplainabilitySummary;

  /** Canonical evaluation context SSOT */
  readonly evaluationContext: EvaluationContext;
}

// =========================================================================
// 8. Multi-Candidate Need Evaluation Set
// =========================================================================

export interface CandidateTrainingNeedEvaluationSet {
  readonly evaluationContext: EvaluationContext;
  readonly candidates: readonly CandidateTrainingNeedEvidence[];
  readonly candidateMap: Readonly<Record<string, CandidateTrainingNeedEvidence>>;
  readonly totalCandidatesCount: number;
}

// =========================================================================
// 9. Audit Result Contract
// =========================================================================

export interface CandidateTrainingNeedAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
