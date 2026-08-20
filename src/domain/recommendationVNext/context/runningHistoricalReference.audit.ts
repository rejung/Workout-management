/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  deriveRunningHistoricalReference,
  isStrictlyEarlierRunningSession,
} from './runningHistoricalReference';
import {
  CanonicalRunningSession,
  RunningHistoricalReference,
} from '../types/running.types';

function createMockRunningSession(
  params: {
    logId: string;
    date: string;
    startTime?: string;
    distanceKm?: number;
    durationSeconds?: number;
    distanceProvenance?: 'explicit' | 'legacy' | 'missing';
    durationProvenance?: 'explicit' | 'legacy' | 'missing';
    sourceConfidence?: 'high' | 'medium' | 'low';
  }
): CanonicalRunningSession {
  const distProv = params.distanceProvenance ?? (params.distanceKm !== undefined ? 'explicit' : 'missing');
  const durProv = params.durationProvenance ?? (params.durationSeconds !== undefined ? 'explicit' : 'missing');
  const conf = params.sourceConfidence ?? (
    params.distanceKm !== undefined && params.durationSeconds !== undefined
      ? 'high'
      : params.distanceKm !== undefined || params.durationSeconds !== undefined
      ? 'medium'
      : 'low'
  );

  const paceSecondsPerKm =
    params.distanceKm !== undefined && params.durationSeconds !== undefined && params.distanceKm > 0
      ? params.durationSeconds / params.distanceKm
      : undefined;

  return {
    logId: params.logId,
    date: params.date,
    startTime: params.startTime,
    exerciseName: '야외 러닝',
    metrics: {
      distanceKm: params.distanceKm,
      durationSeconds: params.durationSeconds,
      paceSecondsPerKm,
      sourceFormat: 'explicit-cardio-fields',
      provenance: {
        distance: distProv,
        duration: durProv,
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
      },
      sourceConfidence: conf,
      runIntent: 'unknown',
    },
  };
}

export interface RunningHistoricalReferenceAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}

/**
 * Comprehensive verification suite for CU3.12C Running Historical Reference Implementation.
 */
export function runRunningHistoricalReferenceAudits(): readonly RunningHistoricalReferenceAuditResult[] {
  const results: RunningHistoricalReferenceAuditResult[] = [];

  // Audit 1: Cold Start (0 prior sessions)
  {
    const target = createMockRunningSession({
      logId: 'target-1',
      date: '2026-08-15',
      startTime: '08:00',
      distanceKm: 5,
      durationSeconds: 1800,
    });

    const ref = deriveRunningHistoricalReference(target, []);
    const passed =
      ref.historyState === 'cold-start' &&
      ref.totalHistoricalSessionCount === 0 &&
      ref.recent1SessionSummary === undefined &&
      ref.distance.availableObservationCount === 0 &&
      ref.distance.min === undefined &&
      ref.distance.median === undefined &&
      ref.distance.max === undefined &&
      ref.distance.lastSession === undefined;

    results.push({
      auditName: 'Cold Start (0 prior sessions)',
      passed,
      details: passed
        ? 'Cold start state correctly returns 0 observations and undefined anchors without creating 0 values.'
        : 'Failed cold start invariants.',
    });
  }

  // Audit 2: Single Prior Session
  {
    const target = createMockRunningSession({
      logId: 'target-2',
      date: '2026-08-15',
      startTime: '08:00',
      distanceKm: 5,
      durationSeconds: 1800,
    });

    const prior = createMockRunningSession({
      logId: 'prior-1',
      date: '2026-08-10',
      startTime: '07:00',
      distanceKm: 4.5,
      durationSeconds: 1620,
      sourceConfidence: 'high',
    });

    const ref = deriveRunningHistoricalReference(target, [prior]);
    const passed =
      ref.historyState === 'single-session-reference' &&
      ref.totalHistoricalSessionCount === 1 &&
      ref.recent1SessionSummary?.sessionLogId === 'prior-1' &&
      ref.distance.availableObservationCount === 1 &&
      ref.distance.unavailableObservationCount === 0 &&
      ref.distance.min?.value === 4.5 &&
      ref.distance.min.kind === 'exact' &&
      ref.distance.min.sourceAnchors[0].sourceSessionLogId === 'prior-1' &&
      ref.distance.median?.value === 4.5 &&
      ref.distance.max?.value === 4.5 &&
      ref.distance.lastSession?.value === 4.5 &&
      ref.pace.min?.value === 360; // 1620 / 4.5 = 360 s/km

    results.push({
      auditName: 'Single Prior Session Reference',
      passed,
      details: passed
        ? 'Single prior session correctly establishes single-session-reference with exact anchors matching prior session.'
        : 'Failed single prior session reference invariants.',
    });
  }

  // Audit 3: Chronology — Same-day earlier, equal, and missing start times
  {
    const target = createMockRunningSession({
      logId: 'target-3',
      date: '2026-08-15',
      startTime: '18:00',
      distanceKm: 5,
      durationSeconds: 1800,
    });

    const sameDayEarlier = createMockRunningSession({
      logId: 'same-earlier',
      date: '2026-08-15',
      startTime: '07:00',
      distanceKm: 3,
      durationSeconds: 1000,
    });

    const sameDayEqualTime = createMockRunningSession({
      logId: 'same-equal',
      date: '2026-08-15',
      startTime: '18:00',
      distanceKm: 4,
      durationSeconds: 1200,
    });

    const sameDayMissingTime = createMockRunningSession({
      logId: 'same-missing',
      date: '2026-08-15',
      distanceKm: 6,
      durationSeconds: 2000,
    });

    const earlierDate = createMockRunningSession({
      logId: 'earlier-date',
      date: '2026-08-14',
      distanceKm: 5,
      durationSeconds: 1500,
    });

    // Check individual strictly earlier predicates
    const strictlyEarlier_sameDayEarlier = isStrictlyEarlierRunningSession(sameDayEarlier, target);
    const strictlyEarlier_sameDayEqual = isStrictlyEarlierRunningSession(sameDayEqualTime, target);
    const strictlyEarlier_sameDayMissing = isStrictlyEarlierRunningSession(sameDayMissingTime, target);
    const strictlyEarlier_earlierDate = isStrictlyEarlierRunningSession(earlierDate, target);

    const ref = deriveRunningHistoricalReference(target, [
      sameDayEarlier,
      sameDayEqualTime,
      sameDayMissingTime,
      earlierDate,
    ]);

    const passed =
      strictlyEarlier_sameDayEarlier === true &&
      strictlyEarlier_sameDayEqual === false &&
      strictlyEarlier_sameDayMissing === false &&
      strictlyEarlier_earlierDate === true &&
      ref.totalHistoricalSessionCount === 2 && // only sameDayEarlier and earlierDate
      ref.recent1SessionSummary?.sessionLogId === 'same-earlier' && // 2026-08-15 07:00 is newer than 2026-08-14
      ref.distance.availableObservationCount === 2;

    results.push({
      auditName: 'Chronology & Ordering-Uncertain Exclusion',
      passed,
      details: passed
        ? 'Same-day earlier session is strictly earlier; equal/missing times are ordering-uncertain and excluded.'
        : `Failed chronology invariants: sameDayEarlier=${strictlyEarlier_sameDayEarlier}, equal=${strictlyEarlier_sameDayEqual}, missing=${strictlyEarlier_sameDayMissing}, earlierDate=${strictlyEarlier_earlierDate}, count=${ref.totalHistoricalSessionCount}`,
    });
  }

  // Audit 4: Recent-1 Missing Metric (No fallback)
  {
    const target = createMockRunningSession({
      logId: 'target-4',
      date: '2026-08-15',
      startTime: '10:00',
      distanceKm: 5,
      durationSeconds: 1800,
    });

    // Recent-1 has distance only (duration and pace are missing)
    const recent1 = createMockRunningSession({
      logId: 'recent-1-dist-only',
      date: '2026-08-14',
      startTime: '08:00',
      distanceKm: 7.0,
      durationSeconds: undefined,
    });

    // Older session has valid duration and pace
    const older = createMockRunningSession({
      logId: 'older-full',
      date: '2026-08-12',
      startTime: '08:00',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const ref = deriveRunningHistoricalReference(target, [recent1, older]);

    const passed =
      ref.recent1SessionSummary?.sessionLogId === 'recent-1-dist-only' &&
      ref.distance.lastSession?.value === 7.0 &&
      ref.duration.lastSession === undefined && // No fallback to older session!
      ref.pace.lastSession === undefined &&     // No fallback to older session!
      ref.duration.availableObservationCount === 1 &&
      ref.duration.min?.value === 1500 &&
      ref.duration.median?.value === 1500 &&
      ref.duration.max?.value === 1500;

    results.push({
      auditName: 'Recent-1 Missing Metric Fallback Prevention',
      passed,
      details: passed
        ? 'Recent-1 lastSession anchor is undefined for missing metrics and does not fall back to older sessions.'
        : 'Failed Recent-1 missing metric fallback prevention invariants.',
    });
  }

  // Audit 5: Metric Independent Observation Pools & Availability
  {
    const target = createMockRunningSession({
      logId: 'target-5',
      date: '2026-08-20',
    });

    // Session 1: distance only
    const s1 = createMockRunningSession({
      logId: 's1',
      date: '2026-08-10',
      distanceKm: 4.0,
      durationSeconds: undefined,
    });

    // Session 2: duration only
    const s2 = createMockRunningSession({
      logId: 's2',
      date: '2026-08-12',
      distanceKm: undefined,
      durationSeconds: 1800,
    });

    // Session 3: full (both distance and duration)
    const s3 = createMockRunningSession({
      logId: 's3',
      date: '2026-08-14',
      distanceKm: 6.0,
      durationSeconds: 1980,
    });

    const ref = deriveRunningHistoricalReference(target, [s1, s2, s3]);

    const passed =
      ref.historyState === 'multi-session-reference' &&
      ref.totalHistoricalSessionCount === 3 &&
      // Distance: s1 (4.0), s3 (6.0) -> available 2, unavailable 1
      ref.distance.availableObservationCount === 2 &&
      ref.distance.unavailableObservationCount === 1 &&
      ref.distance.min?.value === 4.0 &&
      ref.distance.max?.value === 6.0 &&
      // Duration: s2 (1800), s3 (1980) -> available 2, unavailable 1
      ref.duration.availableObservationCount === 2 &&
      ref.duration.unavailableObservationCount === 1 &&
      ref.duration.min?.value === 1800 &&
      ref.duration.max?.value === 1980 &&
      // Pace: s3 only (330 s/km) -> available 1, unavailable 2
      ref.pace.availableObservationCount === 1 &&
      ref.pace.unavailableObservationCount === 2 &&
      ref.pace.min?.value === 330 &&
      ref.pace.median?.value === 330 &&
      ref.pace.max?.value === 330;

    results.push({
      auditName: 'Independent Observation Pools & Availability',
      passed,
      details: passed
        ? 'Distance, duration, and pace tracked independently with separate available/unavailable counts.'
        : 'Failed independent observation pool invariants.',
    });
  }

  // Audit 6: Min / Max Tie Provenance (All Ties Preserved)
  {
    const target = createMockRunningSession({
      logId: 'target-6',
      date: '2026-08-20',
    });

    const tie1 = createMockRunningSession({
      logId: 'tie-1',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const tie2 = createMockRunningSession({
      logId: 'tie-2',
      date: '2026-08-12',
      distanceKm: 5.0,
      durationSeconds: 1800,
    });

    const tie3 = createMockRunningSession({
      logId: 'tie-3',
      date: '2026-08-14',
      distanceKm: 5.0,
      durationSeconds: 1600,
    });

    const ref = deriveRunningHistoricalReference(target, [tie1, tie2, tie3]);

    const distMin = ref.distance.min;
    const distMax = ref.distance.max;

    const passed =
      distMin?.value === 5.0 &&
      distMin.sourceAnchors.length === 3 &&
      distMin.sourceAnchors.some((a) => a.sourceSessionLogId === 'tie-1') &&
      distMin.sourceAnchors.some((a) => a.sourceSessionLogId === 'tie-2') &&
      distMin.sourceAnchors.some((a) => a.sourceSessionLogId === 'tie-3') &&
      distMax?.value === 5.0 &&
      distMax.sourceAnchors.length === 3;

    results.push({
      auditName: 'Min / Max Tie Provenance Preservation',
      passed,
      details: passed
        ? 'All matching sessions in min/max ties are preserved without arbitrary ID tie-break drops.'
        : 'Failed min/max tie provenance invariants.',
    });
  }

  // Audit 7: Median Calculation (Odd = Exact, Even = Arithmetic Mean without rounding)
  {
    const target = createMockRunningSession({
      logId: 'target-7',
      date: '2026-08-20',
    });

    // Even observations: [301, 302] s/km (e.g. 5:01/km and 5:02/km)
    // Exact arithmetic mean = 301.5 s/km (no Math.round!)
    const s1 = createMockRunningSession({
      logId: 's1-even',
      date: '2026-08-10',
      distanceKm: 1.0,
      durationSeconds: 301,
    });

    const s2 = createMockRunningSession({
      logId: 's2-even',
      date: '2026-08-12',
      distanceKm: 1.0,
      durationSeconds: 302,
    });

    const refEven = deriveRunningHistoricalReference(target, [s1, s2]);

    const paceMedianEven = refEven.pace.median;
    const passedEven =
      paceMedianEven?.value === 301.5 &&
      paceMedianEven.kind === 'interpolated' &&
      paceMedianEven.sourceAnchors.length === 2 &&
      paceMedianEven.sourceAnchors[0].sourceSessionLogId === 's1-even' &&
      paceMedianEven.sourceAnchors[1].sourceSessionLogId === 's2-even';

    // Odd observations: [10, 20, 30]
    const s3 = createMockRunningSession({
      logId: 's3-odd',
      date: '2026-08-14',
      distanceKm: 1.0,
      durationSeconds: 309,
    });

    const refOdd = deriveRunningHistoricalReference(target, [s1, s2, s3]);
    const paceMedianOdd = refOdd.pace.median;
    const passedOdd =
      paceMedianOdd?.value === 302 &&
      paceMedianOdd.kind === 'exact' &&
      paceMedianOdd.sourceAnchors.length === 1 &&
      paceMedianOdd.sourceAnchors[0].sourceSessionLogId === 's2-even';

    const passed = passedEven && passedOdd;

    results.push({
      auditName: 'Median Odd (Exact) / Even (Interpolated No Rounding)',
      passed,
      details: passed
        ? 'Odd count yields exact anchor; even count yields unrounded exact arithmetic mean with 2 source anchors.'
        : `Failed median calculation invariants: even=${passedEven}, odd=${passedOdd}`,
    });
  }

  // Audit 8: Immutability & Zero Input Mutation
  {
    const target = createMockRunningSession({
      logId: 'target-8',
      date: '2026-08-20',
      distanceKm: 5,
      durationSeconds: 1500,
    });

    const prior1 = createMockRunningSession({
      logId: 'prior-imm-1',
      date: '2026-08-10',
      distanceKm: 4,
      durationSeconds: 1200,
    });

    const prior2 = createMockRunningSession({
      logId: 'prior-imm-2',
      date: '2026-08-12',
      distanceKm: 6,
      durationSeconds: 1800,
    });

    const priors = [prior1, prior2];
    const snapshot = JSON.stringify(priors);

    const ref = deriveRunningHistoricalReference(target, priors);

    let isObjectFrozen = Object.isFrozen(ref) && Object.isFrozen(ref.distance);
    let noMutation = JSON.stringify(priors) === snapshot;

    const passed = isObjectFrozen && noMutation;

    results.push({
      auditName: 'Deep Immutability & Zero Input Mutation',
      passed,
      details: passed
        ? 'Derived references are deeply frozen and candidate session input arrays remain strictly unmutated.'
        : 'Failed immutability and zero input mutation invariants.',
    });
  }

  return results;
}
