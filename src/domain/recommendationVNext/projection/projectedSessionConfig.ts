/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NextProjectedSession Configuration (VNext Recommendation Engine - CU9.0)
 *
 * Centralized policy constants for forward session projection.
 */

import { ProjectionAssumption } from '../types/projectedSession.types';

export const DEFAULT_PROJECTION_SEARCH_HORIZON_DAYS = 7;
export const DEFAULT_PROJECTION_DAILY_EVALUATION_LOCAL_TIME = '09:00:00';
export const DEFAULT_PROJECTION_LOCAL_TIME = '09:00:00';
export const DEFAULT_PROJECTION_TIMEZONE = 'Asia/Seoul';
export const PROJECTION_ASSUMPTION: ProjectionAssumption = 'no-new-actual-workout-logs';

export const PROJECTION_INVALIDATION_POLICIES: readonly string[] = Object.freeze([
  'New actual WorkoutLog added to history',
  'Existing WorkoutLog modified, reordered, or deleted',
  'Source evaluation instant superseded by real-world time advance',
  'WorkoutLog repository dataset or athlete profile replaced',
]);
