/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Projected Session Application Service (VNext Recommendation Engine - CU9.0)
 *
 * Single Responsibility:
 * Authoritative Application Service entry point for obtaining forward session projections
 * from the actual WorkoutLog SSOT.
 *
 * Invariants:
 * 1. Independent from TodayDecision: Separate entry point with distinct return contract.
 * 2. SSOT Ingestion: Ingests directly from WorkoutLog Repository (`workoutRepository.getLogs()`).
 * 3. On-Demand Recalculation: Always evaluates forward dynamically without stale prediction caches.
 * 4. Zero Fake Workouts: Relies strictly on historical logs.
 */

import { WorkoutLog } from '../../../types';
import { workoutRepository } from '../../../storage/workoutRepository';
import {
  NextProjectedSession,
  NextProjectedSessionOptions,
} from '../types/projectedSession.types';
import { evaluateNextProjectedSession } from '../projection/nextProjectedSessionEngine';

/**
 * Derives the earliest forward training opportunity from current WorkoutLogs.
 */
export function getNextProjectedSession(
  logs?: WorkoutLog[],
  options?: NextProjectedSessionOptions
): NextProjectedSession {
  const activeLogs: readonly WorkoutLog[] = Array.isArray(logs)
    ? logs
    : workoutRepository.getLogs();

  return evaluateNextProjectedSession(activeLogs, options);
}
