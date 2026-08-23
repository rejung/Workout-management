/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Historical Replay & Shadow Validation Types (VNext Recommendation Engine - CU5.0)
 *
 * Defines the contract for time-traveling replay evaluation, shadow comparison
 * against Legacy recommendations and actual performed sessions, anomaly reporting,
 * and statistical audit aggregations.
 *
 * Strict Invariants:
 * 1. Zero Future Data Leakage: At evaluationInstant T, the engine CANNOT access any session with date/time > T.
 * 2. Actual Session is NOT Ground Truth: Performed exercises represent user decisions, not objective correctness labels.
 * 3. Legacy is NOT Ground Truth: Legacy recommendations are shadow comparison baselines only.
 * 4. Zero Policy Modification: CU5.0 observes, classifies, and reports; it never modifies frozen recommendation logic.
 * 5. Determinism & Immutability: Replay execution produces identical, deeply frozen results for identical inputs.
 */

import { EvaluationContext } from './residualStressTrace.types';
import {
  CandidateDecisionEvaluationSet,
  CandidateDecisionEvidence,
  RestDecisionCategory,
} from './candidateDecision.types';
import { RestDecisionEvidence } from './restDecision.types';
import { FinalTodayDecision } from './finalTodayDecision.types';
import { CandidateReadinessEvidence } from './candidateReadiness.types';
import { CandidateTrainingNeedEvidence } from './candidateTrainingNeed.types';
import { CandidateProgressOpportunityEvidence } from './candidateProgressOpportunity.types';
import { WorkoutLog } from '../../../types';

export type EvaluationPointKind =
  | 'pre-session'
  | 'post-session'
  | 'calendar-day-eod'
  | 'ad-hoc';

/**
 * Point in time constructed from historical records for evaluating recommendation decisions.
 */
export interface HistoricalEvaluationPoint {
  readonly pointId: string;
  readonly kind: EvaluationPointKind;
  readonly evaluationInstant: string;
  readonly evaluationTimezone: string;
  readonly evaluationCalendarDate: string;
  readonly evaluationLocalTime: string;
  readonly associatedWorkoutLogId?: string;
  readonly associatedWorkoutLog?: WorkoutLog;
  readonly hasChronologyUncertainty: boolean;
  readonly uncertaintyReason?: string;
}

/**
 * Classification of agreement / disagreement between VNext recommendation and actual next performed workout.
 */
export type ComparisonClassification =
  | 'exact-match'
  | 'recommended-alternative-performed'
  | 'post-session-boundary'
  | 'rest-vs-train-disagreement'
  | 'candidate-disagreement'
  | 'actual-unmapped'
  | 'indeterminate';

/**
 * Structured comparison between VNext recommendation and the next actual workout session performed.
 */
export interface ActualSessionComparison {
  readonly classification: ComparisonClassification;
  readonly actualWorkoutLogId?: string;
  readonly actualDate?: string;
  readonly actualStartTime?: string;
  readonly actualRoutineName?: string;
  readonly actualMainLift?: string;
  readonly actualExerciseNames: readonly string[];
  readonly vNextKind: 'train' | 'rest';
  readonly vNextPrimaryCandidateId?: string;
  readonly vNextPrimaryCandidateName?: string;
  readonly vNextAlternativeCandidateIds: readonly string[];
  readonly explanation: string;
}

/**
 * Snapshot of stress dimensions and modality context at an evaluation point.
 */
export interface DimensionBehaviorSnapshot {
  readonly activeImmediateDimensions: readonly string[];
  readonly activeResidualDimensions: readonly string[];
  readonly hasAxialSystemicResidual: boolean;
  readonly hasRunningLowerBodyOverlap: boolean;
  readonly systemicExposureSummary: string;
}

/**
 * Complete evaluation result at a single historical evaluation point.
 */
export interface HistoricalReplayResult {
  readonly evaluationPoint: HistoricalEvaluationPoint;
  readonly evaluationContext: EvaluationContext;

  /** Evidence counts available at evaluationInstant T */
  readonly availableHistoricalEvidenceCount: {
    readonly eligibleWorkoutLogCount: number;
    readonly excludedFutureWorkoutLogCount: number;
    readonly eligibleExerciseEvidenceCount: number;
    readonly strengthEvidenceCount: number;
    readonly runningEvidenceCount: number;
    readonly excludedFutureExerciseEvidenceCount: number;
    readonly uncertainSameDaySessionCount: number;
    /** @deprecated Use eligibleWorkoutLogCount or eligibleExerciseEvidenceCount */
    readonly totalEligibleSessionCount: number;
    /** @deprecated Use excludedFutureWorkoutLogCount or excludedFutureExerciseEvidenceCount */
    readonly excludedFutureSessionCount: number;
  };

  /** Multi-axis candidate evidence */
  readonly readinessResults: readonly CandidateReadinessEvidence[];
  readonly trainingNeedResults: readonly CandidateTrainingNeedEvidence[];
  readonly progressOpportunityResults: readonly CandidateProgressOpportunityEvidence[];

  /** Synthesized evaluation set & today decision */
  readonly candidateDecisionSet: CandidateDecisionEvaluationSet;
  readonly restDecisionEvidence: RestDecisionEvidence;
  readonly todayDecision: FinalTodayDecision;

  /** Actual session metadata if a session occurred directly after this point */
  readonly actualSessionAfterEvaluation?: {
    readonly workoutLogId: string;
    readonly date: string;
    readonly startTime?: string;
    readonly routineName?: string;
    readonly mainLift?: string;
    readonly exercises: readonly string[];
  };

  /** Structured comparisons */
  readonly actualComparison?: ActualSessionComparison;

  /** Dimension behavior snapshot */
  readonly dimensionBehaviorSnapshot: DimensionBehaviorSnapshot;

  /** Warnings & chronology flags */
  readonly warnings: readonly string[];
}

/**
 * Replay anomaly taxonomy for structured classification.
 */
export type ReplayAnomalyCategory =
  | 'excessive-rest'
  | 'suspicious-train'
  | 'repeated-candidate'
  | 'candidate-starvation'
  | 'running-overconstraint'
  | 'axial-overconstraint'
  | 'need-policy-artifact'
  | 'progression-artifact'
  | 'chronology-uncertainty'
  | 'unexpected-tie';

/**
 * Structured observation anomaly detected during historical replay.
 */
export interface ReplayAnomaly {
  readonly anomalyId: string;
  readonly evaluationInstant: string;
  readonly category: ReplayAnomalyCategory;
  readonly relevantWorkoutLogIds: readonly string[];
  readonly vNextDecision: FinalTodayDecision;
  readonly legacyDecision?: string;
  readonly actualNextSession?: string;
  readonly evidenceSnapshot: {
    readonly readinessSummary: string;
    readonly needSummary: string;
    readonly opportunitySummary: string;
    readonly restSupportClass?: string;
  };
  readonly suspectedCause: string;
}

/**
 * Aggregate summary statistics from a replay run across multiple evaluation points.
 */
export interface ReplayStatistics {
  readonly totalEvaluationPoints: number;
  readonly preSessionPointCount: number;
  readonly postSessionPointCount: number;
  readonly trainDecisionCount: number;
  readonly restDecisionCount: number;
  readonly restCategoryDistribution: Record<RestDecisionCategory, number>;
  readonly candidateRecommendationDistribution: Record<string, number>;
  readonly candidatePreferredDistribution: Record<string, number>;
  readonly candidateViableDistribution: Record<string, number>;
  readonly candidateDeferredDistribution: Record<string, number>;
  readonly candidateUnsupportedDistribution: Record<string, number>;
  readonly needCategoryDistribution: Record<string, number>;
  readonly opportunityCategoryDistribution: Record<string, number>;
  readonly actualMatchDistribution: Record<ComparisonClassification, number>;
  readonly futureLeakageCount: number;
  readonly sameDayFutureLeakageCount: number;
  readonly anomalyCount: number;
}

/**
 * Golden Scenario verification outcome during replay.
 */
export interface GoldenScenarioReplayOutcome {
  readonly scenarioId: string;
  readonly title: string;
  readonly passed: boolean;
  readonly details: string;
  readonly evaluationInstant: string;
  readonly decisionKind: 'train' | 'rest';
  readonly primaryRecommendation?: string;
  readonly restCategory?: string;
}

/**
 * Full Replay Report container.
 */
export interface FullReplayReport {
  readonly summary: string;
  readonly statistics: ReplayStatistics;
  readonly results: readonly HistoricalReplayResult[];
  readonly anomalies: readonly ReplayAnomaly[];
  readonly goldenScenariosResults: readonly GoldenScenarioReplayOutcome[];
}
