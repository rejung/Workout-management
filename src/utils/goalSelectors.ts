/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoalSettings } from '../types/goal';

/**
 * Automatically computes the 3-lift goal (Squat + Benchpress + Deadlift).
 */
export function getThreeLiftGoal(settings: GoalSettings): number {
  return settings.squatGoal + settings.benchGoal + settings.deadliftGoal;
}

/**
 * Automatically computes the current 3-lift sum (Squat + Benchpress + Deadlift).
 */
export function getThreeLiftCurrent(squatCurrent: number, benchCurrent: number, deadliftCurrent: number): number {
  return squatCurrent + benchCurrent + deadliftCurrent;
}

/**
 * Automatically computes the remaining weight/performance to reach the goal.
 */
export function getGoalRemaining(current: number, goal: number): number {
  return goal - current;
}

/**
 * Automatically computes the goal achievement/progress percentage.
 */
export function getGoalProgressPercent(current: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return (current / goal) * 100;
}
