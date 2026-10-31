/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise } from '../types';

/**
 * Weight Step Policy Constants
 * SSOT for weight increment/decrement steps across workout input interfaces.
 *
 * Cable +/-: 4.5kg
 * Dumbbell +/-: 2kg
 * Barbell +/-: 5kg
 * Machine / Unspecified / Other: 2.5kg (DEFAULT)
 */
export const DEFAULT_WEIGHT_STEP = 2.5;
export const CABLE_WEIGHT_STEP = 4.5;
export const DUMBBELL_WEIGHT_STEP = 2;
export const BARBELL_WEIGHT_STEP = 5;

export const WEIGHT_STEP_POLICY = {
  DEFAULT: DEFAULT_WEIGHT_STEP,
  CABLE: CABLE_WEIGHT_STEP,
  DUMBBELL: DUMBBELL_WEIGHT_STEP,
  BARBELL: BARBELL_WEIGHT_STEP,
} as const;

export type ExerciseLike = Partial<Exercise> & {
  exerciseId?: string;
  exerciseName?: string;
  [key: string]: unknown;
};

/**
 * Known canonical barbell exercise IDs in the system.
 */
const CANONICAL_BARBELL_IDS = new Set([
  'bench-press',
  'deadlift',
  'squat',
  'barbell-row',
  'overhead-press',
  'romanian-deadlift',
  'biceps-curl',
]);

/**
 * Known canonical cable exercise IDs in the system.
 */
const CANONICAL_CABLE_IDS = new Set([
  'lat-pulldown',
  'seated-row',
  'face-pull',
  'triceps-pushdown',
  'face-pull-rule',
  'pushdown',
  'cable-fly',
]);

/**
 * Normalized keyword matcher for Dumbbell exercises.
 */
function checkDumbbellNameOrKeyword(input: string): boolean {
  const norm = input.toLowerCase().replace(/\s+/g, '');

  // Keyword matches for dumbbell in Korean and English
  if (norm.includes('덤벨') || norm.includes('dumbbell')) {
    return true;
  }

  // Known canonical exercises that are inherently dumbbell movements
  if (norm.includes('해머컬') || norm.includes('hammercurl')) {
    return true;
  }

  return false;
}

/**
 * Normalized keyword matcher for Cable exercises.
 */
function checkCableNameOrKeyword(input: string): boolean {
  const norm = input.toLowerCase().replace(/\s+/g, '');

  if (norm.includes('케이블') || norm.includes('cable')) {
    return true;
  }

  // Canonical movements that are inherently cable exercises
  if (
    norm.includes('랫풀다운') ||
    norm.includes('latpulldown') ||
    norm.includes('페이스풀') ||
    norm.includes('facepull') ||
    norm.includes('푸쉬다운') ||
    norm.includes('푸시다운') ||
    norm.includes('pushdown')
  ) {
    return true;
  }

  return false;
}

/**
 * Normalized keyword matcher for Barbell exercises.
 */
function checkBarbellNameOrKeyword(input: string): boolean {
  const norm = input.toLowerCase().replace(/\s+/g, '');

  // Explicit non-barbell equipment keywords in the name preclude barbell classification
  if (
    norm.includes('덤벨') ||
    norm.includes('dumbbell') ||
    norm.includes('케이블') ||
    norm.includes('cable') ||
    norm.includes('머신') ||
    norm.includes('machine') ||
    norm.includes('스미스') ||
    norm.includes('smith') ||
    norm.includes('맨몸') ||
    norm.includes('bodyweight') ||
    norm.includes('밴드') ||
    norm.includes('band') ||
    norm.includes('레그프레스') ||
    norm.includes('legpress') ||
    norm.includes('핵스쿼트') ||
    norm.includes('hacksquat') ||
    norm.includes('브이스쿼트') ||
    norm.includes('vsquat')
  ) {
    return false;
  }

  // Barbell explicit keywords
  if (norm.includes('바벨') || norm.includes('barbell')) {
    return true;
  }

  // Canonical core lifts (bench press, deadlift, squat, overhead press / ohp)
  if (
    norm.includes('벤치프레스') ||
    norm.includes('benchpress') ||
    norm.includes('데드리프트') ||
    norm.includes('deadlift') ||
    norm.includes('스쿼트') ||
    norm.includes('squat') ||
    norm.includes('오버헤드프레스') ||
    norm.includes('overheadpress') ||
    norm.includes('ohp')
  ) {
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
    return checkDumbbellNameOrKeyword(exercise);
  }

  const exObj = exercise && typeof exercise === 'object' ? exercise : null;
  const rawEquipment = (exObj ? (exObj.equipment ?? exObj.equipmentType) : undefined) as unknown;
  if (typeof rawEquipment === 'string' && rawEquipment.trim().length > 0) {
    const eq = rawEquipment.trim().toLowerCase();
    if (eq === 'dumbbell' || eq === '덤벨') {
      return true;
    }
    // Any explicit non-dumbbell equipment metadata explicitly overrides name heuristics
    return false;
  }

  // Priority 2 & 3: Canonical metadata & Exercise identification
  const id = exObj ? (exObj.id || exObj.exerciseId || '') : '';
  const canonicalName = exObj ? (exObj.canonicalName || '') : '';
  const name = (exObj ? (exObj.name || exObj.exerciseName) : '') || fallbackName || '';

  // Check ID for dumbbell indicator
  if (id) {
    const lowerId = id.toLowerCase();
    if (lowerId.includes('dumbbell') || lowerId.includes('덤벨')) {
      return true;
    }
  }

  // Check canonicalName
  if (canonicalName && checkDumbbellNameOrKeyword(canonicalName)) {
    return true;
  }

  // Check name or fallbackName
  if (name && checkDumbbellNameOrKeyword(name)) {
    return true;
  }

  return false;
}

/**
 * Determines whether an exercise is a cable exercise.
 *
 * Priority 1: Structured equipment metadata (equipment / equipmentType)
 * Priority 2: Canonical exercise metadata & known cable identifiers
 * Priority 3: Keyword heuristic fallback on normalized name / canonicalName / id
 */
export function isCableExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  if (!exercise && !fallbackName) {
    return false;
  }

  if (typeof exercise === 'string') {
    return checkCableNameOrKeyword(exercise);
  }

  const exObj = exercise && typeof exercise === 'object' ? exercise : null;
  const rawEquipment = (exObj ? (exObj.equipment ?? exObj.equipmentType) : undefined) as unknown;
  if (typeof rawEquipment === 'string' && rawEquipment.trim().length > 0) {
    const eq = rawEquipment.trim().toLowerCase();
    if (eq === 'cable' || eq === '케이블') {
      return true;
    }
    // Any explicit non-cable equipment metadata explicitly overrides name heuristics
    return false;
  }

  // Priority 2 & 3: ID, canonicalName, name
  const id = exObj ? (exObj.id || exObj.exerciseId || '') : '';
  const canonicalName = exObj ? (exObj.canonicalName || '') : '';
  const name = (exObj ? (exObj.name || exObj.exerciseName) : '') || fallbackName || '';

  if (id) {
    const lowerId = id.toLowerCase();
    if (
      lowerId.includes('cable') ||
      lowerId.includes('케이블') ||
      CANONICAL_CABLE_IDS.has(lowerId)
    ) {
      return true;
    }
  }

  if (canonicalName && checkCableNameOrKeyword(canonicalName)) {
    return true;
  }

  if (name && checkCableNameOrKeyword(name)) {
    return true;
  }

  return false;
}

/**
 * Determines whether an exercise uses a barbell.
 *
 * Priority 1: Structured equipment metadata (equipment / equipmentType)
 * Priority 2: Canonical exercise metadata & known barbell identifiers
 * Priority 3: Keyword heuristic fallback on normalized name / canonicalName / id
 */
export function isBarbellExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  if (!exercise && !fallbackName) {
    return false;
  }

  if (typeof exercise === 'string') {
    return checkBarbellNameOrKeyword(exercise);
  }

  const exObj = exercise && typeof exercise === 'object' ? exercise : null;
  const rawEquipment = (exObj ? (exObj.equipment ?? exObj.equipmentType) : undefined) as unknown;
  if (typeof rawEquipment === 'string' && rawEquipment.trim().length > 0) {
    const eq = rawEquipment.trim().toLowerCase();
    if (eq === 'barbell' || eq === '바벨') {
      return true;
    }
    // Any explicit non-barbell equipment metadata explicitly overrides name heuristics
    return false;
  }

  // Priority 2 & 3: ID, canonicalName, name
  const id = exObj ? (exObj.id || exObj.exerciseId || '') : '';
  const canonicalName = exObj ? (exObj.canonicalName || '') : '';
  const name = (exObj ? (exObj.name || exObj.exerciseName) : '') || fallbackName || '';

  if (id) {
    const lowerId = id.toLowerCase();
    // Exclude if ID contains explicit non-barbell indicators
    if (
      lowerId.includes('dumbbell') ||
      lowerId.includes('덤벨') ||
      lowerId.includes('cable') ||
      lowerId.includes('케이블') ||
      lowerId.includes('machine') ||
      lowerId.includes('머신')
    ) {
      return false;
    }

    if (
      lowerId.includes('barbell') ||
      lowerId.includes('바벨') ||
      CANONICAL_BARBELL_IDS.has(lowerId)
    ) {
      return true;
    }
  }

  if (canonicalName && checkBarbellNameOrKeyword(canonicalName)) {
    return true;
  }

  if (name && checkBarbellNameOrKeyword(name)) {
    return true;
  }

  return false;
}

/**
 * Returns the weight adjustment step for a given exercise.
 * Cable exercises: 4.5kg
 * Dumbbell exercises: 2kg
 * Barbell exercises: 5kg
 * Other standard weight exercises (machine, unspecified, bodyweight, etc.): 2.5kg (DEFAULT)
 */
export function getWeightStep(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): number {
  if (isCableExercise(exercise, fallbackName)) {
    return CABLE_WEIGHT_STEP;
  }
  if (isDumbbellExercise(exercise, fallbackName)) {
    return DUMBBELL_WEIGHT_STEP;
  }
  if (isBarbellExercise(exercise, fallbackName)) {
    return BARBELL_WEIGHT_STEP;
  }
  return DEFAULT_WEIGHT_STEP;
}

export type WeightStepResolutionTier =
  | 'EQUIPMENT_METADATA'
  | 'CANONICAL_ID'
  | 'NAME_FALLBACK'
  | 'DEFAULT';

export type ResolvedEquipmentType = 'DUMBBELL' | 'CABLE' | 'BARBELL' | 'OTHER';

export interface WeightStepResolution {
  isDumbbell: boolean;
  isCable?: boolean;
  isBarbell?: boolean;
  resolvedEquipment?: ResolvedEquipmentType;
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
      isCable: false,
      isBarbell: false,
      resolvedEquipment: 'OTHER',
      step: DEFAULT_WEIGHT_STEP,
      source: 'DEFAULT',
    };
  }

  if (typeof exercise === 'string') {
    const isCable = isCableExercise(exercise);
    const isDb = isDumbbellExercise(exercise);
    const isBb = isBarbellExercise(exercise);
    const step = getWeightStep(exercise);
    const source: WeightStepResolutionTier = (isCable || isDb || isBb) ? 'NAME_FALLBACK' : 'DEFAULT';
    return {
      isDumbbell: isDb,
      isCable,
      isBarbell: isBb,
      resolvedEquipment: isCable ? 'CABLE' : isDb ? 'DUMBBELL' : isBb ? 'BARBELL' : 'OTHER',
      step,
      source,
    };
  }

  const exObj = exercise && typeof exercise === 'object' ? exercise : null;
  const rawEquipment = (exObj ? (exObj.equipment ?? exObj.equipmentType) : undefined) as unknown;
  const hasStructuredEquipment =
    typeof rawEquipment === 'string' && rawEquipment.trim().length > 0;

  const id = exObj ? (exObj.id || exObj.exerciseId || '') : '';
  const canonicalName = exObj ? (exObj.canonicalName || '') : '';
  const name = (exObj ? (exObj.name || exObj.exerciseName) : '') || fallbackName || '';

  const nameOrIdSuggestsDumbbell =
    (id && (id.toLowerCase().includes('dumbbell') || id.toLowerCase().includes('덤벨'))) ||
    (canonicalName && checkDumbbellNameOrKeyword(canonicalName)) ||
    (name && checkDumbbellNameOrKeyword(name));

  const nameOrIdSuggestsCable =
    (id && (id.toLowerCase().includes('cable') || id.toLowerCase().includes('케이블') || CANONICAL_CABLE_IDS.has(id.toLowerCase()))) ||
    (canonicalName && checkCableNameOrKeyword(canonicalName)) ||
    (name && checkCableNameOrKeyword(name));

  const nameOrIdSuggestsBarbell =
    (id && (id.toLowerCase().includes('barbell') || id.toLowerCase().includes('바벨') || CANONICAL_BARBELL_IDS.has(id.toLowerCase()))) ||
    (canonicalName && checkBarbellNameOrKeyword(canonicalName)) ||
    (name && checkBarbellNameOrKeyword(name));

  if (hasStructuredEquipment) {
    const eq = (rawEquipment as string).trim().toLowerCase();
    const isDb = eq === 'dumbbell' || eq === '덤벨';
    const isCable = eq === 'cable' || eq === '케이블';
    const isBb = eq === 'barbell' || eq === '바벨';
    const step = getWeightStep(exercise, fallbackName);

    let conflict: string | undefined;
    if (isDb && !nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is DUMBBELL, but exercise name/ID "${name || id}" has no dumbbell keyword.`;
    } else if (!isDb && nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains dumbbell keyword (metadata overrides).`;
    } else if (isCable && !nameOrIdSuggestsCable) {
      conflict = `Equipment is CABLE, but exercise name/ID "${name || id}" has no cable keyword.`;
    } else if (!isCable && nameOrIdSuggestsCable) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains cable keyword (metadata overrides).`;
    } else if (isBb && !nameOrIdSuggestsBarbell) {
      conflict = `Equipment is BARBELL, but exercise name/ID "${name || id}" has no barbell keyword.`;
    } else if (!isBb && nameOrIdSuggestsBarbell) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains barbell keyword (metadata overrides).`;
    }

    return {
      isDumbbell: isDb,
      isCable,
      isBarbell: isBb,
      resolvedEquipment: isCable ? 'CABLE' : isDb ? 'DUMBBELL' : isBb ? 'BARBELL' : 'OTHER',
      step,
      source: 'EQUIPMENT_METADATA',
      conflict,
    };
  }

  // Priority 2: Canonical ID
  if (id) {
    const lowerId = id.toLowerCase();
    if (lowerId.includes('cable') || lowerId.includes('케이블') || CANONICAL_CABLE_IDS.has(lowerId)) {
      return {
        isDumbbell: false,
        isCable: true,
        isBarbell: false,
        resolvedEquipment: 'CABLE',
        step: CABLE_WEIGHT_STEP,
        source: 'CANONICAL_ID',
      };
    }
    if (lowerId.includes('dumbbell') || lowerId.includes('덤벨')) {
      return {
        isDumbbell: true,
        isCable: false,
        isBarbell: false,
        resolvedEquipment: 'DUMBBELL',
        step: DUMBBELL_WEIGHT_STEP,
        source: 'CANONICAL_ID',
      };
    }
    if (
      !lowerId.includes('machine') &&
      !lowerId.includes('머신') &&
      (lowerId.includes('barbell') || lowerId.includes('바벨') || CANONICAL_BARBELL_IDS.has(lowerId))
    ) {
      return {
        isDumbbell: false,
        isCable: false,
        isBarbell: true,
        resolvedEquipment: 'BARBELL',
        step: BARBELL_WEIGHT_STEP,
        source: 'CANONICAL_ID',
      };
    }
  }

  // Priority 3: Name / Fallback
  if ((canonicalName && checkCableNameOrKeyword(canonicalName)) || (name && checkCableNameOrKeyword(name))) {
    return {
      isDumbbell: false,
      isCable: true,
      isBarbell: false,
      resolvedEquipment: 'CABLE',
      step: CABLE_WEIGHT_STEP,
      source: 'NAME_FALLBACK',
    };
  }

  if ((canonicalName && checkDumbbellNameOrKeyword(canonicalName)) || (name && checkDumbbellNameOrKeyword(name))) {
    return {
      isDumbbell: true,
      isCable: false,
      isBarbell: false,
      resolvedEquipment: 'DUMBBELL',
      step: DUMBBELL_WEIGHT_STEP,
      source: 'NAME_FALLBACK',
    };
  }

  if ((canonicalName && checkBarbellNameOrKeyword(canonicalName)) || (name && checkBarbellNameOrKeyword(name))) {
    return {
      isDumbbell: false,
      isCable: false,
      isBarbell: true,
      resolvedEquipment: 'BARBELL',
      step: BARBELL_WEIGHT_STEP,
      source: 'NAME_FALLBACK',
    };
  }

  return {
    isDumbbell: false,
    isCable: false,
    isBarbell: false,
    resolvedEquipment: 'OTHER',
    step: DEFAULT_WEIGHT_STEP,
    source: 'DEFAULT',
  };
}

/**
 * Validates whether a direct weight input is valid for saving.
 * - Allows any finite number or non-empty numeric string >= 0 (e.g. 0, "0", 6, 6.75, 21).
 * - Disallows empty string, whitespace, null, undefined, negative numbers, NaN, and Infinity.
 */
export function isValidWeightInput(rawWeight: unknown): boolean {
  if (rawWeight === null || rawWeight === undefined) {
    return false;
  }
  if (typeof rawWeight === 'string' && rawWeight.trim() === '') {
    return false;
  }
  const num = Number(rawWeight);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return false;
  }
  return true;
}

