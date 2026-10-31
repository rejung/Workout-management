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

  if (norm.includes('덤벨') || norm.includes('dumbbell')) {
    return true;
  }

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

export interface EquipmentClassificationResult {
  equipment: ResolvedEquipmentType;
  source: WeightStepResolutionTier;
  conflict?: string;
}

/**
 * Common, single source of truth classification engine.
 *
 * Strict evaluation order applied exactly once:
 * Tier 1: Explicit equipment/equipmentType metadata (overrides ID and name)
 * Tier 2: Definite canonical ID (overrides name keywords when metadata is absent)
 * Tier 3: Name / fallbackName keywords
 * Tier 4: DEFAULT (Machine, unspecified, or unknown equipment -> 'OTHER')
 */
export function resolveEquipmentClassification(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): EquipmentClassificationResult {
  if (!exercise && !fallbackName) {
    return {
      equipment: 'OTHER',
      source: 'DEFAULT',
    };
  }

  const isString = typeof exercise === 'string';
  const exObj = exercise && typeof exercise === 'object' ? exercise : null;

  const rawEquipment = (exObj ? (exObj.equipment ?? exObj.equipmentType) : undefined) as unknown;
  const hasStructuredEquipment =
    typeof rawEquipment === 'string' && rawEquipment.trim().length > 0;

  const id = (exObj ? (exObj.id || exObj.exerciseId || '') : '').toLowerCase().trim();
  const canonicalName = exObj?.canonicalName || '';
  const name = (exObj ? (exObj.name || exObj.exerciseName) : '') || (isString ? exercise : '') || fallbackName || '';

  // Tier 1: Explicit equipment/equipmentType metadata
  if (hasStructuredEquipment) {
    const eq = (rawEquipment as string).trim().toLowerCase();
    let equipment: ResolvedEquipmentType = 'OTHER';

    if (eq === 'cable' || eq === '케이블') {
      equipment = 'CABLE';
    } else if (eq === 'dumbbell' || eq === '덤벨') {
      equipment = 'DUMBBELL';
    } else if (eq === 'barbell' || eq === '바벨') {
      equipment = 'BARBELL';
    } else {
      equipment = 'OTHER';
    }

    // Diagnostics conflict check
    const nameOrIdSuggestsDumbbell =
      (id && (id.includes('dumbbell') || id.includes('덤벨'))) ||
      (canonicalName && checkDumbbellNameOrKeyword(canonicalName)) ||
      (name && checkDumbbellNameOrKeyword(name));

    const nameOrIdSuggestsCable =
      (id && (id.includes('cable') || id.includes('케이블') || CANONICAL_CABLE_IDS.has(id))) ||
      (canonicalName && checkCableNameOrKeyword(canonicalName)) ||
      (name && checkCableNameOrKeyword(name));

    const nameOrIdSuggestsBarbell =
      (id && (id.includes('barbell') || id.includes('바벨') || CANONICAL_BARBELL_IDS.has(id))) ||
      (canonicalName && checkBarbellNameOrKeyword(canonicalName)) ||
      (name && checkBarbellNameOrKeyword(name));

    let conflict: string | undefined;
    if (equipment === 'DUMBBELL' && !nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is DUMBBELL, but exercise name/ID "${name || id}" has no dumbbell keyword.`;
    } else if (equipment !== 'DUMBBELL' && nameOrIdSuggestsDumbbell) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains dumbbell keyword (metadata overrides).`;
    } else if (equipment === 'CABLE' && !nameOrIdSuggestsCable) {
      conflict = `Equipment is CABLE, but exercise name/ID "${name || id}" has no cable keyword.`;
    } else if (equipment !== 'CABLE' && nameOrIdSuggestsCable) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains cable keyword (metadata overrides).`;
    } else if (equipment === 'BARBELL' && !nameOrIdSuggestsBarbell) {
      conflict = `Equipment is BARBELL, but exercise name/ID "${name || id}" has no barbell keyword.`;
    } else if (equipment !== 'BARBELL' && nameOrIdSuggestsBarbell) {
      conflict = `Equipment is "${rawEquipment}", but exercise name/ID "${name || id}" contains barbell keyword (metadata overrides).`;
    }

    return {
      equipment,
      source: 'EQUIPMENT_METADATA',
      conflict,
    };
  }

  // Tier 2: Canonical ID (takes priority over name keywords when metadata is absent)
  const targetId = id || (isString ? exercise.toLowerCase().trim() : '');
  if (targetId) {
    if (
      targetId.includes('cable') ||
      targetId.includes('케이블') ||
      CANONICAL_CABLE_IDS.has(targetId)
    ) {
      return {
        equipment: 'CABLE',
        source: 'CANONICAL_ID',
      };
    }

    if (targetId.includes('dumbbell') || targetId.includes('덤벨')) {
      return {
        equipment: 'DUMBBELL',
        source: 'CANONICAL_ID',
      };
    }

    if (
      !targetId.includes('machine') &&
      !targetId.includes('머신') &&
      (targetId.includes('barbell') || targetId.includes('바벨') || CANONICAL_BARBELL_IDS.has(targetId))
    ) {
      return {
        equipment: 'BARBELL',
        source: 'CANONICAL_ID',
      };
    }
  }

  // Tier 3: Name / Fallback keywords
  if (
    (canonicalName && checkCableNameOrKeyword(canonicalName)) ||
    (name && checkCableNameOrKeyword(name))
  ) {
    return {
      equipment: 'CABLE',
      source: 'NAME_FALLBACK',
    };
  }

  if (
    (canonicalName && checkDumbbellNameOrKeyword(canonicalName)) ||
    (name && checkDumbbellNameOrKeyword(name))
  ) {
    return {
      equipment: 'DUMBBELL',
      source: 'NAME_FALLBACK',
    };
  }

  if (
    (canonicalName && checkBarbellNameOrKeyword(canonicalName)) ||
    (name && checkBarbellNameOrKeyword(name))
  ) {
    return {
      equipment: 'BARBELL',
      source: 'NAME_FALLBACK',
    };
  }

  // Tier 4: DEFAULT (Machine, unspecified, etc.)
  return {
    equipment: 'OTHER',
    source: 'DEFAULT',
  };
}

/**
 * Determines whether an exercise uses dumbbells.
 */
export function isDumbbellExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  return resolveEquipmentClassification(exercise, fallbackName).equipment === 'DUMBBELL';
}

/**
 * Determines whether an exercise is a cable exercise.
 */
export function isCableExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  return resolveEquipmentClassification(exercise, fallbackName).equipment === 'CABLE';
}

/**
 * Determines whether an exercise uses a barbell.
 */
export function isBarbellExercise(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): boolean {
  return resolveEquipmentClassification(exercise, fallbackName).equipment === 'BARBELL';
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
  const { equipment } = resolveEquipmentClassification(exercise, fallbackName);
  switch (equipment) {
    case 'CABLE':
      return CABLE_WEIGHT_STEP;
    case 'DUMBBELL':
      return DUMBBELL_WEIGHT_STEP;
    case 'BARBELL':
      return BARBELL_WEIGHT_STEP;
    default:
      return DEFAULT_WEIGHT_STEP;
  }
}

/**
 * Diagnostics function to inspect which tier resolved the weight step,
 * and whether a conflict between equipment metadata and name heuristics exists.
 */
export function inspectWeightStepResolution(
  exercise?: ExerciseLike | string | null,
  fallbackName?: string
): WeightStepResolution {
  const { equipment, source, conflict } = resolveEquipmentClassification(exercise, fallbackName);
  const step = getWeightStep(exercise, fallbackName);

  return {
    isDumbbell: equipment === 'DUMBBELL',
    isCable: equipment === 'CABLE',
    isBarbell: equipment === 'BARBELL',
    resolvedEquipment: equipment,
    step,
    source,
    conflict,
  };
}

/**
 * Validates whether a direct weight input is valid for saving.
 * - Allows number or non-empty numeric string whose parsed value is finite and >= 0 (e.g. 0, "0", 6, 6.75, 21).
 * - Strictly rejects boolean, array, object, null, undefined, empty string, whitespace, negative numbers, NaN, and Infinity.
 */
export function isValidWeightInput(rawWeight: unknown): boolean {
  if (rawWeight === null || rawWeight === undefined) {
    return false;
  }
  if (typeof rawWeight === 'boolean') {
    return false;
  }
  if (typeof rawWeight === 'object') {
    return false;
  }
  if (typeof rawWeight !== 'number' && typeof rawWeight !== 'string') {
    return false;
  }

  if (typeof rawWeight === 'string') {
    const trimmed = rawWeight.trim();
    if (trimmed === '') {
      return false;
    }
    const num = Number(trimmed);
    return !isNaN(num) && isFinite(num) && num >= 0;
  }

  return !isNaN(rawWeight) && isFinite(rawWeight) && rawWeight >= 0;
}
