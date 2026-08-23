/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NextProjectedSession Forward Evaluation Engine (VNext Recommendation Engine - CU9.1)
 *
 * Single Responsibility:
 * Evaluates the earliest forward training opportunity from actual WorkoutLog SSOT
 * using the Frozen VNext recommendation pipeline across deterministic future evaluation points.
 *
 * Core Execution Invariants:
 * 1. Dedicated Domain Contract: Returns NextProjectedSession, never WorkoutLog.
 * 2. Zero Hypothetical Workout Injection: Evaluates strictly with actual historical WorkoutLogs.
 * 3. Conditional Assumption: Explicitly marked with 'no-new-actual-workout-logs'.
 * 4. Strictly Future Evaluation: Evaluates only forward points (T+1 calendar days onwards).
 * 5. Deterministic Transition Evaluation: Evaluates exact temporal attenuation boundaries (24h/72h),
 *    calendar Need boundaries (00:00:00), and daily evaluation policy (09:00:00) without brute force.
 * 6. Timezone SSOT: Strictly adheres to EvaluationContext evaluationTimezone across all calculations.
 * 7. First-Class Rest Preservation: Future Rest evaluations are never converted to fake exercises.
 * 8. True Tie Preservation: Preserves tied candidates if present at projected point.
 * 9. Qualitative Uncertainty: Flags assumption and evidence constraints without fake score math.
 * 10. Pure Immutability: Deeply frozen return objects.
 */

import { WorkoutLog } from '../../../types';
import {
  NextProjectedSession,
  NextProjectedSessionOptions,
  ProjectedEvaluationContext,
  ProjectionUncertaintyFlag,
  SourceEvaluationReference,
} from '../types/projectedSession.types';
import {
  DEFAULT_PROJECTION_DAILY_EVALUATION_LOCAL_TIME,
  DEFAULT_PROJECTION_SEARCH_HORIZON_DAYS,
  DEFAULT_PROJECTION_TIMEZONE,
  PROJECTION_ASSUMPTION,
  PROJECTION_INVALIDATION_POLICIES,
} from './projectedSessionConfig';
import { HistoricalEvaluationPoint } from '../types/historicalReplay.types';
import { evaluateSingleHistoricalPoint } from '../replay/historicalReplayEngine';
import {
  deriveEvaluationContext,
  parseWallClockInTimezone,
  THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS,
  THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS,
} from '../stress/residualStressTrace';
import { computeCalendarDayDelta } from '../need/candidateTrainingNeed';

/**
 * Deterministically adds calendar days to a 'YYYY-MM-DD' date string.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const parts = dateStr.trim().replace(/\./g, '-').split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return dateStr;
  }

  const target = new Date(Date.UTC(y, m - 1, d + days));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const td = String(target.getUTCDate()).padStart(2, '0');

  return `${ty}-${tm}-${td}`;
}

/**
 * Generates an ISO 8601 string for evaluation in the given timezone using the wall-clock parser SSOT.
 */
export function buildTargetInstant(
  calendarDate: string,
  localTime: string,
  timezone: string
): string {
  const cleanTime = localTime.length === 5 ? `${localTime}:00` : localTime;
  return parseWallClockInTimezone(calendarDate, cleanTime, timezone).isoString;
}

/**
 * Builds a deterministic fingerprint of historical WorkoutLogs.
 */
export function buildWorkoutLogFingerprint(logs: readonly WorkoutLog[]): string {
  if (!logs || logs.length === 0) {
    return 'empty-ssot';
  }

  const summary = logs
    .map((l) => `${l.id}:${l.date}:${l.startTime || 'no-time'}`)
    .sort()
    .join('|');

  return `ssot-${logs.length}-${summary.length}`;
}

export interface CandidateEvaluationPointItem {
  readonly point: HistoricalEvaluationPoint;
  readonly daysFromSource: number;
  readonly timestampMs: number;
}

/**
 * Deterministically generates all candidate future evaluation points within the search horizon.
 *
 * Evaluation Point Sources (T+1 through T+H):
 * A. Temporal Attenuation Transitions:
 *    - 24h boundary (immediate -> residual, 86,400s)
 *    - 72h boundary (residual -> historical, 259,200s)
 * B. Calendar-based Need Transitions:
 *    - Start of each calendar day (00:00:00 wall-clock in evaluationTimezone, T+1 to T+H)
 * C. Daily Evaluation Fallback Policy:
 *    - Configured local evaluation time (e.g. 09:00:00 wall-clock in evaluationTimezone, T+1 to T+H)
 * D. Max Horizon Boundary:
 *    - End of the search horizon window.
 *
 * Invariants:
 * - Strictly future relative to source evaluation calendar day (T+1 onwards).
 * - Chronologically ascending order.
 * - Deduplicated timestamps (evaluated exactly once).
 * - Full timezone fidelity (DST-aware via Intl and deriveEvaluationContext).
 */
export function generateFutureEvaluationPoints(
  allLogs: readonly WorkoutLog[],
  sourceInstantMs: number,
  sourceCalendarDate: string,
  timezone: string,
  searchHorizonDays: number,
  dailyEvaluationLocalTime: string
): readonly CandidateEvaluationPointItem[] {
  if (searchHorizonDays <= 0) {
    return Object.freeze([]);
  }

  const startOfTomorrowCalendarDate = addDaysToDateString(sourceCalendarDate, 1);
  const minFutureInstantMs = parseWallClockInTimezone(startOfTomorrowCalendarDate, '00:00:00', timezone).instantMs;
  const maxCalendarDate = addDaysToDateString(sourceCalendarDate, searchHorizonDays);
  const maxInstantMs = parseWallClockInTimezone(maxCalendarDate, '23:59:59.999', timezone).instantMs;

  const candidateMsSet = new Set<number>();

  // A. Temporal Attenuation Boundaries (24h & 72h) from actual historical logs falling within T+1..T+H
  for (const log of allLogs) {
    if (!log.date) continue;

    if (typeof log.startTime === 'string' && log.startTime.trim().length > 0) {
      const sessionMs = parseWallClockInTimezone(log.date, log.startTime, timezone).instantMs;
      const t1 = sessionMs + THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS * 1000;
      const t2 = sessionMs + THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS * 1000;

      if (t1 >= minFutureInstantMs && t1 <= maxInstantMs) {
        candidateMsSet.add(t1);
      }
      if (t2 >= minFutureInstantMs && t2 <= maxInstantMs) {
        candidateMsSet.add(t2);
      }
    } else {
      // Missing startTime (calendar bounded interval [00:00:00, 23:59:59.999])
      const startOfDayMs = parseWallClockInTimezone(log.date, '00:00:00', timezone).instantMs;
      const endOfDayMs = parseWallClockInTimezone(log.date, '23:59:59.999', timezone).instantMs;

      const t1Start = startOfDayMs + THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS * 1000;
      const t1End = endOfDayMs + THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS * 1000;
      const t2Start = startOfDayMs + THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS * 1000;
      const t2End = endOfDayMs + THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS * 1000;

      if (t1Start >= minFutureInstantMs && t1Start <= maxInstantMs) candidateMsSet.add(t1Start);
      if (t1End >= minFutureInstantMs && t1End <= maxInstantMs) candidateMsSet.add(t1End);
      if (t2Start >= minFutureInstantMs && t2Start <= maxInstantMs) candidateMsSet.add(t2Start);
      if (t2End >= minFutureInstantMs && t2End <= maxInstantMs) candidateMsSet.add(t2End);
    }
  }

  // B. Calendar Day Boundaries (00:00:00 local wall-clock) & C. Daily Fallback (e.g. 09:00:00 local wall-clock) for T+1..T+H
  for (let dayOffset = 1; dayOffset <= searchHorizonDays; dayOffset += 1) {
    const targetDate = addDaysToDateString(sourceCalendarDate, dayOffset);

    // Day start boundary (Need transition point)
    const dayStartMs = parseWallClockInTimezone(targetDate, '00:00:00', timezone).instantMs;
    if (dayStartMs >= minFutureInstantMs && dayStartMs <= maxInstantMs) {
      candidateMsSet.add(dayStartMs);
    }

    // Daily evaluation policy local time
    const dailyMs = parseWallClockInTimezone(targetDate, dailyEvaluationLocalTime, timezone).instantMs;
    if (dailyMs >= minFutureInstantMs && dailyMs <= maxInstantMs) {
      candidateMsSet.add(dailyMs);
    }
  }

  // D. Chronological Ascending Sort & Deduplication Normalization
  const sortedTimestamps = Array.from(candidateMsSet).sort((a, b) => a - b);

  const points: CandidateEvaluationPointItem[] = [];
  for (const ts of sortedTimestamps) {
    const isoString = new Date(ts).toISOString();
    const evalContext = deriveEvaluationContext({
      evaluationInstant: isoString,
      evaluationTimezone: timezone,
    });
    const daysFromSource = computeCalendarDayDelta(
      evalContext.evaluationCalendarDate,
      sourceCalendarDate
    );

    const pointId = `proj-eval-${evalContext.evaluationCalendarDate}-${evalContext.evaluationLocalTime.replace(/:/g, '')}-${ts}`;

    const point: HistoricalEvaluationPoint = Object.freeze({
      pointId,
      kind: 'pre-session',
      evaluationInstant: isoString,
      evaluationCalendarDate: evalContext.evaluationCalendarDate,
      evaluationLocalTime: evalContext.evaluationLocalTime,
      evaluationTimezone: timezone,
      hasChronologyUncertainty: false,
    });

    points.push(
      Object.freeze({
        point,
        daysFromSource,
        timestampMs: ts,
      })
    );
  }

  return Object.freeze(points);
}

/**
 * Evaluates NextProjectedSession forward in time using Frozen VNext Pipeline.
 */
export function evaluateNextProjectedSession(
  allLogs: readonly WorkoutLog[] = [],
  options?: NextProjectedSessionOptions
): NextProjectedSession {
  const timezone = options?.timezone || DEFAULT_PROJECTION_TIMEZONE;
  const sourceEvaluationInstant = options?.sourceEvaluationInstant || new Date().toISOString();

  // Derive source evaluation context cleanly using EvaluationContext SSOT
  const sourceEvalContext = deriveEvaluationContext({
    evaluationInstant: sourceEvaluationInstant,
    evaluationTimezone: timezone,
  });

  const sourceCalendarDate =
    options?.sourceCalendarDate || sourceEvalContext.evaluationCalendarDate;

  const searchHorizonDays =
    typeof options?.searchHorizonDays === 'number' && options.searchHorizonDays >= 0
      ? options.searchHorizonDays
      : DEFAULT_PROJECTION_SEARCH_HORIZON_DAYS;

  const dailyEvaluationLocalTime =
    options?.evaluationLocalTime || DEFAULT_PROJECTION_DAILY_EVALUATION_LOCAL_TIME;

  const sourceInstantMs = new Date(sourceEvaluationInstant).getTime();

  // 1. Build Source Evaluation Provenance Reference
  const sortedLogs = [...allLogs].sort((a, b) => {
    const dDiff = a.date.localeCompare(b.date);
    if (dDiff !== 0) return dDiff;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  const latestLog = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : undefined;
  const workoutLogFingerprint = buildWorkoutLogFingerprint(allLogs);

  const sourceEvaluation: SourceEvaluationReference = Object.freeze({
    evaluationInstant: sourceEvaluationInstant,
    evaluationCalendarDate: sourceCalendarDate,
    evaluationTimezone: timezone,
    actualLogCount: allLogs.length,
    latestActualLogDate: latestLog?.date,
    latestActualLogStartTime: latestLog?.startTime,
    workoutLogFingerprint,
  });

  // 2. Identify Baseline Uncertainty Flags
  const baseUncertainties: ProjectionUncertaintyFlag[] = [
    'assumption-dependent',
    'actual-log-sensitive',
  ];

  const hasMissingStartTime = allLogs.some((l) => !l.startTime || l.startTime.trim() === '');
  if (hasMissingStartTime) {
    baseUncertainties.push('chronology-limited');
  }

  if (allLogs.length === 0) {
    baseUncertainties.push('insufficient-evidence');
  }

  // 3. Generate Deterministic Future Candidate Evaluation Points
  const candidatePoints = generateFutureEvaluationPoints(
    allLogs,
    sourceInstantMs,
    sourceCalendarDate,
    timezone,
    searchHorizonDays,
    dailyEvaluationLocalTime
  );

  // 4. Sequential Evaluation across Deterministic Points (Earliest Opportunity Selection)
  let evaluationsCheckedCount = 0;

  for (const candidateItem of candidatePoints) {
    evaluationsCheckedCount += 1;
    const { point, daysFromSource } = candidateItem;

    // Run pure Frozen VNext pipeline with actual historical logs only (zero fake workouts!)
    const replayResult = evaluateSingleHistoricalPoint(allLogs, point, options?.candidateIds);
    const todayDecision = replayResult.todayDecision;

    // First train decision encountered is the earliest meaningful training opportunity
    if (todayDecision.kind === 'train') {
      const projectedEvaluation: ProjectedEvaluationContext = Object.freeze({
        pointId: point.pointId,
        evaluationInstant: point.evaluationInstant,
        evaluationCalendarDate: point.evaluationCalendarDate,
        evaluationLocalTime: point.evaluationLocalTime,
        evaluationTimezone: timezone,
        daysFromSource,
      });

      const basis =
        todayDecision.decisionRationale ||
        todayDecision.explainability?.headline ||
        'Earliest forward training opportunity identified under current recovery trajectory.';

      return Object.freeze({
        sourceEvaluation,
        projectionAssumption: PROJECTION_ASSUMPTION,
        projectedDecisionClass: 'train',
        projectedEvaluation,
        projectedDate: point.evaluationCalendarDate,
        projectedCandidate: todayDecision.primaryCandidate,
        tiedCandidates: todayDecision.tiedPrimaryCandidates,
        alternativeCandidates: todayDecision.alternativeCandidates || [],
        projectionBasis: basis,
        uncertaintyFlags: Object.freeze(baseUncertainties),
        invalidationPolicy: PROJECTION_INVALIDATION_POLICIES,
        searchHorizonDays,
        evaluationsCheckedCount,
        underlyingTodayDecision: todayDecision,
        underlyingCandidateSet: replayResult.candidateDecisionSet,
      });
    }

    // If decision.kind === 'rest', Rest is preserved as a first-class Rest boundary.
    // Continue to next deterministic evaluation point.
  }

  // 5. If search horizon exhausted without any train decision
  const exhaustedUncertainties: ProjectionUncertaintyFlag[] = [
    ...baseUncertainties,
    'horizon-exhausted',
  ];

  return Object.freeze({
    sourceEvaluation,
    projectionAssumption: PROJECTION_ASSUMPTION,
    projectedDecisionClass: 'no-projected-session-within-horizon',
    projectionBasis: `No suitable training opportunity identified within the ${searchHorizonDays}-day forward search window.`,
    uncertaintyFlags: Object.freeze(exhaustedUncertainties),
    invalidationPolicy: PROJECTION_INVALIDATION_POLICIES,
    searchHorizonDays,
    evaluationsCheckedCount,
    alternativeCandidates: Object.freeze([]),
  });
}
