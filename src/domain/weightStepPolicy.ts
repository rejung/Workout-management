/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise } from '../types';

/**
 * Weight Step Policy Constants
 * SSOT for weight increment/decrement steps across workout input interfaces.
 */
export const DEFAULT_WEIGHT_STEP = 2.5;
export const DUMBBELL_WEIGHT_STEP = 2;

export const WEIGHT_STEP_POLICY = {
  DEFAULT: DEFAULT_WEIGHT_STEP,
  DUMBBELL: DUMBBELL_WEIGHT_STEP,
} as const;

export type ExerciseLike = Partial<Exercise> & {
  exerciseId?: string;
  exerciseName?: string;
  [key: string]: unknown;
};

/**
 * Normalized keyword matcher for Dumbbell exercises.
 */
function checkNameOrKeyword(input: string): boolean {
  const norm = input.toLowerCase().replace(/\s+/g, '');

  // Keyword matches for dumbbell in Korean and English
  if (norm.includes('덤벨') || norm.includes('dumbbell')) {
    return true;
  }

  // Known canonical exercises that are inherently dumbbell movements (e.g., hammer curl)
  if (norm.includes('해머컬') || norm.includes('hammercurl')) {
    return true;
  }

  return false;
}

/**
 * Determines whether an exercise uses dumbbells.
 *
 * Priority 1: Structured equipment metadata (equipment / equipmentType)
 * Priority 2: Canonical exercise metadata & known dumbbell identifiers
 * Priority 3: Keyword heuristic fallback on normalized name / canonicalName / id
 */
export function isDumbbellExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  if (!exercise && !fallbackName) {
    return false;
  }

  // If passed as a plain string (exercise name or ID)
  if (typeof exercise === 'string') {
    return checkNameOrKeyword(exercise);
  }

  // Priority 1: Structured equipment metadata
  const rawEquipment = (exercise.equipment ?? exercise.equipmentType) as unknown;
  if (typeof rawEquipment === 'string' && rawEquipment.trim().length > 0) {
    const eq = rawEquipment.trim().toLowerCase();
    if (eq === 'dumbbell' || eq === '덤벨') {
      return true;
    }
    // Any explicit non-dumbbell equipment metadata explicitly overrides name heuristics
    return false;
  }

  // Priority 2 & 3: Canonical metadata & Exercise identification
  const id = exercise.id || exercise.exerciseId || '';
  const canonicalName = exercise.canonicalName || '';
  const name = exercise.name || exercise.exerciseName || fallbackName || '';

  // Check ID for dumbbell indicator
  if (id) {
    const lowerId = id.toLowerCase();
    if (lowerId.includes('dumbbell') || lowerId.includes('덤벨')) {
      return true;
    }
  }

  // Check canonicalName
  if (canonicalName && checkNameOrKeyword(canonicalName)) {
    return true;
  }

  // Check name or fallbackName
  if (name && checkNameOrKeyword(name)) {
    return true;
  }

  return false;
}

/**
 * Returns the weight adjustment step for a given exercise.
 * Dumbbell exercises: 2kg
 * Other standard weight exercises: 2.5kg
 */
export function getWeightStep(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): number {
  return isDumbbellExercise(exercise, fallbackName)
    ? DUMBBELL_WEIGHT_STEP
    : DEFAULT_WEIGHT_STEP;
}

export type WeightStepResolutionTier =
  | 'EQUIPMENT_METADATA'
  | 'CANONICAL_ID'
  | 'NAME_FALLBACK'
  | 'DEFAULT';

export interface WeightStepResolution {
  isDumbbell: boolean;
  step: number;
  source: WeightStepResolutionTier;
  conflict?: string;
}

/**
 * Diagnostics function to inspect which tier resolved the weight step,
 * and whether a conflict between equipment metadata and name heuristics exists.
 */
export function inspectWeightStepResolution(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): WeightStepResolution {
  if (!exercise && !fallbackName) {
    return {
      isDumbbell: false,
      step: DEFAULT_WEIGHT_STEP,
      source: 'DEFAULT',
    };
  }

  if (typeof exercise === 'string') {
    const isDb = checkNameOrKeyword(exercise);
    return {
      isDumbbell: isDb,
      step: isDb ? DUMBBELL_WEIGHT_STEP : DEFAULT_WEIGHT_STEP,
      source: 'NAME_FALLBACK',
    };
  }

  const rawEquipment = (exercise.equipment ?? exercise.equipmentType) as unknown;
  const hasStructuredEquipment =
    typeof rawEquipment === 'string' && rawEquipment.trim().length > 0;

  const id = exercise.id || exercise.exerciseId || '';
  const canonicalName = exercise.canonicalName || '';
  const name = exercise.name || exercise.exerciseName || fallbackName || '';

  const nameOrIdSuggestsDumbbell =
    (id && (id.toLowerCase().includes('dumbbell') || id.toLowerCase().includes('덤벨'))) ||
    (canonicalName && checkNameOrKeyword(canonicalName)) ||
    (name && checkNameOrKeyword(name));

  if (hasStructuredEquipment) {
    const eq = (rawEquipment as string).trim().toLowerCase();
    const isDb = eq === 'dumbbell' || eq === '덤벨';

    let conflict: string | undefined;
    if (isDb && !nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is DUMBBELL, but exercise name/ID "${name || id}" has no dumbbell keyword.`;
    } else if (!isDb && nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains dumbbell keyword (metadata overrides).`;
    }

    return {
      isDumbbell: isDb,
      step: isDb ? DUMBBELL_WEIGHT_STEP : DEFAULT_WEIGHT_STEP,
      source: 'EQUIPMENT_METADATA',
      conflict,
    };
  }

  if (id && (id.toLowerCase().includes('dumbbell') || id.toLowerCase().includes('덤벨'))) {
    return {
      isDumbbell: true,
      step: DUMBBELL_WEIGHT_STEP,
      source: 'CANONICAL_ID',
    };
  }

  if ((canonicalName && checkNameOrKeyword(canonicalName)) || (name && checkNameOrKeyword(name))) {
    return {
      isDumbbell: true,
      step: DUMBBELL_WEIGHT_STEP,
      source: 'NAME_FALLBACK',
    };
  }

  return {
    isDumbbell: false,
    step: DEFAULT_WEIGHT_STEP,
    source: 'DEFAULT',
  };
}

