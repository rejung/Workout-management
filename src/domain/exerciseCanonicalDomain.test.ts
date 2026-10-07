/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise, WorkoutLog, Routine } from '../types';
import { DEFAULT_EXERCISES } from '../constants';
import {
  applyCanonicalExerciseMigration,
  CANONICAL_MERGE_GROUPS,
  normalizeExerciseCanonicalName,
} from './exerciseCanonicalDomain';
import { getWeightStep } from './weightStepPolicy';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export function runCanonicalMigrationTests() {
  console.log('--- Running Exercise Database Canonical Merge Tests ---');

  // Case 1: WorkoutLog only references duplicate -> migrated to canonical, count preserved
  const c1_exs: Exercise[] = [
    { id: 'band-pull-up', name: '밴드 풀업 (Band Pull-Up)', category: 'Back', logType: 'BODYWEIGHT_REPS', equipment: 'BAND' },
    { id: 'band-pull-up-simple', name: '밴드 풀업', category: 'Back', logType: 'BODYWEIGHT_REPS', equipment: 'BAND', isCustom: true },
  ];
  const c1_logs: WorkoutLog[] = [
    {
      id: 'log-1',
      date: '2026-06-01',
      notes: '',
      exercises: [
        {
          exerciseId: 'band-pull-up-simple',
          exerciseName: '밴드 풀업',
          category: 'Back',
          sets: [{ id: 's1', weight: 0, reps: 10 }],
        },
      ],
    },
  ];
  const c1_routines: Routine[] = [];

  const res1 = applyCanonicalExerciseMigration(c1_logs, c1_routines, c1_exs, DEFAULT_EXERCISES);
  assert(res1.updatedLogs[0].exercises[0].exerciseId === 'band-pull-up', 'Case 1: WorkoutLog duplicate migrated to canonical ID band-pull-up');
  assert(res1.updatedLogs[0].exercises[0].exerciseName === '밴드 풀업 (Band Pull-Up)', 'Case 1: WorkoutLog exerciseName updated to canonical');
  assert(res1.updatedLogs[0].exercises[0].sets[0].reps === 10, 'Case 1: WorkoutLog sets data perfectly preserved');
  assert(res1.referenceAudit.find(r => r.groupId === 'group-1-band-pullup')!.afterWorkoutRefs === 1, 'Case 1: Total workout refs conserved');

  // Case 2: Routine only references duplicate -> migrated to canonical
  const c2_routines: Routine[] = [
    {
      id: 'r-1',
      name: '등 루틴',
      description: '',
      exercises: [
        { exerciseId: 'band-pull-up-simple', exerciseName: '밴드 풀업', category: 'Back', targetSetsCount: 4 },
      ],
    },
  ];
  const res2 = applyCanonicalExerciseMigration([], c2_routines, c1_exs, DEFAULT_EXERCISES);
  assert(res2.updatedRoutines[0].exercises[0].exerciseId === 'band-pull-up', 'Case 2: Routine duplicate migrated to canonical ID band-pull-up');
  assert(res2.updatedRoutines[0].exercises[0].targetSetsCount === 4, 'Case 2: Routine targetSetsCount preserved');
  assert(res2.referenceAudit.find(r => r.groupId === 'group-1-band-pullup')!.afterRoutineRefs === 1, 'Case 2: Total routine refs conserved');

  // Case 3: WorkoutLog + Routine both reference duplicate -> both migrated
  const res3 = applyCanonicalExerciseMigration(c1_logs, c2_routines, c1_exs, DEFAULT_EXERCISES);
  assert(res3.updatedLogs[0].exercises[0].exerciseId === 'band-pull-up', 'Case 3: WorkoutLog migrated in combined case');
  assert(res3.updatedRoutines[0].exercises[0].exerciseId === 'band-pull-up', 'Case 3: Routine migrated in combined case');
  assert(!res3.updatedExercises.some(e => e.id === 'band-pull-up-simple'), 'Case 3: Duplicate exercise safely removed from exercises list');

  // Case 4: Reference-less duplicate -> safely removed
  const c4_exs: Exercise[] = [
    { id: 'band-pull-up', name: '밴드 풀업 (Band Pull-Up)', category: 'Back', logType: 'BODYWEIGHT_REPS', equipment: 'BAND' },
    { id: 'band-pull-up-simple', name: '밴드 풀업', category: 'Back', logType: 'BODYWEIGHT_REPS', equipment: 'BAND' },
  ];
  const res4 = applyCanonicalExerciseMigration([], [], c4_exs, DEFAULT_EXERCISES);
  assert(!res4.updatedExercises.some(e => e.id === 'band-pull-up-simple'), 'Case 4: Reference-less duplicate safely removed');
  assert(res4.updatedExercises.some(e => e.id === 'band-pull-up'), 'Case 4: Canonical exercise maintained in exercises list');

  // Case 5: Already migrated state -> idempotent, running twice yields identical result
  const res5_1 = applyCanonicalExerciseMigration(c1_logs, c2_routines, c1_exs, DEFAULT_EXERCISES);
  const res5_2 = applyCanonicalExerciseMigration(res5_1.updatedLogs, res5_1.updatedRoutines, res5_1.updatedExercises, DEFAULT_EXERCISES);
  assert(res5_2.migratedWorkoutRefs === 0, 'Case 5: Second migration performs 0 workout remappings (idempotent)');
  assert(res5_2.migratedRoutineRefs === 0, 'Case 5: Second migration performs 0 routine remappings (idempotent)');
  assert(JSON.stringify(res5_1.updatedLogs) === JSON.stringify(res5_2.updatedLogs), 'Case 5: Updated logs are identical');
  assert(JSON.stringify(res5_1.updatedRoutines) === JSON.stringify(res5_2.updatedRoutines), 'Case 5: Updated routines are identical');

  // Case 6: Canonical exercise metadata -> category/logType/equipment strictly preserved
  const seatedDef = DEFAULT_EXERCISES.find(e => e.id === 'seated-row')!;
  assert(seatedDef.category === 'Back', 'Case 6: seated-row category is Back');
  assert(seatedDef.logType === 'STANDARD', 'Case 6: seated-row logType is STANDARD');
  assert(seatedDef.equipment === 'CABLE', 'Case 6: seated-row equipment is CABLE');

  // Case 7: Custom exercise that matches merge target -> properly migrated
  const c7_exs: Exercise[] = [
    { id: 'custom-one-arm-row', name: '원암 덤벨 로우', category: 'Back', logType: 'STANDARD', isCustom: true },
    { id: 'dumbbell-row', name: '덤벨 로우 (Dumbbell Row)', category: 'Back', logType: 'STANDARD', canonicalName: '덤벨 로우', equipment: 'DUMBBELL' },
  ];
  const c7_logs: WorkoutLog[] = [
    {
      id: 'log-custom',
      date: '2026-06-05',
      notes: '한손씩 수행',
      exercises: [
        {
          exerciseId: 'custom-one-arm-row',
          exerciseName: '원암 덤벨 로우',
          category: 'Back',
          sets: [{ id: 's1', weight: 24, reps: 8 }],
        },
      ],
    },
  ];
  const res7 = applyCanonicalExerciseMigration(c7_logs, [], c7_exs, DEFAULT_EXERCISES);
  assert(res7.updatedLogs[0].exercises[0].exerciseId === 'dumbbell-row', 'Case 7: Custom duplicate migrated to canonical dumbbell-row');
  assert(res7.updatedLogs[0].exercises[0].sets[0].weight === 24, 'Case 7: Weight preserved');

  // Case 8: Custom exercise NOT in merge targets -> strictly untouched
  const c8_exs: Exercise[] = [
    { id: 'my-unique-custom-lift', name: '나만의 독창적 리프트', category: 'Chest', logType: 'STANDARD', isCustom: true },
  ];
  const c8_logs: WorkoutLog[] = [
    {
      id: 'log-my-unique',
      date: '2026-06-06',
      notes: '',
      exercises: [
        {
          exerciseId: 'my-unique-custom-lift',
          exerciseName: '나만의 독창적 리프트',
          category: 'Chest',
          sets: [{ id: 's1', weight: 50, reps: 5 }],
        },
      ],
    },
  ];
  const res8 = applyCanonicalExerciseMigration(c8_logs, [], c8_exs, DEFAULT_EXERCISES);
  assert(res8.updatedLogs[0].exercises[0].exerciseId === 'my-unique-custom-lift', 'Case 8: Unrelated custom exercise ID untouched');
  assert(res8.updatedExercises.some(e => e.id === 'my-unique-custom-lift'), 'Case 8: Unrelated custom exercise preserved in DB');

  // Case 9: Seated Cable Row 3 -> 1 Group (seated-row, seated-cable-row, cable-row) -> Total reference sum conserved
  const c9_exs: Exercise[] = [
    { id: 'seated-row', name: '시티드 케이블 로우 (Seated Cable Row)', category: 'Back', logType: 'STANDARD', equipment: 'CABLE' },
    { id: 'cable-row', name: '케이블 로우', category: 'Back', logType: 'STANDARD', isCustom: true },
    { id: 'custom-cable-row', name: '시티드 케이블 로우', category: 'Back', logType: 'STANDARD', isCustom: true },
  ];
  const c9_logs: WorkoutLog[] = [
    {
      id: 'log-c9-1',
      date: '2026-06-01',
      notes: '',
      exercises: [
        { exerciseId: 'seated-row', exerciseName: '시티드 케이블 로우 (Seated Cable Row)', category: 'Back', sets: [] },
        { exerciseId: 'cable-row', exerciseName: '케이블 로우', category: 'Back', sets: [] },
        { exerciseId: 'custom-cable-row', exerciseName: '시티드 케이블 로우', category: 'Back', sets: [] },
      ],
    },
  ];
  const res9 = applyCanonicalExerciseMigration(c9_logs, [], c9_exs, DEFAULT_EXERCISES);
  const auditGroup2 = res9.referenceAudit.find(r => r.groupId === 'group-2-seated-cable-row')!;
  assert(auditGroup2.beforeWorkoutRefs === 3, 'Case 9: Group 2 beforeWorkoutRefs was 3');
  assert(auditGroup2.afterWorkoutRefs === 3, 'Case 9: Group 2 afterWorkoutRefs is 3 (100% conserved)');
  assert(res9.updatedLogs[0].exercises.every(e => e.exerciseId === 'seated-row'), 'Case 9: All 3 entries remapped to canonical seated-row');

  // Case 10: WeightStepPolicy integration check with canonical exercises
  const dbRowDef = DEFAULT_EXERCISES.find(e => e.id === 'dumbbell-row')!;
  assert(getWeightStep(dbRowDef as Partial<Exercise>) === 2, 'Case 10: Canonical dumbbell-row resolves to DUMBBELL_WEIGHT_STEP (2kg)');
  assert(getWeightStep(seatedDef as Partial<Exercise>) === 2.5, 'Case 10: Canonical seated-row resolves to DEFAULT_WEIGHT_STEP (2.5kg)');

  // Group 3 Test: 닐링 케이블 플라이 -> cable-fly
  const g3_logs: WorkoutLog[] = [
    {
      id: 'log-g3',
      date: '2026-06-10',
      notes: '',
      exercises: [
        { exerciseId: 'kneeling-cable-fly', exerciseName: '닐링 케이블 플라이', category: 'Chest', sets: [{ id: 's1', weight: 15, reps: 12 }] },
      ],
    },
  ];
  const resG3 = applyCanonicalExerciseMigration(g3_logs, [], [], DEFAULT_EXERCISES);
  assert(resG3.updatedLogs[0].exercises[0].exerciseId === 'cable-fly', 'Group 3: 닐링 케이블 플라이 migrated to cable-fly');

  // Group 4 Test: 케이블 푸시다운 -> triceps-pushdown
  const g4_logs: WorkoutLog[] = [
    {
      id: 'log-g4',
      date: '2026-06-11',
      notes: '',
      exercises: [
        { exerciseId: 'custom-pushdown', exerciseName: '케이블 푸시다운', category: 'Arms', sets: [{ id: 's1', weight: 25, reps: 15 }] },
      ],
    },
  ];
  const resG4 = applyCanonicalExerciseMigration(g4_logs, [], [], DEFAULT_EXERCISES);
  assert(resG4.updatedLogs[0].exercises[0].exerciseId === 'triceps-pushdown', 'Group 4: 케이블 푸시다운 migrated to triceps-pushdown');

  console.log('🎉 All Exercise Database Canonical Merge tests PASSED!');
  return true;
}

if (import.meta.url.endsWith('exerciseCanonicalDomain.test.ts') || process.argv[1]?.includes('exerciseCanonicalDomain.test.ts')) {
  runCanonicalMigrationTests();
}
