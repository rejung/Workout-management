/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationSnapshot, WorkoutLog, Routine, Exercise, SnapshotWeightLog, SnapshotStatistics, BackupSummary } from '../types';
import { GoalSettings } from '../types/goal';
import { goalRepository } from '../storage/goalRepository';
import { 
  CURRENT_SNAPSHOT_VERSION, 
  CURRENT_SCHEMA_VERSION, 
  SNAPSHOT_APP_NAME, 
  SNAPSHOT_TYPE,
  EXPORT_FILENAME_PREFIX 
} from '../constants';
import { validateSnapshotDeep, calculateSnapshotStatistics, formatBytes } from './snapshotValidator';

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

/**
 * Type Guard to check if an unknown object conforms to the ApplicationSnapshot structure.
 * (Requirement 6: Type Safety)
 */
export function isApplicationSnapshot(data: unknown): data is ApplicationSnapshot {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  const logs = Array.isArray(obj.workoutLogs) ? obj.workoutLogs : obj.logs;
  return typeof obj.version === 'string' && Array.isArray(logs);
}

export const snapshotService = {
  /**
   * 1. createSnapshot: Creates a complete application snapshot including workout logs, weight logs,
   * goal settings, routines, exercises, and snapshot metadata with statistics. (Requirement 1, 5, 9)
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
      workoutLogs: logs,
      weightLogs: weightLogs || [],
      goalSettings: goalSettings,
      logs: logs, // Legacy alias support
      routines: routines,
      exercises: exercises,
      routineSettings: {
        routines: routines,
        exercises: exercises
      }
    };
  },

  /**
   * 2. parseSnapshot: Safely parses raw string or returns object for snapshot processing. (Requirement 3, 5)
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
   * Ensures no partial or invalid import is allowed. (Requirement 1, 3, 4, 9)
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
   * 4. restoreSnapshot: Executes ALL-OR-NOTHING atomic restore from validated snapshot. (Requirement 4, 5, 9)
   * Also exported as importSnapshot for compatibility.
   */
  restoreSnapshot(
    snapshot: ApplicationSnapshot,
    onImportData: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs?: SnapshotWeightLog[]; goalSettings?: unknown }) => void,
    fallbackRoutines: Routine[],
    fallbackExercises: Exercise[]
  ): RestoreSummary {
    // Re-verify atomic integrity before invoking storage changes
    const validation = this.validateSnapshot(snapshot);
    if (!validation.isValid || !validation.snapshot) {
      throw new Error(`Atomic Import Aborted: ${validation.error}`);
    }

    const validData = validation.snapshot;
    const logsData = validData.workoutLogs || [];
    const weightLogsData = validData.weightLogs || [];
    const routinesData = validData.routines || fallbackRoutines;
    const exercisesData = validData.exercises || fallbackExercises;
    const goalSettingsData = validData.goalSettings || null;

    // ALL OR NOTHING execution via storage handler
    onImportData({
      logs: logsData,
      routines: routinesData,
      exercises: exercisesData,
      weightLogs: weightLogsData,
      goalSettings: goalSettingsData
    });

    return {
      logsCount: logsData.length,
      weightLogsCount: weightLogsData.length,
      hasGoalSettings: goalSettingsData !== null && typeof goalSettingsData === 'object',
      exportedAt: validData.exportedAt || validData.exportDate || null,
      version: validData.version || CURRENT_SNAPSHOT_VERSION,
      statistics: validation.statistics,
      healthScore: validation.healthScore,
      healthReasons: validation.healthReasons
    };
  },

  /**
   * Alias for restoreSnapshot
   */
  importSnapshot(
    snapshot: ApplicationSnapshot,
    onImportData: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs?: SnapshotWeightLog[]; goalSettings?: unknown }) => void,
    fallbackRoutines: Routine[],
    fallbackExercises: Exercise[]
  ): RestoreSummary {
    return this.restoreSnapshot(snapshot, onImportData, fallbackRoutines, fallbackExercises);
  },

  /**
   * 5. exportSnapshot: Exports snapshot object to JSON file download with Integrity Check and returns BackupSummary. (Requirement 2, 5, 6, 8, 9)
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

