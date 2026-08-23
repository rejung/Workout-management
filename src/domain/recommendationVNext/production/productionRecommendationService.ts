/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Production Recommendation Service (CU7.0 - Sole Production Engine)
 *
 * Single Responsibility:
 * Authoritative production recommendation entry point that orchestrates VNext
 * recommendation derivation from the Production WorkoutLog SSOT.
 *
 * Execution Invariants:
 * 1. SSOT Ingestion: Ingests directly from WorkoutLog Repository (`workoutRepository.getLogs()`).
 * 2. Uncontaminated VNext Pipeline: No legacy scores, fatigue factors, or rotation bonuses exist.
 * 3. Sole Production Path: VNext is the only recommendation implementation.
 * 4. First-Class Rest: Rest decisions are never converted into fake exercise entities or fallbacks.
 * 5. Dynamic Evaluation Time: Always evaluates at the exact invocation time without stale cached assumptions.
 */

import { WorkoutLog } from '../../../types';
import { workoutRepository } from '../../../storage/workoutRepository';
import { getLocalDateString } from '../../../utils/dateUtils';
import {
  RecommendationResult,
} from '../types/recommendationPresentation.types';
import {
  HistoricalEvaluationPoint,
  HistoricalReplayResult,
} from '../types/historicalReplay.types';
import { evaluateSingleHistoricalPoint } from '../replay/historicalReplayEngine';
import { mapVNextToPresentationModel } from './vnextPresentationMapper';
import { FinalTodayDecision } from '../types/finalTodayDecision.types';
import { NextProjectedSession } from '../types/projectedSession.types';
import { getNextProjectedSession } from './projectedSessionService';

export interface ProductionRecommendationOptions {
  readonly evaluationInstant?: string;
  readonly calendarDate?: string;
  readonly timezone?: string;
  readonly goalSettings?: any;
}

export interface VNextProductionResult {
  readonly decision: FinalTodayDecision;
  readonly presentation: RecommendationResult;
  readonly replayResult: HistoricalReplayResult;
  readonly projectedSession?: NextProjectedSession;
}

/**
 * Derives production recommendation from current WorkoutLogs.
 */
export function getProductionRecommendation(
  logs?: WorkoutLog[],
  goalSettings?: any,
  options?: ProductionRecommendationOptions
): RecommendationResult {
  const evaluated = evaluateVNextProduction(logs, { ...options, goalSettings });
  return evaluated.presentation;
}

/**
 * Executes VNext Recommendation pipeline.
 */
export function evaluateVNextProduction(
  logs?: WorkoutLog[],
  options?: ProductionRecommendationOptions
): VNextProductionResult {
  const activeLogs: readonly WorkoutLog[] = Array.isArray(logs)
    ? logs
    : workoutRepository.getLogs();

  const timezone = options?.timezone || 'Asia/Seoul';
  const evaluationInstant = options?.evaluationInstant || new Date().toISOString();
  const calendarDate = options?.calendarDate || getLocalDateString();
  const localTime = evaluationInstant.includes('T')
    ? evaluationInstant.split('T')[1].substring(0, 8)
    : '12:00:00';

  const point: HistoricalEvaluationPoint = Object.freeze({
    pointId: `prod-eval-${evaluationInstant}`,
    kind: 'pre-session',
    evaluationInstant,
    evaluationCalendarDate: calendarDate,
    evaluationLocalTime: localTime,
    evaluationTimezone: timezone,
    hasChronologyUncertainty: false,
  });

  // Execute full VNext Pipeline for TodayDecision
  const replayResult = evaluateSingleHistoricalPoint(activeLogs, point);

  // Evaluate Forward Projected Session SSOT
  const projectedSession = getNextProjectedSession(activeLogs as WorkoutLog[], {
    sourceEvaluationInstant: evaluationInstant,
    sourceCalendarDate: calendarDate,
    timezone,
  });

  // Map to UI presentation contract
  const presentation = mapVNextToPresentationModel(
    replayResult.todayDecision,
    replayResult.candidateDecisionSet,
    replayResult.restDecisionEvidence,
    {
      calendarDate,
      nextProjectedSession: projectedSession,
    }
  );

  return Object.freeze({
    decision: replayResult.todayDecision,
    presentation,
    replayResult,
    projectedSession,
  });
}
