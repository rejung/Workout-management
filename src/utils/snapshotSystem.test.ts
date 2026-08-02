/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { snapshotService } from '../services/snapshotService';
import { WorkoutLog, Routine, Exercise, SnapshotWeightLog } from '../types';
import { CURRENT_SCHEMA_VERSION, CURRENT_SNAPSHOT_VERSION } from '../constants';

export interface TestResult {
  scenario: string;
  passed: boolean;
  message: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

export function runSnapshotSystemTests(): TestSuiteSummary {
  const results: TestResult[] = [];

  const mockExercises: Exercise[] = [
    { id: 'bench-press', name: 'Bench Press', category: 'Chest' }
  ];
  const mockRoutines: Routine[] = [
    { id: 'routine-1', name: 'Push Day', description: 'Push routine', exercises: [] }
  ];
  const mockWorkoutLogs: WorkoutLog[] = [
    {
      id: 'workout-2026-07-04',
      date: '2026-07-04',
      notes: 'Good workout',
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseName: 'Bench Press',
          category: 'Chest',
          sets: [
            { id: 'set-1', weight: 80, reps: 8, isWarmup: false },
            { id: 'set-2', weight: 85, reps: 6, isWarmup: false }
          ]
        }
      ]
    }
  ];
  const mockWeightLogs: SnapshotWeightLog[] = [
    { id: 'weight-2026-07-04', date: '2026-07-04', weight: 82.5 }
  ];

  // 1. ✅ 정상 Export
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (val.isValid && val.healthScore === 100 && val.statistics?.workoutCount === 1 && val.statistics?.setCount === 2) {
      results.push({ scenario: '✅ 정상 Export', passed: true, message: '스냅샷 생성, 통계 계산 및 100점 건강도 검증 통과' });
    } else {
      results.push({ scenario: '✅ 정상 Export', passed: false, message: `검증 실패 또는 건강도 점수 불일치 (${val.error || val.healthScore})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 정상 Export', passed: false, message: err.message });
  }

  // 2. ✅ 정상 Restore
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    let imported = false;
    const summary = snapshotService.restoreSnapshot(
      snapshot,
      (data) => {
        if (data.logs.length === 1 && data.weightLogs?.length === 1) imported = true;
      },
      [],
      []
    );
    if (imported && summary.logsCount === 1 && summary.healthScore === 100) {
      results.push({ scenario: '✅ 정상 Restore', passed: true, message: '무결한 스냅샷 Atomic Restore 성공 및 Callback 실행 검증 통과' });
    } else {
      results.push({ scenario: '✅ 정상 Restore', passed: false, message: 'Restore callback 미실행 또는 개수 불일치' });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 정상 Restore', passed: false, message: err.message });
  }

  // 3. ✅ 손상 JSON
  try {
    const invalidJson = '{ workoutLogs: [ { id: "test" - corrupted json';
    const val = snapshotService.validateSnapshot(invalidJson);
    if (!val.isValid && val.error?.includes('JSON 파싱 실패')) {
      results.push({ scenario: '✅ 손상 JSON', passed: true, message: `손상된 JSON 문자열 정확히 차단: ${val.error}` });
    } else {
      results.push({ scenario: '✅ 손상 JSON', passed: false, message: '손상된 JSON이 통과되었거나 에러 메시지가 다름' });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 손상 JSON', passed: true, message: '손상 JSON 예외 안전 처리' });
  }

  // 4. ✅ schemaVersion 누락
  try {
    const snapshot = {
      version: CURRENT_SNAPSHOT_VERSION,
      workoutLogs: mockWorkoutLogs,
      weightLogs: mockWeightLogs,
      metadata: { appName: 'Workout Management System', snapshotType: 'application' } // schemaVersion 누락
    };
    const val = snapshotService.validateSnapshot(snapshot);
    if (val.isValid && val.healthScore < 100 && val.healthReasons.some(r => r.includes('Schema'))) {
      results.push({ scenario: '✅ schemaVersion 누락', passed: true, message: `Schema 버전 누락 감지 및 건강도 점수 감점 (현재 점수: ${val.healthScore}점)` });
    } else {
      results.push({ scenario: '✅ schemaVersion 누락', passed: false, message: `감점 실패 (점수: ${val.healthScore})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ schemaVersion 누락', passed: false, message: err.message });
  }

  // 5. ✅ Metadata 누락
  try {
    const snapshot = {
      version: CURRENT_SNAPSHOT_VERSION,
      workoutLogs: mockWorkoutLogs,
      weightLogs: mockWeightLogs
      // metadata 아예 누락
    };
    const val = snapshotService.validateSnapshot(snapshot);
    if (val.isValid && val.healthScore < 100 && val.healthReasons.some(r => r.includes('Metadata'))) {
      results.push({ scenario: '✅ Metadata 누락', passed: true, message: `Metadata 누락 감지 및 건강도 점수 감점 (현재 점수: ${val.healthScore}점)` });
    } else {
      results.push({ scenario: '✅ Metadata 누락', passed: false, message: `감점 실패 (점수: ${val.healthScore})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ Metadata 누락', passed: false, message: err.message });
  }

  // 6. ✅ Duplicate ID
  try {
    const dupLogs = [
      ...mockWorkoutLogs,
      { ...mockWorkoutLogs[0], notes: 'Duplicate log' } // identical ID "workout-2026-07-04"
    ];
    const snapshot = snapshotService.createSnapshot(dupLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('Duplicate WorkoutLog ID: workout-2026-07-04')) {
      results.push({ scenario: '✅ Duplicate ID', passed: true, message: `중복 ID 정확히 차단 및 메시지 검증 통과: "${val.error}"` });
    } else {
      results.push({ scenario: '✅ Duplicate ID', passed: false, message: `중복 ID 차단 실패 또는 메시지 불일치 (${val.error})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ Duplicate ID', passed: false, message: err.message });
  }

  // 7. ✅ 날짜 오류
  try {
    const badDateLogs: WorkoutLog[] = [
      {
        ...mockWorkoutLogs[0],
        date: '2026-13-50' // invalid calendar date
      }
    ];
    const snapshot = snapshotService.createSnapshot(badDateLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('Invalid workoutLogs[0].date')) {
      results.push({ scenario: '✅ 날짜 오류', passed: true, message: `잘못된 날짜(2026-13-50) 정확히 차단 및 위치 반환: "${val.error}"` });
    } else {
      results.push({ scenario: '✅ 날짜 오류', passed: false, message: `날짜 검증 실패 (${val.error})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 날짜 오류', passed: false, message: err.message });
  }

  // 8. ✅ 잘못된 타입
  try {
    const badTypeLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseName: 'Bench Press',
            category: 'Chest',
            sets: [
              { id: 'set-1', weight: "100kg" as unknown as number, reps: 8 } // string instead of number
            ]
          }
        ]
      }
    ] as WorkoutLog[];
    const snapshot = snapshotService.createSnapshot(badTypeLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('Invalid workoutLogs[0].exercises[0].sets[0].weight')) {
      results.push({ scenario: '✅ 잘못된 타입', passed: true, message: `중첩 객체의 잘못된 타입 정확히 감지 및 위치 반환: "${val.error}"` });
    } else {
      results.push({ scenario: '✅ 잘못된 타입', passed: false, message: `타입 오류 감지 실패 (${val.error})` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 잘못된 타입', passed: false, message: err.message });
  }

  // 9. ✅ Atomic Restore 실패
  try {
    const badSnapshot = {
      version: CURRENT_SNAPSHOT_VERSION,
      workoutLogs: [
        { id: 'bad-log', date: '2026/07/04', exercises: [] } // invalid date 2026/07/04
      ]
    } as unknown as any;

    let callbackCalled = false;
    try {
      snapshotService.restoreSnapshot(
        badSnapshot,
        () => { callbackCalled = true; },
        [],
        []
      );
    } catch (err: any) {
      // Expected to throw
    }

    if (!callbackCalled) {
      results.push({ scenario: '✅ Atomic Restore 실패', passed: true, message: '검증 오류 시 Restore 중단 및 스토리지 콜백 미실행 검증 완료' });
    } else {
      results.push({ scenario: '✅ Atomic Restore 실패', passed: false, message: '오류가 있었음에도 콜백이 실행됨 (Atomic 실패)' });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ Atomic Restore 실패', passed: false, message: err.message });
  }

  // 10. ✅ 문자열(String) 형태 백업 파싱
  try {
    const snapshotObj = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const snapshotStr = JSON.stringify(snapshotObj);
    const val = snapshotService.validateSnapshot(snapshotStr);
    if (val.isValid && val.healthScore === 100 && val.statistics?.workoutCount === 1 && val.statistics?.setCount === 2) {
      results.push({ scenario: '✅ 문자열 백업 파싱', passed: true, message: 'JSON 문자열(String) 형태의 백업 파일 완벽 검증 및 통계 추출 성공' });
    } else {
      results.push({ scenario: '✅ 문자열 백업 파싱', passed: false, message: `문자열 검증 실패: ${val.error || '건강도 불일치'}` });
    }
  } catch (err: any) {
    results.push({ scenario: '✅ 문자열 백업 파싱', passed: false, message: err.message });
  }

  const passedCount = results.filter(r => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}
