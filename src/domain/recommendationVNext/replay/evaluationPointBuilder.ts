/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Historical Evaluation Point Builder (VNext Recommendation Engine - CU5.0)
 *
 * Constructs deterministic evaluation points across chronological WorkoutLog history.
 *
 * Evaluation Point Types:
 * 1. Pre-Session Point:
 *    - Instant directly prior to actual workout startTime (e.g., T - 1 minute).
 *    - Answers: "What did VNext recommend right before the athlete began training?"
 * 2. Post-Session / End-of-Day Point:
 *    - Instant at the end of the calendar date (23:59:59) after session completion.
 *    - Answers: "Did VNext preserve the completed-session-boundary and next session projection?"
 * 3. Missing-Time Handling:
 *    - Preserves strict chronology uncertainty without fabricating arbitrary start times.
 */

import { WorkoutLog } from '../../../types';
import {
  HistoricalEvaluationPoint,
  EvaluationPointKind,
} from '../types/historicalReplay.types';

export interface EvaluationPointBuilderOptions {
  readonly timezone?: string;
  readonly includePreSession?: boolean;
  readonly includePostSession?: boolean;
}

/**
 * Computes an evaluation time exactly 1 minute prior to given HH:MM time.
 */
function computePreSessionTime(startTime: string): string {
  const parts = startTime.split(':');
  if (parts.length < 2) return '00:00:00';
  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return '00:00:00';

  if (minutes > 0) {
    minutes -= 1;
  } else if (hours > 0) {
    hours -= 1;
    minutes = 59;
  } else {
    // 00:00 -> 00:00:00 (cannot go to prior day in time-only subtraction)
    return '00:00:00';
  }

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  return `${hStr}:${mStr}:00`;
}

/**
 * Formats calendar date and local time into an ISO-8601 evaluation instant.
 */
function formatIsoInstant(date: string, localTime: string, timezoneOffset: string = '+09:00'): string {
  const normTime = localTime.length === 5 ? `${localTime}:00` : localTime;
  return `${date}T${normTime}${timezoneOffset}`;
}

/**
 * Builds chronological evaluation points from an array of WorkoutLogs.
 */
export function buildHistoricalEvaluationPoints(
  logs: readonly WorkoutLog[],
  options: EvaluationPointBuilderOptions = {}
): readonly HistoricalEvaluationPoint[] {
  const timezone = options.timezone ?? 'Asia/Seoul';
  const includePre = options.includePreSession ?? true;
  const includePost = options.includePostSession ?? true;
  const tzOffset = timezone === 'Asia/Seoul' ? '+09:00' : '+00:00';

  const points: HistoricalEvaluationPoint[] = [];
  const processedDates = new Set<string>();

  // Sort logs chronologically ascending (oldest first)
  const sortedLogs = [...logs].sort((a, b) => {
    const dDiff = a.date.localeCompare(b.date);
    if (dDiff !== 0) return dDiff;
    const tA = a.startTime || '';
    const tB = b.startTime || '';
    return tA.localeCompare(tB);
  });

  for (const log of sortedLogs) {
    const hasTime = typeof log.startTime === 'string' && log.startTime.trim().length >= 4;

    // 1. Pre-Session Evaluation Point
    if (includePre) {
      if (hasTime) {
        const localTime = computePreSessionTime(log.startTime!);
        const evalInstant = formatIsoInstant(log.date, localTime, tzOffset);
        points.push(
          Object.freeze({
            pointId: `eval-pre-${log.id}`,
            kind: 'pre-session' as EvaluationPointKind,
            evaluationInstant: evalInstant,
            evaluationTimezone: timezone,
            evaluationCalendarDate: log.date,
            evaluationLocalTime: localTime,
            associatedWorkoutLogId: log.id,
            associatedWorkoutLog: log,
            hasChronologyUncertainty: false,
          })
        );
      } else {
        // Missing start time: anchor at start of day with explicit chronology uncertainty flag
        const localTime = '00:00:00';
        const evalInstant = formatIsoInstant(log.date, localTime, tzOffset);
        points.push(
          Object.freeze({
            pointId: `eval-pre-${log.id}-uncertain`,
            kind: 'pre-session' as EvaluationPointKind,
            evaluationInstant: evalInstant,
            evaluationTimezone: timezone,
            evaluationCalendarDate: log.date,
            evaluationLocalTime: localTime,
            associatedWorkoutLogId: log.id,
            associatedWorkoutLog: log,
            hasChronologyUncertainty: true,
            uncertaintyReason: `WorkoutLog ${log.id} has no startTime; pre-session evaluation cannot be strictly timed before workout execution.`,
          })
        );
      }
    }

    // 2. Post-Session / End-of-Day Evaluation Point (one per unique calendar date)
    if (includePost && !processedDates.has(log.date)) {
      processedDates.add(log.date);
      const eodTime = '23:59:59';
      const evalInstant = formatIsoInstant(log.date, eodTime, tzOffset);
      points.push(
        Object.freeze({
          pointId: `eval-post-${log.date}`,
          kind: 'post-session' as EvaluationPointKind,
          evaluationInstant: evalInstant,
          evaluationTimezone: timezone,
          evaluationCalendarDate: log.date,
          evaluationLocalTime: eodTime,
          associatedWorkoutLogId: log.id,
          associatedWorkoutLog: log,
          hasChronologyUncertainty: false,
        })
      );
    }
  }

  // Sort evaluation points chronologically
  points.sort((a, b) => a.evaluationInstant.localeCompare(b.evaluationInstant));

  return Object.freeze(points);
}
