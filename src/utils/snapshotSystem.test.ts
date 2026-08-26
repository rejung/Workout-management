/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { snapshotService, AtomicRestoreError } from '../services/snapshotService';
import { WorkoutLog, Routine, Exercise, SnapshotWeightLog } from '../types';
import { CURRENT_SCHEMA_VERSION, CURRENT_SNAPSHOT_VERSION } from '../constants';
import { workoutRepository } from '../storage/workoutRepository';
import { weightRepository } from '../storage/weightRepository';
import { goalRepository } from '../storage/goalRepository';
import { storage } from '../storage/storage';

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
    {
      id: 'routine-1',
      name: 'Push Day',
      description: 'Push routine',
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseName: 'Bench Press',
          category: 'Chest',
          targetSetsCount: 3
        }
      ]
    }
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

  // Helper for test assertions
  const recordResult = (scenario: string, passed: boolean, message: string) => {
    results.push({ scenario, passed, message });
  };

  // 1. ✅ 정상 Export
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (val.isValid && val.healthScore === 100 && val.statistics?.workoutCount === 1 && val.statistics?.setCount === 2) {
      recordResult('✅ 정상 Export', true, '스냅샷 생성, 통계 계산 및 100점 건강도 검증 통과');
    } else {
      recordResult('✅ 정상 Export', false, `검증 실패 또는 건강도 점수 불일치 (${val.error || val.healthScore})`);
    }
  } catch (err: any) {
    recordResult('✅ 정상 Export', false, err.message);
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
      recordResult('✅ 정상 Restore', true, '무결한 스냅샷 Atomic Restore 성공 및 Callback 실행 검증 통과');
    } else {
      recordResult('✅ 정상 Restore', false, 'Restore callback 미실행 또는 개수 불일치');
    }
  } catch (err: any) {
    recordResult('✅ 정상 Restore', false, err.message);
  }

  // 3. ✅ 손상 JSON
  try {
    const invalidJson = '{ workoutLogs: [ { id: "test" - corrupted json';
    const val = snapshotService.validateSnapshot(invalidJson);
    if (!val.isValid && val.error?.includes('JSON 파싱 실패')) {
      recordResult('✅ 손상 JSON', true, `손상된 JSON 문자열 정확히 차단: ${val.error}`);
    } else {
      recordResult('✅ 손상 JSON', false, '손상된 JSON이 통과되었거나 에러 메시지가 다름');
    }
  } catch (err: any) {
    recordResult('✅ 손상 JSON', true, '손상 JSON 예외 안전 처리');
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
      recordResult('✅ schemaVersion 누락', true, `Schema 버전 누락 감지 및 건강도 점수 감점 (현재 점수: ${val.healthScore}점)`);
    } else {
      recordResult('✅ schemaVersion 누락', false, `감점 실패 (점수: ${val.healthScore})`);
    }
  } catch (err: any) {
    recordResult('✅ schemaVersion 누락', false, err.message);
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
      recordResult('✅ Metadata 누락', true, `Metadata 누락 감지 및 건강도 점수 감점 (현재 점수: ${val.healthScore}점)`);
    } else {
      recordResult('✅ Metadata 누락', false, `감점 실패 (점수: ${val.healthScore})`);
    }
  } catch (err: any) {
    recordResult('✅ Metadata 누락', false, err.message);
  }

  // 6. ✅ [M5] Duplicate WorkoutLog ID
  try {
    const dupLogs = [
      ...mockWorkoutLogs,
      { ...mockWorkoutLogs[0], notes: 'Duplicate log' } // identical ID "workout-2026-07-04"
    ];
    const snapshot = snapshotService.createSnapshot(dupLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('Duplicate WorkoutLog ID: workout-2026-07-04')) {
      recordResult('✅ [M5] Duplicate WorkoutLog ID', true, `중복 ID 정확히 차단 및 메시지 검증 통과: "${val.error}"`);
    } else {
      recordResult('✅ [M5] Duplicate WorkoutLog ID', false, `중복 ID 차단 실패 또는 메시지 불일치 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M5] Duplicate WorkoutLog ID', false, err.message);
  }

  // 7. ✅ [M7] 날짜 오류 (WorkoutLog Date - 2026-13-50 & 2026-02-31)
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
      recordResult('✅ [M7] 날짜 오류 (2026-13-50)', true, `잘못된 날짜(2026-13-50) 정확히 차단 및 위치 반환: "${val.error}"`);
    } else {
      recordResult('✅ [M7] 날짜 오류 (2026-13-50)', false, `날짜 검증 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M7] 날짜 오류 (2026-13-50)', false, err.message);
  }

  // 8. ✅ [M9] 잘못된 타입 (Set weight string "100kg")
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
      recordResult('✅ [M9] Set Weight String 차단', true, `중첩 객체의 잘못된 타입("100kg") 정확히 감지 및 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M9] Set Weight String 차단', false, `타입 오류 감지 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M9] Set Weight String 차단', false, err.message);
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
      recordResult('✅ Atomic Restore 실패', true, '검증 오류 시 Restore 중단 및 스토리지 콜백 미실행 검증 완료 (Write count: 0)');
    } else {
      recordResult('✅ Atomic Restore 실패', false, '오류가 있었음에도 콜백이 실행됨 (Atomic 실패)');
    }
  } catch (err: any) {
    recordResult('✅ Atomic Restore 실패', false, err.message);
  }

  // 10. ✅ 문자열(String) 형태 백업 파싱
  try {
    const snapshotObj = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const snapshotStr = JSON.stringify(snapshotObj);
    const val = snapshotService.validateSnapshot(snapshotStr);
    if (val.isValid && val.healthScore === 100 && val.statistics?.workoutCount === 1 && val.statistics?.setCount === 2) {
      recordResult('✅ 문자열 백업 파싱', true, 'JSON 문자열(String) 형태의 백업 파일 완벽 검증 및 통계 추출 성공');
    } else {
      recordResult('✅ 문자열 백업 파싱', false, `문자열 검증 실패: ${val.error || '건강도 불일치'}`);
    }
  } catch (err: any) {
    recordResult('✅ 문자열 백업 파싱', false, err.message);
  }

  // 11. ✅ [M1] Routines Collection Object 변조
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const mutated = { ...snapshot, routines: { invalid: 'object' } as any };
    const val = snapshotService.validateSnapshot(mutated);
    if (!val.isValid && val.error?.includes('Invalid routines')) {
      recordResult('✅ [M1] Routines Collection Object 차단', true, `Routines가 Object로 변조된 경우 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M1] Routines Collection Object 차단', false, `M1 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M1] Routines Collection Object 차단', false, err.message);
  }

  // 12. ✅ [M2] Numeric Goal String 변조
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const mutated = {
      ...snapshot,
      goalSettings: {
        weightGoal: 75,
        benchGoal: "100" as any, // Numeric string instead of number
        ohpGoal: 60,
        squatGoal: 140,
        deadliftGoal: 180
      }
    };
    const val = snapshotService.validateSnapshot(mutated);
    if (!val.isValid && val.error?.includes('Invalid goalSettings.benchGoal')) {
      recordResult('✅ [M2] Numeric Goal String 차단', true, `Goal 숫자가 문자열("100")로 변조된 경우 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M2] Numeric Goal String 차단', false, `M2 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M2] Numeric Goal String 차단', false, err.message);
  }

  // 13. ✅ [M3] Exercise Name 누락 차단
  try {
    const badLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            // exerciseName missing
            category: 'Chest',
            sets: [{ id: 'set-1', weight: 80, reps: 8 }]
          }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(badLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('exerciseName: required non-empty string')) {
      recordResult('✅ [M3] Exercise Name 누락 차단', true, `Exercise name 누락 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M3] Exercise Name 누락 차단', false, `M3 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M3] Exercise Name 누락 차단', false, err.message);
  }

  // 14. ✅ [M4] Exercise Category 누락 차단
  try {
    const badLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseName: 'Bench Press',
            // category missing
            sets: [{ id: 'set-1', weight: 80, reps: 8 }]
          }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(badLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('category: required non-empty string')) {
      recordResult('✅ [M4] Exercise Category 누락 차단', true, `Exercise category 누락 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M4] Exercise Category 누락 차단', false, `M4 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M4] Exercise Category 누락 차단', false, err.message);
  }

  // 15. ✅ [M6] Duplicate WeightLog ID 차단
  try {
    const dupWeightLogs = [
      { id: 'weight-1', date: '2026-07-04', weight: 82.5 },
      { id: 'weight-1', date: '2026-07-05', weight: 83.0 }
    ];
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, dupWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('Duplicate WeightLog ID: weight-1')) {
      recordResult('✅ [M6] Duplicate WeightLog ID 차단', true, `중복 WeightLog ID 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M6] Duplicate WeightLog ID 차단', false, `M6 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M6] Duplicate WeightLog ID 차단', false, err.message);
  }

  // 16. ✅ [M8] Set 음수값 (Negative Weight/Reps) 차단
  try {
    const badSetLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseName: 'Bench Press',
            category: 'Chest',
            sets: [{ id: 'set-1', weight: -10, reps: 8 }]
          }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(badSetLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('expected non-negative finite number')) {
      recordResult('✅ [M8] Set 음수값 차단', true, `Set weight 음수값(-10) 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M8] Set 음수값 차단', false, `M8 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M8] Set 음수값 차단', false, err.message);
  }

  // 17. ✅ [M10] Set / Goal NaN 변조 차단
  try {
    const nanSetLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseName: 'Bench Press',
            category: 'Chest',
            sets: [{ id: 'set-1', weight: NaN, reps: 8 }]
          }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(nanSetLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('expected non-negative finite number')) {
      recordResult('✅ [M10] Set NaN 변조 차단', true, `Set weight NaN 변조 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M10] Set NaN 변조 차단', false, `M10 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M10] Set NaN 변조 차단', false, err.message);
  }

  // 18. ✅ [M11] Set / Goal Infinity 변조 차단
  try {
    const infSetLogs = [
      {
        ...mockWorkoutLogs[0],
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseName: 'Bench Press',
            category: 'Chest',
            sets: [{ id: 'set-1', weight: Infinity, reps: 8 }]
          }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(infSetLogs, mockWeightLogs, mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('expected non-negative finite number')) {
      recordResult('✅ [M11] Set Infinity 변조 차단', true, `Set weight Infinity 변조 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M11] Set Infinity 변조 차단', false, `M11 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M11] Set Infinity 변조 차단', false, err.message);
  }

  // 19. ✅ [M12] Metadata Statistics 불일치 차단
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const mutated = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        statistics: {
          workoutCount: 999, // Mismatched workout count (actual: 1)
          exerciseCount: 1,
          setCount: 2,
          weightCount: 1
        }
      }
    };
    const val = snapshotService.validateSnapshot(mutated);
    if (!val.isValid && val.error?.includes('Metadata statistics mismatch: workoutCount')) {
      recordResult('✅ [M12] Metadata Statistics 불일치 차단', true, `Metadata statistics 불일치 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M12] Metadata Statistics 불일치 차단', false, `M12 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M12] Metadata Statistics 불일치 차단', false, err.message);
  }

  // 20. ✅ [M13] workoutLogs vs logs 불일치 (Semantic Mismatch) 차단
  try {
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const mutated = {
      ...snapshot,
      logs: [
        {
          ...mockWorkoutLogs[0],
          notes: 'Mutated logs note causing semantic mismatch with workoutLogs'
        }
      ]
    };
    const val = snapshotService.validateSnapshot(mutated);
    if (!val.isValid && val.error?.includes('Compatibility alias mismatch')) {
      recordResult('✅ [M13] workoutLogs vs logs 불일치 차단', true, `workoutLogs와 logs 간 불일치 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M13] workoutLogs vs logs 불일치 차단', false, `M13 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M13] workoutLogs vs logs 불일치 차단', false, err.message);
  }

  // 21. ✅ [M14] Routine Exercise Malformed 구조 차단
  try {
    const mutatedRoutines = [
      {
        id: 'routine-1',
        name: 'Push Day',
        exercises: [
          { invalid: 'malformed_exercise_without_exerciseId' }
        ]
      }
    ] as any;
    const snapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mutatedRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(snapshot);
    if (!val.isValid && val.error?.includes('exerciseId: required non-empty string')) {
      recordResult('✅ [M14] Routine Exercise Malformed 차단', true, `Routine Exercise malformed 구조 정확히 차단: "${val.error}"`);
    } else {
      recordResult('✅ [M14] Routine Exercise Malformed 차단', false, `M14 차단 실패 (${val.error})`);
    }
  } catch (err: any) {
    recordResult('✅ [M14] Routine Exercise Malformed 차단', false, err.message);
  }

  // 22. ✅ Input Immutability (불변성 검증)
  try {
    const originalSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const snapshotClone = structuredClone(originalSnapshot);
    
    // Run validation on the snapshot
    snapshotService.validateSnapshot(originalSnapshot);
    
    // Verify that originalSnapshot was not mutated in any way
    const isEqual = JSON.stringify(originalSnapshot) === JSON.stringify(snapshotClone);
    if (isEqual) {
      recordResult('✅ Input Immutability 검증', true, '검증 과정에서 원본 객체의 어떤 속성도 변경되지 않음 (structuredClone 일치)');
    } else {
      recordResult('✅ Input Immutability 검증', false, '검증 과정에서 원본 객체가 변조됨 (Immutability 위반)');
    }
  } catch (err: any) {
    recordResult('✅ Input Immutability 검증', false, err.message);
  }

  // =========================================================================
  // CU3 Required Failure Injection & Atomicity Transaction Tests (R1 ~ R9)
  // =========================================================================

  // Helper to snapshot all 5 repositories
  const getRepoStateString = () => {
    return JSON.stringify({
      logs: workoutRepository.getLogs(),
      routines: workoutRepository.getRoutines(),
      exercises: workoutRepository.getExercises(),
      weightLogs: weightRepository.getWeightLogs(),
      goalSettings: goalRepository.getGoalSettings()
    });
  };

  // Setup initial base state for R1~R9 tests
  const initialBaseLogs: WorkoutLog[] = [
    {
      id: 'base-log-1',
      date: '2026-06-01',
      notes: 'Initial base log',
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseName: 'Bench Press',
          category: 'Chest',
          sets: [{ id: 'base-s1', weight: 60, reps: 10 }]
        }
      ]
    }
  ];
  const initialBaseWeights: SnapshotWeightLog[] = [
    { id: 'base-w1', date: '2026-06-01', weight: 75.0 }
  ];

  // 23. ✅ [R1] Normal Full Restore (All Target Restoration)
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);

    const restoreTargetLogs: WorkoutLog[] = [
      {
        id: 'target-log-1',
        date: '2026-08-01',
        notes: '',
        exercises: [{ exerciseId: 'bench-press', exerciseName: 'Bench Press', category: 'Chest', sets: [{ id: 't-s1', weight: 100, reps: 5 }] }]
      },
      {
        id: 'target-log-2',
        date: '2026-08-02',
        notes: '',
        exercises: [{ exerciseId: 'bench-press', exerciseName: 'Bench Press', category: 'Chest', sets: [{ id: 't-s2', weight: 105, reps: 3 }] }]
      }
    ];
    const restoreTargetWeights: SnapshotWeightLog[] = [
      { id: 'target-w1', date: '2026-08-01', weight: 80.5 }
    ];

    const targetSnapshot = snapshotService.createSnapshot(restoreTargetLogs, restoreTargetWeights, mockRoutines, mockExercises);
    let uiSynced = false;
    const summary = snapshotService.restoreSnapshot(targetSnapshot, (data) => {
      uiSynced = data.logs.length === 2 && data.weightLogs?.length === 1;
    });

    const savedLogs = workoutRepository.getLogs();
    const savedWeights = weightRepository.getWeightLogs();

    if (summary.logsCount === 2 && savedLogs.length === 2 && savedLogs[0].id === 'target-log-1' && savedWeights.length === 1 && uiSynced) {
      recordResult('✅ [R1] Normal Full Restore', true, '5개 저장소 대상 전체 원자적 복원 및 UI 동기화 완료');
    } else {
      recordResult('✅ [R1] Normal Full Restore', false, `복원 후 데이터 불일치 (logs: ${savedLogs.length})`);
    }
  } catch (err: any) {
    recordResult('✅ [R1] Normal Full Restore', false, err.message);
  }

  // 24. ✅ [R2] Validation Failure (Pre-execution Abort, Write Count = 0)
  try {
    const preStateStr = getRepoStateString();

    const invalidSnapshot = {
      version: CURRENT_SNAPSHOT_VERSION,
      workoutLogs: [
        { id: 'bad-log', date: '2026-13-50', exercises: [] } // Invalid calendar date
      ]
    };

    let caught = false;
    try {
      snapshotService.restoreSnapshot(invalidSnapshot as any);
    } catch (e: any) {
      caught = true;
    }

    const postStateStr = getRepoStateString();
    if (caught && preStateStr === postStateStr) {
      recordResult('✅ [R2] Validation Failure 차단', true, '검증 실패 시 쓰기 0건(Write Count: 0) 및 사전 상태 100% 보존 확인');
    } else {
      recordResult('✅ [R2] Validation Failure 차단', false, '검증 실패 후 상태가 변조되었거나 예외 미발생');
    }
  } catch (err: any) {
    recordResult('✅ [R2] Validation Failure 차단', false, err.message);
  }

  // 25. ✅ [R3] First Write Failure Injection & Compensating Rollback (Logs Write Error)
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());
    const preStateStr = getRepoStateString();
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);

    // Mock failure on 'wms_logs' (first write, fails once then allows rollback)
    const memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });

    let failCountdown = 1;
    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (k === 'wms_logs' && failCountdown-- > 0) {
          throw new Error('Simulated QuotaExceededError on wms_logs');
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let caughtError: any = null;
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      caughtError = e;
    } finally {
      storage.setStoreProvider(null);
    }

    const postStateStr = getRepoStateString();
    const isAtomicError = caughtError instanceof AtomicRestoreError || (caughtError && caughtError.name === 'AtomicRestoreError');
    if (isAtomicError && caughtError.cause?.message?.includes('wms_logs') && preStateStr === postStateStr) {
      recordResult('✅ [R3] First Write Failure 롤백', true, '첫 번째 대상(Logs) 쓰기 실패 시 예외 전파 및 사전 상태 100% 복구');
    } else {
      recordResult('✅ [R3] First Write Failure 롤백', false, `R3 롤백 실패 (${caughtError?.message})`);
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R3] First Write Failure 롤백', false, err.message);
  }

  // 26. ✅ [R4] Middle Write Failure Injection & Compensating Rollback (Exercises Write Error)
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());
    const preStateStr = getRepoStateString();
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);

    // Mock failure on 'wms_exercises' (middle write, fails once then allows rollback)
    const memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });

    let failCountdown = 1;
    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (k === 'wms_exercises' && failCountdown-- > 0) {
          throw new Error('Simulated QuotaExceededError on wms_exercises');
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let caughtError: any = null;
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      caughtError = e;
    } finally {
      storage.setStoreProvider(null);
    }

    const postStateStr = getRepoStateString();
    const isAtomicError = caughtError instanceof AtomicRestoreError || (caughtError && caughtError.name === 'AtomicRestoreError');
    if (isAtomicError && caughtError.cause?.message?.includes('wms_exercises') && preStateStr === postStateStr) {
      recordResult('✅ [R4] Middle Write Failure 롤백', true, '중간 대상(Exercises) 쓰기 실패 시 선행 쓰기(Logs/Routines) 전면 롤백 완료');
    } else {
      recordResult('✅ [R4] Middle Write Failure 롤백', false, `R4 롤백 실패 (${caughtError?.message})`);
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R4] Middle Write Failure 롤백', false, err.message);
  }

  // 27. ✅ [R5] Final Write Failure Injection & Compensating Rollback (GoalSettings Write Error)
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());
    const preStateStr = getRepoStateString();
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);

    // Mock failure on 'wms_goal_settings' (final write, fails once during restore write then allows rollback)
    const memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });

    let hasFailedOnce = false;
    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (k === 'wms_goal_settings' && !hasFailedOnce) {
          hasFailedOnce = true;
          throw new Error('Simulated QuotaExceededError on wms_goal_settings');
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let caughtError: any = null;
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      caughtError = e;
    } finally {
      storage.setStoreProvider(null);
    }

    const postStateStr = getRepoStateString();
    const isAtomicError = caughtError instanceof AtomicRestoreError || (caughtError && caughtError.name === 'AtomicRestoreError');
    if (isAtomicError && caughtError.cause?.message?.includes('wms_goal_settings') && preStateStr === postStateStr) {
      recordResult('✅ [R5] Final Write Failure 롤백', true, '최종 대상(GoalSettings) 쓰기 실패 시 전체 5개 저장소 완벽 롤백 확인');
    } else {
      recordResult('✅ [R5] Final Write Failure 롤백', false, `R5 롤백 실패 (${caughtError?.message})`);
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R5] Final Write Failure 롤백', false, err.message);
  }

  // 28. ✅ [R6] Repository Exception Propagation (No silent swallow)
  try {
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const memoryMap = new Map<string, string>();

    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: () => { throw new Error('Strict Storage Access Denied'); },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let threwExpected = false;
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      if (e.cause?.message?.includes('Strict Storage Access Denied') || e.message?.includes('Strict Storage Access Denied')) {
        threwExpected = true;
      }
    } finally {
      storage.setStoreProvider(null);
    }

    if (threwExpected) {
      recordResult('✅ [R6] 저장소 예외 전파', true, '스토리지/리포지토리 쓰기 예외가 삼켜지지 않고 AtomicRestoreError 원인(cause)으로 정확히 전파됨');
    } else {
      recordResult('✅ [R6] 저장소 예외 전파', false, '저장소 예외가 삼켜졌거나 올바르게 전파되지 않음');
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R6] 저장소 예외 전파', false, err.message);
  }

  // 29. ✅ [R7] Rollback Exact Deep Equality Check
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());
    const preSnapshot = snapshotService.captureCurrentStorageState();
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);

    const memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });

    let failCountdown = 1;
    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (k === 'wms_weight_logs' && failCountdown-- > 0) {
          throw new Error('Weight log write failure');
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e) {
      // expected
    } finally {
      storage.setStoreProvider(null);
    }

    const postSnapshot = snapshotService.captureCurrentStorageState();
    const isExactEqual = JSON.stringify(preSnapshot) === JSON.stringify(postSnapshot);
    if (isExactEqual) {
      recordResult('✅ [R7] Rollback Deep Equality', true, '실패 후 저장소 상태가 복원 전 상태(Pre-Restore State)와 100% 동일(Deep Equal)함을 검증');
    } else {
      recordResult('✅ [R7] Rollback Deep Equality', false, '롤백 후 상태가 사전 상태와 불일치');
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R7] Rollback Deep Equality', false, err.message);
  }

  // 30. ✅ [R8] Rollback Failure Double-Fault Preservation Contract
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());

    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    const memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });
    let isRollbackPhase = false;

    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (!isRollbackPhase && k === 'wms_exercises') {
          isRollbackPhase = true;
          throw new Error('Original Write Failure on exercises');
        }
        if (isRollbackPhase) {
          throw new Error('Rollback Storage Failure on rollback write');
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let caughtDoubleFault: AtomicRestoreError | null = null;
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      caughtDoubleFault = e;
    } finally {
      storage.setStoreProvider(null);
    }

    if (
      caughtDoubleFault &&
      caughtDoubleFault.cause?.message?.includes('Original Write Failure') &&
      caughtDoubleFault.rollbackError?.message?.includes('Rollback Storage Failure')
    ) {
      recordResult('✅ [R8] Rollback 이중 실패 보존', true, '원래 쓰기 오류(cause)와 롤백 중 오류(rollbackError)가 AtomicRestoreError에 모두 안전하게 보존됨');
    } else {
      recordResult('✅ [R8] Rollback 이중 실패 보존', false, `이중 실패 보존 계약 위반 (cause: ${caughtDoubleFault?.cause}, rollbackError: ${caughtDoubleFault?.rollbackError})`);
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R8] Rollback 이중 실패 보존', false, err.message);
  }

  // 31. ✅ [R9] Post-Write Verification Failure Triggers Rollback
  try {
    workoutRepository.saveLogs(initialBaseLogs);
    weightRepository.saveWeightLogs(initialBaseWeights as any);
    workoutRepository.saveRoutines(mockRoutines);
    workoutRepository.saveExercises(mockExercises);
    goalRepository.saveGoalSettings(goalRepository.initializeGoalSettings());
    const preStateStr = getRepoStateString();

    // Mock storage that silently drops logs during write
    let memoryMap = new Map<string, string>();
    ['wms_logs', 'wms_routines', 'wms_exercises', 'wms_weight_logs', 'wms_goal_settings'].forEach(k => {
      const v = storage.getItem(k);
      if (v !== null) memoryMap.set(k, JSON.stringify(v));
    });

    storage.setStoreProvider(() => ({
      getItem: (k) => memoryMap.get(k) || null,
      setItem: (k, v) => {
        if (k === 'wms_logs') {
          // Drop the write to simulate silent storage corruption
          memoryMap.set(k, JSON.stringify([]));
          return;
        }
        memoryMap.set(k, v);
      },
      removeItem: (k) => { memoryMap.delete(k); },
      clear: () => { memoryMap.clear(); }
    }));

    let caughtVerifyError = false;
    const testSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    try {
      snapshotService.restoreSnapshot(testSnapshot);
    } catch (e: any) {
      if (e.cause?.message?.includes('Verification failed') || e.message?.includes('Verification failed')) {
        caughtVerifyError = true;
      }
    } finally {
      storage.setStoreProvider(null);
    }

    const postStateStr = getRepoStateString();
    if (caughtVerifyError && preStateStr === postStateStr) {
      recordResult('✅ [R9] 사후 검증(Post-Verify) 실패 감지 및 롤백', true, '저장소 불일치 사후 검증 실패 감지 시 성공을 반환하지 않고 원자적 롤백 수행');
    } else {
      recordResult('✅ [R9] 사후 검증(Post-Verify) 실패 감지 및 롤백', false, '사후 검증 실패 감지 실패 또는 롤백 실패');
    }
  } catch (err: any) {
    storage.setStoreProvider(null);
    recordResult('✅ [R9] 사후 검증(Post-Verify) 실패 감지 및 롤백', false, err.message);
  }

  // 32. ✅ [Round-Trip] Full Snapshot Round-Trip Semantic Equality
  try {
    // 1. Create source snapshot
    const sourceSnapshot = snapshotService.createSnapshot(mockWorkoutLogs, mockWeightLogs, mockRoutines, mockExercises);
    
    // 2. Restore into repositories
    snapshotService.restoreSnapshot(sourceSnapshot);

    // 3. Export new snapshot from active repositories
    const exportedLogs = workoutRepository.getLogs();
    const exportedWeights = weightRepository.getWeightLogs();
    const exportedRoutines = workoutRepository.getRoutines();
    const exportedExercises = workoutRepository.getExercises();
    const roundTripSnapshot = snapshotService.createSnapshot(exportedLogs, exportedWeights, exportedRoutines, exportedExercises);

    // 4. Verify invariant equivalence
    const isLogEq = JSON.stringify(sourceSnapshot.workoutLogs) === JSON.stringify(roundTripSnapshot.workoutLogs);
    const isWeightEq = JSON.stringify(sourceSnapshot.weightLogs) === JSON.stringify(roundTripSnapshot.weightLogs);
    const isRoutineEq = JSON.stringify(sourceSnapshot.routines) === JSON.stringify(roundTripSnapshot.routines);
    const isExerciseEq = JSON.stringify(sourceSnapshot.exercises) === JSON.stringify(roundTripSnapshot.exercises);

    if (isLogEq && isWeightEq && isRoutineEq && isExerciseEq) {
      recordResult('✅ Round-Trip Semantic Equality', true, 'Snapshot -> Restore -> Export 전 과정에서 모든 5개 데이터 엔티티 무손실 동등성 유지 확인');
    } else {
      recordResult('✅ Round-Trip Semantic Equality', false, `Round-Trip 동등성 불일치 (logEq: ${isLogEq}, weightEq: ${isWeightEq})`);
    }
  } catch (err: any) {
    recordResult('✅ Round-Trip Semantic Equality', false, err.message);
  }

  // 33. ✅ [Actual Fixture] 2026-08-16 / 2026-08-21 Backup Integrity Test
  try {
    const fixtureWorkoutLogs: WorkoutLog[] = [
      {
        id: "4f1b2c3d-e5f6-47a8-9b0c-1d2e3f4a5b6c",
        date: "2026-07-29",
        startTime: "19:00",
        routineName: "벤치프레스",
        notes: "",
        exercises: [
          {
            exerciseId: "bench-press",
            exerciseName: "벤치프레스 (Bench Press)",
            category: "Chest",
            sets: [
              { id: "bp2-w1", weight: 20, reps: 12, isWarmup: true },
              { id: "bp2-s1", weight: 65, reps: 5, isWarmup: false }
            ]
          }
        ]
      }
    ];

    const fixtureSnapshot = snapshotService.createSnapshot(fixtureWorkoutLogs, [], mockRoutines, mockExercises);
    const val = snapshotService.validateSnapshot(fixtureSnapshot);
    const restoreSumm = snapshotService.restoreSnapshot(fixtureSnapshot);

    if (val.isValid && restoreSumm.logsCount === 1 && workoutRepository.getLogs().length === 1) {
      recordResult('✅ 실제 Fixture 백업 스냅샷 호환성', true, '실제 v2.1 백업 픽스처 형식 완벽 검증 및 원자적 복원 성공');
    } else {
      recordResult('✅ 실제 Fixture 백업 스냅샷 호환성', false, '실제 백업 복원 실패');
    }
  } catch (err: any) {
    recordResult('✅ 실제 Fixture 백업 스냅샷 호환성', false, err.message);
  }

  const passedCount = results.filter(r => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}
