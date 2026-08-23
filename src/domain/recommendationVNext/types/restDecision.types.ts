/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-Level Rest Decision Evidence Types (VNext Recommendation Engine - CU4.3)
 *
 * Defines the structural contract for deriving session-level rest evidence
 * strictly from actual recorded Strength and Cardio logs and deterministically
 * derived facts.
 *
 * Strict Invariants:
 * 1. Rest is NOT a WorkoutLog: Rest is a top-level session alternative of TodayDecision,
 *    never an exercise entity, fake log, or candidate in the exercise ranking.
 * 2. Evidence Boundary: Only actual recorded Strength and Cardio logs and their deterministic
 *    projections (dates, start times, sets, reps, weight, RPE if recorded, distance, duration, pace).
 * 3. Zero Biological / CNS Guessing: Strictly forbidden to estimate CNS fatigue, recovery %,
 *    muscle damage %, sleep, HRV, motivation, or unrecorded RPE. Axial-systemic-loading is
 *    structural movement loading context, NOT a CNS fatigue measurement.
 * 4. Zero Arithmetic Collapse: No scalar rest scores, fatigue numbers, or hidden magic multipliers.
 * 5. Distinct Metrics: Session count and unique workout days are strictly separated.
 * 6. Multi-Directional Preservation: Supporting reasons and counter reasons are preserved losslessly.
 * 7. Rest Taxonomy: 'rest-supported' | 'rest-reasonable' | 'rest-not-indicated'.
 *    (Forbidden: 'rest-required' or 'mandatory-rest').
 * 8. Pure Immutability: Deeply frozen return structures with zero mutation.
 */

import { StressDimension } from './stressModel.types';
import { EvaluationContext } from './residualStressTrace.types';

// =========================================================================
// 1. Rest Taxonomy
// =========================================================================

/**
 * Categorical rest support classification.
 *
 * - 'rest-supported': Current log structure actively supports choosing Rest.
 * - 'rest-reasonable': Train is possible, but Rest is also well justified.
 * - 'rest-not-indicated': Structural evidence prioritizing Rest is weak; training is well supported.
 *
 * (Note: 'rest-required' and 'mandatory-rest' are strictly forbidden as Strength/Cardio logs
 * alone cannot declare biological mandatory rest).
 */
export type RestSupportClass =
  | 'rest-supported'
  | 'rest-reasonable'
  | 'rest-not-indicated';

// =========================================================================
// 2. Recent Training Context & Density
// =========================================================================

/**
 * Modality presence in recent training history.
 */
export type TrainingModalityPresence =
  | 'none'
  | 'strength-only'
  | 'cardio-only'
  | 'both';

/**
 * Daily training breakdown for density tracking.
 */
export interface DailyTrainingBreakdown {
  readonly calendarDate: string;
  readonly calendarDaysAgo: number;
  readonly sessionCount: number;
  readonly strengthSessionCount: number;
  readonly cardioSessionCount: number;
  readonly isMultiSessionDay: boolean;
  readonly exerciseOrActivityNames: readonly string[];
}

/**
 * Recent training density structure (explicit externalized window, zero hidden magic rules).
 */
export interface RecentTrainingDensity {
  readonly sessionsByCalendarDay: readonly DailyTrainingBreakdown[];
  readonly uniqueTrainingDays: number;
  readonly totalSessions: number;
  readonly consecutiveTrainingDays: number;
  readonly multiSessionDays: number;
  readonly policyWindowDays: number;
}

/**
 * Consecutive training day context.
 */
export interface ConsecutiveTrainingDayContext {
  readonly consecutiveDaysLeadingUpToEval: number;
  readonly isSameDaySessionCompleted: boolean;
  readonly sameDaySessionCount: number;
}

/**
 * Recent Training Context:
 * Session count and unique days are explicitly separated.
 */
export interface RecentTrainingContext {
  readonly lastTrainingDate?: string;
  readonly calendarDaysSinceLastTraining?: number;
  readonly recentSessionCount: number;
  readonly recentUniqueTrainingDays: number;
  readonly consecutiveTrainingDayContext: ConsecutiveTrainingDayContext;
  readonly modalityPresence: TrainingModalityPresence;
  readonly recentTrainingDensity: RecentTrainingDensity;
}

// =========================================================================
// 3. Residual Landscape Summary
// =========================================================================

/**
 * Session-level Residual Landscape summary derived from AllDimensionResidualStates.
 * Zero scalar sums, zero recovery percentages, zero global fatigue numbers.
 */
export interface RestResidualLandscape {
  readonly immediateDimensions: readonly StressDimension[];
  readonly residualDimensions: readonly StressDimension[];
  readonly historicalOnlyDimensions: readonly StressDimension[];
  readonly uncertainDimensions: readonly StressDimension[];
  readonly dimensionsWithStrengthEvidence: readonly StressDimension[];
  readonly dimensionsWithRunningEvidence: readonly StressDimension[];
  readonly dimensionsWithBoth: readonly StressDimension[];
  readonly hasImmediateLowerBodyResidual: boolean;
  readonly hasImmediateUpperBodyResidual: boolean;
  readonly hasImmediateAxialResidual: boolean;
  readonly hasMultipleActiveDimensions: boolean;
}

// =========================================================================
// 4. Systemic Training Demand Context
// =========================================================================

/**
 * Categorical state of systemic training demand observed from recent logs.
 * Note: 'elevated-context' != CNS fatigue high, 'elevated-context' != mandatory Rest.
 */
export type SystemicTrainingDemandEvidenceState =
  | 'elevated-context'
  | 'present-context'
  | 'minimal-context'
  | 'insufficient-evidence';

export interface RecentAxialExposure {
  readonly hasRecentAxialLoading: boolean;
  readonly axialSessionCount: number;
  readonly lastAxialDate?: string;
  readonly axialExercises: readonly string[];
}

export interface RepeatedCompoundExposure {
  readonly hasRepeatedCompoundLoading: boolean;
  readonly compoundSessionCount: number;
  readonly compoundExercises: readonly string[];
}

export interface RecentHighLoadExposure {
  readonly hasHighWorkingLoad: boolean;
  readonly highLoadSessionCount: number;
  readonly observedSessions: readonly string[];
}

export interface CardioExposureContext {
  readonly hasCardioExposure: boolean;
  readonly cardioSessionCount: number;
  readonly totalDurationSeconds: number;
  readonly totalDistanceKm: number;
  readonly lowerBodyOverlapDimensions: readonly StressDimension[];
}

export interface MultiModalityExposureContext {
  readonly hasMultiModality: boolean;
  readonly sameDayMultiModality: boolean;
  readonly strengthCount: number;
  readonly cardioCount: number;
}

export interface SystemicTrainingDemandContext {
  readonly evidenceState: SystemicTrainingDemandEvidenceState;
  readonly recentAxialExposure: RecentAxialExposure;
  readonly repeatedCompoundExposure: RepeatedCompoundExposure;
  readonly recentHighLoadExposure: RecentHighLoadExposure;
  readonly cardioExposure: CardioExposureContext;
  readonly multiModalityExposure: MultiModalityExposureContext;
  readonly factualDemandFactors: readonly string[];
}

// =========================================================================
// 5. Candidate Landscape Summary
// =========================================================================

/**
 * Candidate Landscape summary at session level.
 */
export interface RestCandidateLandscape {
  readonly preferredCandidates: readonly string[];
  readonly viableCandidates: readonly string[];
  readonly deferredCandidates: readonly string[];
  readonly unsupportedCandidates: readonly string[];

  readonly dueCandidateCount: number;
  readonly progressionSupportedCandidateCount: number;
  readonly clearCandidateCount: number;
  readonly cautionCandidateCount: number;
  readonly constrainedCandidateCount: number;

  readonly hasClearDueCandidate: boolean;
  readonly hasProgressionSupportedCandidate: boolean;
  readonly allCandidatesDeferredOrUnsupported: boolean;
}

// =========================================================================
// 6. Uncertainty Context
// =========================================================================

/**
 * Uncertainty context for Rest Decision.
 */
export interface RestUncertaintyContext {
  readonly hasUncertainSameDaySessions: boolean;
  readonly uncertainSessionCount: number;
  readonly hasBracketPersistenceTraces: boolean;
  readonly bracketTraceCount: number;
  readonly hasSparseHistory: boolean;
  readonly factualUncertaintyNotes: readonly string[];
}

// =========================================================================
// 7. Session-Level Rest Decision Evidence Container
// =========================================================================

/**
 * Complete immutable session-level rest decision evidence representation.
 */
export interface RestDecisionEvidence {
  readonly kind: 'rest-decision-evidence';
  readonly evaluationContext: EvaluationContext;

  readonly recentTrainingContext: RecentTrainingContext;
  readonly residualLandscape: RestResidualLandscape;
  readonly systemicTrainingDemandContext: SystemicTrainingDemandContext;
  readonly candidateLandscape: RestCandidateLandscape;

  readonly restSupportClass: RestSupportClass;

  readonly supportingReasons: readonly string[];
  readonly counterReasons: readonly string[];
  readonly uncertaintyContext: RestUncertaintyContext;
}
