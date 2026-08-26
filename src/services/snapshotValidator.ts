/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationSnapshot, WorkoutLog, SnapshotWeightLog, SnapshotStatistics } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../constants';

export interface DeepValidationResult {
  isValid: boolean;
  error: string | null;
  healthScore: number;
  healthReasons: string[];
  statistics: SnapshotStatistics;
}

/**
 * Strictly checks if a date string is in valid YYYY-MM-DD calendar format.
 * Rejects 2026-02-31, 2026-13-50, abc, 2026/07/04, etc.
 */
export function isValidYYYYMMDD(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Strictly checks if a time string is in valid HH:MM format (00:00 - 23:59).
 */
export function isValidHHMM(timeStr: unknown): boolean {
  if (typeof timeStr !== 'string') return false;
  const regex = /^([01]\d|2[0-3]):[0-5]\d$/;
  return regex.test(timeStr);
}

/**
 * Formats byte size into human-readable strings (e.g., "248 KB", "1.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${Math.round(bytes / k)} KB`;
  return `${(bytes / (k * k)).toFixed(1)} MB`;
}

/**
 * Computes Snapshot Statistics (Requirement 5)
 */
export function calculateSnapshotStatistics(
  workoutLogs: unknown[],
  weightLogs: unknown[]
): SnapshotStatistics {
  let exerciseCount = 0;
  let setCount = 0;

  if (Array.isArray(workoutLogs)) {
    workoutLogs.forEach((log: unknown) => {
      if (log && typeof log === 'object') {
        const exercises = (log as Record<string, unknown>).exercises;
        if (Array.isArray(exercises)) {
          exerciseCount += exercises.length;
          exercises.forEach((ex: unknown) => {
            if (ex && typeof ex === 'object') {
              const sets = (ex as Record<string, unknown>).sets;
              if (Array.isArray(sets)) {
                setCount += sets.length;
              }
            }
          });
        }
      }
    });
  }

  return {
    workoutCount: Array.isArray(workoutLogs) ? workoutLogs.length : 0,
    exerciseCount,
    setCount,
    weightCount: Array.isArray(weightLogs) ? weightLogs.length : 0
  };
}

/**
 * Deep validation & duplicate ID & health score engine (Requirements 1, 3, 4, 9)
 * Strictly verifies schema structure, types, non-negative numbers, calendar dates,
 * duplicate IDs, compatibility aliases, and metadata statistics consistency.
 * Guaranteed NOT to mutate the input object.
 */
export function validateSnapshotDeep(data: unknown): DeepValidationResult {
  const healthReasons: string[] = [];
  let score = 100;

  let parsedData = data;
  if (typeof parsedData === 'string') {
    try {
      parsedData = JSON.parse(parsedData);
    } catch (e) {
      return {
        isValid: false,
        error: 'JSON 파싱 실패: 백업 파일 형식이 손상되었거나 유효한 객체가 아닙니다.',
        healthScore: 0,
        healthReasons: ['치명적 오류: JSON 객체 형식 아님'],
        statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
      };
    }
  }

  if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
    return {
      isValid: false,
      error: 'JSON 파싱 실패: 백업 파일 형식이 손상되었거나 유효한 객체가 아닙니다.',
      healthScore: 0,
      healthReasons: ['치명적 오류: JSON 객체 형식 아님'],
      statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
    };
  }

  const obj = parsedData as Record<string, unknown>;

  // Check top-level version
  if (obj.version !== undefined && (typeof obj.version !== 'string' || obj.version.trim() === '')) {
    return {
      isValid: false,
      error: 'Invalid version: expected non-empty string',
      healthScore: 0,
      healthReasons: ['치명적 오류: version 형식 오류'],
      statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
    };
  }

  // Check top-level collections types
  if (obj.workoutLogs !== undefined && !Array.isArray(obj.workoutLogs)) {
    return {
      isValid: false,
      error: `Invalid workoutLogs: expected array, received ${typeof obj.workoutLogs}`,
      healthScore: 0,
      healthReasons: ['치명적 오류: workoutLogs 배열 아님'],
      statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
    };
  }

  if (obj.logs !== undefined && !Array.isArray(obj.logs)) {
    return {
      isValid: false,
      error: `Invalid logs: expected array, received ${typeof obj.logs}`,
      healthScore: 0,
      healthReasons: ['치명적 오류: logs 배열 아님'],
      statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
    };
  }

  if (obj.workoutLogs === undefined && obj.logs === undefined) {
    return {
      isValid: false,
      error: '필수 필드 누락/오류: "workoutLogs" (또는 "logs")는 반드시 배열(Array) 형식이어야 합니다.',
      healthScore: 0,
      healthReasons: ['치명적 오류: workoutLogs 누락 또는 배열 아님'],
      statistics: { workoutCount: 0, exerciseCount: 0, setCount: 0, weightCount: 0 }
    };
  }

  let hasDeepError = false;
  let firstErrorMessage: string | null = null;
  let weightLogErrorsCount = 0;
  let hasDuplicate = false;
  let duplicateReason: string | null = null;
  let hasDateError = false;

  // Compatibility contract: if both workoutLogs and logs exist, they must be semantically identical.
  // Never concatenate them.
  if (Array.isArray(obj.workoutLogs) && Array.isArray(obj.logs)) {
    if (obj.workoutLogs.length !== obj.logs.length) {
      hasDeepError = true;
      if (!firstErrorMessage) {
        firstErrorMessage = `Compatibility alias mismatch: "workoutLogs" (length ${obj.workoutLogs.length}) and "logs" (length ${obj.logs.length}) must have identical records.`;
      }
    } else {
      for (let i = 0; i < obj.workoutLogs.length; i++) {
        if (JSON.stringify(obj.workoutLogs[i]) !== JSON.stringify(obj.logs[i])) {
          hasDeepError = true;
          if (!firstErrorMessage) {
            firstErrorMessage = `Compatibility alias mismatch: "workoutLogs" and "logs" must be semantically identical when both are present (mismatch at index ${i}).`;
          }
          break;
        }
      }
    }
  }

  const logsArray = Array.isArray(obj.workoutLogs) ? obj.workoutLogs : (Array.isArray(obj.logs) ? obj.logs : []);
  const weightLogsArray = Array.isArray(obj.weightLogs) ? obj.weightLogs : [];

  const stats = calculateSnapshotStatistics(logsArray, weightLogsArray);

  // Validate weightLogs collection type
  if (obj.weightLogs !== undefined && obj.weightLogs !== null && !Array.isArray(obj.weightLogs)) {
    hasDeepError = true;
    if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs: expected array, received ${typeof obj.weightLogs}`;
  }

  // Validate routines collection type (M1)
  if (obj.routines !== undefined && obj.routines !== null && !Array.isArray(obj.routines)) {
    hasDeepError = true;
    if (!firstErrorMessage) firstErrorMessage = `Invalid routines: expected array, received ${typeof obj.routines}`;
  }

  // Validate routineSettings (M1)
  if (obj.routineSettings !== undefined && obj.routineSettings !== null) {
    if (typeof obj.routineSettings !== 'object' || Array.isArray(obj.routineSettings)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid routineSettings: expected object, received ${typeof obj.routineSettings}`;
    } else {
      const rs = obj.routineSettings as Record<string, unknown>;
      if (rs.routines !== undefined && rs.routines !== null && !Array.isArray(rs.routines)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid routineSettings.routines: expected array, received ${typeof rs.routines}`;
      }
      if (rs.exercises !== undefined && rs.exercises !== null && !Array.isArray(rs.exercises)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid routineSettings.exercises: expected array, received ${typeof rs.exercises}`;
      }
    }
  }

  // Validate exercises collection type
  if (obj.exercises !== undefined && obj.exercises !== null && !Array.isArray(obj.exercises)) {
    hasDeepError = true;
    if (!firstErrorMessage) firstErrorMessage = `Invalid exercises: expected array, received ${typeof obj.exercises}`;
  }

  // Track duplicate IDs
  const workoutLogIds = new Set<string>();
  const weightLogIds = new Set<string>();
  const routineIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const setIds = new Set<string>();

  // 1. Check WorkoutLogs Deep Validation & Duplicates & Dates & Nested Sets
  for (let i = 0; i < logsArray.length; i++) {
    const log = logsArray[i] as Record<string, unknown>;
    if (!log || typeof log !== 'object' || Array.isArray(log)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}]`;
      continue;
    }

    if (!log.id || typeof log.id !== 'string' || log.id.trim() === '') {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].id`;
      continue;
    }

    if (workoutLogIds.has(log.id)) {
      hasDuplicate = true;
      duplicateReason = `Duplicate WorkoutLog ID: ${log.id}`;
      if (!firstErrorMessage) firstErrorMessage = duplicateReason;
    }
    workoutLogIds.add(log.id);

    if (!isValidYYYYMMDD(log.date)) {
      hasDateError = true;
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].date: ${log.date}`;
    }

    if (log.startTime !== undefined && log.startTime !== null) {
      if (typeof log.startTime !== 'string' || !isValidHHMM(log.startTime)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].startTime: ${log.startTime}`;
      }
    }

    if (!log.exercises || !Array.isArray(log.exercises)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises: expected array`;
      continue;
    }

    for (let j = 0; j < log.exercises.length; j++) {
      const ex = log.exercises[j] as Record<string, unknown>;
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}]`;
        continue;
      }

      const exId = ex.exerciseId || ex.id;
      if (!exId || typeof exId !== 'string' || exId.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].exerciseId: required non-empty string`;
      }

      // Exercise required name validation (M3)
      const exName = ex.exerciseName || ex.name;
      if (!exName || typeof exName !== 'string' || exName.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].exerciseName: required non-empty string`;
      }

      // Exercise required category validation (M4)
      const cat = ex.category;
      if (!cat || typeof cat !== 'string' || cat.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].category: required non-empty string`;
      }

      if (!ex.sets || !Array.isArray(ex.sets)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets: expected array`;
        continue;
      }

      for (let k = 0; k < ex.sets.length; k++) {
        const set = ex.sets[k] as Record<string, unknown>;
        if (!set || typeof set !== 'object' || Array.isArray(set)) {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}]`;
          continue;
        }

        if (set.id && typeof set.id === 'string') {
          if (setIds.has(set.id)) {
            hasDuplicate = true;
            duplicateReason = `Duplicate Set ID: ${set.id}`;
            if (!firstErrorMessage) firstErrorMessage = duplicateReason;
          }
          setIds.add(set.id);
        }

        // Weight numeric contract (M8, M9, M10, M11): finite, non-negative, not NaN, not Infinity, not string
        if (set.weight !== undefined && set.weight !== null) {
          if (typeof set.weight !== 'number' || !Number.isFinite(set.weight) || Number.isNaN(set.weight) || set.weight < 0) {
            hasDeepError = true;
            if (!firstErrorMessage) {
              firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].weight: expected non-negative finite number, received ${typeof set.weight === 'string' ? `"${set.weight}"` : String(set.weight)}`;
            }
          }
        }

        // Reps numeric contract (M8, M9, M10, M11): finite, non-negative, not NaN, not Infinity, not string
        if (set.reps !== undefined && set.reps !== null) {
          if (typeof set.reps !== 'number' || !Number.isFinite(set.reps) || Number.isNaN(set.reps) || set.reps < 0) {
            hasDeepError = true;
            if (!firstErrorMessage) {
              firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].reps: expected non-negative finite number, received ${typeof set.reps === 'string' ? `"${set.reps}"` : String(set.reps)}`;
            }
          }
        }

        // timeSeconds numeric contract
        if (set.timeSeconds !== undefined && set.timeSeconds !== null) {
          if (typeof set.timeSeconds !== 'number' || !Number.isFinite(set.timeSeconds) || Number.isNaN(set.timeSeconds) || set.timeSeconds < 0) {
            hasDeepError = true;
            if (!firstErrorMessage) {
              firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].timeSeconds: expected non-negative finite number`;
            }
          }
        }

        // distanceKm numeric contract
        if (set.distanceKm !== undefined && set.distanceKm !== null) {
          if (typeof set.distanceKm !== 'number' || !Number.isFinite(set.distanceKm) || Number.isNaN(set.distanceKm) || set.distanceKm < 0) {
            hasDeepError = true;
            if (!firstErrorMessage) {
              firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].distanceKm: expected non-negative finite number`;
            }
          }
        }

        // isWarmup boolean contract
        if (set.isWarmup !== undefined && set.isWarmup !== null && typeof set.isWarmup !== 'boolean') {
          hasDeepError = true;
          if (!firstErrorMessage) {
            firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].isWarmup: expected boolean`;
          }
        }
      }
    }
  }

  // 2. Check WeightLogs Deep Validation & Duplicates & Dates & Numeric Value (M6, M10, M11)
  if (obj.weightLogs !== undefined && obj.weightLogs !== null && Array.isArray(obj.weightLogs)) {
    for (let i = 0; i < obj.weightLogs.length; i++) {
      const wLog = obj.weightLogs[i] as Record<string, unknown>;
      if (!wLog || typeof wLog !== 'object' || Array.isArray(wLog)) {
        hasDeepError = true;
        weightLogErrorsCount++;
        if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}]`;
        continue;
      }

      if (!wLog.id || typeof wLog.id !== 'string' || wLog.id.trim() === '') {
        hasDeepError = true;
        weightLogErrorsCount++;
        if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}].id`;
        continue;
      }

      if (weightLogIds.has(wLog.id)) {
        hasDuplicate = true;
        duplicateReason = `Duplicate WeightLog ID: ${wLog.id}`;
        if (!firstErrorMessage) firstErrorMessage = duplicateReason;
      }
      weightLogIds.add(wLog.id);

      if (!isValidYYYYMMDD(wLog.date)) {
        hasDateError = true;
        hasDeepError = true;
        weightLogErrorsCount++;
        if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}].date: ${wLog.date}`;
      }

      if (typeof wLog.weight !== 'number' || !Number.isFinite(wLog.weight) || Number.isNaN(wLog.weight) || wLog.weight <= 0) {
        hasDeepError = true;
        weightLogErrorsCount++;
        if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}].weight: expected positive finite number`;
      }
    }
  }

  // 3. Check Routines Deep Validation & Routine Exercises (M1, M14)
  const routineList = Array.isArray(obj.routines)
    ? obj.routines
    : ((obj.routineSettings as Record<string, unknown>)?.routines as unknown[] | undefined);
  if (Array.isArray(routineList)) {
    for (let i = 0; i < routineList.length; i++) {
      const r = routineList[i] as Record<string, unknown>;
      if (!r || typeof r !== 'object' || Array.isArray(r)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}]`;
        continue;
      }

      if (!r.id || typeof r.id !== 'string' || r.id.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].id`;
        continue;
      }

      if (routineIds.has(r.id)) {
        hasDuplicate = true;
        duplicateReason = `Duplicate Routine ID: ${r.id}`;
        if (!firstErrorMessage) firstErrorMessage = duplicateReason;
      }
      routineIds.add(r.id);

      if (!r.name || typeof r.name !== 'string' || r.name.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].name: required non-empty string`;
      }

      if (r.exercises !== undefined && r.exercises !== null) {
        if (!Array.isArray(r.exercises)) {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].exercises: expected array`;
        } else {
          for (let j = 0; j < r.exercises.length; j++) {
            const rEx = r.exercises[j] as Record<string, unknown>;
            if (!rEx || typeof rEx !== 'object' || Array.isArray(rEx)) {
              hasDeepError = true;
              if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].exercises[${j}]: expected object`;
              continue;
            }

            const rExId = rEx.exerciseId || rEx.id;
            if (!rExId || typeof rExId !== 'string' || rExId.trim() === '') {
              hasDeepError = true;
              if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].exercises[${j}].exerciseId: required non-empty string`;
            }

            if (rEx.targetSetsCount !== undefined && rEx.targetSetsCount !== null) {
              if (typeof rEx.targetSetsCount !== 'number' || !Number.isFinite(rEx.targetSetsCount) || Number.isNaN(rEx.targetSetsCount) || rEx.targetSetsCount < 0) {
                hasDeepError = true;
                if (!firstErrorMessage) firstErrorMessage = `Invalid routines[${i}].exercises[${j}].targetSetsCount: expected non-negative finite number`;
              }
            }
          }
        }
      }
    }
  }

  // 4. Check Global Exercises Catalog Duplicates & Types
  const catalogExercises = Array.isArray(obj.exercises) 
    ? obj.exercises 
    : ((obj.routineSettings as Record<string, unknown>)?.exercises as unknown[] | undefined);
  if (Array.isArray(catalogExercises)) {
    for (let i = 0; i < catalogExercises.length; i++) {
      const ex = catalogExercises[i] as Record<string, unknown>;
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid exercises[${i}]`;
        continue;
      }

      if (!ex.id || typeof ex.id !== 'string' || ex.id.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid exercises[${i}].id: required non-empty string`;
        continue;
      }

      if (exerciseIds.has(ex.id)) {
        hasDuplicate = true;
        duplicateReason = `Duplicate Exercise ID: ${ex.id}`;
        if (!firstErrorMessage) firstErrorMessage = duplicateReason;
      }
      exerciseIds.add(ex.id);

      if (!ex.name || typeof ex.name !== 'string' || ex.name.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid exercises[${i}].name: required non-empty string`;
      }

      if (!ex.category || typeof ex.category !== 'string' || ex.category.trim() === '') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid exercises[${i}].category: required non-empty string`;
      }

      if (ex.logType !== undefined && ex.logType !== null) {
        const allowedLogTypes = ['STANDARD', 'BODYWEIGHT_REPS', 'TIME_BASED', 'CARDIO'];
        if (typeof ex.logType !== 'string' || !allowedLogTypes.includes(ex.logType)) {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid exercises[${i}].logType: unsupported logType enum value`;
        }
      }
    }
  }

  // 5. Check GoalSettings Deep Validation (M2, M10, M11)
  const goals = obj.goalSettings;
  if (goals !== undefined && goals !== null) {
    if (typeof goals !== 'object' || Array.isArray(goals)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = 'Invalid goalSettings: expected object';
    } else {
      const gObj = goals as Record<string, unknown>;
      const numericGoalFields = ['weightGoal', 'benchGoal', 'ohpGoal', 'squatGoal', 'deadliftGoal'];
      for (const field of numericGoalFields) {
        if (field in gObj && gObj[field] !== undefined && gObj[field] !== null) {
          const val = gObj[field];
          if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
            hasDeepError = true;
            if (!firstErrorMessage) {
              firstErrorMessage = `Invalid goalSettings.${field}: expected finite number, received ${typeof val === 'string' ? `string "${val}"` : typeof val}`;
            }
            break;
          }
        }
      }
      for (const key in gObj) {
        const val = gObj[key];
        if (val !== undefined && val !== null) {
          if (typeof val === 'number') {
            if (!Number.isFinite(val) || Number.isNaN(val) || val < 0) {
              hasDeepError = true;
              if (!firstErrorMessage) firstErrorMessage = `Invalid goalSettings.${key}: expected non-negative finite number`;
              break;
            }
          } else if (typeof val === 'string') {
            if (numericGoalFields.includes(key)) {
              hasDeepError = true;
              if (!firstErrorMessage) firstErrorMessage = `Invalid goalSettings.${key}: expected finite number, received string "${val}"`;
              break;
            }
          } else if (typeof val !== 'boolean') {
            hasDeepError = true;
            if (!firstErrorMessage) firstErrorMessage = `Invalid goalSettings.${key}`;
            break;
          }
        }
      }
    }
  }

  // 6. Metadata Statistics Consistency (M12)
  const metadata = obj.metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const metaStats = metadata.statistics as Record<string, unknown> | undefined;
    if (metaStats && typeof metaStats === 'object' && !Array.isArray(metaStats)) {
      if (metaStats.workoutCount !== undefined && metaStats.workoutCount !== stats.workoutCount) {
        hasDeepError = true;
        if (!firstErrorMessage) {
          firstErrorMessage = `Metadata statistics mismatch: workoutCount expected ${stats.workoutCount}, received ${metaStats.workoutCount}`;
        }
      }
      if (metaStats.exerciseCount !== undefined && metaStats.exerciseCount !== stats.exerciseCount) {
        hasDeepError = true;
        if (!firstErrorMessage) {
          firstErrorMessage = `Metadata statistics mismatch: exerciseCount expected ${stats.exerciseCount}, received ${metaStats.exerciseCount}`;
        }
      }
      if (metaStats.setCount !== undefined && metaStats.setCount !== stats.setCount) {
        hasDeepError = true;
        if (!firstErrorMessage) {
          firstErrorMessage = `Metadata statistics mismatch: setCount expected ${stats.setCount}, received ${metaStats.setCount}`;
        }
      }
      if (metaStats.weightCount !== undefined && metaStats.weightCount !== stats.weightCount) {
        hasDeepError = true;
        if (!firstErrorMessage) {
          firstErrorMessage = `Metadata statistics mismatch: weightCount expected ${stats.weightCount}, received ${metaStats.weightCount}`;
        }
      }
    }
  }

  // 7. Metadata & Schema Version Health Checks
  const hasMetadata = metadata && typeof metadata === 'object' && typeof metadata.appName === 'string';
  const schemaVer = metadata?.schemaVersion !== undefined ? metadata.schemaVersion : obj.schemaVersion;
  const isSchemaLatest = schemaVer === CURRENT_SCHEMA_VERSION;

  // Calculate Health Score & Reasons (Requirement 9)
  if (hasDeepError) {
    score -= 30;
    if (weightLogErrorsCount > 0) {
      healthReasons.push(`WeightLog ${weightLogErrorsCount}개 오류`);
    } else if (firstErrorMessage && !firstErrorMessage.startsWith('Duplicate')) {
      healthReasons.push(`데이터 구조 오류 (${firstErrorMessage})`);
    } else {
      healthReasons.push('데이터 구조 오류 발견');
    }
  } else {
    healthReasons.push('✓ Validation 성공');
  }

  if (hasDuplicate) {
    score -= 20;
    healthReasons.push('Duplicate ID 발견');
  } else {
    healthReasons.push('✓ Duplicate 없음');
  }

  if (hasDateError) {
    score -= 20;
    healthReasons.push('날짜 형식 오류 발견');
  } else {
    healthReasons.push('✓ 날짜 형식 정상');
  }

  if (!hasMetadata) {
    score -= 15;
    healthReasons.push('Metadata 누락');
  } else {
    healthReasons.push('✓ Metadata 정상');
  }

  if (!isSchemaLatest) {
    score -= 15;
    healthReasons.push('Schema 최신 아님');
  } else {
    healthReasons.push('✓ Schema 최신');
  }

  const finalScore = Math.max(0, score);
  const isValid = !hasDeepError && !hasDuplicate && !hasDateError;

  return {
    isValid,
    error: isValid ? null : (firstErrorMessage || '데이터 무결성 검증 실패'),
    healthScore: finalScore,
    healthReasons,
    statistics: stats
  };
}

