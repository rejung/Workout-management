/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoalSettings } from './types/goal';

export type MuscleCategory = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core' | 'Cardio';

export type LogType = 'STANDARD' | 'BODYWEIGHT_REPS' | 'TIME_BASED' | 'CARDIO';

export interface Exercise {
  id: string;
  name: string;
  category: MuscleCategory;
  logType?: LogType;
  isCustom?: boolean;
  notes?: string;
  canonicalName?: string;
}

export interface SetRecord {
  id: string;
  weight: number; // in kg (default)
  reps: number;
  isWarmup?: boolean;
  timeSeconds?: number; // for TIME_BASED and CARDIO
  distanceKm?: number; // for CARDIO
}

export interface ExerciseSession {
  exerciseId: string;
  exerciseName: string;
  category: MuscleCategory;
  sets: SetRecord[];
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  routineId?: string;
  routineName?: string;
  notes: string;
  exercises: ExerciseSession[];
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    category: MuscleCategory;
    targetSetsCount: number;
  }[];
}

// Analytics and calculations interfaces
export interface DailyVolume {
  date: string;
  volume: number;
}

export interface OneRepMaxProgress {
  date: string;
  weight: number;
  reps: number;
  estimated1RM: number;
}

export interface CategoryVolume {
  category: MuscleCategory;
  setsCount: number;
  volume: number;
}

export interface SnapshotWeightLog {
  id: string;
  date: string;
  weight: number;
}

export interface SnapshotStatistics {
  workoutCount: number;
  exerciseCount: number;
  setCount: number;
  weightCount: number;
}

export interface ApplicationSnapshotMetadata {
  appName: string;
  snapshotType: 'application' | string;
  schemaVersion: number;
  statistics?: SnapshotStatistics;
  size?: string;
  healthScore?: number;
}

export interface BackupSummary {
  fileName: string;
  exportedAt: string | null;
  schemaVersion: number;
  workoutCount: number;
  weightCount: number;
  size: string;
  healthScore?: number;
}

// Application Snapshot structure for v1.0/v2.1 complete backup (Requirement 1, 6, 11, 17)
export interface ApplicationSnapshot {
  version: string;
  exportedAt?: string | null;
  exportDate?: string | null; // Legacy field support
  metadata?: ApplicationSnapshotMetadata;
  workoutLogs: WorkoutLog[];
  weightLogs: SnapshotWeightLog[];
  goalSettings?: GoalSettings | Record<string, unknown> | null;
  logs?: WorkoutLog[]; // Legacy alias support
  routines?: Routine[];
  exercises?: Exercise[];
  routineSettings?: {
    routines?: Routine[];
    exercises?: Exercise[];
    [key: string]: unknown;
  };
  appPreferences?: Record<string, unknown>;
  dashboardLayout?: Record<string, unknown>;
  customPrograms?: unknown[];
  userSettings?: Record<string, unknown>;
}
