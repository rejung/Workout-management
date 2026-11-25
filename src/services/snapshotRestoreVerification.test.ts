import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotService, AtomicRestoreError } from './snapshotService';
import { storage, StorageBackend } from '../storage/storage';
import { WorkoutLog, Routine, Exercise } from '../types';

// Run only in Node: node --import tsx --test src/services/snapshotRestoreVerification.test.ts
function withIsolatedStorage(run: (data: Map<string, string>, backend: StorageBackend) => void) {
  const data = new Map<string, string>();
  const backend: StorageBackend = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
    clear: () => { data.clear(); },
  };
  storage.setStoreProvider(() => backend);
  try { run(data, backend); } finally { storage.setStoreProvider(null); }
}

function fixture(id: string) {
  const logs: WorkoutLog[] = [{
    id, date: '2026-10-16', startTime: '19:00', notes: '',
    exercises: [{
      exerciseId: 'bench-press', exerciseName: 'Bench Press', category: 'Chest',
      sets: [{ id: `${id}-set`, weight: 27, reps: 12, isWarmup: false }],
    }],
  }];
  const routines: Routine[] = [{
    id: 'routine', name: 'Bench', description: '',
    exercises: [{ exerciseId: 'bench-press', exerciseName: 'Bench Press', category: 'Chest', targetSetsCount: 4 }],
  }];
  const exercises: Exercise[] = [{ id: 'bench-press', name: 'Bench Press', category: 'Chest', logType: 'STANDARD' }];
  return snapshotService.createSnapshot(logs, [{ id: `${id}-weight`, date: '2026-10-15', weight: 70 }], routines, exercises);
}

const corruptions: [string, string, (value: any) => void][] = [
  ['set weight', 'wms_logs', value => { value[0].exercises[0].sets[0].weight = 25; }],
  ['set reps', 'wms_logs', value => { value[0].exercises[0].sets[0].reps = 1; }],
  ['set warmup flag', 'wms_logs', value => { value[0].exercises[0].sets[0].isWarmup = true; }],
  ['routine target', 'wms_routines', value => { value[0].exercises[0].targetSetsCount = 1; }],
  ['exercise name', 'wms_exercises', value => { value[0].name = 'Changed'; }],
  ['weight log date', 'wms_weight_logs', value => { value[0].date = '2026-10-14'; }],
  ['goal value', 'wms_goal_settings', value => { value.benchGoal = 999; }],
];

for (const [name, targetKey, mutate] of corruptions) {
  test(`restore rejects silent ${name} corruption and restores all prior content`, () => {
    withIsolatedStorage((data, backend) => {
      snapshotService.restoreSnapshot(fixture('existing'));
      const before = new Map(data);
      const incoming = fixture('incoming');
      const write = backend.setItem;
      let corruptNextWrite = true;
      backend.setItem = (key, text) => {
        if (key === targetKey && corruptNextWrite) {
          corruptNextWrite = false;
          const value = JSON.parse(text);
          mutate(value);
          text = JSON.stringify(value);
        }
        write(key, text);
      };
      const callbacks: string[] = [];
      assert.throws(
        () => snapshotService.restoreSnapshot(incoming, state => { callbacks.push(state.logs[0].id); }),
        error => error instanceof AtomicRestoreError && error.cause.message.includes('Verification failed') && error.rollbackError === null,
      );
      assert.deepEqual(data, before, 'every stored collection must roll back');
      assert.deepEqual(callbacks, ['existing'], 'only the rollback state reaches the UI');
    });
  });
}

test('restore accepts reordered JSON object keys without losing nested content', () => {
  withIsolatedStorage((data, backend) => {
    const source = fixture('incoming');
    const write = backend.setItem;
    backend.setItem = (key, text) => write(key, JSON.stringify(JSON.parse(text), (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value));
    let delivered: WorkoutLog[] | undefined;
    const summary = snapshotService.restoreSnapshot(source, state => { delivered = state.logs; });
    assert.equal(summary.logsCount, 1);
    assert.deepEqual(delivered, source.workoutLogs);
    assert.deepEqual(JSON.parse(data.get('wms_logs')!), source.workoutLogs);
  });
});
