/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SetRecord, LogType } from '../types';
import { extractCardioRecord } from '../domain/cardio';

/**
 * Format duration in seconds to Korean text format, e.g., "1분 30초" or "45초".
 */
export function formatTimeSeconds(seconds?: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '0초';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) {
    return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
  }
  return `${secs}초`;
}

/**
 * Format a Cardio set's distance and duration nicely, e.g., "5.00km · 24분 31초".
 */
export function formatCardioSet(set: any): string {
  const record = extractCardioRecord(set);
  const distStr = `${record.distanceKm.toFixed(2)}km`;
  if (record.timeSeconds > 0) {
    return `${distStr} · ${formatTimeSeconds(record.timeSeconds)}`;
  }
  return distStr;
}

/**
 * Format a single SetRecord according to its LogType.
 */
export function formatSetRecord(set: any, logType: LogType = 'STANDARD'): string {
  switch (logType) {
    case 'CARDIO':
      return formatCardioSet(set);
    case 'TIME_BASED':
      return formatTimeSeconds(set.timeSeconds);
    case 'BODYWEIGHT_REPS':
      return `${set.reps || 0}회`;
    case 'STANDARD':
    default:
      return `${set.weight || 0}kg × ${set.reps || 0}회`;
  }
}

/**
 * Formats multiple SetRecords into a comma-separated list of formatted strings, e.g. "80kg × 5회, 80kg × 5회"
 */
export function formatSetRecordsList(sets: any[], logType: LogType = 'STANDARD'): string {
  if (!sets || sets.length === 0) return '-';
  return sets.map(s => {
    const prefix = s.isWarmup ? '(W) ' : '';
    return `${prefix}${formatSetRecord(s, logType)}`;
  }).join(', ');
}
