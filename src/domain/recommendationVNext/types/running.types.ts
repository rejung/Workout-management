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
