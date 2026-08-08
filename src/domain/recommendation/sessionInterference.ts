/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MainLift, LiftCategory, TrainingState } from './types';
import { LIFT_TO_CATEGORY } from './trainingState';

export type InterferenceLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface SessionInterferenceResult {
  candidateLift: MainLift;
  recentLift: MainLift | null;
  recentCategory: LiftCategory | null;
  candidateCategory: LiftCategory;
  level: InterferenceLevel;
  penalty: number;
  isHardBlocked: boolean;
  hardBlockReason?: string;
  reason?: string;
}

const PENALTY_MAP: Record<InterferenceLevel, number> = {
  'NONE': 0,
  'LOW': 2,
  'MEDIUM': 6,
  'HIGH': 15,
  'VERY_HIGH': 25,
};

/**
 * Evaluates session interference and hard constraints for a candidate lift
 * given the current TrainingState.
 */
export function evaluateSessionInterference(
  candidateLift: MainLift,
  trainingState: TrainingState
): SessionInterferenceResult {
  const candidateCategory = LIFT_TO_CATEGORY[candidateLift];
  const { recentSession } = trainingState;
  const recentLift = recentSession.mainLift;
  const recentCategory = recentSession.category;
  const daysAgo = recentSession.daysAgo;

  // Rest candidate never suffers interference or hard block
  if (candidateLift === '휴식') {
    return {
      candidateLift,
      recentLift,
      recentCategory,
      candidateCategory: 'Rest',
      level: 'NONE',
      penalty: 0,
      isHardBlocked: false,
    };
  }

  // If no recent session or session was > 3 days ago, no interference
  if (!recentLift || !recentCategory || daysAgo === null || daysAgo > 3 || recentCategory === 'Rest') {
    return {
      candidateLift,
      recentLift,
      recentCategory,
      candidateCategory,
      level: 'NONE',
      penalty: 0,
      isHardBlocked: false,
    };
  }

  // 1. HARD CONSTRAINTS
  // Hard Constraint: Re-performing exact same main heavy lift within <= 1 day
  if (candidateLift === recentLift && daysAgo <= 1) {
    if (candidateLift !== '러닝') {
      return {
        candidateLift,
        recentLift,
        recentCategory,
        candidateCategory,
        level: 'VERY_HIGH',
        penalty: 50,
        isHardBlocked: true,
        hardBlockReason: `최근 ${daysAgo === 0 ? '오늘' : '어제'} 이미 ${candidateLift}를 수행하여 재수행이 제한됩니다.`,
        reason: `동일 메인 리프트 (${candidateLift}) 연달아 수행 금지`,
      };
    }
  }

  // Hard Constraint: Extremely high intensity conflict on SAME day (daysAgo === 0)
  if (daysAgo === 0) {
    if (
      (recentLift === '스쿼트' && candidateLift === '데드리프트') ||
      (recentLift === '데드리프트' && candidateLift === '스쿼트')
    ) {
      return {
        candidateLift,
        recentLift,
        recentCategory,
        candidateCategory,
        level: 'VERY_HIGH',
        penalty: 50,
        isHardBlocked: true,
        hardBlockReason: `오늘 이미 ${recentLift}를 수행하여 동일 날짜에 ${candidateLift} 수행은 제한됩니다.`,
        reason: `동일 날짜 고강도 하체/후면사슬 중복 제한`,
      };
    }
  }

  // 2. LIFT-SPECIFIC OVERRIDES (when recent session is <= 2 days ago)
  let level: InterferenceLevel = 'NONE';
  let overrideReason = '';

  if (daysAgo <= 2) {
    if (
      (recentLift === '스쿼트' && candidateLift === '데드리프트') ||
      (recentLift === '데드리프트' && candidateLift === '스쿼트')
    ) {
      level = daysAgo <= 1 ? 'VERY_HIGH' : 'HIGH';
      overrideReason = `${recentLift} 수행 후 ${candidateLift} 세션 간섭 (척추/하체 피로)`;
    } else if (
      (recentLift === '스쿼트' && candidateLift === '러닝') ||
      (recentLift === '데드리프트' && candidateLift === '러닝')
    ) {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
      overrideReason = `${recentLift} 수행 후 러닝 세션 간섭 (하체 누적 피로)`;
    } else if (
      (recentLift === '벤치프레스' && candidateLift === 'OHP') ||
      (recentLift === 'OHP' && candidateLift === '벤치프레스')
    ) {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
      overrideReason = `${recentLift} 수행 후 ${candidateLift} 세션 간섭 (상체 밀기 피로)`;
    }
  }

  // 3. CATEGORY-BASED INTERFERENCE (if no lift-specific override)
  if (level === 'NONE') {
    if (recentCategory === 'Legs' && candidateCategory === 'Legs') {
      level = daysAgo <= 1 ? 'VERY_HIGH' : 'HIGH';
    } else if (recentCategory === 'Legs' && candidateCategory === 'Pull') {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
    } else if (recentCategory === 'Legs' && candidateCategory === 'Push') {
      level = daysAgo <= 1 ? 'MEDIUM' : 'LOW';
    } else if (recentCategory === 'Pull' && candidateCategory === 'Pull') {
      level = daysAgo <= 1 ? 'VERY_HIGH' : 'HIGH';
    } else if (recentCategory === 'Pull' && candidateCategory === 'Legs') {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
    } else if (recentCategory === 'Push' && candidateCategory === 'Push') {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
    } else if (recentCategory === 'Push' && candidateCategory === 'Legs') {
      level = daysAgo <= 1 ? 'MEDIUM' : 'LOW';
    } else if (recentCategory === 'Cardio' && candidateCategory === 'Legs') {
      level = daysAgo <= 1 ? 'HIGH' : 'MEDIUM';
    } else if (recentCategory === 'Cardio' && candidateCategory === 'Cardio') {
      level = daysAgo <= 1 ? 'MEDIUM' : 'LOW';
    }
  }

  // Adjust level decay for 2~3 days ago if not already lowered
  if (daysAgo === 2 && (level === 'VERY_HIGH' || level === 'HIGH')) {
    level = level === 'VERY_HIGH' ? 'HIGH' : 'MEDIUM';
  } else if (daysAgo === 3) {
    if (level === 'VERY_HIGH' || level === 'HIGH') level = 'LOW';
    else level = 'NONE';
  }

  const penalty = PENALTY_MAP[level];
  const defaultReason = level !== 'NONE'
    ? `최근 ${daysAgo}일 전 ${recentCategory}(${recentLift}) 수행으로 인한 ${candidateCategory}(${candidateLift}) 세션 간섭 (${level})`
    : undefined;

  return {
    candidateLift,
    recentLift,
    recentCategory,
    candidateCategory,
    level,
    penalty,
    isHardBlocked: false,
    reason: overrideReason || defaultReason,
  };
}
