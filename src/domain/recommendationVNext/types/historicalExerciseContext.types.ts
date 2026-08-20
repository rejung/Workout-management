/**
 * Historical Exercise Context Types (VNext Recommendation Engine - CU3.7)
 *
 * Defines the contract and schema for the compact runtime context encapsulating
 * historical exercise background facts and baseline anchors.
 *
 * Strict Invariants:
 * 1. Compact Context: Does NOT contain the full historical collection or raw session logs.
 * 2. Single-Source Projection: historyState, totalHistoricalSessionCount, and factorAvailability
 *    are projected directly from CU3.6 baseline rather than independently recomputed.
 * 3. Recency Fidelity: Recency is derived strictly from historicalSessions[0] (Recent-1).
 *    daysSinceLastPerformed is a pure calendar-day delta (NO decay or recovery meaning).
 * 4. Zero Coercion & Zero Mutation: Missing facts remain undefined, all outputs deeply frozen.
 * 5. NO Normalization / Ratios / Magnitude / Weights / Decay / Readiness / Recommendations.
 */

import {
  StrengthHistoryState,
  StrengthStressHistoricalBaseline
} from './strengthStressBaseline.types';

/**
 * Recency metadata for the most recent prior execution of the exercise.
 */
export interface ExerciseRecencyMetadata {
  readonly lastPerformedDate?: string;
  readonly lastPerformedStartTime?: string;
  readonly lastPerformedSourceLogId?: string;
  /** Pure calendar-day delta between currentDate and lastPerformedDate (0 for same-day) */
  readonly daysSinceLastPerformed?: number;
}

/**
 * Observation availability summary projected directly from the factor baseline references.
 */
export interface FactorAvailabilitySummary {
  readonly volume: {
    readonly availableObservationCount: number;
    readonly unavailableObservationCount: number;
  };
  readonly intensityCapacity: {
    readonly availableObservationCount: number;
    readonly unavailableObservationCount: number;
  };
  readonly repeatedWork: {
    readonly availableObservationCount: number;
    readonly unavailableObservationCount: number;
  };
}

/**
 * Compact runtime context representing historical background facts and baseline anchors
 * for a specific strength exercise at the moment of evaluation.
 */
export interface HistoricalExerciseContext {
  /** 1. Target session and exercise identifiers */
  readonly currentSourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentDate: string;
  readonly currentStartTime?: string;

  /** 2. Recency metadata (Recent-1 facts) */
  readonly recency: ExerciseRecencyMetadata;

  /** 3. Overall historical state & session count (projected from baseline) */
  readonly historyState: StrengthHistoryState;
  readonly totalHistoricalSessionCount: number;

  /** 4. Factor availability summary (projected from baseline) */
  readonly factorAvailability: FactorAvailabilitySummary;

  /** 5. Empirical factor baseline anchors & capacity reference (CU3.6) */
  readonly baseline: StrengthStressHistoricalBaseline;
}

/**
 * Invariant audit verification result for CU3.7.
 */
export interface HistoricalExerciseContextAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
