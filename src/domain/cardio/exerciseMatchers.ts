/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if the exercise represents a running activity.
 */
export function isRunningExercise(exerciseId: string, exerciseName: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  const idLower = exerciseId.toLowerCase();
  const runKeywords = ['running', 'treadmill', 'jogging', '러닝', '달리기', '조깅'];
  return runKeywords.some(keyword => nameLower.includes(keyword) || idLower.includes(keyword));
}

/**
 * Checks if the exercise represents a cycling activity.
 */
export function isCyclingExercise(exerciseId: string, exerciseName: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  const idLower = exerciseId.toLowerCase();
  const cycleKeywords = ['cycling', 'cycle', 'bike', '사이클', '자전거'];
  return cycleKeywords.some(keyword => nameLower.includes(keyword) || idLower.includes(keyword));
}

/**
 * Checks if the exercise represents a rowing activity.
 */
export function isRowingExercise(exerciseId: string, exerciseName: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  const idLower = exerciseId.toLowerCase();
  const rowKeywords = ['rowing', 'row', '로잉'];
  return rowKeywords.some(keyword => nameLower.includes(keyword) || idLower.includes(keyword));
}

/**
 * Checks if the exercise represents a swimming activity.
 */
export function isSwimmingExercise(exerciseId: string, exerciseName: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  const idLower = exerciseId.toLowerCase();
  const swimKeywords = ['swimming', 'swim', '수영'];
  return swimKeywords.some(keyword => nameLower.includes(keyword) || idLower.includes(keyword));
}
