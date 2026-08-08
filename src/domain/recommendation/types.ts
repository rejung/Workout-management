/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../types';

export type MainLift = '벤치프레스' | 'OHP' | '데드리프트' | '바벨 로우' | '스쿼트' | '러닝' | '휴식';
export type FourMainLift = '스쿼트' | '벤치프레스' | '데드리프트' | 'OHP';
export type LiftCategory = 'Push' | 'Pull' | 'Legs' | 'Cardio' | 'Rest';

export interface PendingRecommendation {
  lift: MainLift;
  recommendedDate: string;
  status: 'pending' | 'completed';
  overdueDays: number;
}

export interface RecentSessionInfo {
  date: string | null;
  mainLift: MainLift | null;
  category: LiftCategory | null;
  daysAgo: number | null;
  log: WorkoutLog | null;
}

export interface LiftRecencyInfo {
  lastDate: string | null;
  daysAgo: number;
}

export interface CategoryRecencyInfo {
  lastDate: string | null;
  daysAgo: number;
  countLast7Days: number;
  countLast28Days: number;
}

export interface TrainingStreakInfo {
  consecutiveDays: number;
  countLast7Days: number;
  countLast28Days: number;
}

export interface FourMainLiftRotationState {
  lastDateMap: Record<FourMainLift, string | null>;
  daysAgoMap: Record<FourMainLift, number>;
  oldestLift: FourMainLift;
  mostRecentLift: FourMainLift | null;
  recentOrder: FourMainLift[];
  cycleCompleter: FourMainLift | null;
}

export interface TrainingState {
  todayStr: string;
  hasWorkedOutToday: boolean;
  recentSession: RecentSessionInfo;
  liftRecency: Record<MainLift, LiftRecencyInfo>;
  daysSinceLastMap: Record<MainLift, number>;
  categoryRecency: Record<'Push' | 'Pull' | 'Legs' | 'Cardio', CategoryRecencyInfo>;
  categoryCounts28Days: Record<'Push' | 'Pull' | 'Legs' | 'Cardio', number>;
  rotationState: FourMainLiftRotationState;
  trainingStreak: TrainingStreakInfo;
  sortedLogs: WorkoutLog[];
}
