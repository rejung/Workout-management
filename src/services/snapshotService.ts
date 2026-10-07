/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationSnapshot, WorkoutLog, Routine, Exercise, SnapshotWeightLog, SnapshotStatistics, BackupSummary } from '../types';
import { GoalSettings } from '../types/goal';
import { goalRepository } from '../storage/goalRepository';
import { workoutRepository } from '../storage/workoutRepository';
import { weightRepository } from '../storage/weightRepository';
import { 
  CURRENT_SNAPSHOT_VERSION, 
  CURRENT_SCHEMA_VERSION, 
  SNAPSHOT_APP_NAME, 
  SNAPSHOT_TYPE, 
  EXPORT_FILENAME_PREFIX,
  DEFAULT_EXERCISES
} from '../constants';
import { validateSnapshotDeep, calculateSnapshotStatistics, formatBytes } from './snapshotValidator';
import { WeightLog } from '../utils/workoutEngine';
import { applyCanonicalExerciseMigration } from '../domain/exerciseCanonicalDomain';

export interface SnapshotValidationResult {
  isValid: boolean;
  error: string | null;
  snapshot: ApplicationSnapshot | null;
  healthScore: number;
  healthReasons: string[];
  statistics: SnapshotStatistics;
}

export interface RestoreSummary {
  logsCount: number;
  weightLogsCount: number;
  hasGoalSettings: boolean;
  exportedAt: string | null;
  version: string;
  statistics: SnapshotStatistics;
  healthScore: number;
  healthReasons: string[];
}

export interface StorageStateSnapshot {
  logs: WorkoutLog[];
  routines: Routine[];
  exercises: Exercise[];
  weightLogs: WeightLog[];
  goalSettings: GoalSettings;
}

/**
 * Custom Error class representing an Atomic Restore failure, preserving
 * the original cause and any rollback failure error.
 */
export class AtomicRestoreError extends Error {
  cause: Error;
  rollbackError: Error | null;

  constructor(message: string, cause: Error, rollbackError: Error | null = null) {
    super(message);
    this.name = 'AtomicRestoreError';
    this.cause = cause;
    this.rollbackError = rollbackError;
    Object.setPrototypeOf(this, AtomicRestoreError.prototype);
  }
}

function deepClone<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

/**
 * Type Guard to check if an unknown object conforms to the ApplicationSnapshot structure.
 */
export function isApplicationSnapshot(data: unknown): data is ApplicationSnapshot {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  const logs = Array.isArray(obj.workoutLogs) ? obj.workoutLogs : obj.logs;
  return typeof obj.version === 'string' && Array.isArray(logs);
}

export const snapshotService = {
  /**
   * Captures the complete pre-restore state of all application storage targets.
   */
  captureCurrentStorageState(): StorageStateSnapshot {
    return {
      logs: deepClone(workoutRepository.getLogs()),
      routines: deepClone(workoutRepository.getRoutines()),
      exercises: deepClone(workoutRepository.getExercises()),
      weightLogs: deepClone(weightRepository.getWeightLogs()),
      goalSettings: deepClone(goalRepository.getGoalSettings())
    };
  },

  /**
   * Replaces storage state across all 5 targets with the provided snapshot.
   */
  applyStorageState(state: StorageStateSnapshot): void {
    workoutRepository.saveLogs(state.logs);
    workoutRepository.saveRoutines(state.routines);
    workoutRepository.saveExercises(state.exercises);
    weightRepository.saveWeightLogs(state.weightLogs);
    goalRepository.saveGoalSettings(state.goalSettings);
  },

  /**
   * Verifies that storage collections match the expected restored snapshot data.
   */
  verifyStorageState(expected: {
    logs: WorkoutLog[];
    routines: Routine[];
    exercises: Exercise[];
    weightLogs: SnapshotWeightLog[];
    goalSettings?: unknown;
  }): void {
    const actualLogs = workoutRepository.getLogs();
    if (actualLogs.length !== expected.logs.length) {
      throw new Error(`Verification failed: workoutLogs count mismatch (expected ${expected.logs.length}, got ${actualLogs.length})`);
    }
    for (let i = 0; i < expected.logs.length; i++) {
      if (actualLogs[i].id !== expected.logs[i].id || actualLogs[i].date !== expected.logs[i].date) {
        throw new Error(`Verification failed: workoutLogs[${i}] mismatch (expected id ${expected.logs[i].id}, got ${actualLogs[i].id})`);
      }
    }

    const actualRoutines = workoutRepository.getRoutines();
    if (actualRoutines.length !== expected.routines.length) {
      throw new Error(`Verification failed: routines count mismatch (expected ${expected.routines.length}, got ${actualRoutines.length})`);
    }

    const actualExercises = workoutRepository.getExercises();
    if (actualExercises.length !== expected.exercises.length) {
      throw new Error(`Verification failed: exercises count mismatch (expected ${expected.exercises.length}, got ${actualExercises.length})`);
    }

    const actualWeightLogs = weightRepository.getWeightLogs();
    if (actualWeightLogs.length !== expected.weightLogs.length) {
      throw new Error(`Verification failed: weightLogs count mismatch (expected ${expected.weightLogs.length}, got ${actualWeightLogs.length})`);
    }
    for (let i = 0; i < expected.weightLogs.length; i++) {
      if (actualWeightLogs[i].id !== expected.weightLogs[i].id || actualWeightLogs[i].weight !== expected.weightLogs[i].weight) {
        throw new Error(`Verification failed: weightLogs[${i}] mismatch`);
      }
    }

    if (expected.goalSettings && typeof expected.goalSettings === 'object') {
      const actualGoals = goalRepository.getGoalSettings();
      const expGoals = expected.goalSettings as Record<string, unknown>;
      const actualGoalsRecord = actualGoals as unknown as Record<string, unknown>;
      for (const k of Object.keys(expGoals)) {
        if (actualGoalsRecord[k] !== expGoals[k]) {
          throw new Error(`Verification failed: goalSettings.${k} mismatch`);
        }
      }
    }
  },

  /**
   * 1. createSnapshot: Creates a complete application snapshot including workout logs, weight logs,
   * goal settings, routines, exercises, and snapshot metadata with statistics.
   */
  createSnapshot(
    logs: WorkoutLog[],
    weightLogs: SnapshotWeightLog[],
    routines: Routine[],
    exercises: Exercise[]
  ): ApplicationSnapshot {
    const goalSettings: GoalSettings = goalRepository.getGoalSettings();
    const nowIso = new Date().toISOString();
    const stats = calculateSnapshotStatistics(logs, weightLogs || []);

    return {
      version: CURRENT_SNAPSHOT_VERSION,
      exportedAt: nowIso,
      exportDate: nowIso, // Backward compatibility
      metadata: {
        appName: SNAPSHOT_APP_NAME,
        snapshotType: SNAPSHOT_TYPE,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        statistics: stats
      },
      workoutLogs: deepClone(logs),
      weightLogs: deepClone(weightLogs || []),
      goalSettings: deepClone(goalSettings),
      logs: deepClone(logs), // Legacy alias support
      routines: deepClone(routines),
      exercises: deepClone(exercises),
      routineSettings: {
        routines: deepClone(routines),
        exercises: deepClone(exercises)
      }
    };
  },

  /**
   * 2. parseSnapshot: Safely parses raw string or returns object for snapshot processing.
   */
  parseSnapshot(rawInput: unknown): Record<string, unknown> | null {
    if (typeof rawInput === 'string') {
      try {
        const parsed = JSON.parse(rawInput);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        return null;
      } catch (err) {
        return null;
      }
    } else if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      return rawInput as Record<string, unknown>;
    }
    return null;
  },

  /**
   * 3. validateSnapshot: Strictly validates an imported snapshot object or JSON string using deep validation.
   * Ensures no partial or invalid import is allowed.
   */
  validateSnapshot(rawInput: unknown): SnapshotValidationResult {
    let parsedInput = rawInput;
    if (typeof parsedInput === 'string') {
      try {
        parsedInput = JSON.parse(parsedInput);
      } catch (e) {
        return {
          isValid: false,
          error: 'JSON 파싱 실패: 백업 파일 형식이 손상되었거나 유효한 객체가 아닙니다.',
          snapshot: null,
          healthScore: 0,
          healthReasons: ['치명적 오류: JSON 객체 형식 아님'],
          statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
        };
      }
    }

    const deepRes = validateSnapshotDeep(parsedInput);
    if (!deepRes.isValid) {
      return {
        isValid: false,
        error: deepRes.error,
        snapshot: null,
        healthScore: deepRes.healthScore,
        healthReasons: deepRes.healthReasons,
        statistics: deepRes.statistics
      };
    }

    const data = parsedInput as Record<string, unknown>;
    const logsArray = (Array.isArray(data.workoutLogs) ? data.workoutLogs : (Array.isArray(data.logs) ? data.logs : [])) as WorkoutLog[];
    const weightLogsArray = (Array.isArray(data.weightLogs) ? data.weightLogs : []) as SnapshotWeightLog[];
    const goals = data.goalSettings as GoalSettings | null;
    const routines = (data.routines !== undefined ? data.routines : (data.routineSettings as Record<string, unknown>)?.routines) as Routine[] | undefined;
    const exercises = (Array.isArray(data.exercises) ? data.exercises : (data.routineSettings as Record<string, unknown>)?.exercises) as Exercise[] | undefined;

    // Schema Version & Migration hook
    const metadata = data.metadata as Record<string, unknown> | undefined;
    if (metadata && typeof metadata === 'object') {
      const schemaVer = metadata.schemaVersion;
      if (schemaVer !== undefined && schemaVer !== CURRENT_SCHEMA_VERSION) {
        console.warn(`[SnapshotService] Snapshot schema version (${schemaVer}) differs from current (${CURRENT_SCHEMA_VERSION}).`);
      }
    } else if (data.schemaVersion !== undefined && data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      console.warn(`[SnapshotService] Legacy root schema version differs from current.`);
    }

    const validatedSnapshot: ApplicationSnapshot = {
      version: typeof data.version === 'string' ? data.version : CURRENT_SNAPSHOT_VERSION,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : (typeof data.exportDate === 'string' ? data.exportDate : null),
      exportDate: typeof data.exportDate === 'string' ? data.exportDate : null,
      metadata: (data.metadata as ApplicationSnapshot['metadata']) || {
        appName: SNAPSHOT_APP_NAME,
        snapshotType: SNAPSHOT_TYPE,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        statistics: deepRes.statistics
      },
      workoutLogs: logsArray,
      weightLogs: weightLogsArray,
      goalSettings: goals,
      logs: logsArray,
      routines: routines,
      exercises: exercises,
      routineSettings: data.routineSettings as ApplicationSnapshot['routineSettings']
    };

    return {
      isValid: true,
      error: null,
      snapshot: validatedSnapshot,
      healthScore: deepRes.healthScore,
      healthReasons: deepRes.healthReasons,
      statistics: deepRes.statistics
    };
  },

  /**
   * 4. restoreSnapshot: Executes ALL-OR-NOTHING atomic restore from validated snapshot with
   * pre-restore state capture, strict repository writes, post-write verification,
   * and compensating rollback upon any failure.
   */
  restoreSnapshot(
    snapshot: ApplicationSnapshot | string | unknown,
    onImportData?: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs?: SnapshotWeightLog[]; goalSettings?: unknown }) => void,
    fallbackRoutines: Routine[] = [],
    fallbackExercises: Exercise[] = []
  ): RestoreSummary {
    // Step 1: Pre-execution deep validation (Rejects corrupt/invalid snapshot with write count = 0)
    const validation = this.validateSnapshot(snapshot);
    if (!validation.isValid || !validation.snapshot) {
      throw new Error(`Atomic Import Aborted: ${validation.error}`);
    }

    const validData = validation.snapshot;
    const rawLogsData = validData.workoutLogs || [];
    const weightLogsData = validData.weightLogs || [];
    const rawRoutinesData = validData.routines || fallbackRoutines;
    const rawExercisesData = validData.exercises || fallbackExercises;
    const goalSettingsData = validData.goalSettings || null;

    // Step 2: Apply Canonical Exercise Integration (Change Unit 1 - Groups 1 to 5)
    const migrationResult = applyCanonicalExerciseMigration(
      rawLogsData,
      rawRoutinesData,
      rawExercisesData,
      DEFAULT_EXERCISES
    );

    const logsData = migrationResult.updatedLogs;
    const routinesData = migrationResult.updatedRoutines;
    const exercisesData = migrationResult.updatedExercises;

    // Pre-save validation of transformed data & statistics recalculation
    const stats = calculateSnapshotStatistics(logsData, weightLogsData);
    const transformedSnapshot: ApplicationSnapshot = {
      ...validData,
      workoutLogs: logsData,
      logs: logsData,
      routines: routinesData,
      exercises: exercisesData,
      routineSettings: {
        routines: routinesData,
        exercises: exercisesData
      },
      metadata: {
        appName: validData.metadata?.appName || SNAPSHOT_APP_NAME,
        snapshotType: validData.metadata?.snapshotType || SNAPSHOT_TYPE,
        schemaVersion: validData.metadata?.schemaVersion || CURRENT_SCHEMA_VERSION,
        statistics: stats
      }
    };

    const postMigrationValidation = this.validateSnapshot(transformedSnapshot);
    if (!postMigrationValidation.isValid || !postMigrationValidation.snapshot) {
      throw new Error(`Atomic Import Aborted: ${postMigrationValidation.error || 'Canonical Migration Validation Failed'}`);
    }

    const finalStatistics = postMigrationValidation.statistics;
    const finalHealthScore = postMigrationValidation.healthScore;
    const finalHealthReasons = postMigrationValidation.healthReasons;

    // Step 3: Capture Pre-Restore State across all storage targets
    const preState = this.captureCurrentStorageState();

    // Step 4: Execute sequential writes with Post-Write Verification & Compensating Rollback
    try {
      workoutRepository.saveLogs(logsData);
      workoutRepository.saveRoutines(routinesData);
      workoutRepository.saveExercises(exercisesData);
      weightRepository.saveWeightLogs(weightLogsData as WeightLog[]);
      if (goalSettingsData && typeof goalSettingsData === 'object') {
        goalRepository.saveGoalSettings(goalSettingsData as GoalSettings);
      }

      // Step 5: Post-write storage integrity verification
      this.verifyStorageState({
        logs: logsData,
        routines: routinesData,
        exercises: exercisesData,
        weightLogs: weightLogsData,
        goalSettings: goalSettingsData
      });

      // Step 6: Notify UI/caller on verified success
      if (onImportData) {
        onImportData({
          logs: logsData,
          routines: routinesData,
          exercises: exercisesData,
          weightLogs: weightLogsData,
          goalSettings: goalSettingsData
        });
      }
    } catch (writeOrVerifyError: any) {
      const origErr = writeOrVerifyError instanceof Error 
        ? writeOrVerifyError 
        : new Error(String(writeOrVerifyError));

      let rollbackErr: Error | null = null;
      try {
        // Compensating Rollback: restore all storage repositories to pre-restore state
        this.applyStorageState(preState);
        if (onImportData) {
          onImportData({
            logs: preState.logs,
            routines: preState.routines,
            exercises: preState.exercises,
            weightLogs: preState.weightLogs,
            goalSettings: preState.goalSettings
          });
        }
      } catch (rbError: any) {
        rollbackErr = rbError instanceof Error ? rbError : new Error(String(rbError));
      }

      throw new AtomicRestoreError(
        `Atomic Restore Transaction Failed: ${origErr.message}`,
        origErr,
        rollbackErr
      );
    }

    return {
      logsCount: logsData.length,
      weightLogsCount: weightLogsData.length,
      hasGoalSettings: goalSettingsData !== null && typeof goalSettingsData === 'object',
      exportedAt: validData.exportedAt || validData.exportDate || null,
      version: validData.version || CURRENT_SNAPSHOT_VERSION,
      statistics: finalStatistics,
      healthScore: finalHealthScore,
      healthReasons: finalHealthReasons
    };
  },

  /**
   * Alias for restoreSnapshot
   */
  importSnapshot(
    snapshot: ApplicationSnapshot | string | unknown,
    onImportData?: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs?: SnapshotWeightLog[]; goalSettings?: unknown }) => void,
    fallbackRoutines: Routine[] = [],
    fallbackExercises: Exercise[] = []
  ): RestoreSummary {
    return this.restoreSnapshot(snapshot, onImportData, fallbackRoutines, fallbackExercises);
  },

  /**
   * 5. exportSnapshot: Exports snapshot object to JSON file download with Integrity Check and returns BackupSummary.
   */
  exportSnapshot(snapshot: ApplicationSnapshot, filenamePrefix: string = EXPORT_FILENAME_PREFIX): BackupSummary {
    const validation = this.validateSnapshot(snapshot);
    if (!validation.isValid) {
      throw new Error(`Snapshot Integrity Check Failed: ${validation.error}`);
    }

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(snapshot, null, 2)
    )}`;
    
    // Calculate byte size for summary
    const rawJson = JSON.stringify(snapshot, null, 2);
    const bytes = new Blob([rawJson]).size;
    const sizeStr = formatBytes(bytes);

    if (snapshot.metadata) {
      snapshot.metadata.size = sizeStr;
      snapshot.metadata.healthScore = validation.healthScore;
    }

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${filenamePrefix}_v${snapshot.version}_${dateStr}.json`;
    downloadAnchor.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    return {
      fileName,
      exportedAt: snapshot.exportedAt || null,
      schemaVersion: snapshot.metadata?.schemaVersion || CURRENT_SCHEMA_VERSION,
      workoutCount: validation.statistics.workoutCount,
      weightCount: validation.statistics.weightCount,
      size: sizeStr,
      healthScore: validation.healthScore
    };
  },

  /**
   * Alias for exportSnapshot
   */
  exportSnapshotToFile(snapshot: ApplicationSnapshot, filenamePrefix: string = EXPORT_FILENAME_PREFIX): BackupSummary {
    return this.exportSnapshot(snapshot, filenamePrefix);
  }
};

