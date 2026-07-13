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
 * Rejects 2026-13-50, abc, 2026/07/04, etc.
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
  const logsArray = Array.isArray(obj.workoutLogs) ? obj.workoutLogs : (Array.isArray(obj.logs) ? obj.logs : null);
  const weightLogsArray = Array.isArray(obj.weightLogs) ? obj.weightLogs : [];

  const stats = calculateSnapshotStatistics(logsArray || [], weightLogsArray);

  if (!logsArray) {
    return {
      isValid: false,
      error: '필수 필드 누락/오류: "workoutLogs" (또는 "logs")는 반드시 배열(Array) 형식이어야 합니다.',
      healthScore: 0,
      healthReasons: ['치명적 오류: workoutLogs 누락 또는 배열 아님'],
      statistics: stats
    };
  }

  // Track duplicate IDs
  const workoutLogIds = new Set<string>();
  const weightLogIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const setIds = new Set<string>();

  let hasDeepError = false;
  let firstErrorMessage: string | null = null;
  let weightLogErrorsCount = 0;
  let hasDuplicate = false;
  let duplicateReason: string | null = null;
  let hasDateError = false;

  // 1. Check WorkoutLogs Deep Validation & Duplicates & Dates
  for (let i = 0; i < logsArray.length; i++) {
    const log = logsArray[i] as Record<string, unknown>;
    if (!log || typeof log !== 'object') {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}]`;
      continue;
    }

    if (!log.id || typeof log.id !== 'string') {
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

    if (!log.exercises || !Array.isArray(log.exercises)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises`;
      continue;
    }

    for (let j = 0; j < log.exercises.length; j++) {
      const ex = log.exercises[j] as Record<string, unknown>;
      if (!ex || typeof ex !== 'object') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}]`;
        continue;
      }

      const exId = ex.exerciseId || ex.id;
      if (!exId || typeof exId !== 'string') {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].exerciseId`;
      }

      if (!ex.sets || !Array.isArray(ex.sets)) {
        hasDeepError = true;
        if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets`;
        continue;
      }

      for (let k = 0; k < ex.sets.length; k++) {
        const set = ex.sets[k] as Record<string, unknown>;
        if (!set || typeof set !== 'object') {
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

        if (set.weight !== undefined && typeof set.weight !== 'number') {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].weight`;
        }

        if (set.reps !== undefined && typeof set.reps !== 'number') {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid workoutLogs[${i}].exercises[${j}].sets[${k}].reps`;
        }
      }
    }
  }

  // 2. Check WeightLogs Deep Validation & Duplicates & Dates
  if (obj.weightLogs !== undefined && obj.weightLogs !== null) {
    if (!Array.isArray(obj.weightLogs)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = 'Invalid weightLogs: must be an array';
    } else {
      for (let i = 0; i < obj.weightLogs.length; i++) {
        const wLog = obj.weightLogs[i] as Record<string, unknown>;
        if (!wLog || typeof wLog !== 'object') {
          hasDeepError = true;
          weightLogErrorsCount++;
          if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}]`;
          continue;
        }

        if (!wLog.id || typeof wLog.id !== 'string') {
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

        if (typeof wLog.weight !== 'number' || isNaN(wLog.weight)) {
          hasDeepError = true;
          weightLogErrorsCount++;
          if (!firstErrorMessage) firstErrorMessage = `Invalid weightLogs[${i}].weight`;
        }
      }
    }
  }

  // 3. Check Global Exercises Catalog Duplicates
  const catalogExercises = Array.isArray(obj.exercises) 
    ? obj.exercises 
    : ((obj.routineSettings as Record<string, unknown>)?.exercises as unknown[] | undefined);
  if (Array.isArray(catalogExercises)) {
    for (let i = 0; i < catalogExercises.length; i++) {
      const ex = catalogExercises[i] as Record<string, unknown>;
      if (ex && typeof ex === 'object' && typeof ex.id === 'string') {
        if (exerciseIds.has(ex.id)) {
          hasDuplicate = true;
          duplicateReason = `Duplicate Exercise ID: ${ex.id}`;
          if (!firstErrorMessage) firstErrorMessage = duplicateReason;
        }
        exerciseIds.add(ex.id);
      }
    }
  }

  // 4. Check GoalSettings Deep Validation
  const goals = obj.goalSettings;
  if (goals !== undefined && goals !== null) {
    if (typeof goals !== 'object' || Array.isArray(goals)) {
      hasDeepError = true;
      if (!firstErrorMessage) firstErrorMessage = 'Invalid goalSettings';
    } else {
      const gObj = goals as Record<string, unknown>;
      const requiredGoalFields = ['weightGoal', 'benchGoal', 'ohpGoal', 'squatGoal', 'deadliftGoal'];
      for (const field of requiredGoalFields) {
        if (!(field in gObj) || (typeof gObj[field] !== 'number' && typeof gObj[field] !== 'string')) {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid goalSettings.${field}`;
          break;
        }
      }
      for (const key in gObj) {
        const val = gObj[key];
        if (val !== undefined && val !== null && typeof val !== 'number' && typeof val !== 'string' && typeof val !== 'boolean') {
          hasDeepError = true;
          if (!firstErrorMessage) firstErrorMessage = `Invalid goalSettings.${key}`;
          break;
        }
      }
    }
  }

  // 5. Metadata & Schema Version Health Checks
  const metadata = obj.metadata as Record<string, unknown> | undefined;
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
