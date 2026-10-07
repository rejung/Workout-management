/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_WEIGHT_STEP,
  DUMBBELL_WEIGHT_STEP,
  WEIGHT_STEP_POLICY,
  isDumbbellExercise,
  getWeightStep,
} from './weightStepPolicy';
import { Exercise } from '../types';

export function runWeightStepPolicyTests(): { passed: boolean; message: string }[] {
  const results: { passed: boolean; message: string }[] = [];

  function assert(condition: boolean, testName: string) {
    results.push({
      passed: condition,
      message: condition ? `✅ PASS: ${testName}` : `❌ FAIL: ${testName}`,
    });
  }

  // Constants verification
  assert(DEFAULT_WEIGHT_STEP === 2.5, 'DEFAULT_WEIGHT_STEP is 2.5');
  assert(DUMBBELL_WEIGHT_STEP === 2, 'DUMBBELL_WEIGHT_STEP is 2');
  assert(WEIGHT_STEP_POLICY.DEFAULT === 2.5, 'WEIGHT_STEP_POLICY.DEFAULT is 2.5');
  assert(WEIGHT_STEP_POLICY.DUMBBELL === 2, 'WEIGHT_STEP_POLICY.DUMBBELL is 2');

  // Case 1: Dumbbell exercises (Step = 2kg)
  const dumbbellExercises: Partial<Exercise>[] = [
    { id: 'custom-1', name: '덤벨 벤치프레스' },
    { id: 'dumbbell-shoulder-press', name: '덤벨 숄더 프레스 (Dumbbell Shoulder Press)' },
    { id: 'custom-2', name: '덤벨 로우' },
    { id: 'custom-3', name: '원암 덤벨 로우' },
    { id: 'custom-4', name: '인클라인 덤벨 로우' },
    { id: 'custom-5', name: '덤벨 컬' },
    { id: 'dumbbell-hammer-curl', name: '해머 컬 (Hammer Curl)' },
    { id: 'custom-hammer', name: '해머 컬' },
    { id: 'custom-hammer-en', name: 'Hammer Curl' },
    { id: 'dumbbell-shrug', name: '덤벨 슈러그 (Dumbbell Shrug)' },
    { id: 'custom-6', name: '덤벨 플라이' },
    { id: 'incline-dumbbell-press', name: '인클라인 덤벨 프레스 (Incline Dumbbell Press)' },
  ];

  for (const ex of dumbbellExercises) {
    const isDb = isDumbbellExercise(ex);
    const step = getWeightStep(ex);
    assert(isDb === true, `isDumbbellExercise returns true for ${ex.name}`);
    assert(step === 2, `getWeightStep returns 2 for ${ex.name}`);
  }

  // Case 2: Barbell and non-dumbbell exercises (Step = 2.5kg)
  const nonDumbbellExercises: Partial<Exercise>[] = [
    { id: 'barbell-row', name: '바벨 로우 (Barbell Row)' },
    { id: 'bench-press', name: '벤치프레스 (Bench Press)' },
    { id: 'deadlift', name: '데드리프트 (Deadlift)' },
    { id: 'squat', name: '스쿼트 (Squat)' },
    { id: 'overhead-press', name: '오버헤드 프레스 (Overhead Press)' },
    { id: 'lat-pulldown', name: '랫 풀 다운 (Lat Pulldown)' },
    { id: 'lateral-raise', name: '사이드 레터럴 레이즈 (Side Lateral Raise)' }, // Without equipment: default 2.5kg
  ];

  for (const ex of nonDumbbellExercises) {
    const isDb = isDumbbellExercise(ex);
    const step = getWeightStep(ex);
    assert(isDb === false, `isDumbbellExercise returns false for ${ex.name}`);
    assert(step === 2.5, `getWeightStep returns 2.5 for ${ex.name}`);
  }

  // Case 3: Priority 1 - Structured Equipment field takes precedence
  const lateralRaiseWithDumbbell: Partial<Exercise> = {
    id: 'lateral-raise',
    name: '사이드 레터럴 레이즈 (Side Lateral Raise)',
    equipment: 'DUMBBELL',
  };
  assert(
    isDumbbellExercise(lateralRaiseWithDumbbell) === true,
    'Priority 1: equipment="DUMBBELL" recognized on 사이드 레터럴 레이즈'
  );
  assert(
    getWeightStep(lateralRaiseWithDumbbell) === 2,
    'Priority 1: getWeightStep returns 2 for equipment="DUMBBELL"'
  );

  const barbellWithEquipment: Partial<Exercise> = {
    id: 'custom-barbell',
    name: '로우',
    equipment: 'BARBELL',
  };
  assert(
    isDumbbellExercise(barbellWithEquipment) === false,
    'Priority 1: equipment="BARBELL" returns false'
  );
  assert(
    getWeightStep(barbellWithEquipment) === 2.5,
    'Priority 1: getWeightStep returns 2.5 for equipment="BARBELL"'
  );

  // Case 4: Step calculation logic with direct inputs (no auto-rounding)
  const dbEx: Partial<Exercise> = { id: 'db-press', name: '덤벨 벤치프레스' };
  const dbStep = getWeightStep(dbEx);

  // 20kg + 2 -> 22kg -> 24kg -> 22kg
  let weight = 20;
  weight = Number((weight + dbStep).toFixed(2));
  assert(weight === 22, 'Dumbbell 20kg + 2kg = 22kg');
  weight = Number((weight + dbStep).toFixed(2));
  assert(weight === 24, 'Dumbbell 22kg + 2kg = 24kg');
  weight = Math.max(0, Number((weight - dbStep).toFixed(2)));
  assert(weight === 22, 'Dumbbell 24kg - 2kg = 22kg');

  // Barbell 20kg + 2.5 -> 22.5kg -> 25kg -> 22.5kg
  const bbEx: Partial<Exercise> = { id: 'bb-row', name: '바벨 로우' };
  const bbStep = getWeightStep(bbEx);
  let bbWeight = 20;
  bbWeight = Number((bbWeight + bbStep).toFixed(2));
  assert(bbWeight === 22.5, 'Barbell 20kg + 2.5kg = 22.5kg');
  bbWeight = Number((bbWeight + bbStep).toFixed(2));
  assert(bbWeight === 25, 'Barbell 22.5kg + 2.5kg = 25kg');
  bbWeight = Math.max(0, Number((bbWeight - bbStep).toFixed(2)));
  assert(bbWeight === 22.5, 'Barbell 25kg - 2.5kg = 22.5kg');

  // User direct input: 21kg + 2kg = 23kg, - 2kg = 21kg (no rounding to multiple of 2)
  let userDirectWeight = 21;
  userDirectWeight = Number((userDirectWeight + dbStep).toFixed(2));
  assert(userDirectWeight === 23, 'Direct input 21kg + 2kg = 23kg');
  userDirectWeight = Math.max(0, Number((userDirectWeight - dbStep).toFixed(2)));
  assert(userDirectWeight === 21, 'Direct input 23kg - 2kg = 21kg');

  // Existing 22.5kg on dumbbell exercise + 2kg = 24.5kg (preserved decimal)
  let existingDecimalWeight = 22.5;
  existingDecimalWeight = Number((existingDecimalWeight + dbStep).toFixed(2));
  assert(existingDecimalWeight === 24.5, 'Existing 22.5kg + 2kg = 24.5kg');

  // 0kg boundary
  let nearZeroWeight = 2;
  nearZeroWeight = Math.max(0, Number((nearZeroWeight - dbStep).toFixed(2)));
  assert(nearZeroWeight === 0, '2kg - 2kg = 0kg');
  nearZeroWeight = Math.max(0, Number((nearZeroWeight - dbStep).toFixed(2)));
  assert(nearZeroWeight === 0, '0kg - 2kg clamped to 0kg');

  // Case 5: Other log types
  const pullUp: Partial<Exercise> = { id: 'pull-up', name: '풀업 (Pull-Up)', logType: 'BODYWEIGHT_REPS' };
  assert(isDumbbellExercise(pullUp) === false, 'Pull-up is not a dumbbell exercise');
  assert(getWeightStep(pullUp) === 2.5, 'Pull-up defaults safely to 2.5');

  const running: Partial<Exercise> = { id: 'treadmill', name: '트레드밀 (Treadmill)', logType: 'CARDIO' };
  assert(isDumbbellExercise(running) === false, 'Running is not a dumbbell exercise');

  const plank: Partial<Exercise> = { id: 'plank', name: '플랭크 (Plank)', logType: 'TIME_BASED' };
  assert(isDumbbellExercise(plank) === false, 'Plank is not a dumbbell exercise');

  // Change Unit 1 - Specific Audit Test Suite (Cases 1 - 7)
  // Case 1: 덤벨 벤치프레스 equipment = DUMBBELL -> 2kg
  const c1: Partial<Exercise> = { id: 'custom-db-bench', name: '덤벨 벤치프레스', equipment: 'DUMBBELL' };
  assert(getWeightStep(c1) === 2, 'Audit Case 1: 덤벨 벤치프레스 (equipment: DUMBBELL) -> 2kg');

  // Case 2: 덤벨 로우 equipment = DUMBBELL -> 2kg
  const c2: Partial<Exercise> = { id: 'custom-db-row', name: '덤벨 로우', equipment: 'DUMBBELL' };
  assert(getWeightStep(c2) === 2, 'Audit Case 2: 덤벨 로우 (equipment: DUMBBELL) -> 2kg');

  // Case 3: 해머 컬 equipment = DUMBBELL -> 2kg
  const c3: Partial<Exercise> = { id: 'dumbbell-hammer-curl', name: '해머 컬 (Hammer Curl)', equipment: 'DUMBBELL' };
  assert(getWeightStep(c3) === 2, 'Audit Case 3: 해머 컬 (equipment: DUMBBELL) -> 2kg');

  // Case 4: 바벨 로우 equipment = BARBELL -> 2.5kg
  const c4: Partial<Exercise> = { id: 'barbell-row', name: '바벨 로우 (Barbell Row)', equipment: 'BARBELL' };
  assert(getWeightStep(c4) === 2.5, 'Audit Case 4: 바벨 로우 (equipment: BARBELL) -> 2.5kg');

  // Case 5: 벤치프레스 equipment = BARBELL -> 2.5kg
  const c5: Partial<Exercise> = { id: 'bench-press', name: '벤치프레스 (Bench Press)', equipment: 'BARBELL' };
  assert(getWeightStep(c5) === 2.5, 'Audit Case 5: 벤치프레스 (equipment: BARBELL) -> 2.5kg');

  // Case 6: metadata 없는 legacy 덤벨 운동 -> 기존 name fallback으로 2kg
  const c6_1: Partial<Exercise> = { id: 'legacy-1', name: '덤벨 숄더 프레스' };
  const c6_2: Partial<Exercise> = { id: 'legacy-2', name: '원암 덤벨 로우' };
  const c6_3: Partial<Exercise> = { id: 'legacy-3', name: '인클라인 덤벨 로우' };
  const c6_4: Partial<Exercise> = { id: 'legacy-4', name: '덤벨 컬' };
  const c6_5: Partial<Exercise> = { id: 'legacy-5', name: '덤벨 플라이' };
  assert(getWeightStep(c6_1) === 2, 'Audit Case 6.1: legacy 덤벨 숄더 프레스 (no metadata) -> 2kg (name fallback)');
  assert(getWeightStep(c6_2) === 2, 'Audit Case 6.2: legacy 원암 덤벨 로우 (no metadata) -> 2kg (name fallback)');
  assert(getWeightStep(c6_3) === 2, 'Audit Case 6.3: legacy 인클라인 덤벨 로우 (no metadata) -> 2kg (name fallback)');
  assert(getWeightStep(c6_4) === 2, 'Audit Case 6.4: legacy 덤벨 컬 (no metadata) -> 2kg (name fallback)');
  assert(getWeightStep(c6_5) === 2, 'Audit Case 6.5: legacy 덤벨 플라이 (no metadata) -> 2kg (name fallback)');

  // Case 7: metadata와 이름이 충돌 (예: name = "덤벨 로우", equipment = "BARBELL") -> metadata 우선 확인
  const c7: Partial<Exercise> = { id: 'conflict-test', name: '덤벨 로우', equipment: 'BARBELL' };
  assert(
    isDumbbellExercise(c7) === false,
    'Audit Case 7: name="덤벨 로우", equipment="BARBELL" -> metadata takes precedence (isDumbbell: false)'
  );
  assert(
    getWeightStep(c7) === 2.5,
    'Audit Case 7: name="덤벨 로우", equipment="BARBELL" -> getWeightStep returns 2.5kg'
  );

  // Change Unit 2 - Additional Validation Tests (Cases 1 - 8)
  // Case 1: Bench Press (equipment: BARBELL) -> 2.5kg
  const cu2_c1: Partial<Exercise> = { id: 'bench-press', name: '벤치프레스 (Bench Press)', equipment: 'BARBELL' };
  assert(getWeightStep(cu2_c1) === 2.5, 'CU2 Case 1: Bench Press (BARBELL) -> 2.5kg');

  // Case 2: Squat (equipment: BARBELL) -> 2.5kg
  const cu2_c2: Partial<Exercise> = { id: 'squat', name: '스쿼트 (Squat)', equipment: 'BARBELL' };
  assert(getWeightStep(cu2_c2) === 2.5, 'CU2 Case 2: Squat (BARBELL) -> 2.5kg');

  // Case 3: Dumbbell Shoulder Press (equipment: DUMBBELL) -> 2kg
  const cu2_c3: Partial<Exercise> = { id: 'dumbbell-shoulder-press', name: '덤벨 숄더 프레스 (Dumbbell Shoulder Press)', equipment: 'DUMBBELL' };
  assert(getWeightStep(cu2_c3) === 2, 'CU2 Case 3: Dumbbell Shoulder Press (DUMBBELL) -> 2kg');

  // Case 4: Cable Row (equipment: CABLE) -> 2.5kg
  const cu2_c4: Partial<Exercise> = { id: 'seated-row', name: '시티드 케이블 로우 (Seated Cable Row)', equipment: 'CABLE' };
  assert(getWeightStep(cu2_c4) === 2.5, 'CU2 Case 4: Cable Row (CABLE) -> 2.5kg');

  // Case 5: Leg Press (equipment: MACHINE) -> 2.5kg
  const cu2_c5: Partial<Exercise> = { id: 'leg-press', name: '레그프레스 (Leg Press)', equipment: 'MACHINE' };
  assert(getWeightStep(cu2_c5) === 2.5, 'CU2 Case 5: Leg Press (MACHINE) -> 2.5kg');

  // Case 6: Pull-Up (equipment: BODYWEIGHT, logType: BODYWEIGHT_REPS) -> no adverse UI step impact, step defaults safely to 2.5
  const cu2_c6: Partial<Exercise> = { id: 'pull-up', name: '풀업 (Pull-Up)', equipment: 'BODYWEIGHT', logType: 'BODYWEIGHT_REPS' };
  assert(isDumbbellExercise(cu2_c6) === false, 'CU2 Case 6: Pull-Up is not dumbbell');
  assert(getWeightStep(cu2_c6) === 2.5, 'CU2 Case 6: Pull-Up (BODYWEIGHT) step is default 2.5kg');

  // Case 7: Running (equipment: CARDIO, logType: CARDIO) -> normal cardio logType logic, step defaults safely to 2.5
  const cu2_c7: Partial<Exercise> = { id: 'treadmill', name: '트레드밀 (Treadmill)', equipment: 'CARDIO', logType: 'CARDIO' };
  assert(isDumbbellExercise(cu2_c7) === false, 'CU2 Case 7: Treadmill is not dumbbell');
  assert(getWeightStep(cu2_c7) === 2.5, 'CU2 Case 7: Treadmill (CARDIO) step is default 2.5kg');

  // Case 8: Legacy custom dumbbell exercise (equipment undefined) -> name fallback ensures 2kg
  const cu2_c8: Partial<Exercise> = { id: 'user-custom-db-row-123', name: '나의 덤벨 로우', isCustom: true };
  assert(isDumbbellExercise(cu2_c8) === true, 'CU2 Case 8: Legacy custom dumbbell exercise correctly identified by name fallback');
  assert(getWeightStep(cu2_c8) === 2, 'CU2 Case 8: Legacy custom dumbbell exercise maintains 2kg step via fallback');

  // Change Unit 3 - App-wide Adoption Audit & UI Integration Tests (Cases 1 - 10)
  // Case 1: Dumbbell 20kg (+ -> 22kg, + -> 24kg, - -> 22kg)
  const cu3_dbEx: Partial<Exercise> = { id: 'dumbbell-shoulder-press', name: '덤벨 숄더 프레스', equipment: 'DUMBBELL' };
  const cu3_dbStep = getWeightStep(cu3_dbEx);
  let cu3_w = 20;
  cu3_w = Number((cu3_w + cu3_dbStep).toFixed(2));
  assert(cu3_w === 22, 'CU3 Case 1: Dumbbell 20kg + step = 22kg');
  cu3_w = Number((cu3_w + cu3_dbStep).toFixed(2));
  assert(cu3_w === 24, 'CU3 Case 1: Dumbbell 22kg + step = 24kg');
  cu3_w = Math.max(0, Number((cu3_w - cu3_dbStep).toFixed(2)));
  assert(cu3_w === 22, 'CU3 Case 1: Dumbbell 24kg - step = 22kg');

  // Case 2: Barbell 20kg (+ -> 22.5kg, + -> 25kg, - -> 22.5kg)
  const cu3_bbEx: Partial<Exercise> = { id: 'bench-press', name: '벤치프레스', equipment: 'BARBELL' };
  const cu3_bbStep = getWeightStep(cu3_bbEx);
  let cu3_bbW = 20;
  cu3_bbW = Number((cu3_bbW + cu3_bbStep).toFixed(2));
  assert(cu3_bbW === 22.5, 'CU3 Case 2: Barbell 20kg + step = 22.5kg');
  cu3_bbW = Number((cu3_bbW + cu3_bbStep).toFixed(2));
  assert(cu3_bbW === 25, 'CU3 Case 2: Barbell 22.5kg + step = 25kg');
  cu3_bbW = Math.max(0, Number((cu3_bbW - cu3_bbStep).toFixed(2)));
  assert(cu3_bbW === 22.5, 'CU3 Case 2: Barbell 25kg - step = 22.5kg');

  // Case 3: Cable exercise 20kg (+ -> 22.5kg, maintains DEFAULT)
  const cu3_cableEx: Partial<Exercise> = { id: 'seated-row', name: '시티드 케이블 로우', equipment: 'CABLE' };
  const cu3_cableStep = getWeightStep(cu3_cableEx);
  assert(cu3_cableStep === 2.5, 'CU3 Case 3: Cable exercise maintains DEFAULT 2.5kg step');
  assert(Number((20 + cu3_cableStep).toFixed(2)) === 22.5, 'CU3 Case 3: Cable 20kg + step = 22.5kg');

  // Case 4: Machine exercise 20kg (+ -> 22.5kg, maintains DEFAULT)
  const cu3_machEx: Partial<Exercise> = { id: 'leg-press', name: '레그프레스', equipment: 'MACHINE' };
  const cu3_machStep = getWeightStep(cu3_machEx);
  assert(cu3_machStep === 2.5, 'CU3 Case 4: Machine exercise maintains DEFAULT 2.5kg step');
  assert(Number((20 + cu3_machStep).toFixed(2)) === 22.5, 'CU3 Case 4: Machine 20kg + step = 22.5kg');

  // Case 5: Legacy custom dumbbell (equipment undefined, name = "나의 덤벨 로우") -> 2kg Step
  const cu3_legacyDb: Partial<Exercise> = { id: 'custom-db-1234', name: '나의 덤벨 로우', isCustom: true };
  assert(getWeightStep(cu3_legacyDb) === 2, 'CU3 Case 5: Legacy custom dumbbell correctly yields 2kg step');

  // Case 6: Direct input 21kg (Dumbbell: + -> 23kg, - -> 19kg, no auto-rounding)
  let cu3_directW = 21;
  cu3_directW = Number((cu3_directW + cu3_dbStep).toFixed(2));
  assert(cu3_directW === 23, 'CU3 Case 6: Direct input 21kg + 2kg = 23kg (no rounding)');
  cu3_directW = Math.max(0, Number((21 - cu3_dbStep).toFixed(2)));
  assert(cu3_directW === 19, 'CU3 Case 6: Direct input 21kg - 2kg = 19kg (no rounding)');

  // Case 7: Existing record 22.5kg (Dumbbell: + -> 24.5kg, decimal preserved)
  const cu3_existingW = 22.5;
  const cu3_nextW = Number((cu3_existingW + cu3_dbStep).toFixed(2));
  assert(cu3_nextW === 24.5, 'CU3 Case 7: Existing record 22.5kg + 2kg = 24.5kg (preserved decimal)');

  // Case 8: BODYWEIGHT_REPS (Pull-up) -> safe default step, no adverse UI step effect
  const cu3_bwEx: Partial<Exercise> = { id: 'pull-up', name: '풀업', equipment: 'BODYWEIGHT', logType: 'BODYWEIGHT_REPS' };
  assert(getWeightStep(cu3_bwEx) === 2.5, 'CU3 Case 8: BODYWEIGHT_REPS step defaults safely to 2.5');

  // Case 9: CARDIO (Running) -> no adverse UI step effect
  const cu3_cardioEx: Partial<Exercise> = { id: 'treadmill', name: '트레드밀', equipment: 'CARDIO', logType: 'CARDIO' };
  assert(getWeightStep(cu3_cardioEx) === 2.5, 'CU3 Case 9: CARDIO step defaults safely to 2.5');

  // Case 10: TIME_BASED (Plank) -> no adverse UI step effect
  const cu3_timeEx: Partial<Exercise> = { id: 'plank', name: '플랭크', logType: 'TIME_BASED' };
  assert(getWeightStep(cu3_timeEx) === 2.5, 'CU3 Case 10: TIME_BASED step defaults safely to 2.5');

  return results;
}

// Self-run when executed directly via tsx
const results = runWeightStepPolicyTests();
const allPassed = results.every(r => r.passed);
for (const r of results) {
  console.log(r.message);
}
if (!allPassed) {
  console.error('Some tests failed!');
  process.exit(1);
} else {
  console.log(`\n🎉 All ${results.length} Weight Step Policy tests PASSED!`);
}
