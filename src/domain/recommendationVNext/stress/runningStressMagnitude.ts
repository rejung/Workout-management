/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CanonicalRunningSession,
  DirectionalComparison,
  DurationDirectionalComparison,
  MetricProvenance,
  MetricRangePosition,
  PaceDirectionalComparison,
  PaceRangePosition,
  RunningMetricCouplingContract,
  RunningMetricCouplingKind,
  RunningMetricMagnitudeProfile,
  RunningMetricProvenance,
  RunningSessionInterpretation,
  RunningStressMagnitude,
  RunningTargetDimensions,
} from '../types/running.types';

function isValidMetricNumber(val?: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Evaluates the coupling state and non-additivity contract for the running metrics triad.
 * 
 * Strict Invariants:
 * 1. Pace is derived from distance + duration; it is not an independent third stress factor.
 * 2. additiveCombinationAllowed is unconditionally false (forbidding scalar sum, TRIMP, rTSS, or weighted scores).
 */
function evaluateRunningCoupling(
  hasDistance: boolean,
  hasDuration: boolean,
  hasPace: boolean
): RunningMetricCouplingContract {
  let kind: RunningMetricCouplingKind;

  if (hasDistance && hasDuration && hasPace) {
    kind = 'full-canonical-triad';
  } else if (hasDistance && !hasDuration) {
    kind = 'distance-only';
  } else if (!hasDistance && hasDuration) {
    kind = 'duration-only';
  } else {
    kind = 'missing-all-metrics';
  }

  const isPaceDerived = hasDistance && hasDuration && hasPace;
  const isStructurallyCoupled = hasDistance && hasDuration;

  return Object.freeze({
    kind,
    isPaceDerived,
    isStructurallyCoupled,
    additiveCombinationAllowed: false,
  });
}

/**
 * Projects a physical metric magnitude profile from its canonical fact and interpretation.
 */
function projectDistanceMagnitudeProfile(
  targetSession: Readonly<CanonicalRunningSession>,
  interpretation: Readonly<RunningSessionInterpretation>
): RunningMetricMagnitudeProfile<'km', DirectionalComparison, MetricRangePosition, MetricProvenance> {
  const { metrics } = targetSession;
  const hasValue = isValidMetricNumber(metrics.distanceKm);

  return Object.freeze({
    unit: 'km',
    observedValue: hasValue ? metrics.distanceKm : undefined,
    availability: hasValue ? 'available' : 'missing',
    provenance: metrics.provenance.distance,
    sourceConfidence: metrics.sourceConfidence,
    interpretation: Object.freeze({
      comparisonState: interpretation.distance.comparisonState,
      vsRecent1: interpretation.distance.vsRecent1,
      vsMedian: interpretation.distance.vsMedian,
      vsMin: interpretation.distance.vsMin,
      vsMax: interpretation.distance.vsMax,
      rangePosition: interpretation.distance.rangePosition,
    }),
  });
}

/**
 * Projects a temporal duration magnitude profile from its canonical fact and interpretation.
 */
function projectDurationMagnitudeProfile(
  targetSession: Readonly<CanonicalRunningSession>,
  interpretation: Readonly<RunningSessionInterpretation>
): RunningMetricMagnitudeProfile<'seconds', DurationDirectionalComparison, MetricRangePosition, MetricProvenance> {
  const { metrics } = targetSession;
  const hasValue = isValidMetricNumber(metrics.durationSeconds);

  return Object.freeze({
    unit: 'seconds',
    observedValue: hasValue ? metrics.durationSeconds : undefined,
    availability: hasValue ? 'available' : 'missing',
    provenance: metrics.provenance.duration,
    sourceConfidence: metrics.sourceConfidence,
    interpretation: Object.freeze({
      comparisonState: interpretation.duration.comparisonState,
      vsRecent1: interpretation.duration.vsRecent1,
      vsMedian: interpretation.duration.vsMedian,
      vsMin: interpretation.duration.vsMin,
      vsMax: interpretation.duration.vsMax,
      rangePosition: interpretation.duration.rangePosition,
    }),
  });
}

/**
 * Projects a pace relation magnitude profile from its canonical fact and interpretation.
 * Preserves full RunningMetricProvenance without lossy single-value compression.
 */
function projectPaceMagnitudeProfile(
  targetSession: Readonly<CanonicalRunningSession>,
  interpretation: Readonly<RunningSessionInterpretation>
): RunningMetricMagnitudeProfile<'seconds/km', PaceDirectionalComparison, PaceRangePosition, RunningMetricProvenance> {
  const { metrics } = targetSession;
  const hasValue = isValidMetricNumber(metrics.paceSecondsPerKm);

  return Object.freeze({
    unit: 'seconds/km',
    observedValue: hasValue ? metrics.paceSecondsPerKm : undefined,
    availability: hasValue ? 'available' : 'missing',
    provenance: metrics.provenance,
    sourceConfidence: metrics.sourceConfidence,
    interpretation: Object.freeze({
      comparisonState: interpretation.pace.comparisonState,
      vsRecent1: interpretation.pace.vsRecent1,
      vsMedian: interpretation.pace.vsMedian,
      vsMin: interpretation.pace.vsMin,
      vsMax: interpretation.pace.vsMax,
      rangePosition: interpretation.pace.rangePosition,
    }),
  });
}

/**
 * Canonical target stress dimensions for running (CU3.1 / CU3.11 / CU3.12F).
 * Strict Invariant: Membership only; NO dimension-specific magnitude attribution or splitting.
 */
const CANONICAL_RUNNING_DIMENSIONS: RunningTargetDimensions = Object.freeze([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
] as const);

/**
 * Derives the complete RunningStressMagnitude representation for a running session.
 * 
 * Strict Invariants:
 * 1. Pure function with zero mutations on inputs. Deeply frozen return object.
 * 2. Non-Additivity: additiveCombinationAllowed is strictly false. No scalar scores / TRIMP / rTSS.
 * 3. Exact Literal Units: 'km', 'seconds', 'seconds/km'.
 * 4. Zero Coercion: Missing metrics remain undefined with availability: 'missing'.
 * 5. Lossless Provenance: CU1.3 component provenance and sourceConfidence are preserved intact.
 * 6. Pure Dimension Membership: 'knee-dominant-lower-body' and 'hip-posterior-chain' only.
 * 7. False Physiological Precision Forbidden: No HR, VO2, Calories, Fatigue, Decay, or Recommendations.
 */
export function deriveRunningStressMagnitude(
  targetSession: Readonly<CanonicalRunningSession>,
  interpretation: Readonly<RunningSessionInterpretation>
): RunningStressMagnitude {
  const hasDistance = isValidMetricNumber(targetSession.metrics.distanceKm);
  const hasDuration = isValidMetricNumber(targetSession.metrics.durationSeconds);
  const hasPace = isValidMetricNumber(targetSession.metrics.paceSecondsPerKm);

  const coupling = evaluateRunningCoupling(hasDistance, hasDuration, hasPace);

  const distanceProfile = projectDistanceMagnitudeProfile(targetSession, interpretation);
  const durationProfile = projectDurationMagnitudeProfile(targetSession, interpretation);
  const paceProfile = projectPaceMagnitudeProfile(targetSession, interpretation);

  return Object.freeze({
    sessionLogId: targetSession.logId,
    sessionDate: targetSession.date,
    sessionStartTime: targetSession.startTime,
    historyState: interpretation.historyState,
    coupling,
    profiles: Object.freeze({
      distance: distanceProfile,
      duration: durationProfile,
      pace: paceProfile,
    }),
    targetDimensions: CANONICAL_RUNNING_DIMENSIONS,
  });
}
