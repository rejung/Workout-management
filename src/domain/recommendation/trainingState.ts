/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../types';
import { getLocalDateString } from '../../utils/dateUtils';
import { getLast7DaysRange, getLast28DaysRange } from '../../utils/dateRange';
import {
  MainLift,
  FourMainLift,
  LiftCategory,
  RecentSessionInfo,
  LiftRecencyInfo,
  CategoryRecencyInfo,
  FourMainLiftRotationState,
  TrainingStreakInfo,
  TrainingState,
} from './types';

export const LIFT_TO_CATEGORY: Record<MainLift, LiftCategory> = {
  '벤치프레스': 'Push',
  'OHP': 'Push',
  '데드리프트': 'Pull',
  '바벨 로우': 'Pull',
  '스쿼트': 'Legs',
  '러닝': 'Cardio',
  '휴식': 'Rest',
};

/**
 * Helper to identify the main lift of a workout log based on exercises and routine metadata
 */
export function getMainLiftOfLog(log: WorkoutLog): MainLift | null {
  const routineId = log.routineId || '';
  const rName = (log.routineName || '').toLowerCase();
  if (routineId === 'routine-bench-press' || rName.includes('bench') || rName.includes('벤치프레스')) return '벤치프레스';
  if (routineId === 'routine-ohp' || rName.includes('ohp') || rName.includes('오버헤드 프레스')) return 'OHP';
  if (routineId === 'routine-deadlift' || rName.includes('dead') || rName.includes('데드리프트')) return '데드리프트';
  if (routineId === 'routine-barbell-row' || rName.includes('barbell row') || rName.includes('바벨 로우') || rName.includes('바벨로우')) return '바벨 로우';
  if (routineId === 'routine-squat' || rName.includes('squat') || rName.includes('스쿼트')) return '스쿼트';
  if (routineId === 'routine-cardio' || rName.includes('run') || rName.includes('러닝') || rName.includes('유산소') || rName.includes('cardio') || rName.includes('트레드밀')) return '러닝';

  for (const ex of log.exercises) {
    const eName = ex.exerciseName.toLowerCase();
    if (eName.includes('bench') || eName.includes('벤치프레스')) return '벤치프레스';
    if (eName.includes('ohp') || eName.includes('오버헤드프레스') || eName.includes('오버헤드 프레스') || eName.includes('overhead press')) return 'OHP';
    if (eName.includes('dead') || eName.includes('데드리프트')) return '데드리프트';
    if (eName.includes('barbell row') || eName.includes('바벨 로우') || eName.includes('바벨로우')) return '바벨 로우';
    if (eName.includes('squat') || eName.includes('스쿼트')) return '스쿼트';
    if (ex.category === 'Cardio' || eName.includes('run') || eName.includes('러닝') || eName.includes('달리기') || eName.includes('treadmill') || eName.includes('트레드밀')) return '러닝';
  }
  return null;
}

/**
 * Compares two WorkoutLogs in descending chronological order (newest first).
 * Primary sort key: date (YYYY-MM-DD)
 * Secondary sort key: startTime (HH:MM)
 *
 * When date and startTime are identical or omitted, returns 0 to maintain stable array order
 * without inventing unverified chronological order from arbitrary UUIDs.
 */
export function compareWorkoutLogsChronologicalDesc(a: WorkoutLog, b: WorkoutLog): number {
  const dateDiff = b.date.localeCompare(a.date);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  const timeA = a.startTime || '';
  const timeB = b.startTime || '';
  const timeDiff = timeB.localeCompare(timeA);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return 0;
}

/**
 * Pure function to construct TrainingState as SSOT from WorkoutLog[]
 */
export function buildTrainingState(
  logs: WorkoutLog[],
  baseDateStr?: string
): TrainingState {
  const todayStr = baseDateStr || getLocalDateString();
  const sortedLogs = [...logs].sort(compareWorkoutLogsChronologicalDesc);

  const hasWorkedOutToday = sortedLogs.some(l => l.date === todayStr);

  // 1. Most Recent Session Info
  let recentSession: RecentSessionInfo = {
    date: null,
    mainLift: null,
    category: null,
    daysAgo: null,
    log: null,
  };

  const latestLog = sortedLogs[0];
  if (latestLog) {
    const mLift = getMainLiftOfLog(latestLog);
    const cat = mLift ? LIFT_TO_CATEGORY[mLift] : null;
    const diffDays = Math.max(
      0,
      Math.floor((new Date(todayStr).getTime() - new Date(latestLog.date).getTime()) / (1000 * 60 * 60 * 24))
    );
    recentSession = {
      date: latestLog.date,
      mainLift: mLift,
      category: cat,
      daysAgo: diffDays,
      log: latestLog,
    };
  }

  // 2. Lift Recency & daysSinceLastMap
  const allLifts: MainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP', '러닝', '휴식', '바벨 로우'];

  const liftRecency = {} as Record<MainLift, LiftRecencyInfo>;
  const daysSinceLastMap = {} as Record<MainLift, number>;

  allLifts.forEach(lift => {
    if (lift !== '휴식') {
      const foundLog = sortedLogs.find(l => getMainLiftOfLog(l) === lift);
      if (foundLog) {
        const diffDays = Math.max(
          0,
          Math.floor((new Date(todayStr).getTime() - new Date(foundLog.date).getTime()) / (1000 * 60 * 60 * 24))
        );
        liftRecency[lift] = { lastDate: foundLog.date, daysAgo: diffDays };
        daysSinceLastMap[lift] = diffDays;
      } else {
        liftRecency[lift] = { lastDate: null, daysAgo: 30 };
        daysSinceLastMap[lift] = 30;
      }
    }
  });

  // Consecutive training days calculation
  let consecutiveTrainingDays = 0;
  const checkDate = new Date(todayStr);
  if (!hasWorkedOutToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (true) {
    const dStr = checkDate.toISOString().slice(0, 10);
    const trained = sortedLogs.some(l => l.date === dStr);
    if (trained) {
      consecutiveTrainingDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  liftRecency['휴식'] = {
    lastDate: recentSession.date,
    daysAgo: consecutiveTrainingDays,
  };
  daysSinceLastMap['휴식'] = consecutiveTrainingDays;

  // 3. Category Recency & 7d / 28d Counts
  const { startDateStr: sevenDaysAgoStr } = getLast7DaysRange(todayStr);
  const { startDateStr: fourWeeksAgoStr } = getLast28DaysRange(todayStr);

  const last7DaysLogs = sortedLogs.filter(l => l.date >= sevenDaysAgoStr && l.date <= todayStr);
  const last28DaysLogs = sortedLogs.filter(l => l.date >= fourWeeksAgoStr && l.date <= todayStr);

  const categories: ('Push' | 'Pull' | 'Legs' | 'Cardio')[] = ['Push', 'Pull', 'Legs', 'Cardio'];

  const categoryCounts28Days: Record<'Push' | 'Pull' | 'Legs' | 'Cardio', number> = {
    Push: 0,
    Pull: 0,
    Legs: 0,
    Cardio: 0,
  };

  last28DaysLogs.forEach(l => {
    const ml = getMainLiftOfLog(l);
    if (ml) {
      const cat = LIFT_TO_CATEGORY[ml];
      if (cat in categoryCounts28Days) {
        categoryCounts28Days[cat as keyof typeof categoryCounts28Days]++;
      }
    }
  });

  const categoryRecency = {} as Record<'Push' | 'Pull' | 'Legs' | 'Cardio', CategoryRecencyInfo>;

  categories.forEach(cat => {
    const foundLog = sortedLogs.find(l => {
      const ml = getMainLiftOfLog(l);
      return ml ? LIFT_TO_CATEGORY[ml] === cat : false;
    });

    const count7 = last7DaysLogs.filter(l => {
      const ml = getMainLiftOfLog(l);
      return ml ? LIFT_TO_CATEGORY[ml] === cat : false;
    }).length;

    const count28 = categoryCounts28Days[cat];

    if (foundLog) {
      const diffDays = Math.max(
        0,
        Math.floor((new Date(todayStr).getTime() - new Date(foundLog.date).getTime()) / (1000 * 60 * 60 * 24))
      );
      categoryRecency[cat] = {
        lastDate: foundLog.date,
        daysAgo: diffDays,
        countLast7Days: count7,
        countLast28Days: count28,
      };
    } else {
      categoryRecency[cat] = {
        lastDate: null,
        daysAgo: 30,
        countLast7Days: 0,
        countLast28Days: 0,
      };
    }
  });

  // 4. 4-Main-Lift Rotation State (Derived from WorkoutLog SSOT)
  const fourMainLifts: FourMainLift[] = ['스쿼트', '벤치프레스', '데드리프트', 'OHP'];
  const lastDateMap = {} as Record<FourMainLift, string | null>;
  const daysAgoMap = {} as Record<FourMainLift, number>;

  fourMainLifts.forEach(lift => {
    const foundLog = sortedLogs.find(l => getMainLiftOfLog(l) === lift);
    if (foundLog) {
      const diffDays = Math.max(
        0,
        Math.floor((new Date(todayStr).getTime() - new Date(foundLog.date).getTime()) / (1000 * 60 * 60 * 24))
      );
      lastDateMap[lift] = foundLog.date;
      daysAgoMap[lift] = diffDays;
    } else {
      lastDateMap[lift] = null;
      daysAgoMap[lift] = 99; // Never performed or long ago
    }
  });

  const sortedByOldest = [...fourMainLifts].sort((a, b) => daysAgoMap[b] - daysAgoMap[a]);
  const oldestLift = sortedByOldest[0];

  const recentOrder: FourMainLift[] = [];
  sortedLogs.forEach(l => {
    const ml = getMainLiftOfLog(l);
    if (ml && (ml === '스쿼트' || ml === '벤치프레스' || ml === '데드리프트' || ml === 'OHP')) {
      if (!recentOrder.includes(ml)) {
        recentOrder.push(ml);
      }
    }
  });

  const mostRecentLift = recentOrder[0] || null;

  const missingCycleLifts = fourMainLifts.filter(l => !recentOrder.includes(l));
  const cycleCompleter = missingCycleLifts.length === 1 ? missingCycleLifts[0] : (sortedByOldest[0] || null);

  const rotationState: FourMainLiftRotationState = {
    lastDateMap,
    daysAgoMap,
    oldestLift,
    mostRecentLift,
    recentOrder,
    cycleCompleter,
  };

  // 5. Training Streak
  const unique7Days = new Set(last7DaysLogs.map(l => l.date)).size;
  const unique28Days = new Set(last28DaysLogs.map(l => l.date)).size;

  const trainingStreak: TrainingStreakInfo = {
    consecutiveDays: consecutiveTrainingDays,
    countLast7Days: unique7Days,
    countLast28Days: unique28Days,
  };

  return {
    todayStr,
    hasWorkedOutToday,
    recentSession,
    liftRecency,
    daysSinceLastMap,
    categoryRecency,
    categoryCounts28Days,
    rotationState,
    trainingStreak,
    sortedLogs,
  };
}
