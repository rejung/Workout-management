/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExerciseSession, SetRecord, WorkoutLog } from '../../../types';
import {
  CanonicalNormalizedExerciseSession,
  CanonicalNormalizedSet,
  CanonicalSetRole,
  CanonicalSetRoleEvidence,
  SetRoleEvidenceSource,
  SetRoleSourceConfidence,
} from '../types/setRole.types';
import { isRunningIdentifier } from './runningNormalization';

// Known non-running cardio keywords that identify cardio sessions
const OTHER_CARDIO_KEYWORDS = [
  'cycling',
  'cycle',
  'bike',
  '사이클',
  '자전거',
  'biking',
  'spin',
  'rowing',
  'row',
  '로잉',
  'ergometer',
  'swimming',
  'swim',
  '수영',
  'elliptical',
  'stairmaster',
  'stair-climber',
  '스텝퍼',
  '천국의계단',
  '유산소',
  'cardio',
];

/**
 * Pure predicate to determine whether an exercise or session belongs to the Cardio domain.
 */
export function isCardioExercise(
  exerciseName?: string,
  category?: string,
  logType?: string
): boolean {
  if (category === 'Cardio' || logType === 'CARDIO') {
    return true;
  }

  if (isRunningIdentifier(exerciseName)) {
    return true;
  }

  if (exerciseName && typeof exerciseName === 'string') {
    const lower = exerciseName.toLowerCase().trim();
    if (OTHER_CARDIO_KEYWORDS.some((kw) => lower.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes the warm-up / working-set role evidence of a single set record.
 * 
 * Strict Evidence Rules:
 * 1. Cardio sets: Not applicable to strength set roles (`applicableToStrength: false`, role: `'unknown-set-role'`, source: `'not-applicable-cardio'`, confidence: `'low'`).
 * 2. `isWarmup === true`: Explicit warm-up (`role: 'explicit-warmup'`, source: `'isWarmup-true'`, confidence: `'high'`).
 * 3. `isWarmup === false`: Explicit working-set (`role: 'explicit-working-set'`, source: `'isWarmup-false'`, confidence: `'high'`, representing stored boolean false evidence).
 * 4. `isWarmup` absent / `undefined` / `null`: Unknown role (`role: 'unknown-set-role'`, source: `'isWarmup-missing'`, confidence: `'low'`).
 * 5. Invalid runtime value (e.g. string, number, object): Unknown role (`role: 'unknown-set-role'`, source: `'isWarmup-invalid'`, confidence: `'low'`). Coercion is strictly forbidden.
 * 6. Progression patterns (e.g. 20kg -> 40kg -> 60kg) are NEVER used to infer roles.
 * 
 * Pure function: Does NOT mutate the input set record.
 */
export function normalizeSetRoleEvidence(
  set?: Partial<SetRecord> | null,
  isCardio: boolean = false
): CanonicalSetRoleEvidence {
  // Case 1: Cardio modality
  if (isCardio) {
    return {
      role: 'unknown-set-role',
      source: 'not-applicable-cardio',
      sourceConfidence: 'low',
      applicableToStrength: false,
    };
  }

  // Case 2: Missing or null set object
  if (!set || typeof set !== 'object') {
    return {
      role: 'unknown-set-role',
      source: 'isWarmup-missing',
      sourceConfidence: 'low',
      applicableToStrength: true,
    };
  }

  const rawValue = (set as Record<string, unknown>).isWarmup;

  // Case 3: Property absent, undefined, or null
  if (rawValue === undefined || rawValue === null || !('isWarmup' in set)) {
    return {
      role: 'unknown-set-role',
      source: 'isWarmup-missing',
      sourceConfidence: 'low',
      applicableToStrength: true,
    };
  }

  // Case 4: Explicit boolean true
  if (rawValue === true) {
    return {
      role: 'explicit-warmup',
      source: 'isWarmup-true',
      sourceConfidence: 'high',
      applicableToStrength: true,
    };
  }

  // Case 5: Explicit boolean false
  if (rawValue === false) {
    return {
      role: 'explicit-working-set',
      source: 'isWarmup-false',
      sourceConfidence: 'high',
      applicableToStrength: true,
    };
  }

  // Case 6: Invalid runtime value (e.g. "false", 0, 1, {})
  return {
    role: 'unknown-set-role',
    source: 'isWarmup-invalid',
    sourceConfidence: 'low',
    applicableToStrength: true,
  };
}

/**
 * Normalizes all sets in an ExerciseSession into CanonicalNormalizedSet objects.
 * Pure function: Does NOT mutate the input session or its sets.
 */
export function normalizeSessionSetRoles(
  session: ExerciseSession
): readonly CanonicalNormalizedSet[] {
  if (!session || !Array.isArray(session.sets)) {
    return [];
  }

  const isCardio = isCardioExercise(session.exerciseName, session.category);

  return session.sets.map((set) => {
    const evidence = normalizeSetRoleEvidence(set, isCardio);
    return {
      setId: set.id,
      weight: typeof set.weight === 'number' && Number.isFinite(set.weight) ? set.weight : 0,
      reps: typeof set.reps === 'number' && Number.isFinite(set.reps) ? set.reps : 0,
      timeSeconds: set.timeSeconds,
      distanceKm: set.distanceKm,
      evidence,
    };
  });
}

/**
 * Normalizes an entire WorkoutLog into structured CanonicalNormalizedExerciseSession objects.
 * Pure function: Does NOT mutate the input log.
 */
export function normalizeWorkoutLogSetRoles(
  log: WorkoutLog
): readonly CanonicalNormalizedExerciseSession[] {
  if (!log || !Array.isArray(log.exercises)) {
    return [];
  }

  return log.exercises.map((session) => {
    const normalizedSets = normalizeSessionSetRoles(session);
    return {
      exerciseId: session.exerciseId,
      exerciseName: session.exerciseName,
      category: session.category,
      sets: normalizedSets,
    };
  });
}
