/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Source representation format from which running metrics were extracted.
 * - 'explicit-cardio-fields': All extracted metrics originated from explicit cardio fields (distanceKm, timeSeconds).
 * - 'legacy-weight-reps': All extracted metrics originated from legacy fallback fields (weight, reps).
 * - 'hybrid': Distance and duration originated from mixed source representations (e.g. explicit distance + legacy duration).
 * - 'unknown': Running session detected, but source fields are unrecognized or missing.
 */
export type RunningSourceFormat =
  | 'explicit-cardio-fields'
  | 'legacy-weight-reps'
  | 'hybrid'
  | 'unknown';

/**
 * Provenance origin for an individual physical metric (distance or duration).
 */
export type MetricProvenance = 'explicit' | 'legacy' | 'missing';

/**
 * Fine-grained metric provenance and conflict tracking metadata.
 */
export interface RunningMetricProvenance {
  readonly distance: MetricProvenance;
  readonly duration: MetricProvenance;
  /** True if legacy weight field existed with a different value from chosen explicit distanceKm */
  readonly distanceLegacyConflict: boolean;
  /** True if legacy reps field existed with a different value from chosen explicit timeSeconds */
  readonly durationLegacyConflict: boolean;
  /** True if either distance or duration has a conflict with legacy candidate */
  readonly hasLegacyConflict: boolean;
}

/**
 * Confidence level regarding how clearly and reliably the metric data was extracted from raw sources.
 * (Note: sourceConfidence is strictly distinct from performance observation confidence in CU2).
 * - 'high': Running session clearly identified, and both distance and duration mappings are valid (> 0).
 * - 'medium': Running session clearly identified, but exactly one metric is present (e.g. distance only or duration only).
 * - 'low': Running session detected, but both metrics are missing or invalid (<= 0, NaN, Infinity).
 */
export type RunningSourceConfidence =
  | 'high'
  | 'medium'
  | 'low';

/**
 * Intent of the running session (e.g. Easy, Tempo, Interval, Recovery, Race).
 * In CU1.3.1, intent is strictly preserved as 'unknown'.
 * No automatic classification or guessing based on pace/distance is performed.
 */
export type RunIntent = 'unknown';

/**
 * Canonical running fact representation for a single running activity or workout log.
 */
export interface CanonicalRunningMetrics {
  /** Distance in kilometers (finite positive number), or undefined if absent/invalid */
  readonly distanceKm?: number;
  /** Duration in seconds (finite positive number), or undefined if absent/invalid */
  readonly durationSeconds?: number;
  /** Calculated pace in seconds per kilometer (durationSeconds / distanceKm), or undefined if uncomputable */
  readonly paceSecondsPerKm?: number;

  /** Overall source data representation format */
  readonly sourceFormat: RunningSourceFormat;
  /** Detailed metric provenance and conflict indicator */
  readonly provenance: RunningMetricProvenance;
  /** Data extraction / representation confidence */
  readonly sourceConfidence: RunningSourceConfidence;
  /** Running intent uncertainty representation */
  readonly runIntent: RunIntent;
}

/**
 * Canonical normalized running session fact with contextual metadata.
 */
export interface CanonicalRunningSession {
  readonly logId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly exerciseName: string;
  readonly metrics: CanonicalRunningMetrics;
}

/**
 * Historical state of available prior running sessions.
 * Determined solely by total strictly-earlier running session count.
 */
export type RunningHistoryState =
  | 'cold-start'
  | 'single-session-reference'
  | 'multi-session-reference';

/**
 * Detailed observation anchor for a specific physical metric.
 * Preserves exact CU1.3 provenance and session contextual facts without loss.
 */
export interface MetricObservationAnchor<TValue = number> {
  readonly value: TValue;
  readonly sourceSessionLogId: string;
  readonly sourceSessionDate: string;
  readonly sourceSessionStartTime?: string;
  readonly sourceConfidence: RunningSourceConfidence;
  readonly metricProvenance: MetricProvenance;
}

/**
 * Statistical anchor (min, median, max, lastSession) for a physical metric.
 * Supports exact observation(s) (including all ties) or interpolated arithmetic mean.
 */
export interface MetricStatisticalAnchor<TValue = number> {
  readonly value: TValue;
  readonly kind: 'exact' | 'interpolated';
  readonly sourceAnchors: readonly MetricObservationAnchor<TValue>[];
}

/**
 * Reference statistics and anchors for a single independent physical metric observation pool.
 */
export interface RunningMetricHistoricalReference {
  readonly availableObservationCount: number;
  readonly unavailableObservationCount: number;
  readonly min?: MetricStatisticalAnchor<number>;
  readonly median?: MetricStatisticalAnchor<number>;
  readonly max?: MetricStatisticalAnchor<number>;
  readonly lastSession?: MetricStatisticalAnchor<number>;
}

/**
 * Summary metadata for the chronologically confirmed Recent-1 running session.
 */
export interface Recent1RunningSessionSummary {
  readonly sessionLogId: string;
  readonly sessionDate: string;
  readonly sessionStartTime?: string;
  readonly sourceConfidence: RunningSourceConfidence;
}

/**
 * Complete immutable historical reference contract for running.
 */
export interface RunningHistoricalReference {
  readonly historyState: RunningHistoryState;
  readonly totalHistoricalSessionCount: number;
  readonly recent1SessionSummary?: Recent1RunningSessionSummary;
  readonly distance: RunningMetricHistoricalReference;
  readonly duration: RunningMetricHistoricalReference;
  readonly pace: RunningMetricHistoricalReference;
}

// ---------------------------------------------------------------------------
// CU3.12D / CU3.12E: Current vs History Interpretation Types
// ---------------------------------------------------------------------------

/**
 * Comparison state for an independent physical metric observation pool.
 * Strictly decoupled from the session-level RunningHistoryState.
 */
export type MetricComparisonState =
  | 'no-current-value'
  | 'no-history-observation'
  | 'single-observation-reference'
  | 'multi-observation-reference';

/**
 * Directional comparison against a specific baseline anchor.
 */
export type DirectionalComparison = 'greater' | 'equal' | 'less';
export type DurationDirectionalComparison = 'longer' | 'equal' | 'shorter';
export type PaceDirectionalComparison = 'faster' | 'equal' | 'slower';

/**
 * Position of current metric value relative to historical min and max range.
 */
export type MetricRangePosition =
  | 'above-max'
  | 'at-max'
  | 'within-range'
  | 'at-min'
  | 'below-min';

/**
 * Pace-specific historical range position accounting for inverted time-per-km physics.
 * (Lower seconds/km is faster; higher seconds/km is slower).
 */
export type PaceRangePosition =
  | 'fastest-on-record'
  | 'at-fastest'
  | 'within-range'
  | 'at-slowest'
  | 'slowest-on-record';

/**
 * Metric delta comparison against a historical anchor.
 */
export interface MetricDeltaComparison<
  TDirection = DirectionalComparison,
  TProvenance = MetricProvenance
> {
  readonly currentValue: number;
  readonly referenceValue: number;
  readonly delta: number; // currentValue - referenceValue (unrounded exact difference)
  readonly direction: TDirection;
  readonly referenceAnchor: MetricStatisticalAnchor<number>;
}

/**
 * Full comparative interpretation for a single physical metric.
 */
export interface RunningMetricInterpretation<
  TDirection = DirectionalComparison,
  TRangePos = MetricRangePosition,
  TProvenance = MetricProvenance
> {
  readonly metricName: 'distance' | 'duration' | 'pace';
  readonly comparisonState: MetricComparisonState;
  readonly currentValue?: number;
  readonly currentProvenance?: TProvenance;
  readonly currentSourceConfidence?: RunningSourceConfidence;
  readonly vsRecent1?: MetricDeltaComparison<TDirection, TProvenance>;
  readonly vsMedian?: MetricDeltaComparison<TDirection, TProvenance>;
  readonly vsMin?: MetricDeltaComparison<TDirection, TProvenance>;
  readonly vsMax?: MetricDeltaComparison<TDirection, TProvenance>;
  readonly rangePosition?: TRangePos;
}

/**
 * Complete immutable session-level interpretation comparing the current running
 * session against its historical references.
 */
export interface RunningSessionInterpretation {
  readonly targetSessionLogId: string;
  readonly targetSessionDate: string;
  readonly targetSessionStartTime?: string;
  readonly historyState: RunningHistoryState;
  readonly totalHistoricalSessionCount: number;
  readonly distance: RunningMetricInterpretation<
    DirectionalComparison,
    MetricRangePosition,
    MetricProvenance
  >;
  readonly duration: RunningMetricInterpretation<
    DurationDirectionalComparison,
    MetricRangePosition,
    MetricProvenance
  >;
  readonly pace: RunningMetricInterpretation<
    PaceDirectionalComparison,
    PaceRangePosition,
    RunningMetricProvenance
  >;
  readonly currentProvenanceSummary: RunningMetricProvenance;
  readonly context: {
    readonly historicalReference: RunningHistoricalReference;
  };
}

// ---------------------------------------------------------------------------
// CU3.12F / CU3.12G: Running Stress Magnitude Representation Types
// ---------------------------------------------------------------------------

export type RunningMetricCouplingKind =
  | 'full-canonical-triad'
  | 'distance-only'
  | 'duration-only'
  | 'missing-all-metrics';

/**
 * Coupling contract enforcing physical dependency between metrics
 * and strictly forbidding scalar summation / additive scoring.
 */
export interface RunningMetricCouplingContract {
  readonly kind: RunningMetricCouplingKind;
  readonly isPaceDerived: boolean;
  readonly isStructurallyCoupled: boolean;
  readonly additiveCombinationAllowed: false;
}

/**
 * Magnitude profile for an individual physical metric (Distance, Duration, or Pace).
 */
export interface RunningMetricMagnitudeProfile<
  TUnit extends string = string,
  TDirection = DirectionalComparison,
  TRangePos = MetricRangePosition,
  TProvenance = MetricProvenance
> {
  readonly unit: TUnit;
  readonly observedValue?: number;
  readonly availability: 'available' | 'missing';
  readonly provenance?: TProvenance;
  readonly sourceConfidence?: RunningSourceConfidence;
  readonly interpretation?: {
    readonly comparisonState: MetricComparisonState;
    readonly vsRecent1?: MetricDeltaComparison<TDirection, TProvenance>;
    readonly vsMedian?: MetricDeltaComparison<TDirection, TProvenance>;
    readonly vsMin?: MetricDeltaComparison<TDirection, TProvenance>;
    readonly vsMax?: MetricDeltaComparison<TDirection, TProvenance>;
    readonly rangePosition?: TRangePos;
  };
}

export type RunningTargetDimensions = readonly [
  'knee-dominant-lower-body',
  'hip-posterior-chain'
];

/**
 * Complete immutable session-level stress magnitude representation for running.
 */
export interface RunningStressMagnitude {
  readonly sessionLogId: string;
  readonly sessionDate: string;
  readonly sessionStartTime?: string;
  readonly historyState: RunningHistoryState;
  readonly coupling: RunningMetricCouplingContract;
  readonly profiles: {
    readonly distance: RunningMetricMagnitudeProfile<
      'km',
      DirectionalComparison,
      MetricRangePosition,
      MetricProvenance
    >;
    readonly duration: RunningMetricMagnitudeProfile<
      'seconds',
      DurationDirectionalComparison,
      MetricRangePosition,
      MetricProvenance
    >;
    readonly pace: RunningMetricMagnitudeProfile<
      'seconds/km',
      PaceDirectionalComparison,
      PaceRangePosition,
      RunningMetricProvenance
    >;
  };
  readonly targetDimensions: RunningTargetDimensions;
}

