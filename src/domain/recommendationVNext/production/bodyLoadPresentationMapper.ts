/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Body Load Presentation Compatibility Mapper (VNext Recommendation Engine - Phase 2)
 *
 * Single Responsibility:
 * Translates evaluated AllDimensionResidualStates and chronology evidence counts into
 * the pure Korean presentation contract `BodyLoadPresentation` without altering recommendation
 * logic, candidate rankings, or inventing scalar fatigue scores.
 *
 * Invariants & Strict Rules:
 * 1. Zero Scalar Summation / Fatigue Scoring: Expresses discrete persistence status, NEVER fake scores or percentages.
 * 2. Complete Dimensional Coverage: Evaluates all seven canonical StressDimensions.
 * 3. Exact Status Mapping:
 *    - immediate evidence present -> '최근 부하'
 *    - no immediate, but residual present -> '잔여 부하'
 *    - no active, but historical present -> '최근 부하 근거 없음'
 *    - no evidence or missing data -> '판단 정보 부족'
 * 4. Uncertainty Preservation:
 *    - Bracket / uncomputed traces are NEVER promoted to confirmed or treated as recovered.
 *    - When uncertain evidence coexists with confirmed evidence, confirmed status is maintained with uncertainty flag.
 * 5. Missing Time Invariance:
 *    - uncertainSameDaySessionCount is explicitly passed to inform UI of excluded sessions.
 *    - NEVER guesses body dimensions for time-missing excluded records.
 * 6. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { StressDimension } from '../types/stressModel.types';
import { CANONICAL_STRESS_DIMENSIONS } from '../stress/stressVocabulary';
import {
  AllDimensionResidualStates,
  DimensionResidualState,
} from '../types/dimensionResidualState.types';
import {
  BodyLoadDisplayStatus,
  BodyLoadPresentation,
  DimensionLoadPresentation,
  DimensionUncertaintyInfo,
} from '../types/recommendationPresentation.types';
import { HistoricalReplayResult } from '../types/historicalReplay.types';
import { translateStressDimension } from './vnextPresentationMapper';

/**
 * Maps a single DimensionResidualState to a user-facing DimensionLoadPresentation.
 */
export function mapSingleDimensionLoad(
  dimension: StressDimension,
  state?: DimensionResidualState
): DimensionLoadPresentation {
  const displayName = translateStressDimension(dimension);

  if (!state) {
    const emptyUncertainty: DimensionUncertaintyInfo = Object.freeze({
      hasUncertainty: false,
      hasBracketTraces: false,
      hasUncertainTraces: false,
      bracketTraceCount: 0,
      uncertainTraceCount: 0,
      potentialPersistence: 'none',
    });

    return Object.freeze({
      dimension,
      displayName,
      status: '판단 정보 부족',
      uncertainty: emptyUncertainty,
      isImmediate: false,
      isResidual: false,
      isHistorical: false,
      isInsufficient: true,
    });
  }

  const immediateCount = state.immediateTraces?.length ?? 0;
  const residualCount = state.residualTraces?.length ?? 0;
  const historicalCount = state.historicalTraces?.length ?? 0;
  const bracketCount = state.bracketTraces?.length ?? 0;
  const uncertainCount = state.uncertainTraces?.length ?? 0;

  const hasBracketTraces = bracketCount > 0;
  const hasUncertainTraces = uncertainCount > 0;
  const hasUncertainty = hasBracketTraces || hasUncertainTraces;

  let note: string | undefined;
  if (hasUncertainTraces && hasBracketTraces) {
    note = '시간 미지정 및 경계 시점 불확실성 포함';
  } else if (hasUncertainTraces) {
    note = '시간 미지정 기록으로 인한 불확실성 포함';
  } else if (hasBracketTraces) {
    note = '경계 시점(24h/72h) 불확실성 포함';
  }

  const potentialPersistence = state.strongestPersistence?.potential ?? 'none';

  const uncertainty: DimensionUncertaintyInfo = Object.freeze({
    hasUncertainty,
    hasBracketTraces,
    hasUncertainTraces,
    bracketTraceCount: bracketCount,
    uncertainTraceCount: uncertainCount,
    potentialPersistence,
    note,
  });

  // Determine Display Status strictly following domain rules:
  // 1. Immediate evidence present: '최근 부하'
  // 2. No immediate, but residual evidence present: '잔여 부하'
  // 3. No active (immediate or residual) evidence:
  //    - Historical evidence present without potential active load: '최근 부하 근거 없음'
  //    - Historical evidence present BUT uncertain/bracket load could be active: '판단 정보 부족'
  // 4. No eligible traces or missing data: '판단 정보 부족'
  let status: BodyLoadDisplayStatus;

  if (immediateCount > 0) {
    status = '최근 부하';
  } else if (residualCount > 0) {
    status = '잔여 부하';
  } else if (historicalCount > 0) {
    if (
      hasUncertainTraces ||
      (hasBracketTraces && (potentialPersistence === 'immediate' || potentialPersistence === 'residual'))
    ) {
      status = '판단 정보 부족';
    } else {
      status = '최근 부하 근거 없음';
    }
  } else {
    status = '판단 정보 부족';
  }

  return Object.freeze({
    dimension,
    displayName,
    status,
    uncertainty,
    isImmediate: status === '최근 부하',
    isResidual: status === '잔여 부하',
    isHistorical: status === '최근 부하 근거 없음',
    isInsufficient: status === '판단 정보 부족',
  });
}

/**
 * Pure transformation mapping AllDimensionResidualStates and uncertain session count to BodyLoadPresentation.
 */
export function mapBodyLoadPresentation(
  residualStates?: AllDimensionResidualStates,
  uncertainSameDaySessionCount: number = 0
): BodyLoadPresentation {
  const safeCount = Math.max(0, uncertainSameDaySessionCount || 0);

  const dimensionPresentations: DimensionLoadPresentation[] = CANONICAL_STRESS_DIMENSIONS.map(
    (dim) => {
      const state = residualStates ? residualStates[dim] : undefined;
      return mapSingleDimensionLoad(dim, state);
    }
  );

  const anyDimensionUncertainty = dimensionPresentations.some(
    (d) => d.uncertainty.hasUncertainty
  );
  const hasUncertainty = anyDimensionUncertainty || safeCount > 0;

  const immediateCount = dimensionPresentations.filter((d) => d.isImmediate).length;
  const residualCount = dimensionPresentations.filter((d) => d.isResidual).length;
  const insufficientCount = dimensionPresentations.filter((d) => d.isInsufficient).length;
  const totalDimensions = dimensionPresentations.length;

  let summary = '';
  if (immediateCount === 0 && residualCount === 0) {
    if (insufficientCount === totalDimensions) {
      // 2. All dimensions insufficient
      summary = '신체 부하를 판단할 기록이 부족합니다';
    } else if (insufficientCount > 0) {
      // 3. No active load, but some dimensions insufficient
      summary =
        '확인 가능한 영역에서 최근·잔여 부하 근거가 없습니다. 일부 영역은 판단 정보가 부족합니다';
    } else {
      // 4. All dimensions historical-only
      summary = '기록상 최근·잔여 부하 근거가 없습니다';
    }
  } else {
    // 5. Active load present
    if (immediateCount > 0 && residualCount > 0) {
      summary = `최근 직접 부하 ${immediateCount}개 영역, 잔여 부하 ${residualCount}개 영역 감지`;
    } else if (immediateCount > 0) {
      summary = `최근 직접 부하 ${immediateCount}개 영역 감지`;
    } else {
      summary = `잔여 부하 ${residualCount}개 영역 감지`;
    }

    if (insufficientCount > 0) {
      summary += '. 일부 영역은 판단 정보가 부족합니다';
    }
  }

  // 6. Append uncertainty guidance if traces have bracket/uncomputed uncertainty or excluded sessions
  const hasBracketAcrossDimensions = dimensionPresentations.some(
    (d) => d.uncertainty.hasBracketTraces
  );
  const hasUncertainTracesAcrossDimensions = dimensionPresentations.some(
    (d) => d.uncertainty.hasUncertainTraces
  );

  if (hasUncertainTracesAcrossDimensions && hasBracketAcrossDimensions) {
    summary += ' (시간 미지정 및 경계 시점 불확실성 포함)';
  } else if (hasUncertainTracesAcrossDimensions) {
    summary += ' (시간 미지정 기록으로 인한 불확실성 포함)';
  } else if (hasBracketAcrossDimensions) {
    summary += ' (경계 시점(24h/72h) 불확실성 포함)';
  }

  if (safeCount > 0) {
    summary += ` (당일 시간 미지정 기록 ${safeCount}건 제외)`;
  }

  return Object.freeze({
    dimensions: Object.freeze(dimensionPresentations),
    uncertainSameDaySessionCount: safeCount,
    hasUncertainty,
    summary,
  });
}

/**
 * Convenience mapper directly extracting states and evidence count from HistoricalReplayResult.
 */
export function mapBodyLoadFromReplayResult(
  replayResult: HistoricalReplayResult
): BodyLoadPresentation {
  const uncertainCount =
    replayResult.availableHistoricalEvidenceCount?.uncertainSameDaySessionCount ?? 0;
  return mapBodyLoadPresentation(replayResult.dimensionResidualStates, uncertainCount);
}
