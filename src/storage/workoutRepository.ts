/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog, Routine, Exercise } from '../types';
import { storage } from './storage';
import { DEFAULT_EXERCISES, DEFAULT_ROUTINES } from '../constants';
import { isMockWorkoutLogId } from '../constants/mockData';
import { applyV1CustomExerciseRemappingPatch } from '../utils/v1Migration';
import { applyCanonicalExerciseMigration } from '../domain/exerciseCanonicalDomain';

const LOGS_KEY = 'wms_logs';
const ROUTINES_KEY = 'wms_routines';
const EXERCISES_KEY = 'wms_exercises';

function getRawStorageItem(key: string): string | null {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage.getItem(key);
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
}

function setRawStorageItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(key, value);
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

export function isRemovedExerciseName(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().replace(/\s+/g, '');
  return (
    n.includes('행군') ||
    n.includes('강습') ||
    n.includes('탁구') ||
    n.includes('tabletennis') ||
    n.includes('pingpong')
  );
}

function guessLogType(name: string, category: string): 'STANDARD' | 'BODYWEIGHT_REPS' | 'TIME_BASED' | 'CARDIO' {
  const lowercaseName = name.toLowerCase();
  
  if (category === 'Cardio' || lowercaseName.includes('러닝') || lowercaseName.includes('런') || lowercaseName.includes('treadmill') || lowercaseName.includes('자전거') || lowercaseName.includes('사이클') || lowercaseName.includes('stationary bike') || lowercaseName.includes('달리기') || lowercaseName.includes('조깅')) {
    return 'CARDIO';
  }
  
  if (lowercaseName.includes('플랭크') || lowercaseName.includes('plank') || lowercaseName.includes('l-sit') || lowercaseName.includes('버티기') || lowercaseName.includes('홀드')) {
    return 'TIME_BASED';
  }
  
  if (lowercaseName.includes('풀업') || lowercaseName.includes('pullup') || lowercaseName.includes('pull-up') || lowercaseName.includes('턱걸이') || lowercaseName.includes('딥스') || lowercaseName.includes('dips') || lowercaseName.includes('푸쉬업') || lowercaseName.includes('푸시업') || lowercaseName.includes('pushup') || lowercaseName.includes('push-up') || lowercaseName.includes('친업') || lowercaseName.includes('chinup') || lowercaseName.includes('chin-up') || lowercaseName.includes('맨몸') || lowercaseName.includes('크런치') || lowercaseName.includes('crunch') || lowercaseName.includes('레그레이즈') || lowercaseName.includes('leg raise') || lowercaseName.includes('머슬업') || lowercaseName.includes('muscleup') || lowercaseName.includes('muscle-up')) {
    return 'BODYWEIGHT_REPS';
  }
  
  return 'STANDARD';
}

export const workoutRepository = {
  /**
   * Initializes the repository by running data migrations, template additions, 
   * and mock sanitization once. Keeps read getters pure and side-effect free.
   */
  initialize(): void {
    let logs = storage.getItem<WorkoutLog[]>(LOGS_KEY);
    if (!logs || !Array.isArray(logs)) {
      logs = [];
      storage.setItem(LOGS_KEY, logs);
    }

    let logsChanged = false;

    // 1. Restore exact dates for v1-migrated logs timezone-safely
    const dateRestoredKeyV6 = 'wms_v1_logs_date_restored_v6';
    if (getRawStorageItem(dateRestoredKeyV6) !== 'true') {
      const hasShiftedLogs = logs.some(log => 
        log && log.id && typeof log.id === 'string' && log.id.startsWith('v1-log-') && log.date === '2026-06-27'
      );

      if (hasShiftedLogs) {
        const addOneDay = (dateStr: string): string => {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            const dateObj = new Date(y, m - 1, d);
            dateObj.setDate(dateObj.getDate() + 1);
            const ny = dateObj.getFullYear();
            const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const nd = String(dateObj.getDate()).padStart(2, '0');
            return `${ny}-${nm}-${nd}`;
          }
          return dateStr;
        };

        logs = logs.map(log => {
          if (log && log.id && typeof log.id === 'string' && log.id.startsWith('v1-log-')) {
            const match = log.id.match(/v1-log-(\d{4}-\d{2}-\d{2})/);
            if (match && match[1]) {
              const originalIdDate = match[1];
              const correctedDate = addOneDay(log.date);
              logsChanged = true;
              return {
                ...log,
                id: log.id.replace(originalIdDate, correctedDate),
                date: correctedDate
              };
            }
          }
          return log;
        });
      }
      setRawStorageItem(dateRestoredKeyV6, 'true');
    }

    // 2. Strict Mock Filtering (Only removes 'mock-' prefixed IDs, preserving user data/migration data/clone data)
    const filteredLogs = logs.filter(log => log && log.id && !isMockWorkoutLogId(log.id));
    if (filteredLogs.length !== logs.length) {
      logs = filteredLogs;
      logsChanged = true;
    }

    if (logsChanged) {
      logs.sort((a, b) => b.date.localeCompare(a.date));
      this.saveLogs(logs);
    }

    // 3. Ensure routines are loaded and preserved
    const routinesRestoredKeyV8 = 'wms_routines_v8_restored';
    const rawRoutines = getRawStorageItem(ROUTINES_KEY);

    let routines: Routine[];
    if (rawRoutines === null) {
      // Fresh state without existing key -> initialize with DEFAULT_ROUTINES
      routines = DEFAULT_ROUTINES;
      storage.setItem(ROUTINES_KEY, DEFAULT_ROUTINES);
      setRawStorageItem(routinesRestoredKeyV8, 'true');
    } else {
      // Existing key -> strictly parse JSON and validate array structure
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawRoutines);
      } catch (err: any) {
        throw new Error(`Failed to parse routines from storage ("${ROUTINES_KEY}"): ${err.message || err}`);
      }

      if (!Array.isArray(parsed)) {
        throw new Error(`Invalid routines data in storage ("${ROUTINES_KEY}"): expected JSON array, received ${typeof parsed}`);
      }

      // Valid array (including [] and custom routines): preserve as-is
      routines = parsed as Routine[];
      setRawStorageItem(routinesRestoredKeyV8, 'true');
    }

    // 4. Ensure all default exercises (including the custom ones added for the restored routines) are present and fully normalized in localStorage
    let exercises = storage.getItem<Exercise[]>(EXERCISES_KEY);
    let exercisesChanged = false;

    if (!exercises || !Array.isArray(exercises)) {
      exercises = DEFAULT_EXERCISES.filter(ex => !isRemovedExerciseName(ex.name) && !isRemovedExerciseName(ex.id));
      exercisesChanged = true;
    }

    // Filter out removed exercises if present in stored array
    const beforeLen = exercises.length;
    exercises = exercises.filter(ex => !isRemovedExerciseName(ex.name) && !isRemovedExerciseName(ex.id));
    if (exercises.length !== beforeLen) {
      exercisesChanged = true;
    }

    // Map existing exercises to make sure they have a correct logType, category, and canonicalName
    exercises = exercises.map(ex => {
      const def = DEFAULT_EXERCISES.find(d => d.id === ex.id || d.name === ex.name);
      const guessed = def?.logType || guessLogType(ex.name, ex.category);
      
      let category = ex.category;
      const lowerName = ex.name.toLowerCase();
      if (lowerName.includes('풀다운') || lowerName.includes('pulldown') || lowerName.includes('랫풀') || lowerName.includes('렛풀') || lowerName.includes('lat pull')) {
        category = 'Back';
      } else if (def && def.category && ex.category !== def.category) {
        category = def.category;
      }

      let logType = ex.logType;
      if (!logType) {
        logType = guessed;
        exercisesChanged = true;
      }
      
      let canonicalName = ex.canonicalName;
      if (def && def.canonicalName && !canonicalName) {
        canonicalName = def.canonicalName;
        exercisesChanged = true;
      }

      let equipment = ex.equipment;
      if (def && def.equipment && !equipment) {
        equipment = def.equipment;
        exercisesChanged = true;
      }

      const updatedEx = {
        ...ex,
        category,
        logType,
        canonicalName,
        equipment,
      };

      if (
        updatedEx.category !== ex.category ||
        updatedEx.logType !== ex.logType ||
        updatedEx.canonicalName !== ex.canonicalName ||
        updatedEx.equipment !== ex.equipment
      ) {
        exercisesChanged = true;
      }

      return updatedEx;
    });

    // Ensure all required default exercises exist
    DEFAULT_EXERCISES.forEach(req => {
      if (!isRemovedExerciseName(req.name) && !isRemovedExerciseName(req.id)) {
        if (!exercises!.some(ex => ex.id === req.id || ex.name === req.name)) {
          exercises!.push(req);
          exercisesChanged = true;
        }
      }
    });

    if (exercisesChanged) {
      storage.setItem(EXERCISES_KEY, exercises);
    }

    // 5. One-time Legacy Custom Exercise Remapping Patch
    const v1RemappingPatchKey = 'wms_v1_custom_remapping_patch_applied_v1';
    if (getRawStorageItem(v1RemappingPatchKey) !== 'true') {
      const currentLogs = this.getLogs();
      const currentRoutines = this.getRoutines();
      const currentExercises = storage.getItem<Exercise[]>(EXERCISES_KEY) || [];

      const patchResult = applyV1CustomExerciseRemappingPatch(
        currentLogs,
        currentRoutines,
        currentExercises,
        DEFAULT_EXERCISES
      );

      if (patchResult.patchedCount > 0) {
        this.saveLogs(patchResult.updatedLogs);
        this.saveRoutines(patchResult.updatedRoutines);
        this.saveExercises(patchResult.updatedExercises);
      }

      setRawStorageItem(v1RemappingPatchKey, 'true');
    }

    // 6. Canonical Exercise Merge Patch (Change Unit 1 - Groups 1 to 5)
    const canonicalMergePatchKey = 'wms_canonical_merge_cu1_applied_v1';
    if (getRawStorageItem(canonicalMergePatchKey) !== 'true') {
      const currentLogs = this.getLogs();
      const currentRoutines = this.getRoutines();
      const currentExercises = storage.getItem<Exercise[]>(EXERCISES_KEY) || [];

      const migrationResult = applyCanonicalExerciseMigration(
        currentLogs,
        currentRoutines,
        currentExercises,
        DEFAULT_EXERCISES
      );

      this.saveLogs(migrationResult.updatedLogs);
      this.saveRoutines(migrationResult.updatedRoutines);
      this.saveExercises(migrationResult.updatedExercises);

      setRawStorageItem(canonicalMergePatchKey, 'true');
    }
  },

  /**
   * Fetches all workout logs. If empty, seeds with empty array.
   * Keeps read logic pure and free of side-effects/mutations.
   */
  getLogs(): WorkoutLog[] {
    const logs = storage.getItem<WorkoutLog[]>(LOGS_KEY);
    if (logs && Array.isArray(logs)) {
      return logs;
    }
    return [];
  },

  /**
   * Saves/overwrites all workout logs.
   */
  saveLogs(logs: WorkoutLog[]): void {
    storage.setItem(LOGS_KEY, logs);
  },

  /**
   * Adds or updates a single workout log.
   */
  saveLog(log: WorkoutLog): WorkoutLog[] {
    const logs = this.getLogs();
    const index = logs.findIndex(l => l.id === log.id);
    let updated: WorkoutLog[];
    if (index >= 0) {
      updated = logs.map(l => l.id === log.id ? log : l);
    } else {
      updated = [log, ...logs];
    }
    // Sort chronological descending
    updated.sort((a, b) => b.date.localeCompare(a.date));
    this.saveLogs(updated);
    return updated;
  },

  /**
   * Deletes a single workout log.
   */
  deleteLog(id: string): WorkoutLog[] {
    const logs = this.getLogs();
    const updated = logs.filter(l => l.id !== id);
    this.saveLogs(updated);
    return updated;
  },

  /**
   * Fetches all division routine templates. If key does not exist, returns default routines.
   * Pure reader with no side-effects or inline database updates.
   */
  getRoutines(): Routine[] {
    const rawRoutines = getRawStorageItem(ROUTINES_KEY);
    if (rawRoutines === null) {
      return DEFAULT_ROUTINES;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawRoutines);
    } catch (err: any) {
      throw new Error(`Failed to parse routines from storage ("${ROUTINES_KEY}"): ${err.message || err}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid routines data in storage ("${ROUTINES_KEY}"): expected JSON array, received ${typeof parsed}`);
    }
    return parsed as Routine[];
  },

  /**
   * Saves/overwrites all routines.
   */
  saveRoutines(routines: Routine[]): void {
    storage.setItem(ROUTINES_KEY, routines);
  },

  /**
   * Adds a routine template.
   */
  addRoutine(routine: Routine): Routine[] {
    const routines = this.getRoutines();
    const updated = [routine, ...routines];
    this.saveRoutines(updated);
    return updated;
  },

  /**
   * Updates an existing routine template.
   */
  updateRoutine(routine: Routine): Routine[] {
    const routines = this.getRoutines();
    const updated = routines.map(r => r.id === routine.id ? routine : r);
    this.saveRoutines(updated);
    return updated;
  },

  /**
   * Deletes a routine template.
   */
  deleteRoutine(id: string): Routine[] {
    const routines = this.getRoutines();
    const updated = routines.filter(r => r.id !== id);
    this.saveRoutines(updated);
    return updated;
  },

  /**
   * Fetches all exercises. If empty, seeds with default exercises.
   * Pure reader with no side-effects or inline database updates.
   */
  getExercises(): Exercise[] {
    const exercises = storage.getItem<Exercise[]>(EXERCISES_KEY);
    if (exercises && Array.isArray(exercises)) {
      return exercises.filter(ex => !isRemovedExerciseName(ex.name) && !isRemovedExerciseName(ex.id));
    }
    return DEFAULT_EXERCISES.filter(ex => !isRemovedExerciseName(ex.name) && !isRemovedExerciseName(ex.id));
  },

  /**
   * Saves/overwrites all exercises.
   */
  saveExercises(exercises: Exercise[]): void {
    const cleaned = exercises.filter(ex => !isRemovedExerciseName(ex.name) && !isRemovedExerciseName(ex.id));
    storage.setItem(EXERCISES_KEY, cleaned);
  },

  /**
   * Adds an exercise.
   */
  addExercise(exercise: Exercise): Exercise[] {
    if (isRemovedExerciseName(exercise.name) || isRemovedExerciseName(exercise.id)) {
      return this.getExercises();
    }
    const exercises = this.getExercises();
    const updated = [exercise, ...exercises];
    this.saveExercises(updated);
    return updated;
  },

  /**
   * Deletes an exercise.
   */
  deleteExercise(id: string): Exercise[] {
    const exercises = this.getExercises();
    const updated = exercises.filter(e => e.id !== id);
    this.saveExercises(updated);
    return updated;
  },

  /**
   * Deletes all workout-related keys.
   */
  clearAll(): void {
    storage.removeItem(LOGS_KEY);
    storage.removeItem(ROUTINES_KEY);
    storage.removeItem(EXERCISES_KEY);
  }
};
