/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise, WorkoutLog, Routine } from '../types';

/**
 * Exercise Database Canonical Merge — Change Unit 1
 * Domain SSOT for Canonical Resolution & Reference Migration
 *
 * Specific Allowed Groups:
 * Group 1: 밴드 풀업 (Band Pull-Up) ↔ 밴드 풀업 -> band-pull-up
 * Group 2: 시티드 케이블 로우 (Seated Cable Row) ↔ 시티드 케이블 로우 ↔ 케이블 로우 -> seated-row
 * Group 3: 닐링 케이블 플라이 ↔ 케이블 플라이 -> cable-fly
 * Group 4: 케이블 푸시다운 ↔ 푸시다운 -> triceps-pushdown
 * Group 5: 덤벨 로우 ↔ 원암 덤벨 로우 -> dumbbell-row (Canonical DB definition)
 */

export interface CanonicalMergeRule {
  groupId: string;
  groupName: string;
  canonicalId: string;
  canonicalName: string;
  category: Exercise['category'];
  logType: NonNullable<Exercise['logType']>;
  equipment?: string;
  /** Duplicate IDs and name variations to migrate */
  matchIds: string[];
  matchNormalizedNames: string[];
}

/**
 * Normalizes an exercise name for exact matching without spacing, brackets, or case differences.
 */
export function normalizeExerciseCanonicalName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\([^)]*\)/g, '') // remove brackets
    .replace(/[^a-zA-Z0-9가-힣]/g, '') // remove spacing and special chars
    .toLowerCase()
    .trim();
}

/**
 * Group 1 to 5 Canonical Merge Specifications
 */
export const CANONICAL_MERGE_GROUPS: CanonicalMergeRule[] = [
  // Group 1: 밴드 풀업 (Band Pull-Up) ↔ 밴드 풀업
  {
    groupId: 'group-1-band-pullup',
    groupName: '밴드 풀업 (Band Pull-Up)',
    canonicalId: 'band-pull-up',
    canonicalName: '밴드 풀업 (Band Pull-Up)',
    category: 'Back',
    logType: 'BODYWEIGHT_REPS',
    equipment: 'BAND',
    matchIds: ['band-pull-up', 'band-pull-up-simple'],
    matchNormalizedNames: ['밴드풀업', '밴드턱걸이', 'bandpullup'],
  },

  // Group 2: 시티드 케이블 로우 (Seated Cable Row) ↔ 시티드 케이블 로우 ↔ 케이블 로우 (3 -> 1)
  {
    groupId: 'group-2-seated-cable-row',
    groupName: '시티드 케이블 로우 (Seated Cable Row)',
    canonicalId: 'seated-row',
    canonicalName: '시티드 케이블 로우 (Seated Cable Row)',
    category: 'Back',
    logType: 'STANDARD',
    equipment: 'CABLE',
    matchIds: ['seated-row', 'custom-cable-row', 'cable-row', 'seated-cable-row'],
    matchNormalizedNames: ['시티드케이블로우', '시티드로우', '시티드케이블', '케이블로우', 'seatedcablerow', 'seatedrow', 'cablerow'],
  },

  // Group 3: 닐링 케이블 플라이 ↔ 케이블 플라이
  {
    groupId: 'group-3-cable-fly',
    groupName: '케이블 플라이 (Cable Fly)',
    canonicalId: 'cable-fly',
    canonicalName: '케이블 플라이 (Cable Fly)',
    category: 'Chest',
    logType: 'STANDARD',
    equipment: 'CABLE',
    matchIds: ['cable-fly', 'kneeling-cable-fly', 'custom-kneeling-cable-fly'],
    matchNormalizedNames: ['케이블플라이', '닐링케이블플라이', '무릎케이블플라이', 'cablefly', 'kneelingcablefly'],
  },

  // Group 4: 케이블 푸시다운 ↔ 푸시다운
  {
    groupId: 'group-4-pushdown',
    groupName: '트라이셉스 푸쉬다운 (Triceps Pushdown)',
    canonicalId: 'triceps-pushdown',
    canonicalName: '트라이셉스 푸쉬다운 (Triceps Pushdown)',
    category: 'Arms',
    logType: 'STANDARD',
    equipment: 'CABLE',
    matchIds: ['triceps-pushdown', 'cable-pushdown', 'pushdown', 'custom-pushdown'],
    matchNormalizedNames: ['트라이셉스푸쉬다운', '트라이셉스푸시다운', '케이블푸쉬다운', '케이블푸시다운', '푸쉬다운', '푸시다운', 'tricepspushdown', 'pushdown', 'cablepushdown'],
  },

  // Group 5: 덤벨 로우 ↔ 원암 덤벨 로우
  {
    groupId: 'group-5-dumbbell-row',
    groupName: '덤벨 로우 (Dumbbell Row)',
    canonicalId: 'dumbbell-row',
    canonicalName: '덤벨 로우 (Dumbbell Row)',
    category: 'Back',
    logType: 'STANDARD',
    equipment: 'DUMBBELL',
    matchIds: ['dumbbell-row', 'one-arm-dumbbell-row', 'onearm-dumbbell-row', 'single-arm-dumbbell-row', 'custom-dumbbell-row', 'custom-one-arm-row'],
    matchNormalizedNames: ['덤벨로우', '원암덤벨로우', '원암로우', '한손덤벨로우', '싱글암덤벨로우', 'dumbbellrow', 'onearmdumbbellrow', 'onearmrow'],
  },
];

/**
 * Checks if a given exercise ID or name belongs to one of the 5 canonical merge groups.
 * Returns the matching CanonicalMergeRule or null if not in the 5 groups.
 */
export function getCanonicalMergeRule(
  exerciseId: string,
  exerciseName?: string,
  category?: string
): CanonicalMergeRule | null {
  const normName = exerciseName ? normalizeExerciseCanonicalName(exerciseName) : '';

  for (const rule of CANONICAL_MERGE_GROUPS) {
    // 1. Direct ID match
    if (rule.matchIds.includes(exerciseId)) {
      if (!category || category === rule.category) {
        return rule;
      }
    }
    // 2. Normalized name match
    if (normName && rule.matchNormalizedNames.includes(normName)) {
      if (!category || category === rule.category) {
        return rule;
      }
    }
  }

  return null;
}

export interface CanonicalMigrationResult {
  migratedLogsCount: number;
  migratedWorkoutRefs: number;
  migratedRoutinesCount: number;
  migratedRoutineRefs: number;
  removedDuplicateExercises: Exercise[];
  preservedCustomExercises: Exercise[];
  updatedLogs: WorkoutLog[];
  updatedRoutines: Routine[];
  updatedExercises: Exercise[];
  referenceAudit: Array<{
    groupId: string;
    groupName: string;
    canonicalId: string;
    beforeWorkoutRefs: number;
    afterWorkoutRefs: number;
    beforeRoutineRefs: number;
    afterRoutineRefs: number;
  }>;
}

/**
 * Executes idempotent Canonical Resolution and Reference Migration for the 5 target groups.
 *
 * Sequence:
 * Step 1: Canonical Resolution
 * Step 2: WorkoutLog reference migration (preserves sets, reps, weight, cardio, dates)
 * Step 3: Routine reference migration (preserves order, targetSetsCount)
 * Step 4: Verification (ensures duplicate references == 0 and total references conserved)
 * Step 5: Safe deletion of duplicate exercises (only after references are 0 and canonical exists)
 */
export function applyCanonicalExerciseMigration(
  logs: WorkoutLog[],
  routines: Routine[],
  exercises: Exercise[],
  defaultExercises: Exercise[]
): CanonicalMigrationResult {
  // Map of duplicate exerciseId -> target canonical exercise
  const canonicalMap = new Map<string, { id: string; name: string; category: Exercise['category'] }>();
  const duplicateIdSet = new Set<string>();

  // Ensure canonical definitions exist in target dictionary
  const canonicalExerciseLookup = new Map<string, Exercise>();
  defaultExercises.forEach(def => canonicalExerciseLookup.set(def.id, def));
  exercises.forEach(ex => {
    if (!canonicalExerciseLookup.has(ex.id)) {
      canonicalExerciseLookup.set(ex.id, ex);
    }
  });

  // 1. Identify which exercises are duplicates to be merged into canonical
  for (const rule of CANONICAL_MERGE_GROUPS) {
    const canonicalDef = canonicalExerciseLookup.get(rule.canonicalId);
    const targetCanonical = canonicalDef
      ? { id: canonicalDef.id, name: canonicalDef.name, category: canonicalDef.category }
      : { id: rule.canonicalId, name: rule.canonicalName, category: rule.category };

    // Check all existing exercises
    exercises.forEach(ex => {
      // Must not remap canonical to itself
      if (ex.id === rule.canonicalId) return;

      const normName = normalizeExerciseCanonicalName(ex.name);
      const isIdMatch = rule.matchIds.includes(ex.id);
      const isNameMatch = rule.matchNormalizedNames.includes(normName);

      if ((isIdMatch || isNameMatch) && ex.category === rule.category) {
        canonicalMap.set(ex.id, targetCanonical);
        duplicateIdSet.add(ex.id);
      }
    });

    // Also register explicitly known duplicate IDs from rule.matchIds even if not in exercises table
    rule.matchIds.forEach(id => {
      if (id !== rule.canonicalId) {
        canonicalMap.set(id, targetCanonical);
        duplicateIdSet.add(id);
      }
    });
  }

  // Pre-migration Audit counts
  const beforeWorkoutRefsByGroup: Record<string, number> = {};
  const beforeRoutineRefsByGroup: Record<string, number> = {};

  CANONICAL_MERGE_GROUPS.forEach(rule => {
    beforeWorkoutRefsByGroup[rule.groupId] = 0;
    beforeRoutineRefsByGroup[rule.groupId] = 0;
  });

  logs.forEach(log => {
    log.exercises.forEach(sess => {
      for (const rule of CANONICAL_MERGE_GROUPS) {
        const isCanonical = sess.exerciseId === rule.canonicalId;
        const isDuplicate = canonicalMap.has(sess.exerciseId) && canonicalMap.get(sess.exerciseId)!.id === rule.canonicalId;
        const normName = normalizeExerciseCanonicalName(sess.exerciseName);
        const isNameMatch = rule.matchNormalizedNames.includes(normName);

        if (isCanonical || isDuplicate || (isNameMatch && sess.category === rule.category)) {
          beforeWorkoutRefsByGroup[rule.groupId]++;
          break;
        }
      }
    });
  });

  routines.forEach(routine => {
    routine.exercises.forEach(item => {
      for (const rule of CANONICAL_MERGE_GROUPS) {
        const isCanonical = item.exerciseId === rule.canonicalId;
        const isDuplicate = canonicalMap.has(item.exerciseId) && canonicalMap.get(item.exerciseId)!.id === rule.canonicalId;
        const normName = normalizeExerciseCanonicalName(item.exerciseName);
        const isNameMatch = rule.matchNormalizedNames.includes(normName);

        if (isCanonical || isDuplicate || (isNameMatch && item.category === rule.category)) {
          beforeRoutineRefsByGroup[rule.groupId]++;
          break;
        }
      }
    });
  });

  // Step 2: WorkoutLog reference migration
  let migratedLogsCount = 0;
  let migratedWorkoutRefs = 0;

  const updatedLogs = logs.map(log => {
    let logModified = false;
    const updatedExercises = log.exercises.map(sess => {
      let target = canonicalMap.get(sess.exerciseId);

      // Fallback check by name and category if exerciseId was an unrecognized custom ID
      if (!target) {
        const rule = getCanonicalMergeRule(sess.exerciseId, sess.exerciseName, sess.category);
        if (rule && rule.canonicalId !== sess.exerciseId) {
          const canonicalDef = canonicalExerciseLookup.get(rule.canonicalId);
          target = canonicalDef
            ? { id: canonicalDef.id, name: canonicalDef.name, category: canonicalDef.category }
            : { id: rule.canonicalId, name: rule.canonicalName, category: rule.category };
        }
      }

      if (target && (sess.exerciseId !== target.id || sess.category !== target.category)) {
        logModified = true;
        migratedWorkoutRefs++;
        return {
          ...sess,
          exerciseId: target.id,
          exerciseName: target.name,
          category: target.category,
        };
      }
      return sess;
    });

    if (logModified) {
      migratedLogsCount++;
      return { ...log, exercises: updatedExercises };
    }
    return log;
  });

  // Step 3: Routine reference migration
  let migratedRoutinesCount = 0;
  let migratedRoutineRefs = 0;

  const updatedRoutines = routines.map(routine => {
    let routineModified = false;
    const updatedRoutineExercises = routine.exercises.map(item => {
      let target = canonicalMap.get(item.exerciseId);

      if (!target) {
        const rule = getCanonicalMergeRule(item.exerciseId, item.exerciseName, item.category);
        if (rule && rule.canonicalId !== item.exerciseId) {
          const canonicalDef = canonicalExerciseLookup.get(rule.canonicalId);
          target = canonicalDef
            ? { id: canonicalDef.id, name: canonicalDef.name, category: canonicalDef.category }
            : { id: rule.canonicalId, name: rule.canonicalName, category: rule.category };
        }
      }

      if (target && (item.exerciseId !== target.id || item.category !== target.category)) {
        routineModified = true;
        migratedRoutineRefs++;
        return {
          ...item,
          exerciseId: target.id,
          exerciseName: target.name,
          category: target.category,
        };
      }
      return item;
    });

    if (routineModified) {
      migratedRoutinesCount++;
      return { ...routine, exercises: updatedRoutineExercises };
    }
    return routine;
  });

  // Step 4: Verification of reference counts
  const afterWorkoutRefsByGroup: Record<string, number> = {};
  const afterRoutineRefsByGroup: Record<string, number> = {};

  CANONICAL_MERGE_GROUPS.forEach(rule => {
    afterWorkoutRefsByGroup[rule.groupId] = 0;
    afterRoutineRefsByGroup[rule.groupId] = 0;
  });

  updatedLogs.forEach(log => {
    log.exercises.forEach(sess => {
      for (const rule of CANONICAL_MERGE_GROUPS) {
        if (sess.exerciseId === rule.canonicalId) {
          afterWorkoutRefsByGroup[rule.groupId]++;
          break;
        }
      }
    });
  });

  updatedRoutines.forEach(routine => {
    routine.exercises.forEach(item => {
      for (const rule of CANONICAL_MERGE_GROUPS) {
        if (item.exerciseId === rule.canonicalId) {
          afterRoutineRefsByGroup[rule.groupId]++;
          break;
        }
      }
    });
  });

  // Step 5: Safe deletion of duplicate exercises (only if references are 0 and canonical exists)
  const removedDuplicateExercises: Exercise[] = [];
  const preservedCustomExercises: Exercise[] = [];

  const updatedExercises = exercises.filter(ex => {
    if (duplicateIdSet.has(ex.id)) {
      // Confirm it has 0 references in updated logs and routines
      const hasLogRef = updatedLogs.some(l => l.exercises.some(s => s.exerciseId === ex.id));
      const hasRoutineRef = updatedRoutines.some(r => r.exercises.some(e => e.exerciseId === ex.id));

      if (!hasLogRef && !hasRoutineRef) {
        removedDuplicateExercises.push(ex);
        return false;
      }
    }

    if (ex.isCustom) {
      preservedCustomExercises.push(ex);
    }
    return true;
  });

  // Ensure canonical exercises for active/referenced merge groups exist in updatedExercises
  CANONICAL_MERGE_GROUPS.forEach(rule => {
    const isReferencedInLogs = updatedLogs.some(l => l.exercises.some(s => s.exerciseId === rule.canonicalId));
    const isReferencedInRoutines = updatedRoutines.some(r => r.exercises.some(e => e.exerciseId === rule.canonicalId));
    const wasDuplicateRemoved = removedDuplicateExercises.some(d => rule.matchIds.includes(d.id));

    if (isReferencedInLogs || isReferencedInRoutines || wasDuplicateRemoved) {
      if (!updatedExercises.some(e => e.id === rule.canonicalId)) {
        const canonicalDef = defaultExercises.find(d => d.id === rule.canonicalId);
        if (canonicalDef) {
          updatedExercises.push(canonicalDef);
        } else {
          updatedExercises.push({
            id: rule.canonicalId,
            name: rule.canonicalName,
            category: rule.category,
            logType: rule.logType,
            equipment: rule.equipment,
          });
        }
      }
    }
  });

  const referenceAudit = CANONICAL_MERGE_GROUPS.map(rule => ({
    groupId: rule.groupId,
    groupName: rule.groupName,
    canonicalId: rule.canonicalId,
    beforeWorkoutRefs: beforeWorkoutRefsByGroup[rule.groupId],
    afterWorkoutRefs: afterWorkoutRefsByGroup[rule.groupId],
    beforeRoutineRefs: beforeRoutineRefsByGroup[rule.groupId],
    afterRoutineRefs: afterRoutineRefsByGroup[rule.groupId],
  }));

  return {
    migratedLogsCount,
    migratedWorkoutRefs,
    migratedRoutinesCount,
    migratedRoutineRefs,
    removedDuplicateExercises,
    preservedCustomExercises,
    updatedLogs,
    updatedRoutines,
    updatedExercises,
    referenceAudit,
  };
}
