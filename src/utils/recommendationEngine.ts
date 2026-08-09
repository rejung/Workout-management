/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../types';
import { GoalSettings } from '../types/goal';
import { getLocalDateString } from './dateUtils';
import { getLast7DaysRange, getLast28DaysRange } from './dateRange';
import { buildTrainingState, LIFT_TO_CATEGORY, getMainLiftOfLog, compareWorkoutLogsChronologicalDesc } from '../domain/recommendation/trainingState';
import { evaluateSessionInterference } from '../domain/recommendation/sessionInterference';
import { PendingRecommendation } from '../domain/recommendation/types';
import {
  resolvePendingRecommendation,
  createPendingRecommendation,
  getStoredPendingRecommendation,
  savePendingRecommendation,
  isFourMainLift,
} from '../domain/recommendation/pendingRecommendation';
export { LIFT_TO_CATEGORY, getMainLiftOfLog };
export type { TrainingState, PendingRecommendation } from '../domain/recommendation/types';

export type MainLift = '벤치프레스' | 'OHP' | '데드리프트' | '바벨 로우' | '스쿼트' | '러닝' | '휴식';

export interface RecommendationResult {
  mainLift: MainLift;
  pendingRecommendation?: PendingRecommendation | null;
  reasons: string[];
  representativeExercises: string[];
  date: string;
  friendlyDate?: string;
  actionChecklist?: string[];
  executionInfo?: {
    expectedDuration: string;
    workoutType: string;
    nextUp: string;
    nextTiming: string;
    recoveryDays?: number;
    lastWorkoutDate?: string;
  };
  oneLineReason?: string;
  allScores?: Record<MainLift, LiftFactorScores>;
  topCandidates?: {
    lift: MainLift;
    totalScore: number;
    isCurrent: boolean;
    rejectionReason?: string;
  }[];
}

export interface LiftFactorScores {
  recovery: number;    // max 35 (① 회복도 및 수행 간격)
  priority: number;    // max 20 (② 미수행 기간에 따른 훈련 우선순위)
  goalGap: number;     // max 15 (③ 목표 지표 대비 현재 퍼포먼스 간극)
  frequency: number;   // max 15 (④ 최근 4주간 종목/카테고리 빈도 균형)
  fatigue: number;     // max 10 (⑤ 누적 피로도 및 종목 간 간섭 적합도)
  interferencePenalty?: number;
  isHardBlocked?: boolean;
  hardBlockReason?: string;
  total: number;       // sum of factor scores (max 100)
  reasons?: string[];  // detailed explanations for factor scoring
}

export const RECOMMENDATION_WEIGHTS = {
  recovery: 0.35,
  priority: 0.20,
  goalGap: 0.15,
  frequency: 0.15,
  fatigue: 0.10,
};

export const REP_EXERCISES_MAP: Record<MainLift, string[]> = {
  '벤치프레스': ['벤치프레스', '딥스', '오버헤드 삼두 익스텐션', '케이블 플라이'],
  'OHP': ['OHP', '페이스 풀', '플랭크', '사레레'],
  '데드리프트': ['데드리프트', '플랭크', '밴드 풀업'],
  '바벨 로우': ['바벨 로우', '시티드 케이블 로우', '밴드 풀업', '페이스 풀'],
  '스쿼트': ['스쿼트', '카프 레이즈', '플랭크'],
  '러닝': ['트레드밀 러닝', '야외 조깅', '동적 스트레칭', '인터벌 러닝'],
  '휴식': ['회복 산책', '폼롤러 스트레칭', '정적 스트레칭', '수분 섭취']
};

export const ACTION_CHECKLIST_MAP: Record<MainLift, string[]> = {
  '벤치프레스': [
    '어깨 가동성 확보 및 관절 웜업',
    '밴드 외회전 (회전근개 활성화)',
    '점진적 증량 워밍업 세트 수행',
    '본 운동 대표 작업세트 수행',
    '삼두 및 가슴 보강 세션 마무리'
  ],
  '데드리프트': [
    '햄스트링 및 고관절 동적 스트레칭',
    '힙힌지 패턴 및 견갑 고정 확인',
    '복압(브레이싱) 호흡 및 코어 점검',
    '본 운동 대표 작업세트 수행',
    '후면사슬 및 광배 회복 스트레칭'
  ],
  '스쿼트': [
    '고관절 및 발목 가동성 스트레칭',
    '맨몸 딥스쿼트 자세 및 코어 점검',
    '점진적 중량 적응 워밍업 세트',
    '본 운동 대표 작업세트 수행',
    '하체 및 코어 보강 훈련 마무리'
  ],
  'OHP': [
    '흉추 가동성 확보 및 견갑 웜업',
    '회전근개 및 밴드 풀업 활성화',
    '바벨 수직 궤적 워밍업 세트',
    '본 운동 대표 작업세트 수행',
    '측면 델트 및 삼두 보강'
  ],
  '바벨 로우': [
    '흉추 및 견갑 가동성 확보',
    '힙힌지 자세 및 상체 각도 점검',
    '광배 수축 중심 워밍업 세트',
    '본 운동 대표 작업세트 수행',
    '후면 삼각근 및 이두 보강'
  ],
  '러닝': [
    '발목 및 고관절 동적 스트레칭',
    'Easy Pace (가벼운 페이스) 시작',
    '목표 심박수 구간 유지 러닝',
    '유산소 쿨다운 및 조깅 마무리'
  ],
  '휴식': [
    '20분 가벼운 야외 산책',
    '폼롤러 10분 근막 이완',
    '전신 가벼운 정적 스트레칭',
    '수분 및 단백질 충분히 섭취'
  ]
};

function getFriendlyRecommendationDate(dateStr: string): string {
  try {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(dateStr);
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const dayName = days[d.getDay()];
    return `${mm}월 ${dd}일 (${dayName})`;
  } catch {
    return '오늘';
  }
}

function getOneLineReason(lift: MainLift): string {
  switch (lift) {
    case '벤치프레스':
      return '가슴과 삼두근의 초과회복이 극대화된 시점으로, 벤치프레스 점진적 과부하에 최적의 날입니다.';
    case '데드리프트':
      return '후면 사슬의 근력이 완벽히 충전되어 고중량 전신 스트렝스 훈련을 강력하게 소화할 준비가 되었습니다.';
    case '스쿼트':
      return '하체 및 코어 부위의 피로가 충분히 해소되어 강력한 스쿼트 스트렝스 훈련을 수행하기 가장 적합한 날입니다.';
    case 'OHP':
      return '견갑대 주변 소근육과 삼각근이 말끔하게 회복되어 가볍고 탄력 있는 프레스 밀기 훈련이 가능한 상태입니다.';
    case '바벨 로우':
      return '등 주동근 및 후면 근육군의 회복도가 우수하여 깊은 자극과 무거운 당기기 루틴 수행에 매우 좋은 타이밍입니다.';
    case '러닝':
      return '하체 및 심폐 기능 회복이 완료되어 유산소 능력을 기르고 심폐 지구력을 향상시키기 좋은 날입니다.';
    case '휴식':
      return '최근 훈련 빈도를 고려하면 오늘은 회복을 우선하는 것이 다음 세션의 수행 능력 향상에 도움이 됩니다.';
    default:
      return '현재 신체 회복 상태와 누적 피로 지표에 완벽히 매칭된 오늘의 커스텀 권장 훈련 세션입니다.';
  }
}

export function formatNextRecommendationDate(
  lastWorkoutDateStr?: string,
  recoveryDays: number = 2
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let baseDate = new Date(today);
  if (lastWorkoutDateStr) {
    const cleanStr = lastWorkoutDateStr.replace(/\./g, '-').replace(/\s+/g, '').trim();
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) {
        baseDate = parsed;
        baseDate.setHours(0, 0, 0, 0);
      }
    }
  }

  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() + recoveryDays);

  const diffMs = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return '오늘';
  }
  if (diffDays === 1) {
    return '내일';
  }

  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return daysOfWeek[targetDate.getDay()];
}

function getExecutionInfo(lift: MainLift, nextLift: MainLift, lastWorkoutDate?: string) {
  let recoveryDays = 2;
  if (lift === '휴식') {
    recoveryDays = 1;
  } else if (lift === '러닝') {
    recoveryDays = 2;
  } else if (lift === '스쿼트' || lift === '데드리프트') {
    recoveryDays = 2;
  } else {
    recoveryDays = 2;
  }

  const nextTiming = formatNextRecommendationDate(lastWorkoutDate, recoveryDays);

  return {
    expectedDuration: lift === '휴식' ? '20~30분' : (lift === '러닝' ? '40~50분' : (lift === '스쿼트' || lift === '데드리프트' ? '65~75분' : '55~65분')),
    workoutType: lift === '휴식' ? '적극적 회복 (Recovery)' : (lift === '러닝' ? '유산소 심폐 지구력' : '고중량 스트렝스 & 근비대'),
    nextUp: nextLift,
    nextTiming,
    recoveryDays,
    lastWorkoutDate
  };
}

/**
 * Rule-Based Explainable Multi-Factor Scoring Engine
 * Modularized calculation of factor scores for all representative exercises.
 */
export function calculateMultiFactorScores(
  logs: WorkoutLog[],
  goalSettings?: GoalSettings | null,
  pendingRec?: PendingRecommendation | null,
  customTodayStr?: string
): Record<MainLift, LiftFactorScores> {
  const allLifts: MainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP', '러닝', '휴식', '바벨 로우'];
  const todayStr = customTodayStr || getLocalDateString();
  const trainingState = buildTrainingState(logs, todayStr);
  const sorted = trainingState.sortedLogs;

  const rawPending = pendingRec !== undefined ? pendingRec : getStoredPendingRecommendation();
  const resolvedPending = resolvePendingRecommendation(rawPending, logs, todayStr);

  // 1. Training State SSOT
  const hasWorkedOutToday = trainingState.hasWorkedOutToday;
  const daysSinceLastMap = trainingState.daysSinceLastMap;
  const consecutiveTrainingDays = trainingState.trainingStreak.consecutiveDays;
  const last7DaysCount = trainingState.trainingStreak.countLast7Days;
  const last28DaysCount = trainingState.trainingStreak.countLast28Days;

  // 2. Weekly & 4-Week Frequency analysis from Training State
  const pushCount = trainingState.categoryCounts28Days.Push;
  const pullCount = trainingState.categoryCounts28Days.Pull;
  const legCount = trainingState.categoryCounts28Days.Legs;
  const cardioCount = trainingState.categoryCounts28Days.Cardio;
  const maxCatCount = Math.max(pushCount, pullCount, legCount, cardioCount, 1);

  // 3. Goal gap analysis (find max lifted weights)
  const getMaxWeight = (lift: MainLift): number => {
    let maxW = 0;
    sorted.forEach(l => {
      if (getMainLiftOfLog(l) === lift) {
        l.exercises.forEach(ex => {
          ex.sets?.forEach(s => {
            if ((s.weight || 0) > maxW) maxW = s.weight || 0;
          });
        });
      }
    });
    return maxW;
  };
  const maxWeights: Record<MainLift, number> = {
    '벤치프레스': getMaxWeight('벤치프레스'),
    'OHP': getMaxWeight('OHP'),
    '데드리프트': getMaxWeight('데드리프트'),
    '스쿼트': getMaxWeight('스쿼트'),
    '바벨 로우': getMaxWeight('바벨 로우'),
    '러닝': 0,
    '휴식': 0,
  };

  const isOverworked = last7DaysCount >= 5;
  const ranRecently = daysSinceLastMap['러닝'] <= 1;
  const deadliftedRecently = daysSinceLastMap['데드리프트'] <= 1;
  const squattedRecently = daysSinceLastMap['스쿼트'] <= 1;

  const scores: Record<MainLift, LiftFactorScores> = {
    '벤치프레스': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    'OHP': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    '데드리프트': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    '바벨 로우': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    '스쿼트': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    '러닝': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
    '휴식': { recovery: 0, priority: 0, goalGap: 0, frequency: 0, fatigue: 0, total: 0, reasons: [] },
  };

  allLifts.forEach(lift => {
    const days = daysSinceLastMap[lift];

    // ① Recovery Score (max 35)
    let recScore = 0;
    if (lift === '휴식') {
      if (hasWorkedOutToday) recScore = 35;
      else if (consecutiveTrainingDays >= 3 || last7DaysCount >= 4) recScore = 35;
      else if (consecutiveTrainingDays === 2 || last7DaysCount === 3) recScore = 25;
      else if (consecutiveTrainingDays === 1) recScore = 15;
      else recScore = 10;
    } else {
      if (days >= 4) recScore = 35;
      else if (days === 3) recScore = 30;
      else if (days === 2) recScore = 22;
      else if (days === 1) recScore = 10;
      else recScore = 0;
    }

    // ② Training Priority Score (max 20)
    let priScore = 0;
    if (lift === '휴식') {
      if (consecutiveTrainingDays >= 4 || last7DaysCount >= 5) priScore = 20;
      else if (consecutiveTrainingDays === 3) priScore = 16;
      else if (consecutiveTrainingDays === 2) priScore = 10;
      else priScore = 4;
    } else {
      if (days >= 5) priScore = 20;
      else if (days === 4) priScore = 17;
      else if (days === 3) priScore = 14;
      else if (days === 2) priScore = 8;
      else priScore = 0;
    }

    // ③ Goal Gap Score (max 15)
    let goalScore = 0;
    if (lift === '휴식') {
      goalScore = last7DaysCount >= 3 ? 10 : 7;
    } else if (lift === '러닝') {
      goalScore = cardioCount < 4 ? 13 : 8;
    } else {
      let targetGoal = 100;
      if (lift === '벤치프레스') targetGoal = goalSettings?.benchGoal || 100;
      else if (lift === 'OHP') targetGoal = goalSettings?.ohpGoal || 65;
      else if (lift === '데드리프트') targetGoal = goalSettings?.deadliftGoal || 170;
      else if (lift === '스쿼트') targetGoal = goalSettings?.squatGoal || 140;
      else if (lift === '바벨 로우') targetGoal = (goalSettings?.deadliftGoal || 170) * 0.6;

      const currMax = maxWeights[lift];
      if (targetGoal > 0 && currMax > 0) {
        const gap = Math.max(0, targetGoal - currMax);
        const ratio = gap / targetGoal;
        if (ratio >= 0.3) goalScore = 15;
        else if (ratio >= 0.2) goalScore = 13;
        else if (ratio >= 0.1) goalScore = 10;
        else if (ratio > 0) goalScore = 8;
        else goalScore = 6;
      } else {
        goalScore = 10;
      }
    }

    // ④ Frequency Balance Score (max 15)
    let freqScore = 0;
    let imbalancePenalty = 0;
    const cat = LIFT_TO_CATEGORY[lift];
    if (lift === '휴식') {
      if (last28DaysCount >= 16) freqScore = 15;
      else if (last28DaysCount >= 12) freqScore = 11;
      else freqScore = 6;
    } else {
      if (cat === 'Cardio') {
        freqScore = cardioCount < 4 ? 12 : 6;
      } else {
        const catCount = cat === 'Push' ? pushCount : (cat === 'Pull' ? pullCount : legCount);
        const total3Cat = pushCount + pullCount + legCount;
        const avg3Cat = total3Cat > 0 ? total3Cat / 3 : 0;
        const catDelta = catCount - avg3Cat;

        if (catDelta <= -1.0) {
          // Under-represented category boost
          freqScore = Math.min(15, 10 + Math.round(Math.abs(catDelta) * 3));
        } else if (catDelta <= 0.75) {
          // Balanced category
          freqScore = 9;
        } else {
          // Over-represented category penalty
          freqScore = 0;
          imbalancePenalty = Math.min(15, Math.round(catDelta * 8));
        }
      }
    }

    // 4-Lift Rotation Alignment & Cycle Completer Bonus (only if category is not saturated)
    let rotationBonus = 0;
    const isCycleCompleter = isFourMainLift(lift) && trainingState.rotationState.cycleCompleter === lift;
    const isOldestFourLift = isFourMainLift(lift) && trainingState.rotationState.oldestLift === lift;
    const catCount = cat === 'Push' ? pushCount : (cat === 'Pull' ? pullCount : legCount);
    const total3Cat = pushCount + pullCount + legCount;
    const avg3Cat = total3Cat > 0 ? total3Cat / 3 : 0;
    const isCategorySaturated = (catCount - avg3Cat) >= 1.0;

    if ((isCycleCompleter || isOldestFourLift) && recScore >= 30 && !isCategorySaturated) {
      rotationBonus = 8;
    }

    // ⑤ Fatigue Index Score (max 10) - suitability given fatigue
    let fatScore = 0;
    if (lift === '휴식') {
      if (isOverworked || hasWorkedOutToday) fatScore = 10;
      else if (last7DaysCount === 4) fatScore = 8;
      else fatScore = 5;
    } else if (isOverworked) {
      fatScore = 2; // High accumulated fatigue makes heavy training unsuitable
    } else if (lift === '스쿼트') {
      fatScore = (ranRecently || deadliftedRecently) ? 2 : 10;
    } else if (lift === '데드리프트') {
      fatScore = squattedRecently ? 2 : 10;
    } else if (lift === '러닝') {
      fatScore = squattedRecently ? 3 : 9;
    } else {
      fatScore = daysSinceLastMap[lift] <= 1 ? 2 : 10;
    }

    let totalScore = recScore + priScore + goalScore + freqScore + fatScore + rotationBonus - imbalancePenalty;

    // Apply Session Interference Layer
    const interference = evaluateSessionInterference(lift, trainingState);
    totalScore -= interference.penalty;

    if (interference.isHardBlocked) {
      totalScore = 0;
    } else if (resolvedPending && resolvedPending.lift === lift && resolvedPending.status === 'pending') {
      // Pending Priority Boost applies ONLY if recovered and low interference
      if (recScore >= 22 && interference.penalty < 15) {
        const pendingBoost = 12 + Math.min(8, (resolvedPending.overdueDays || 0) * 3);
        totalScore += pendingBoost;
      }
    }

    scores[lift] = {
      recovery: recScore,
      priority: priScore,
      goalGap: goalScore,
      frequency: freqScore,
      fatigue: fatScore,
      interferencePenalty: interference.penalty,
      isHardBlocked: interference.isHardBlocked,
      hardBlockReason: interference.hardBlockReason,
      total: Math.max(0, totalScore),
      reasons: [],
    };
  });

  return scores;
}

export function getRejectionReason(lift: MainLift, score: LiftFactorScores): string {
  if (score.isHardBlocked && score.hardBlockReason) {
    return score.hardBlockReason;
  }

  if (score.interferencePenalty && score.interferencePenalty >= 7) {
    return '최근 세션 수행으로 인한 높은 간섭(피로 누적)이 발생하여 보류 권장됩니다.';
  }

  if (lift === '휴식') {
    if (score.recovery < 35) {
      return '최근 휴식이 충분하고 누적 피로도가 낮아, 오늘은 성장을 위해 훈련을 소화할 적기입니다.';
    }
    return '신체 피로가 적고 컨디션이 최적 상태여서 오늘은 고강도 스트렝스 루틴 수행이 유리합니다.';
  }

  // 1. Fatigue (under-recovery / interference)
  if (score.fatigue <= 3) {
    if (lift === '스쿼트') {
      return '최근 데드리프트나 유산소 수행으로 하체 및 고관절 피로가 누적되어 스쿼트 보류가 권장됩니다.';
    }
    if (lift === '데드리프트') {
      return '최근 스쿼트 수행으로 척추 기립근 및 대퇴사두근 피로도가 높아 부상 방지차 보류가 권장됩니다.';
    }
    return '최근 타 부위 고강도 수행 또는 신경계 누적 피로가 높아 오늘은 수행 안전성이 확보되지 않습니다.';
  }

  // 2. Recovery score (absolute rest needed)
  if (score.recovery === 0) {
    return '최근 매우 가깝게 해당 훈련을 수행하여 근육 섬유 및 안전을 위한 회복 확보가 필요합니다.';
  }
  if (score.recovery === 10) {
    return '최근 1일 전 수행으로 완벽한 초과회복이 일어나기 전이므로 충분한 복구가 우선됩니다.';
  }
  if (score.recovery === 22) {
    return '최근 2일 전 수행하여 완전한 주동근 초과회복 상태에 아직 전면 도달하지 못했습니다.';
  }

  // 3. Priority of training block
  if (score.priority <= 8) {
    return '최근에 이미 해당 루틴을 성공적으로 수행하여 오늘은 다른 부위의 훈련 우선순위가 높습니다.';
  }

  // 4. Frequency Balance (4-week balance)
  if (score.frequency <= 6) {
    return '최근 4주간 동일 부위의 밀도가 상대적으로 높아 부위 간 완벽한 밸런스를 위해 보류합니다.';
  }

  // Fallback
  return '신체 회복 속도와 루틴별 우선순위 밸런스를 고려할 때 다른 종목이 오늘 수행 효율이 더 높습니다.';
}

export function getProjectedNextSession(
  todayLift: MainLift,
  logs: WorkoutLog[],
  goalSettings?: GoalSettings | null,
  todayStr?: string
): MainLift {
  const currentTodayStr = todayStr || getLocalDateString();

  let simLogs = logs;
  if (todayLift !== '휴식') {
    const simLog: WorkoutLog = {
      id: 'simulated-today',
      date: currentTodayStr,
      routineName: todayLift,
      notes: 'Simulated log for projected next workout',
      exercises: [
        {
          exerciseId: 'sim-1',
          exerciseName: todayLift,
          category: LIFT_TO_CATEGORY[todayLift] === 'Push' ? 'Chest' : (LIFT_TO_CATEGORY[todayLift] === 'Pull' ? 'Back' : (LIFT_TO_CATEGORY[todayLift] === 'Legs' ? 'Legs' : 'Cardio')),
          sets: [{ id: 'sim-s1', reps: 5, weight: 100 }],
        },
      ],
    };
    simLogs = [simLog, ...logs];
  }

  const parts = currentTodayStr.split('-').map(Number);
  const tomorrowObj = new Date(parts[0], parts[1] - 1, parts[2] + 1);
  const mm = String(tomorrowObj.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrowObj.getDate()).padStart(2, '0');
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${mm}-${dd}`;

  const scores = calculateMultiFactorScores(simLogs, goalSettings, null, tomorrowStr);
  const allowedLifts: MainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP', '휴식'];
  const candidates = allowedLifts
    .map(lift => ({ lift, score: scores[lift]?.total || 0 }))
    .sort((a, b) => b.score - a.score);

  const bestNext = candidates.find(c => c.lift !== todayLift && c.lift !== '휴식')?.lift || candidates[0].lift;
  return bestNext;
}

export function getNextRecommendation(
  logs: WorkoutLog[],
  goalSettings?: GoalSettings | null,
  existingPending?: PendingRecommendation | null,
  customTodayStr?: string
): RecommendationResult {
  const todayStr = customTodayStr || getLocalDateString();
  const recDateStr = todayStr.replace(/-/g, '. ');

  const rawPending = existingPending !== undefined ? existingPending : getStoredPendingRecommendation();
  const resolvedPending = resolvePendingRecommendation(rawPending, logs, todayStr);

  if (logs.length === 0) {
    const mainLift: MainLift = '벤치프레스';
    const multiFactorScores = calculateMultiFactorScores(logs, goalSettings, resolvedPending, todayStr);
    const allowedLifts: MainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP', '휴식'];
    const filteredScores = {} as Record<MainLift, LiftFactorScores>;
    allowedLifts.forEach(lift => {
      filteredScores[lift] = multiFactorScores[lift];
    });

    const sortedCandidates = Object.entries(filteredScores)
      .map(([lift, score]) => ({ lift: lift as MainLift, ...score }))
      .sort((a, b) => b.total - a.total);

    const topCandidates = sortedCandidates.slice(0, 3).map((item) => ({
      lift: item.lift,
      totalScore: item.total,
      isCurrent: item.lift === mainLift,
      rejectionReason: getRejectionReason(item.lift, item),
    }));

    let activePending = resolvedPending;
    if (isFourMainLift(mainLift)) {
      if (!activePending || activePending.lift !== mainLift) {
        activePending = createPendingRecommendation(mainLift, todayStr, todayStr);
      }
    }
    savePendingRecommendation(activePending);

    const projectedNextLift = getProjectedNextSession(mainLift, logs, goalSettings, todayStr);

    return {
      mainLift,
      pendingRecommendation: activePending,
      reasons: [
        '✓ 신규 훈련 시작을 위한 대표 상체 밀기 종목입니다.',
        '✓ 근육 및 관절 회복도가 100%인 상태입니다.',
        '✓ 점진적 과부하 스트렝스 루틴에 최적화된 종목입니다.'
      ],
      representativeExercises: REP_EXERCISES_MAP[mainLift],
      date: recDateStr,
      friendlyDate: getFriendlyRecommendationDate(todayStr),
      actionChecklist: ACTION_CHECKLIST_MAP[mainLift],
      executionInfo: getExecutionInfo(mainLift, projectedNextLift, todayStr),
      oneLineReason: getOneLineReason(mainLift),
      allScores: filteredScores,
      topCandidates
    };
  }

  const multiFactorScores = calculateMultiFactorScores(logs, goalSettings, resolvedPending, todayStr);
  const allowedLifts: MainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP', '휴식'];
  const filteredScores = {} as Record<MainLift, LiftFactorScores>;
  allowedLifts.forEach(lift => {
    filteredScores[lift] = multiFactorScores[lift];
  });

  const sortedCandidates = Object.entries(filteredScores)
    .map(([lift, score]) => ({ lift: lift as MainLift, ...score }))
    .sort((a, b) => b.total - a.total);

  const best = sortedCandidates[0];
  const mainLift = best.lift;
  const projectedNextLift = getProjectedNextSession(mainLift, logs, goalSettings, todayStr);

  let activePending = resolvedPending;
  if (isFourMainLift(mainLift)) {
    if (!activePending || activePending.lift !== mainLift) {
      activePending = createPendingRecommendation(mainLift, todayStr, todayStr);
    }
  } else if (mainLift === '휴식') {
    // Keep existing pending recommendation when rest is chosen today due to fatigue/recovery
  } else {
    activePending = null;
  }
  savePendingRecommendation(activePending);

  // Generate explainable reasons (Why)
  const candidateReasons: string[] = [];
  const sortedLogs = [...logs].sort(compareWorkoutLogsChronologicalDesc);
  const hasWorkedOutToday = sortedLogs.some(l => l.date === todayStr);

  if (activePending && activePending.lift === mainLift && activePending.overdueDays > 0) {
    candidateReasons.push(`이전에 추천되었지만 아직 수행되지 않아 오늘 우선적으로 고려했습니다. (${activePending.overdueDays}일 이월)`);
  }

  if (mainLift === '휴식') {
    if (hasWorkedOutToday) {
      candidateReasons.push('오늘의 목표 훈련 세션을 이미 성공적으로 완수했습니다.');
      candidateReasons.push('근육 및 신경계의 초과회복(Super-compensation)을 위한 필수 휴식일입니다.');
      candidateReasons.push('오버트레이닝 방지와 부상 예방을 위한 적극적 회복 권장');
    } else if (best.priority >= 16 || best.recovery >= 30) {
      candidateReasons.push('최근 연속된 고강도 훈련으로 인해 누적 피로도 해소가 급선무입니다.');
      candidateReasons.push('근육 성장과 인대/관절 회복을 위한 훈련 우선순위가 가장 높습니다.');
      candidateReasons.push('다음 고강도 스트렝스 세션 퍼포먼스 극대화를 위한 에너지 비축');
    } else {
      candidateReasons.push('현재 모든 주요 근육군의 완전한 회복을 위한 휴식 타이밍입니다.');
      candidateReasons.push('스트레칭 및 가벼운 산책을 통한 적극적 회복 권장');
      candidateReasons.push('부상 방지 및 운동 수행 능력 최적화를 위한 회복일');
    }
  } else {
    // 1. Recovery reason
    if (best.recovery >= 30) {
      if (mainLift === '벤치프레스' || mainLift === 'OHP') {
        candidateReasons.push('가슴·삼두 및 상체 주동근의 회복도가 100%에 도달했습니다.');
      } else if (mainLift === '스쿼트') {
        candidateReasons.push('하체 주동근 및 코어 근육군 회복 상태가 매우 우수합니다.');
      } else if (mainLift === '데드리프트') {
        candidateReasons.push('후면 사슬 및 등 근육군의 회복도가 완벽히 충전되었습니다.');
      }
    }

    // 2. Priority reason
    if (best.priority >= 17) {
      candidateReasons.push('최근 훈련 주기를 고려할 때 금일 훈련 우선순위가 높습니다.');
    } else if (best.priority >= 14) {
      candidateReasons.push('주기적 프로그램 흐름상 금일 배치하기에 가장 적합한 종목입니다.');
    }

    // 3. Goal Gap reason
    if (best.goalGap >= 13) {
      candidateReasons.push('설정한 목표 지표 도달을 위해 해당 종목의 집중 보완이 필요합니다.');
    } else if (best.goalGap >= 10) {
      candidateReasons.push('목표 중량 달성을 위한 점진적 과부하 훈련 적기입니다.');
    }

    // 4. Frequency Balance reason
    if (best.frequency >= 11) {
      const catName = LIFT_TO_CATEGORY[mainLift] === 'Push' ? 'Push(밀기)' : (LIFT_TO_CATEGORY[mainLift] === 'Pull' ? 'Pull(당기기)' : (LIFT_TO_CATEGORY[mainLift] === 'Legs' ? 'Leg(하체)' : 'Cardio(유산소)'));
      candidateReasons.push(`최근 4주간 ${catName} 훈련 빈도 균형을 맞추기에 가장 적합합니다.`);
    }

    // 5. Fatigue Index reason
    if (best.fatigue >= 9) {
      candidateReasons.push('누적 피로 간섭이 적어 고강도 퍼포먼스를 발휘하기 최적의 조건입니다.');
    }

    // Fallbacks if fewer than 3 reasons
    if (candidateReasons.length < 3) {
      candidateReasons.push('점진적 과부하 달성 및 스트렝스 향상 타이밍');
      candidateReasons.push('전반적인 신체 컨디션과 훈련 주기를 고려한 최적 선택');
    }
  }

  const uniqueReasons = Array.from(new Set(candidateReasons))
    .slice(0, 3)
    .map(r => r.startsWith('✓') ? r : `✓ ${r}`);

  const topCandidates = sortedCandidates.slice(0, 3).map((item) => ({
    lift: item.lift,
    totalScore: item.total,
    isCurrent: item.lift === mainLift,
    rejectionReason: getRejectionReason(item.lift, item),
  }));

  const lastLog = sortedLogs[0];
  const lastWorkoutDate = lastLog ? lastLog.date : todayStr;

  return {
    mainLift,
    pendingRecommendation: activePending,
    reasons: uniqueReasons,
    representativeExercises: REP_EXERCISES_MAP[mainLift],
    date: recDateStr,
    friendlyDate: getFriendlyRecommendationDate(todayStr),
    actionChecklist: ACTION_CHECKLIST_MAP[mainLift],
    executionInfo: getExecutionInfo(mainLift, projectedNextLift, lastWorkoutDate),
    oneLineReason: getOneLineReason(mainLift),
    allScores: filteredScores,
    topCandidates
  };
}

