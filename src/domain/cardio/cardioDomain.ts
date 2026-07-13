/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SetRecord } from '../../types';

export interface CardioRecord {
  distanceKm: number;
  timeSeconds: number;
}

/**
 * Parses legacy reps value representing run duration.
 * In v1 migration, times like "21:59" or "21분 59초" were stripped of non-numeric characters
 * and stored as MMSS integers (e.g., 2159) inside 'reps'.
 * 
 * MMSS Identification Rule:
 * - If reps >= 100 and the last two digits (seconds) are less than 60 (reps % 100 < 60),
 *   it is highly likely an MMSS format representing MM minutes and SS seconds.
 *   - 2159 -> 21 minutes 59 seconds (1319 seconds)
 *   - 1150 -> 11 minutes 50 seconds (710 seconds)
 *   - 1215 -> 12 minutes 15 seconds (735 seconds)
 * - Otherwise, treat reps as standard minutes, converting it directly to seconds (reps * 60).
 */
function parseLegacyRunningTime(reps: number): number {
  if (reps >= 100 && reps % 100 < 60) {
    const minutes = Math.floor(reps / 100);
    const seconds = reps % 100;
    return minutes * 60 + seconds;
  }
  return reps * 60;
}

/**
 * Normalizes a WorkoutSet (SetRecord) of legacy or current storage formats
 * into a single unified CardioRecord domain model.
 * 
 * - Current Format: uses distanceKm and timeSeconds directly.
 * - Legacy Format: uses weight as distance (km) and reps as time (minutes or MMSS),
 *   converting reps to seconds.
 */
export function extractCardioRecord(set: SetRecord): CardioRecord {
  // If current format fields exist, use them
  if (set.distanceKm !== undefined || set.timeSeconds !== undefined) {
    return {
      distanceKm: set.distanceKm ?? 0,
      timeSeconds: set.timeSeconds ?? 0,
    };
  }

  // Legacy format fallback: weight -> distance(km), reps -> time (minutes or MMSS format)
  const distanceKm = set.weight ?? 0;
  const timeSeconds = parseLegacyRunningTime(set.reps ?? 0);

  return {
    distanceKm,
    timeSeconds,
  };
}

