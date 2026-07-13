/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../types';
import { extractCardioRecord } from './cardioDomain';
import { formatRaceTime } from './formatRaceTime';

export interface MileageResult {
  recent4Weeks: number;
  recent8Weeks: number;
  total: number;
}

export interface RunningPBResult {
  best3km: string;
  best5km: string;
}

export interface WeeklyCardioStats {
  weeklyDistance: number;
  weeklyTimeSeconds: number;
  weeklyPace: string;
}

/**
 * Calculates cardio mileage based on a provided exercise matcher.
 */
export function calculateMileage(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  p1Start?: string,
  p2Start?: string
): MileageResult {
  let recent4Weeks = 0;
  let recent8Weeks = 0;
  let total = 0;

  for (const log of logs) {
    for (const ex of log.exercises) {
      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        for (const set of ex.sets) {
          if (set.isWarmup) continue;
          const record = extractCardioRecord(set);
          const distance = record.distanceKm;
          if (distance > 0) {
            total += distance;
            if (p1Start && log.date >= p1Start) {
              recent4Weeks += distance;
              recent8Weeks += distance;
            } else if (p2Start && log.date >= p2Start) {
              recent8Weeks += distance;
            }
          }
        }
      }
    }
  }

  return {
    recent4Weeks: parseFloat(recent4Weeks.toFixed(1)),
    recent8Weeks: parseFloat(recent8Weeks.toFixed(1)),
    total: parseFloat(total.toFixed(1)),
  };
}

/**
 * Calculates actual 3km and 5km Personal Bests based on actual WorkoutLog records.
 * Uses a distance tolerance ratio to match exact target distances.
 */
export function calculateRunningPB(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean
): RunningPBResult {
  const DISTANCE_TOLERANCE_RATIO = 0.03;

  const target3k = 3.0;
  const tol3k = target3k * DISTANCE_TOLERANCE_RATIO;
  const min3k = target3k - tol3k;
  const max3k = target3k + tol3k;

  const target5k = 5.0;
  const tol5k = target5k * DISTANCE_TOLERANCE_RATIO;
  const min5k = target5k - tol5k;
  const max5k = target5k + tol5k;

  let best3kSeconds = Infinity;
  let best5kSeconds = Infinity;

  for (const log of logs) {
    for (const ex of log.exercises) {
      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        for (const set of ex.sets) {
          if (set.isWarmup) continue;
          const record = extractCardioRecord(set);
          const dist = record.distanceKm;
          const time = record.timeSeconds;

          if (dist > 0 && time > 0) {
            // Match 3km running record
            if (dist >= min3k && dist <= max3k) {
              if (time < best3kSeconds) {
                best3kSeconds = time;
              }
            }
            // Match 5km running record
            if (dist >= min5k && dist <= max5k) {
              if (time < best5kSeconds) {
                best5kSeconds = time;
              }
            }
          }
        }
      }
    }
  }

  return {
    best3km: best3kSeconds === Infinity ? '—' : formatRaceTime(best3kSeconds),
    best5km: best5kSeconds === Infinity ? '—' : formatRaceTime(best5kSeconds),
  };
}

/**
 * Formats pace given a distance in km and time in seconds.
 */
export function calculatePace(distanceKm: number, timeSeconds: number): string {
  if (distanceKm <= 0 || timeSeconds <= 0) {
    return '—';
  }
  const secondsPerKm = timeSeconds / distanceKm;
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"/km`;
}

/**
 * Calculates cumulative cardio stats for the last 7 days.
 */
export function calculateWeeklyStats(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean
): WeeklyCardioStats {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  let weeklyDistance = 0;
  let weeklyTimeSeconds = 0;

  for (const log of logs) {
    if (log.date >= sevenDaysAgoStr) {
      for (const ex of log.exercises) {
        if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
          for (const set of ex.sets) {
            if (set.isWarmup) continue;
            const record = extractCardioRecord(set);
            weeklyDistance += record.distanceKm;
            weeklyTimeSeconds += record.timeSeconds;
          }
        }
      }
    }
  }

  const weeklyPace = calculatePace(weeklyDistance, weeklyTimeSeconds);

  return {
    weeklyDistance: parseFloat(weeklyDistance.toFixed(1)),
    weeklyTimeSeconds,
    weeklyPace,
  };
}
