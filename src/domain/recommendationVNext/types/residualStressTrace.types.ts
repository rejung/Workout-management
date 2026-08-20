/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Residual Stress Trace Types (VNext Recommendation Engine - CU3.14 / CU3.14A / CU3.14B)
 *
 * Defines the contract for temporal anchoring and occurrence state classification
 * of UnifiedDimensionProjectedStress evidence relative to a canonical evaluation instant.
 *
 * Strict Invariants:
 * 1. Single Evaluation Temporal Frame SSOT:
 *    - `evaluationInstant` (ISO-8601 string) + `evaluationTimezone` (IANA string) is the sole SSOT.
 *    - `evaluationCalendarDate` and `evaluationLocalTime` are strictly derived.
 * 2. Wall-Clock Timezone Binding:
 *    - Evidence `date` and `startTime` are parsed as local wall-clock values in `evaluationTimezone`.
 * 3. 4-State Occurrence Discriminated Model:
 *    - `occurred-exact`: startTime present AND evidenceInstant <= evaluationInstant.
 *    - `occurred-calendar-bounded`: startTime missing AND evidenceCalendarDate < evaluationCalendarDate.
 *    - `occurrence-uncertain`: startTime missing AND evidenceCalendarDate === evaluationCalendarDate.
 *    - `future-evidence`: startTime present & evidenceInstant > evaluationInstant, OR startTime missing & evidenceDate > evalDate.
 * 4. Derived Candidate Rule:
 *    - `isValidResidualCandidate` is NOT a stored field; derived purely as:
 *      (occurred-exact || occurred-calendar-bounded) -> true, (occurrence-uncertain || future-evidence) -> false.
 * 5. Elapsed Time Discriminated Union:
 *    - ExactElapsedTime (`kind: 'exact'`, `elapsedSeconds >= 0`, `0` when exact same instant).
 *    - BoundedElapsedTime (`kind: 'bounded'`, timezone-aware interval without fixed 86400s assumption).
 *    - UnavailableElapsedTime (`kind: 'unavailable'`, reason: 'missing-same-day-time' | 'future-evidence').
 * 6. Temporal Attenuation Placeholder:
 *    - Strictly `{ readonly status: 'uncomputed' }` without decay constants, half-lives, or formulas.
 * 7. Lossless Source Fidelity:
 *    - Direct reference to `UnifiedDimensionProjectedStress` without magnitude split, scaling, or mutation.
 * 8. Partition Invariants:
 *    - `traces` is the canonical collection. `validTraces`, `uncertainTraces`, `futureTraces` are derived views.
 *    - Partition union === traces, duplicates === 0, omissions === 0.
 * 9. Zero Cross-Trace Aggregation / Scalar Summation / Scoring / Readiness / Recommendation.
 */

import { UnifiedDimensionProjectedStress } from './unifiedStressEvidence.types';

// =========================================================================
// 1. Evaluation Context
// =========================================================================

export interface EvaluationContextInput {
  /**
   * Canonical evaluation instant (ISO-8601 string or offset-aware timestamp).
   * Acts as the Single Source of Truth (SSOT).
   */
  readonly evaluationInstant: string;

  /**
   * Canonical IANA Timezone identifier (e.g. 'Asia/Seoul', 'America/New_York', 'UTC').
   */
  readonly evaluationTimezone: string;
}

export interface EvaluationContext extends EvaluationContextInput {
  /**
   * Derived calendar date in evaluationTimezone (YYYY-MM-DD).
   */
  readonly evaluationCalendarDate: string;

  /**
   * Derived local wall-clock time in evaluationTimezone (HH:mm:ss).
   */
  readonly evaluationLocalTime: string;
}

// =========================================================================
// 2. Occurrence State
// =========================================================================

export type OccurrenceState =
  | 'occurred-exact'
  | 'occurred-calendar-bounded'
  | 'occurrence-uncertain'
  | 'future-evidence';

// =========================================================================
// 3. Elapsed Time (Discriminated Union)
// =========================================================================

export interface ExactElapsedTime {
  readonly kind: 'exact';
  /** Non-negative seconds elapsed since evidenceInstant up to evaluationInstant */
  readonly elapsedSeconds: number;
}

export interface BoundedElapsedTime {
  readonly kind: 'bounded';
  /** Minimum possible elapsed seconds (evaluationInstant - dayEndInstant) */
  readonly elapsedLowerBoundSeconds: number;
  /** Maximum possible elapsed seconds (evaluationInstant - dayStartInstant) */
  readonly elapsedUpperBoundSeconds: number;
  /** Calendar date of the evidence in evaluationTimezone (YYYY-MM-DD) */
  readonly evidenceCalendarDate: string;
  /** ISO-8601 string of dayStart in evaluationTimezone */
  readonly dayStartInstant: string;
  /** ISO-8601 string of dayEnd in evaluationTimezone */
  readonly dayEndInstant: string;
}

export interface UnavailableElapsedTime {
  readonly kind: 'unavailable';
  readonly reason: 'missing-same-day-time' | 'future-evidence';
}

export type ElapsedTime =
  | ExactElapsedTime
  | BoundedElapsedTime
  | UnavailableElapsedTime;

// =========================================================================
// 4. Temporal Attenuation (CU3.15 / CU3.15A / CU3.15B / CU3.15C)
// =========================================================================

export type PersistenceState = 'immediate' | 'residual' | 'historical';

export type PersistenceThresholdPolicy = 'product-policy-24h-72h';

export interface ExactOrdinalAttenuation {
  readonly kind: 'exact-ordinal';
  readonly state: PersistenceState;
  readonly thresholdPolicy: PersistenceThresholdPolicy;
}

export interface BracketOrdinalAttenuation {
  readonly kind: 'bracket-ordinal';
  readonly lowerBoundState: PersistenceState;
  readonly upperBoundState: PersistenceState;
  readonly thresholdPolicy: PersistenceThresholdPolicy;
}

export interface UncomputedTemporalAttenuation {
  readonly kind: 'uncomputed';
  readonly reason: 'missing-same-day-time';
}

export interface IneligibleTemporalAttenuation {
  readonly kind: 'ineligible';
  readonly reason: 'future-evidence';
}

export type TemporalAttenuation =
  | ExactOrdinalAttenuation
  | BracketOrdinalAttenuation
  | UncomputedTemporalAttenuation
  | IneligibleTemporalAttenuation;

// =========================================================================
// 5. Residual Stress Trace
// =========================================================================

export interface ResidualStressTrace {
  /** Lossless reference to source unified stress projection evidence */
  readonly sourceEvidence: UnifiedDimensionProjectedStress;

  /** Occurrence classification relative to canonical evaluation instant */
  readonly occurrenceState: OccurrenceState;

  /** Time elapsed between evidence and evaluation instant */
  readonly elapsedTime: ElapsedTime;

  /** Temporal attenuation placeholder (uncomputed at CU3.14 stage) */
  readonly temporalAttenuation: TemporalAttenuation;
}

// =========================================================================
// 6. Residual Stress Trace Collection Container
// =========================================================================

export interface ResidualStressTraceCollection {
  /** The evaluation context used for this derivation */
  readonly evaluationContext: EvaluationContext;

  /** Canonical collection of all traces in deterministic storage order */
  readonly traces: readonly ResidualStressTrace[];

  /** Derived view: traces eligible for residual evaluation (occurred-exact | occurred-calendar-bounded) */
  readonly validTraces: readonly ResidualStressTrace[];

  /** Derived view: same-day missing time traces where occurrence relative to evaluation instant is uncertain */
  readonly uncertainTraces: readonly ResidualStressTrace[];

  /** Derived view: future evidence occurring after evaluation instant */
  readonly futureTraces: readonly ResidualStressTrace[];

  /** Total trace count in canonical collection (traces.length) */
  readonly totalCount: number;

  /** Count of valid traces (validTraces.length) */
  readonly validCount: number;

  /** Count of uncertain traces (uncertainTraces.length) */
  readonly uncertainCount: number;

  /** Count of future traces (futureTraces.length) */
  readonly futureCount: number;
}

// =========================================================================
// 7. Audit Result Contract
// =========================================================================

export interface ResidualStressTraceAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
