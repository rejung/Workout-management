/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CanonicalRunningSession,
  MetricObservationAnchor,
  MetricStatisticalAnchor,
  Recent1RunningSessionSummary,
  RunningHistoricalReference,
  RunningHistoryState,
  RunningMetricHistoricalReference,
} from '../types/running.types';

function isValidMetricNumber(val?: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Determines whether candidateSession is strictly earlier chronologically than targetSession.
 * 
 * Rules (CU1.1 / CU1.2 Chronology Invariant):
 * 1. candidate.date < target.date -> strictly earlier (true)
 * 2. candidate.date > target.date -> false
 * 3. candidate.date === target.date:
 *    - Both have startTime: candidate.startTime < target.startTime -> strictly earlier (true)
 *    - Missing or identical startTime -> ordering uncertain -> false (NEVER inferred via ID)
 */
export function isStrictlyEarlierRunningSession(
  candidate: Readonly<CanonicalRunningSession>,
  target: Readonly<CanonicalRunningSession>
): boolean {
  if (candidate.logId === target.logId) {
    return false;
  }

  if (candidate.date !== target.date) {
    return candidate.date < target.date;
  }

  // Same date
  if (candidate.startTime && target.startTime) {
    return candidate.startTime < target.startTime;
  }

  // Missing or equal startTime on same date -> ordering uncertain
  return false;
}

/**
 * Chronological comparator for sorting strictly-earlier prior sessions from newest to oldest (descending).
 * 
 * Returns:
 *  negative if a is newer than b
 *  positive if b is newer than a
 *  0 if ordering between a and b is uncertain
 */
function compareChronologicalDesc(
  a: Readonly<CanonicalRunningSession>,
  b: Readonly<CanonicalRunningSession>
): number {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }
  if (a.startTime && b.startTime) {
    return b.startTime.localeCompare(a.startTime);
  }
  return 0;
}

/**
 * Pure helper to compute min/median/max and lastSession for an independent metric observation pool.
 */
function deriveMetricReference(
  totalHistoricalSessionCount: number,
  observations: readonly MetricObservationAnchor<number>[],
  recent1Anchor?: MetricObservationAnchor<number>
): RunningMetricHistoricalReference {
  const availableObservationCount = observations.length;
  const unavailableObservationCount = Math.max(0, totalHistoricalSessionCount - availableObservationCount);

  if (availableObservationCount === 0) {
    return Object.freeze({
      availableObservationCount: 0,
      unavailableObservationCount,
      min: undefined,
      median: undefined,
      max: undefined,
      lastSession: undefined,
    });
  }

  // Sort observations ascending by numeric value
  const sorted = observations.slice().sort((a, b) => a.value - b.value);

  // 1. Min Anchor (gather all ties)
  const minValue = sorted[0].value;
  const minTies = sorted.filter((obs) => obs.value === minValue);
  const min: MetricStatisticalAnchor<number> = Object.freeze({
    value: minValue,
    kind: 'exact',
    sourceAnchors: Object.freeze(minTies),
  });

  // 2. Max Anchor (gather all ties)
  const maxValue = sorted[sorted.length - 1].value;
  const maxTies = sorted.filter((obs) => obs.value === maxValue);
  const max: MetricStatisticalAnchor<number> = Object.freeze({
    value: maxValue,
    kind: 'exact',
    sourceAnchors: Object.freeze(maxTies),
  });

  // 3. Median Anchor (exact if odd, exact arithmetic mean without rounding if even)
  let median: MetricStatisticalAnchor<number>;
  const N = sorted.length;
  if (N % 2 === 1) {
    const midIndex = Math.floor(N / 2);
    const medianObs = sorted[midIndex];
    median = Object.freeze({
      value: medianObs.value,
      kind: 'exact',
      sourceAnchors: Object.freeze([medianObs]),
    });
  } else {
    const leftIndex = N / 2 - 1;
    const rightIndex = N / 2;
    const leftObs = sorted[leftIndex];
    const rightObs = sorted[rightIndex];
    const meanValue = (leftObs.value + rightObs.value) / 2;
    median = Object.freeze({
      value: meanValue,
      kind: 'interpolated',
      sourceAnchors: Object.freeze([leftObs, rightObs]),
    });
  }

  // 4. LastSession Anchor (only present if Recent-1 had this valid metric)
  let lastSession: MetricStatisticalAnchor<number> | undefined = undefined;
  if (recent1Anchor) {
    lastSession = Object.freeze({
      value: recent1Anchor.value,
      kind: 'exact',
      sourceAnchors: Object.freeze([recent1Anchor]),
    });
  }

  return Object.freeze({
    availableObservationCount,
    unavailableObservationCount,
    min,
    median,
    max,
    lastSession,
  });
}

/**
 * Derives the RunningHistoricalReference for a target running session given all candidate historical sessions.
 * 
 * Invariants:
 * 1. Pure function with zero mutations on input arguments. Deeply frozen return object.
 * 2. Only strictly-earlier sessions are included in the historical pool.
 * 3. Ordering-uncertain sessions (same date without distinct start times) are never included.
 * 4. Recent-1 is identified strictly if and only if the latest earlier session has unambiguous chronology.
 * 5. Distance, duration, and pace operate as independent observation pools.
 * 6. Missing metrics are never converted to 0.
 * 7. Min and max preserve all source anchors in case of ties.
 * 8. Median calculates exact arithmetic mean without rounding for even counts.
 * 9. CU1.3 metric provenance and sourceConfidence are preserved losslessly.
 */
export function deriveRunningHistoricalReference(
  targetSession: Readonly<CanonicalRunningSession>,
  allHistoricalSessions: readonly Readonly<CanonicalRunningSession>[]
): RunningHistoricalReference {
  if (!targetSession || !allHistoricalSessions || allHistoricalSessions.length === 0) {
    const emptyRef: RunningMetricHistoricalReference = Object.freeze({
      availableObservationCount: 0,
      unavailableObservationCount: 0,
      min: undefined,
      median: undefined,
      max: undefined,
      lastSession: undefined,
    });

    return Object.freeze({
      historyState: 'cold-start',
      totalHistoricalSessionCount: 0,
      recent1SessionSummary: undefined,
      distance: emptyRef,
      duration: emptyRef,
      pace: emptyRef,
    });
  }

  // 1. Filter all strictly earlier running sessions
  const strictlyEarlierSessions = allHistoricalSessions.filter((candidate) =>
    isStrictlyEarlierRunningSession(candidate, targetSession)
  );

  const totalHistoricalSessionCount = strictlyEarlierSessions.length;

  if (totalHistoricalSessionCount === 0) {
    const emptyRef: RunningMetricHistoricalReference = Object.freeze({
      availableObservationCount: 0,
      unavailableObservationCount: 0,
      min: undefined,
      median: undefined,
      max: undefined,
      lastSession: undefined,
    });

    return Object.freeze({
      historyState: 'cold-start',
      totalHistoricalSessionCount: 0,
      recent1SessionSummary: undefined,
      distance: emptyRef,
      duration: emptyRef,
      pace: emptyRef,
    });
  }

  // 2. Determine History State
  const historyState: RunningHistoryState =
    totalHistoricalSessionCount === 1
      ? 'single-session-reference'
      : 'multi-session-reference';

  // 3. Chronological sorting to determine Recent-1
  // We sort strictly earlier sessions descending (newest first)
  const sortedSessionsDesc = strictlyEarlierSessions.slice().sort(compareChronologicalDesc);

  // Recent-1 is the top session, provided it does not have an ordering tie with another top candidate
  let recent1Session: CanonicalRunningSession | undefined = undefined;
  if (sortedSessionsDesc.length === 1) {
    recent1Session = sortedSessionsDesc[0];
  } else {
    const first = sortedSessionsDesc[0];
    const second = sortedSessionsDesc[1];
    if (compareChronologicalDesc(first, second) < 0) {
      // first is unambiguously strictly newer than second
      recent1Session = first;
    } else {
      // Chronological tie / uncertainty at the top -> Recent-1 is ambiguous and not promoted via ID
      recent1Session = undefined;
    }
  }

  const recent1SessionSummary: Recent1RunningSessionSummary | undefined = recent1Session
    ? Object.freeze({
        sessionLogId: recent1Session.logId,
        sessionDate: recent1Session.date,
        sessionStartTime: recent1Session.startTime,
        sourceConfidence: recent1Session.metrics.sourceConfidence,
      })
    : undefined;

  // 4. Build independent observation pools for distance, duration, and pace
  const distanceObservations: MetricObservationAnchor<number>[] = [];
  const durationObservations: MetricObservationAnchor<number>[] = [];
  const paceObservations: MetricObservationAnchor<number>[] = [];

  for (const session of strictlyEarlierSessions) {
    const { metrics } = session;

    if (isValidMetricNumber(metrics.distanceKm)) {
      distanceObservations.push(
        Object.freeze({
          value: metrics.distanceKm,
          sourceSessionLogId: session.logId,
          sourceSessionDate: session.date,
          sourceSessionStartTime: session.startTime,
          sourceConfidence: metrics.sourceConfidence,
          metricProvenance: metrics.provenance.distance,
        })
      );
    }

    if (isValidMetricNumber(metrics.durationSeconds)) {
      durationObservations.push(
        Object.freeze({
          value: metrics.durationSeconds,
          sourceSessionLogId: session.logId,
          sourceSessionDate: session.date,
          sourceSessionStartTime: session.startTime,
          sourceConfidence: metrics.sourceConfidence,
          metricProvenance: metrics.provenance.duration,
        })
      );
    }

    if (isValidMetricNumber(metrics.paceSecondsPerKm)) {
      paceObservations.push(
        Object.freeze({
          value: metrics.paceSecondsPerKm,
          sourceSessionLogId: session.logId,
          sourceSessionDate: session.date,
          sourceSessionStartTime: session.startTime,
          sourceConfidence: metrics.sourceConfidence,
          // Pace inherits provenance based on whether both distance and duration were explicit or legacy
          metricProvenance:
            metrics.provenance.distance === 'explicit' && metrics.provenance.duration === 'explicit'
              ? 'explicit'
              : metrics.provenance.distance === 'legacy' || metrics.provenance.duration === 'legacy'
              ? 'legacy'
              : 'explicit',
        })
      );
    }
  }

  // Recent-1 anchors for each metric (only if Recent-1 exists and has that specific metric)
  let recent1DistanceAnchor: MetricObservationAnchor<number> | undefined = undefined;
  let recent1DurationAnchor: MetricObservationAnchor<number> | undefined = undefined;
  let recent1PaceAnchor: MetricObservationAnchor<number> | undefined = undefined;

  if (recent1Session) {
    const rMetrics = recent1Session.metrics;
    if (isValidMetricNumber(rMetrics.distanceKm)) {
      recent1DistanceAnchor = Object.freeze({
        value: rMetrics.distanceKm,
        sourceSessionLogId: recent1Session.logId,
        sourceSessionDate: recent1Session.date,
        sourceSessionStartTime: recent1Session.startTime,
        sourceConfidence: rMetrics.sourceConfidence,
        metricProvenance: rMetrics.provenance.distance,
      });
    }

    if (isValidMetricNumber(rMetrics.durationSeconds)) {
      recent1DurationAnchor = Object.freeze({
        value: rMetrics.durationSeconds,
        sourceSessionLogId: recent1Session.logId,
        sourceSessionDate: recent1Session.date,
        sourceSessionStartTime: recent1Session.startTime,
        sourceConfidence: rMetrics.sourceConfidence,
        metricProvenance: rMetrics.provenance.duration,
      });
    }

    if (isValidMetricNumber(rMetrics.paceSecondsPerKm)) {
      recent1PaceAnchor = Object.freeze({
        value: rMetrics.paceSecondsPerKm,
        sourceSessionLogId: recent1Session.logId,
        sourceSessionDate: recent1Session.date,
        sourceSessionStartTime: recent1Session.startTime,
        sourceConfidence: rMetrics.sourceConfidence,
        metricProvenance:
          rMetrics.provenance.distance === 'explicit' && rMetrics.provenance.duration === 'explicit'
            ? 'explicit'
            : rMetrics.provenance.distance === 'legacy' || rMetrics.provenance.duration === 'legacy'
            ? 'legacy'
            : 'explicit',
      });
    }
  }

  // 5. Derive independent references
  const distanceRef = deriveMetricReference(
    totalHistoricalSessionCount,
    distanceObservations,
    recent1DistanceAnchor
  );

  const durationRef = deriveMetricReference(
    totalHistoricalSessionCount,
    durationObservations,
    recent1DurationAnchor
  );

  const paceRef = deriveMetricReference(
    totalHistoricalSessionCount,
    paceObservations,
    recent1PaceAnchor
  );

  return Object.freeze({
    historyState,
    totalHistoricalSessionCount,
    recent1SessionSummary,
    distance: distanceRef,
    duration: durationRef,
    pace: paceRef,
  });
}
