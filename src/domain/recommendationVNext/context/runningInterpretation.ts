/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CanonicalRunningSession,
  DirectionalComparison,
  DurationDirectionalComparison,
  MetricComparisonState,
  MetricDeltaComparison,
  MetricProvenance,
  MetricRangePosition,
  MetricStatisticalAnchor,
  PaceDirectionalComparison,
  PaceRangePosition,
  RunningHistoricalReference,
  RunningMetricHistoricalReference,
  RunningMetricInterpretation,
  RunningMetricProvenance,
  RunningSessionInterpretation,
} from '../types/running.types';

function isValidMetricNumber(val?: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Pure helper to compute delta comparison for general magnitude metrics (e.g. distance).
 */
function createGeneralDeltaComparison(
  currentVal: number,
  anchor: MetricStatisticalAnchor<number>
): MetricDeltaComparison<DirectionalComparison, MetricProvenance> {
  const delta = currentVal - anchor.value;
  const direction: DirectionalComparison =
    delta > 0 ? 'greater' : delta < 0 ? 'less' : 'equal';

  return Object.freeze({
    currentValue: currentVal,
    referenceValue: anchor.value,
    delta,
    direction,
    referenceAnchor: anchor,
  });
}

/**
 * Pure helper to compute delta comparison for duration metrics.
 */
function createDurationDeltaComparison(
  currentVal: number,
  anchor: MetricStatisticalAnchor<number>
): MetricDeltaComparison<DurationDirectionalComparison, MetricProvenance> {
  const delta = currentVal - anchor.value;
  const direction: DurationDirectionalComparison =
    delta > 0 ? 'longer' : delta < 0 ? 'shorter' : 'equal';

  return Object.freeze({
    currentValue: currentVal,
    referenceValue: anchor.value,
    delta,
    direction,
    referenceAnchor: anchor,
  });
}

/**
 * Pure helper to compute delta comparison for pace metrics (inverted time-per-km).
 * Note: lower seconds/km means faster pace.
 */
function createPaceDeltaComparison(
  currentVal: number,
  anchor: MetricStatisticalAnchor<number>
): MetricDeltaComparison<PaceDirectionalComparison, RunningMetricProvenance> {
  const delta = currentVal - anchor.value;
  const direction: PaceDirectionalComparison =
    delta < 0 ? 'faster' : delta > 0 ? 'slower' : 'equal';

  return Object.freeze({
    currentValue: currentVal,
    referenceValue: anchor.value,
    delta,
    direction,
    referenceAnchor: anchor,
  });
}

/**
 * Pure helper to compute historical range position for general/duration metrics.
 */
function determineGeneralRangePosition(
  currentVal: number,
  minAnchor: MetricStatisticalAnchor<number>,
  maxAnchor: MetricStatisticalAnchor<number>
): MetricRangePosition {
  if (currentVal > maxAnchor.value) {
    return 'above-max';
  }
  if (currentVal === maxAnchor.value) {
    return 'at-max';
  }
  if (currentVal < minAnchor.value) {
    return 'below-min';
  }
  if (currentVal === minAnchor.value) {
    return 'at-min';
  }
  return 'within-range';
}

/**
 * Pure helper to compute historical range position for pace (seconds/km).
 * Note:
 * minAnchor.value is min seconds/km (fastest on record).
 * maxAnchor.value is max seconds/km (slowest on record).
 */
function determinePaceRangePosition(
  currentVal: number,
  minAnchor: MetricStatisticalAnchor<number>,
  maxAnchor: MetricStatisticalAnchor<number>
): PaceRangePosition {
  if (currentVal < minAnchor.value) {
    return 'fastest-on-record';
  }
  if (currentVal === minAnchor.value) {
    return 'at-fastest';
  }
  if (currentVal > maxAnchor.value) {
    return 'slowest-on-record';
  }
  if (currentVal === maxAnchor.value) {
    return 'at-slowest';
  }
  return 'within-range';
}

/**
 * Derives the comparison state for an independent physical metric.
 */
function determineMetricComparisonState(
  currentVal: number | undefined,
  ref: RunningMetricHistoricalReference
): MetricComparisonState {
  if (!isValidMetricNumber(currentVal)) {
    return 'no-current-value';
  }
  if (ref.availableObservationCount === 0) {
    return 'no-history-observation';
  }
  if (ref.availableObservationCount === 1) {
    return 'single-observation-reference';
  }
  return 'multi-observation-reference';
}

/**
 * Interprets the current distance observation against its historical reference.
 */
function interpretDistance(
  currentVal: number | undefined,
  provenance: MetricProvenance | undefined,
  sourceConfidence: CanonicalRunningSession['metrics']['sourceConfidence'],
  ref: RunningMetricHistoricalReference
): RunningMetricInterpretation<DirectionalComparison, MetricRangePosition, MetricProvenance> {
  const comparisonState = determineMetricComparisonState(currentVal, ref);

  if (comparisonState === 'no-current-value' || currentVal === undefined) {
    return Object.freeze({
      metricName: 'distance',
      comparisonState: 'no-current-value',
      currentValue: undefined,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  if (comparisonState === 'no-history-observation') {
    return Object.freeze({
      metricName: 'distance',
      comparisonState: 'no-history-observation',
      currentValue: currentVal,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  // availableObservationCount >= 1
  const vsRecent1 = ref.lastSession
    ? createGeneralDeltaComparison(currentVal, ref.lastSession)
    : undefined;
  const vsMedian = ref.median
    ? createGeneralDeltaComparison(currentVal, ref.median)
    : undefined;
  const vsMin = ref.min
    ? createGeneralDeltaComparison(currentVal, ref.min)
    : undefined;
  const vsMax = ref.max
    ? createGeneralDeltaComparison(currentVal, ref.max)
    : undefined;

  const rangePosition =
    ref.min && ref.max
      ? determineGeneralRangePosition(currentVal, ref.min, ref.max)
      : undefined;

  return Object.freeze({
    metricName: 'distance',
    comparisonState,
    currentValue: currentVal,
    currentProvenance: provenance,
    currentSourceConfidence: sourceConfidence,
    vsRecent1,
    vsMedian,
    vsMin,
    vsMax,
    rangePosition,
  });
}

/**
 * Interprets the current duration observation against its historical reference.
 */
function interpretDuration(
  currentVal: number | undefined,
  provenance: MetricProvenance | undefined,
  sourceConfidence: CanonicalRunningSession['metrics']['sourceConfidence'],
  ref: RunningMetricHistoricalReference
): RunningMetricInterpretation<DurationDirectionalComparison, MetricRangePosition, MetricProvenance> {
  const comparisonState = determineMetricComparisonState(currentVal, ref);

  if (comparisonState === 'no-current-value' || currentVal === undefined) {
    return Object.freeze({
      metricName: 'duration',
      comparisonState: 'no-current-value',
      currentValue: undefined,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  if (comparisonState === 'no-history-observation') {
    return Object.freeze({
      metricName: 'duration',
      comparisonState: 'no-history-observation',
      currentValue: currentVal,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  // availableObservationCount >= 1
  const vsRecent1 = ref.lastSession
    ? createDurationDeltaComparison(currentVal, ref.lastSession)
    : undefined;
  const vsMedian = ref.median
    ? createDurationDeltaComparison(currentVal, ref.median)
    : undefined;
  const vsMin = ref.min
    ? createDurationDeltaComparison(currentVal, ref.min)
    : undefined;
  const vsMax = ref.max
    ? createDurationDeltaComparison(currentVal, ref.max)
    : undefined;

  const rangePosition =
    ref.min && ref.max
      ? determineGeneralRangePosition(currentVal, ref.min, ref.max)
      : undefined;

  return Object.freeze({
    metricName: 'duration',
    comparisonState,
    currentValue: currentVal,
    currentProvenance: provenance,
    currentSourceConfidence: sourceConfidence,
    vsRecent1,
    vsMedian,
    vsMin,
    vsMax,
    rangePosition,
  });
}

/**
 * Interprets the current pace observation against its historical reference.
 * Preserves the full RunningMetricProvenance (distance, duration, conflict metadata)
 * without synthetic single-value lossy compression.
 */
function interpretPace(
  currentVal: number | undefined,
  provenance: RunningMetricProvenance | undefined,
  sourceConfidence: CanonicalRunningSession['metrics']['sourceConfidence'],
  ref: RunningMetricHistoricalReference
): RunningMetricInterpretation<PaceDirectionalComparison, PaceRangePosition, RunningMetricProvenance> {
  const comparisonState = determineMetricComparisonState(currentVal, ref);

  if (comparisonState === 'no-current-value' || currentVal === undefined) {
    return Object.freeze({
      metricName: 'pace',
      comparisonState: 'no-current-value',
      currentValue: undefined,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  if (comparisonState === 'no-history-observation') {
    return Object.freeze({
      metricName: 'pace',
      comparisonState: 'no-history-observation',
      currentValue: currentVal,
      currentProvenance: provenance,
      currentSourceConfidence: sourceConfidence,
      vsRecent1: undefined,
      vsMedian: undefined,
      vsMin: undefined,
      vsMax: undefined,
      rangePosition: undefined,
    });
  }

  // availableObservationCount >= 1
  const vsRecent1 = ref.lastSession
    ? createPaceDeltaComparison(currentVal, ref.lastSession)
    : undefined;
  const vsMedian = ref.median
    ? createPaceDeltaComparison(currentVal, ref.median)
    : undefined;
  const vsMin = ref.min
    ? createPaceDeltaComparison(currentVal, ref.min)
    : undefined;
  const vsMax = ref.max
    ? createPaceDeltaComparison(currentVal, ref.max)
    : undefined;

  const rangePosition =
    ref.min && ref.max
      ? determinePaceRangePosition(currentVal, ref.min, ref.max)
      : undefined;

  return Object.freeze({
    metricName: 'pace',
    comparisonState,
    currentValue: currentVal,
    currentProvenance: provenance,
    currentSourceConfidence: sourceConfidence,
    vsRecent1,
    vsMedian,
    vsMin,
    vsMax,
    rangePosition,
  });
}

/**
 * Derives the complete RunningSessionInterpretation for a target session against its historical reference.
 * 
 * Invariants:
 * 1. Pure function with zero mutations.
 * 2. Deeply frozen return structures.
 * 3. Preserves CU1.3 current and reference provenance losslessly without confidence synthesis.
 * 4. Strictly separates session RunningHistoryState from independent MetricComparisonState.
 * 5. Handles pace inverted direction (lower seconds/km = faster) rigorously.
 * 6. Never produces fake 0s for missing metrics or comparisons.
 */
export function interpretRunningSessionVsHistory(
  targetSession: Readonly<CanonicalRunningSession>,
  historicalReference: Readonly<RunningHistoricalReference>
): RunningSessionInterpretation {
  const { metrics } = targetSession;
  const { provenance } = metrics;

  const distanceInterpretation = interpretDistance(
    metrics.distanceKm,
    metrics.provenance.distance,
    metrics.sourceConfidence,
    historicalReference.distance
  );

  const durationInterpretation = interpretDuration(
    metrics.durationSeconds,
    metrics.provenance.duration,
    metrics.sourceConfidence,
    historicalReference.duration
  );

  const paceInterpretation = interpretPace(
    metrics.paceSecondsPerKm,
    provenance,
    metrics.sourceConfidence,
    historicalReference.pace
  );

  return Object.freeze({
    targetSessionLogId: targetSession.logId,
    targetSessionDate: targetSession.date,
    targetSessionStartTime: targetSession.startTime,
    historyState: historicalReference.historyState,
    totalHistoricalSessionCount: historicalReference.totalHistoricalSessionCount,
    distance: distanceInterpretation,
    duration: durationInterpretation,
    pace: paceInterpretation,
    currentProvenanceSummary: provenance,
    context: Object.freeze({
      historicalReference,
    }),
  });
}
