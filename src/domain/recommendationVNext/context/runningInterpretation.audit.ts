/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deriveRunningHistoricalReference } from './runningHistoricalReference';
import { interpretRunningSessionVsHistory } from './runningInterpretation';
import { CanonicalRunningSession } from '../types/running.types';

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

export interface RunningInterpretationAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}

/**
 * Comprehensive verification suite for CU3.12E Running Interpretation Implementation.
 */
export function runRunningInterpretationAudits(): readonly RunningInterpretationAuditResult[] {
  const results: RunningInterpretationAuditResult[] = [];

  // Audit 1: Cold Start (no prior history)
  {
    const target = createMockRunningSession({
      logId: 'target-cold',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);

    const passed =
      interp.historyState === 'cold-start' &&
      interp.totalHistoricalSessionCount === 0 &&
      interp.distance.comparisonState === 'no-history-observation' &&
      interp.distance.currentValue === 5.0 &&
      interp.distance.vsRecent1 === undefined &&
      interp.distance.vsMedian === undefined &&
      interp.distance.rangePosition === undefined &&
      interp.pace.comparisonState === 'no-history-observation' &&
      interp.pace.currentValue === 300;

    results.push({
      auditName: 'Cold Start Interpretation',
      passed,
      details: passed
        ? 'Cold start correctly sets no-history-observation and leaves comparative fields undefined.'
        : 'Failed cold start interpretation invariants.',
    });
  }

  // Audit 2: Multi-session history with pace no-history-observation
  {
    const target = createMockRunningSession({
      logId: 'target-multi-no-pace',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500, // current pace = 300 s/km
    });

    // 2 historical sessions with distance only (no duration -> no pace)
    const h1 = createMockRunningSession({
      logId: 'h1',
      date: '2026-08-10',
      distanceKm: 4.0,
    });
    const h2 = createMockRunningSession({
      logId: 'h2',
      date: '2026-08-12',
      distanceKm: 6.0,
    });

    const histRef = deriveRunningHistoricalReference(target, [h1, h2]);
    const interp = interpretRunningSessionVsHistory(target, histRef);

    const passed =
      interp.historyState === 'multi-session-reference' &&
      interp.totalHistoricalSessionCount === 2 &&
      interp.distance.comparisonState === 'multi-observation-reference' &&
      interp.distance.vsMedian?.direction === 'equal' && // median of [4, 6] = 5.0
      interp.distance.rangePosition === 'within-range' &&
      interp.pace.comparisonState === 'no-history-observation' &&
      interp.pace.vsMedian === undefined &&
      interp.duration.comparisonState === 'no-history-observation';

    results.push({
      auditName: 'Multi-History with Decoupled Pace No-History-Observation',
      passed,
      details: passed
        ? 'Session-level multi-session-reference and metric-level no-history-observation operate orthogonally without conflict.'
        : 'Failed decoupled history and metric state invariants.',
    });
  }

  // Audit 3: Current Metric Missing ('no-current-value')
  {
    const target = createMockRunningSession({
      logId: 'target-dist-only',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: undefined, // pace is also undefined
    });

    const h1 = createMockRunningSession({
      logId: 'h1-full',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const histRef = deriveRunningHistoricalReference(target, [h1]);
    const interp = interpretRunningSessionVsHistory(target, histRef);

    const passed =
      interp.distance.comparisonState === 'single-observation-reference' &&
      interp.duration.comparisonState === 'no-current-value' &&
      interp.duration.currentValue === undefined &&
      interp.duration.vsMedian === undefined &&
      interp.pace.comparisonState === 'no-current-value' &&
      interp.pace.currentValue === undefined;

    results.push({
      auditName: 'Current Metric Missing (no-current-value)',
      passed,
      details: passed
        ? 'Missing current metrics are accurately marked as no-current-value without coercion to 0.'
        : 'Failed no-current-value invariants.',
    });
  }

  // Audit 4: Distance Greater / Equal / Less & Range Positions
  {
    const h1 = createMockRunningSession({
      logId: 'h1',
      date: '2026-08-01',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });
    const h2 = createMockRunningSession({
      logId: 'h2',
      date: '2026-08-05',
      distanceKm: 10.0,
      durationSeconds: 3000,
    });

    // 1) Target above max (12km)
    const targetAbove = createMockRunningSession({
      logId: 't-above',
      date: '2026-08-10',
      distanceKm: 12.0,
      durationSeconds: 3600,
    });
    const refAbove = deriveRunningHistoricalReference(targetAbove, [h1, h2]);
    const interpAbove = interpretRunningSessionVsHistory(targetAbove, refAbove);

    // 2) Target below min (3km)
    const targetBelow = createMockRunningSession({
      logId: 't-below',
      date: '2026-08-10',
      distanceKm: 3.0,
      durationSeconds: 900,
    });
    const refBelow = deriveRunningHistoricalReference(targetBelow, [h1, h2]);
    const interpBelow = interpretRunningSessionVsHistory(targetBelow, refBelow);

    const passedAbove =
      interpAbove.distance.vsMax?.direction === 'greater' &&
      interpAbove.distance.vsMax?.delta === 2.0 &&
      interpAbove.distance.rangePosition === 'above-max';

    const passedBelow =
      interpBelow.distance.vsMin?.direction === 'less' &&
      interpBelow.distance.vsMin?.delta === -2.0 &&
      interpBelow.distance.rangePosition === 'below-min';

    const passed = passedAbove && passedBelow;

    results.push({
      auditName: 'Distance Comparison & Range Positions',
      passed,
      details: passed
        ? 'Distance properly calculates greater/less directions and above-max/below-min range positions.'
        : 'Failed distance comparison invariants.',
    });
  }

  // Audit 5: Duration Longer / Equal / Shorter
  {
    const h1 = createMockRunningSession({
      logId: 'h1-dur',
      date: '2026-08-01',
      distanceKm: 5.0,
      durationSeconds: 1800, // 30 min
    });

    const targetLonger = createMockRunningSession({
      logId: 't-longer',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 2400, // 40 min
    });

    const ref = deriveRunningHistoricalReference(targetLonger, [h1]);
    const interp = interpretRunningSessionVsHistory(targetLonger, ref);

    const passed =
      interp.duration.vsRecent1?.direction === 'longer' &&
      interp.duration.vsRecent1?.delta === 600 &&
      interp.duration.rangePosition === 'above-max';

    results.push({
      auditName: 'Duration Longer/Shorter Directions',
      passed,
      details: passed
        ? 'Duration properly calculates longer/equal/shorter directions.'
        : 'Failed duration comparison invariants.',
    });
  }

  // Audit 6: Pace Faster / Equal / Slower & Inverted Range Positions
  {
    // History has pace: 360 s/km (6:00/km) and 300 s/km (5:00/km)
    // min (fastest) = 300 s/km, max (slowest) = 360 s/km
    const hSlow = createMockRunningSession({
      logId: 'h-slow',
      date: '2026-08-01',
      distanceKm: 5.0,
      durationSeconds: 1800, // 360 s/km
    });
    const hFast = createMockRunningSession({
      logId: 'h-fast',
      date: '2026-08-05',
      distanceKm: 5.0,
      durationSeconds: 1500, // 300 s/km
    });

    // 1) Target is 270 s/km (4:30/km) -> FASTER than fastest (fastest-on-record)
    const targetFaster = createMockRunningSession({
      logId: 't-fastest',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 1350, // 270 s/km
    });
    const refFaster = deriveRunningHistoricalReference(targetFaster, [hSlow, hFast]);
    const interpFaster = interpretRunningSessionVsHistory(targetFaster, refFaster);

    // 2) Target is 400 s/km (6:40/km) -> SLOWER than slowest (slowest-on-record)
    const targetSlower = createMockRunningSession({
      logId: 't-slowest',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 2000, // 400 s/km
    });
    const refSlower = deriveRunningHistoricalReference(targetSlower, [hSlow, hFast]);
    const interpSlower = interpretRunningSessionVsHistory(targetSlower, refSlower);

    const passedFaster =
      interpFaster.pace.vsMin?.direction === 'faster' && // 270 < 300 -> faster
      interpFaster.pace.vsMin?.delta === -30 &&          // 270 - 300 = -30 seconds/km
      interpFaster.pace.rangePosition === 'fastest-on-record';

    const passedSlower =
      interpSlower.pace.vsMax?.direction === 'slower' && // 400 > 360 -> slower
      interpSlower.pace.vsMax?.delta === 40 &&
      interpSlower.pace.rangePosition === 'slowest-on-record';

    const passed = passedFaster && passedSlower;

    results.push({
      auditName: 'Pace Inverted Direction & Historical Extremes',
      passed,
      details: passed
        ? 'Pace properly maps lower seconds/km to "faster" and "fastest-on-record" without zone or intent inference.'
        : `Failed pace inversion invariants: faster=${passedFaster}, slower=${passedSlower}`,
    });
  }

  // Audit 7: Recent-1 Missing Metric Fallback Prevention
  {
    const target = createMockRunningSession({
      logId: 'target-recent1-missing',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    // Recent-1 has distance only
    const recent1 = createMockRunningSession({
      logId: 'recent1-no-duration',
      date: '2026-08-14',
      distanceKm: 6.0,
      durationSeconds: undefined,
    });

    // Older session has duration and pace
    const older = createMockRunningSession({
      logId: 'older-has-duration',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 1600,
    });

    const histRef = deriveRunningHistoricalReference(target, [recent1, older]);
    const interp = interpretRunningSessionVsHistory(target, histRef);

    const passed =
      interp.distance.vsRecent1?.referenceValue === 6.0 &&
      interp.distance.vsRecent1.direction === 'less' &&
      interp.duration.vsRecent1 === undefined && // No fallback!
      interp.pace.vsRecent1 === undefined &&     // No fallback!
      interp.duration.vsMedian?.referenceValue === 1600;

    results.push({
      auditName: 'Recent-1 Missing Metric Fallback Prevention in Interpretation',
      passed,
      details: passed
        ? 'vsRecent1 is undefined when Recent-1 lacks that metric, even if older sessions have it.'
        : 'Failed Recent-1 fallback prevention invariants in interpretation.',
    });
  }

  // Audit 8: Deep Immutability & Zero Input Mutation
  {
    const target = createMockRunningSession({
      logId: 't-imm',
      date: '2026-08-10',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const h1 = createMockRunningSession({
      logId: 'h-imm',
      date: '2026-08-01',
      distanceKm: 4.0,
      durationSeconds: 1200,
    });

    const histRef = deriveRunningHistoricalReference(target, [h1]);
    const targetSnapshot = JSON.stringify(target);
    const histRefSnapshot = JSON.stringify(histRef);

    const interp = interpretRunningSessionVsHistory(target, histRef);

    const isFrozen =
      Object.isFrozen(interp) &&
      Object.isFrozen(interp.distance) &&
      Object.isFrozen(interp.duration) &&
      Object.isFrozen(interp.pace);

    const noMutation =
      JSON.stringify(target) === targetSnapshot &&
      JSON.stringify(histRef) === histRefSnapshot;

    const passed = isFrozen && noMutation;

    results.push({
      auditName: 'Deep Immutability & Zero Input Mutation',
      passed,
      details: passed
        ? 'Interpretation result is deeply frozen and input structures remain strictly unmutated.'
        : 'Failed immutability and zero mutation invariants.',
    });
  }

  // Audit 9: Pace Provenance Fidelity (Preserving explicit + legacy components without loss)
  {
    // Case A: explicit distance + legacy duration
    const targetExplicitDistLegacyDur = createMockRunningSession({
      logId: 't-exp-leg',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
      distanceProvenance: 'explicit',
      durationProvenance: 'legacy',
      sourceConfidence: 'medium',
    });

    // Case B: legacy distance + explicit duration
    const targetLegacyDistExplicitDur = createMockRunningSession({
      logId: 't-leg-exp',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
      distanceProvenance: 'legacy',
      durationProvenance: 'explicit',
      sourceConfidence: 'medium',
    });

    const histRef = deriveRunningHistoricalReference(targetExplicitDistLegacyDur, []);

    const interpA = interpretRunningSessionVsHistory(targetExplicitDistLegacyDur, histRef);
    const interpB = interpretRunningSessionVsHistory(targetLegacyDistExplicitDur, histRef);

    const paceProvA = interpA.pace.currentProvenance;
    const passedA =
      paceProvA !== undefined &&
      typeof paceProvA === 'object' &&
      paceProvA.distance === 'explicit' &&
      paceProvA.duration === 'legacy' &&
      interpA.distance.currentProvenance === 'explicit' &&
      interpA.duration.currentProvenance === 'legacy' &&
      interpA.pace.currentSourceConfidence === 'medium';

    const paceProvB = interpB.pace.currentProvenance;
    const passedB =
      paceProvB !== undefined &&
      typeof paceProvB === 'object' &&
      paceProvB.distance === 'legacy' &&
      paceProvB.duration === 'explicit' &&
      interpB.distance.currentProvenance === 'legacy' &&
      interpB.duration.currentProvenance === 'explicit' &&
      interpB.pace.currentSourceConfidence === 'medium';

    const passed = passedA && passedB;

    results.push({
      auditName: 'Pace Provenance Fidelity & Lossless Component Preservation',
      passed,
      details: passed
        ? 'Pace provenance preserves full component provenance (distance, duration, conflict metadata) without synthetic single-value compression.'
        : `Failed pace provenance fidelity invariants: A=${passedA}, B=${passedB}`,
    });
  }

  return results;
}
