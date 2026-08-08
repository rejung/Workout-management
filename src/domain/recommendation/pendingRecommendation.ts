/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../types';
import { MainLift, FourMainLift, PendingRecommendation } from './types';
import { getMainLiftOfLog } from './trainingState';

export const FOUR_MAIN_LIFTS: FourMainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP'];

export function isFourMainLift(lift: MainLift): lift is FourMainLift {
  return FOUR_MAIN_LIFTS.includes(lift as FourMainLift);
}

/**
 * Calculates the number of days a recommendation is overdue based on recommendedDate and todayStr.
 */
export function calculateOverdueDays(recommendedDate: string, todayStr: string): number {
  if (!recommendedDate || !todayStr) return 0;
  const recTime = new Date(recommendedDate).getTime();
  const todayTime = new Date(todayStr).getTime();
  if (isNaN(recTime) || isNaN(todayTime)) return 0;
  const diffDays = Math.floor((todayTime - recTime) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Checks if a pending recommendation lift has been completed in WorkoutLog on or after recommendedDate.
 */
export function checkIsPendingLiftCompleted(
  lift: MainLift,
  recommendedDate: string,
  logs: WorkoutLog[]
): boolean {
  if (!lift || !recommendedDate) return false;
  return logs.some(log => {
    if (log.date >= recommendedDate) {
      const mainLift = getMainLiftOfLog(log);
      return mainLift === lift;
    }
    return false;
  });
}

/**
 * Resolves the state of a PendingRecommendation against actual WorkoutLogs and todayStr.
 * Returns null if completed or invalid, or an updated PendingRecommendation with calculated overdueDays.
 */
export function resolvePendingRecommendation(
  pending: PendingRecommendation | null | undefined,
  logs: WorkoutLog[],
  todayStr: string
): PendingRecommendation | null {
  if (!pending || !pending.lift) return null;

  // Check if actually completed in WorkoutLog on or after recommendedDate
  if (checkIsPendingLiftCompleted(pending.lift, pending.recommendedDate, logs)) {
    return null; // Successfully completed, no longer pending
  }

  const overdueDays = calculateOverdueDays(pending.recommendedDate, todayStr);

  return {
    ...pending,
    status: 'pending',
    overdueDays,
  };
}

/**
 * Creates a new PendingRecommendation object.
 */
export function createPendingRecommendation(
  lift: MainLift,
  recommendedDate: string,
  todayStr: string
): PendingRecommendation {
  return {
    lift,
    recommendedDate,
    status: 'pending',
    overdueDays: calculateOverdueDays(recommendedDate, todayStr),
  };
}

const STORAGE_KEY = 'v2_pending_recommendation';

export function getStoredPendingRecommendation(): PendingRecommendation | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && parsed.lift && parsed.recommendedDate) {
      return parsed as PendingRecommendation;
    }
  } catch (e) {
    // Storage access unavailable or disallowed
  }
  return null;
}

export function savePendingRecommendation(pending: PendingRecommendation | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!pending) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    }
  } catch (e) {
    // Storage access unavailable or disallowed
  }
}
