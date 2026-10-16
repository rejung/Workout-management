/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { workoutRepository } from './workoutRepository';
import { storage, StorageBackend } from './storage';
import { DEFAULT_EXERCISES, DEFAULT_ROUTINES } from '../constants';
import { Exercise, WorkoutLog, Routine } from '../types';

function createMockStorage(): { store: StorageBackend; rawMap: Map<string, string> } {
  const rawMap = new Map<string, string>();
  const store: StorageBackend = {
    getItem: (k: string) => rawMap.has(k) ? (rawMap.get(k) ?? null) : null,
    setItem: (k: string, v: string) => { rawMap.set(k, v); },
    removeItem: (k: string) => { rawMap.delete(k); },
    clear: () => { rawMap.clear(); }
  };
  return { store, rawMap };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export function runExerciseLibraryPreservationTests() {
  console.log('=== Running Exercise Library Preservation Tests ===');

  // Test 1: Fresh install -> seeds default exercises when key is genuinely absent
  {
    const { store, rawMap } = createMockStorage();
    storage.setStoreProvider(() => store);

    assert(rawMap.get('wms_exercises') === undefined, 'Test 1: Key wms_exercises is absent initially');
    
    workoutRepository.initialize();
    
    assert(rawMap.has('wms_exercises'), 'Test 1: Default exercises seeded on fresh install');
    const exercises = workoutRepository.getExercises();
    assert(exercises.length > 0, 'Test 1: getExercises returns seeded exercises');
    assert(exercises.some(e => e.id === 'bench-press'), 'Test 1: Contains bench-press');
  }

  // Test 2: Preserves empty dictionary [] across initialization
  {
    const { store, rawMap } = createMockStorage();
    storage.setStoreProvider(() => store);

    // Save empty array
    workoutRepository.saveExercises([]);
    assert(rawMap.get('wms_exercises') === '[]', 'Test 2: Empty array stored in storage');

    // Re-initialize multiple times
    workoutRepository.initialize();
    workoutRepository.initialize();

    const exercises = workoutRepository.getExercises();
    assert(Array.isArray(exercises) && exercises.length === 0, 'Test 2: Empty array [] is preserved across re-initializations');
    assert(rawMap.get('wms_exercises') === '[]', 'Test 2: Storage remains []');
  }

  // Test 3: Deleted default exercise remains deleted across restart (re-initialization)
  {
    const { store } = createMockStorage();
    storage.setStoreProvider(() => store);

    // Fresh install
    workoutRepository.initialize();
    const initialExercises = workoutRepository.getExercises();
    const initialCount = initialExercises.length;
    assert(initialExercises.some(e => e.id === 'bench-press'), 'Test 3: bench-press initially exists');

    // User deletes bench-press
    workoutRepository.deleteExercise('bench-press');
    const afterDelete = workoutRepository.getExercises();
    assert(afterDelete.length === initialCount - 1, 'Test 3: Exercise count decreased by 1');
    assert(!afterDelete.some(e => e.id === 'bench-press'), 'Test 3: bench-press is deleted');

    // Simulate app restart / page reload
    workoutRepository.initialize();
    workoutRepository.initialize();

    const afterRestart = workoutRepository.getExercises();
    assert(!afterRestart.some(e => e.id === 'bench-press'), 'Test 3: Deleted bench-press is NOT re-added on restart');
    assert(afterRestart.length === initialCount - 1, 'Test 3: Exercise count strictly preserved');
  }

  // Test 4: User-modified attributes (name, category, equipment, logType) are 100% preserved
  {
    const { store } = createMockStorage();
    storage.setStoreProvider(() => store);

    workoutRepository.initialize();
    
    // Modify squat attributes
    const modifiedSquat: Exercise = {
      id: 'squat',
      name: '나만의 하이바 스쿼트',
      category: 'Core', // Changed from Legs to Core
      equipment: 'MACHINE', // Changed from BARBELL to MACHINE
      logType: 'TIME_BASED', // Changed from STANDARD to TIME_BASED
      canonicalName: '스쿼트',
      isCustom: false
    };

    workoutRepository.updateExercise(modifiedSquat);

    // Verify before restart
    const current = workoutRepository.getExercises().find(e => e.id === 'squat')!;
    assert(current.name === '나만의 하이바 스쿼트', 'Test 4: Name updated');
    assert(current.category === 'Core', 'Test 4: Category updated to Core');
    assert(current.equipment === 'MACHINE', 'Test 4: Equipment updated to MACHINE');
    assert(current.logType === 'TIME_BASED', 'Test 4: LogType updated to TIME_BASED');

    // Simulate app restart / page reload multiple times
    workoutRepository.initialize();
    workoutRepository.initialize();

    const afterRestart = workoutRepository.getExercises().find(e => e.id === 'squat')!;
    assert(afterRestart.name === '나만의 하이바 스쿼트', 'Test 4: Modified name preserved across restart');
    assert(afterRestart.category === 'Core', 'Test 4: Modified category preserved across restart (not reverted to Legs)');
    assert(afterRestart.equipment === 'MACHINE', 'Test 4: Modified equipment preserved across restart');
    assert(afterRestart.logType === 'TIME_BASED', 'Test 4: Modified logType preserved across restart');
  }

  // Test 5: Distinction between key absence and read/parsing failure & corrupted raw data preservation
  {
    const { store, rawMap } = createMockStorage();
    storage.setStoreProvider(() => store);

    // Corrupted JSON in wms_exercises
    const corruptPayload = '{"broken": json payload...';
    rawMap.set('wms_exercises', corruptPayload);

    let initThrew = false;
    try {
      workoutRepository.initialize();
    } catch (e: any) {
      initThrew = true;
      assert(e.message.includes('Failed to parse exercises from storage'), 'Test 5: Error message mentions parse failure');
    }
    assert(initThrew, 'Test 5: initialize() throws on corrupted storage payload');
    assert(rawMap.get('wms_exercises') === corruptPayload, 'Test 5: Corrupted raw payload is preserved intact in storage');

    let getExThrew = false;
    try {
      workoutRepository.getExercises();
    } catch (e: any) {
      getExThrew = true;
    }
    assert(getExThrew, 'Test 5: getExercises() throws on corrupted storage payload');
    assert(rawMap.get('wms_exercises') === corruptPayload, 'Test 5: Corrupted raw payload STILL preserved intact');

    // Non-array JSON payload
    rawMap.set('wms_exercises', JSON.stringify({ message: 'not an array' }));
    let nonArrayThrew = false;
    try {
      workoutRepository.initialize();
    } catch (e: any) {
      nonArrayThrew = true;
      assert(e.message.includes('expected JSON array'), 'Test 5: Error message mentions non-array type');
    }
    assert(nonArrayThrew, 'Test 5: Throws when storage payload is not an array');
  }

  // Test 6: Past workout logs and routines are fully preserved with IDs intact
  {
    const { store } = createMockStorage();
    storage.setStoreProvider(() => store);

    const sampleLog: WorkoutLog = {
      id: 'log-user-historical-01',
      date: '2026-05-10',
      notes: '테스트 일지',
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseName: '벤치프레스',
          category: 'Chest',
          sets: [{ id: 's1', weight: 80, reps: 5 }]
        }
      ]
    };

    const sampleRoutine: Routine = {
      id: 'routine-custom-01',
      name: '내 루틴',
      description: '루틴 설명',
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseName: '벤치프레스',
          category: 'Chest',
          targetSetsCount: 5
        }
      ]
    };

    workoutRepository.saveLogs([sampleLog]);
    workoutRepository.saveRoutines([sampleRoutine]);
    workoutRepository.saveExercises(DEFAULT_EXERCISES);

    // Initialize multiple times
    workoutRepository.initialize();
    workoutRepository.initialize();

    const logs = workoutRepository.getLogs();
    assert(logs.length === 1, 'Test 6: Log count preserved');
    assert(logs[0].id === 'log-user-historical-01', 'Test 6: Log ID preserved');
    assert(logs[0].exercises[0].exerciseId === 'bench-press', 'Test 6: Exercise ID in log preserved');

    const routines = workoutRepository.getRoutines();
    assert(routines.some(r => r.id === 'routine-custom-01'), 'Test 6: Routine preserved');
    const r = routines.find(r => r.id === 'routine-custom-01')!;
    assert(r.exercises[0].exerciseId === 'bench-press', 'Test 6: Exercise ID in routine preserved');
  }

  // Test 7: Exercise update preserves unedited fields (id, logType, canonicalName) and updates name, category, equipment
  {
    const { store } = createMockStorage();
    storage.setStoreProvider(() => store);

    workoutRepository.initialize();
    const originalBench = workoutRepository.getExercises().find(e => e.id === 'bench-press')!;
    assert(originalBench !== undefined, 'Test 7: original bench-press exists');

    // Update bench-press name, category, and equipment
    const updatedBench: Exercise = {
      ...originalBench,
      name: '  플랫 바벨 벤치프레스  '.trim(),
      category: 'Shoulders',
      equipment: 'BARBELL',
    };

    workoutRepository.updateExercise(updatedBench);

    const reloadedBench = workoutRepository.getExercises().find(e => e.id === 'bench-press')!;
    assert(reloadedBench.name === '플랫 바벨 벤치프레스', 'Test 7: Name trimmed and updated');
    assert(reloadedBench.category === 'Shoulders', 'Test 7: Category updated');
    assert(reloadedBench.equipment === 'BARBELL', 'Test 7: Equipment updated');
    assert(reloadedBench.id === 'bench-press', 'Test 7: ID preserved');
    assert(reloadedBench.logType === originalBench.logType, 'Test 7: LogType preserved');
    assert(reloadedBench.canonicalName === originalBench.canonicalName, 'Test 7: CanonicalName preserved');

    // Re-initialize to verify persistence
    workoutRepository.initialize();
    const persistedBench = workoutRepository.getExercises().find(e => e.id === 'bench-press')!;
    assert(persistedBench.name === '플랫 바벨 벤치프레스', 'Test 7: Persisted across restart');
    assert(persistedBench.category === 'Shoulders', 'Test 7: Category persisted across restart');
  }

  // Reset store provider to default
  storage.setStoreProvider(null);
  console.log('🎉 All Exercise Library Preservation tests PASSED!');
  return true;
}

if (import.meta.url.endsWith('exerciseLibraryPreservation.test.ts') || process.argv[1]?.includes('exerciseLibraryPreservation.test.ts')) {
  runExerciseLibraryPreservationTests();
}
