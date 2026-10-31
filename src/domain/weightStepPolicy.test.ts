/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_WEIGHT_STEP,
  CABLE_WEIGHT_STEP,
  DUMBBELL_WEIGHT_STEP,
  BARBELL_WEIGHT_STEP,
  WEIGHT_STEP_POLICY,
  isDumbbellExercise,
  isCableExercise,
  isBarbellExercise,
  getWeightStep,
  inspectWeightStepResolution,
  isValidWeightInput,
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

  // 1. Constants verification
  assert(DEFAULT_WEIGHT_STEP === 2.5, 'DEFAULT_WEIGHT_STEP is 2.5');
  assert(CABLE_WEIGHT_STEP === 4.5, 'CABLE_WEIGHT_STEP is 4.5');
  assert(DUMBBELL_WEIGHT_STEP === 2, 'DUMBBELL_WEIGHT_STEP is 2');
  assert(BARBELL_WEIGHT_STEP === 5, 'BARBELL_WEIGHT_STEP is 5');
  assert(WEIGHT_STEP_POLICY.DEFAULT === 2.5, 'WEIGHT_STEP_POLICY.DEFAULT is 2.5');
  assert(WEIGHT_STEP_POLICY.CABLE === 4.5, 'WEIGHT_STEP_POLICY.CABLE is 4.5');
  assert(WEIGHT_STEP_POLICY.DUMBBELL === 2, 'WEIGHT_STEP_POLICY.DUMBBELL is 2');
  assert(WEIGHT_STEP_POLICY.BARBELL === 5, 'WEIGHT_STEP_POLICY.BARBELL is 5');

  // 2. Dumbbell exercises (Step = 2kg)
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

  // 3. Barbell exercises (Step = 5kg)
  const barbellExercises: Partial<Exercise>[] = [
    { id: 'barbell-row', name: '바벨 로우 (Barbell Row)' },
    { id: 'bench-press', name: '벤치프레스 (Bench Press)' },
    { id: 'deadlift', name: '데드리프트 (Deadlift)' },
    { id: 'squat', name: '스쿼트 (Squat)' },
    { id: 'overhead-press', name: '오버헤드 프레스 (Overhead Press)' },
    { id: 'romanian-deadlift', name: '로마니안 데드리프트 (Romanian Deadlift)' },
    { id: 'biceps-curl', name: '바벨 컬 (Biceps Curl)' },
  ];

  for (const ex of barbellExercises) {
    const isBb = isBarbellExercise(ex);
    const step = getWeightStep(ex);
    assert(isBb === true, `isBarbellExercise returns true for ${ex.name}`);
    assert(step === 5, `getWeightStep returns 5 for ${ex.name}`);
  }

  // 4. Cable exercises (Step = 4.5kg)
  const cableExercises: Partial<Exercise>[] = [
    { id: 'lat-pulldown', name: '랫 풀 다운 (Lat Pulldown)' },
    { id: 'seated-row', name: '시티드 케이블 로우 (Seated Cable Row)', equipment: 'CABLE' },
    { id: 'face-pull', name: '페이스 풀 (Face Pull)', equipment: 'CABLE' },
    { id: 'triceps-pushdown', name: '트라이셉스 푸쉬다운 (Triceps Pushdown)' },
    { id: 'cable-fly', name: '케이블 플라이', equipment: 'CABLE' },
  ];

  for (const ex of cableExercises) {
    const isCable = isCableExercise(ex);
    const step = getWeightStep(ex);
    assert(isCable === true, `isCableExercise returns true for ${ex.name}`);
    assert(step === 4.5, `getWeightStep returns 4.5 for ${ex.name}`);
  }

  // 5. Machine & Unspecified equipment exercises (Step = 2.5kg DEFAULT)
  // Ensure unclassified exercises are NOT arbitrarily treated as barbell or dumbbell
  const otherExercises: Partial<Exercise>[] = [
    { id: 'lateral-raise', name: '사이드 레터럴 레이즈 (Side Lateral Raise)' }, // No equipment metadata -> 2.5kg
    { id: 'leg-press', name: '레그프레스 (Leg Press)', equipment: 'MACHINE' },
    { id: 'leg-extension', name: '레그 익스텐션 (Leg Extension)', equipment: 'MACHINE' },
    { id: 'leg-curl', name: '레그 컬 (Leg Curl)', equipment: 'MACHINE' },
    { id: 'chest-fly', name: '펙덱 플라이 (Chest Fly)', equipment: 'MACHINE' },
    { id: 'overhead-extension', name: '오버헤드 익스텐션' },
    { id: 'calf-raise-simple', name: '카프 레이즈' },
  ];

  for (const ex of otherExercises) {
    const isDb = isDumbbellExercise(ex);
    const isCable = isCableExercise(ex);
    const isBb = isBarbellExercise(ex);
    const step = getWeightStep(ex);
    assert(isDb === false, `isDumbbellExercise returns false for ${ex.name}`);
    assert(isCable === false, `isCableExercise returns false for ${ex.name}`);
    assert(isBb === false, `isBarbellExercise returns false for ${ex.name}`);
    assert(step === 2.5, `getWeightStep returns 2.5 (DEFAULT) for ${ex.name}`);
  }

  // 6. Priority 1 - Structured Equipment field takes absolute precedence
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
    id: 'custom-row',
    name: '로우',
    equipment: 'BARBELL',
  };
  assert(
    isBarbellExercise(barbellWithEquipment) === true,
    'Priority 1: equipment="BARBELL" recognized on generic 로우'
  );
  assert(
    getWeightStep(barbellWithEquipment) === 5,
    'Priority 1: getWeightStep returns 5 for equipment="BARBELL"'
  );

  const cableWithEquipment: Partial<Exercise> = {
    id: 'custom-curl',
    name: '컬',
    equipment: 'CABLE',
  };
  assert(
    isCableExercise(cableWithEquipment) === true,
    'Priority 1: equipment="CABLE" recognized on generic 컬'
  );
  assert(
    getWeightStep(cableWithEquipment) === 4.5,
    'Priority 1: getWeightStep returns 4.5 for equipment="CABLE"'
  );

  // 7. Step calculation & direct input preservation (no auto-rounding to multiples)
  // 7a. Dumbbell: 6 -> 8 -> 6
  const dbEx: Partial<Exercise> = { id: 'db-press', name: '덤벨 벤치프레스' };
  const dbStep = getWeightStep(dbEx);
  assert(dbStep === 2, 'Dumbbell step is 2kg');
  let dbW = 6;
  dbW = Number((dbW + dbStep).toFixed(2));
  assert(dbW === 8, 'Dumbbell 6kg + 2kg = 8kg');
  dbW = Math.max(0, Number((dbW - dbStep).toFixed(2)));
  assert(dbW === 6, 'Dumbbell 8kg - 2kg = 6kg');

  // 7b. Dumbbell 20kg + 2 -> 22 -> 24 -> 22
  let dbW2 = 20;
  dbW2 = Number((dbW2 + dbStep).toFixed(2));
  assert(dbW2 === 22, 'Dumbbell 20kg + 2kg = 22kg');
  dbW2 = Number((dbW2 + dbStep).toFixed(2));
  assert(dbW2 === 24, 'Dumbbell 22kg + 2kg = 24kg');
  dbW2 = Math.max(0, Number((dbW2 - dbStep).toFixed(2)));
  assert(dbW2 === 22, 'Dumbbell 24kg - 2kg = 22kg');

  // 7c. Barbell: 20 -> 25 -> 20
  const bbEx: Partial<Exercise> = { id: 'bb-bench', name: '벤치프레스', equipment: 'BARBELL' };
  const bbStep = getWeightStep(bbEx);
  assert(bbStep === 5, 'Barbell step is 5kg');
  let bbW = 20;
  bbW = Number((bbW + bbStep).toFixed(2));
  assert(bbW === 25, 'Barbell 20kg + 5kg = 25kg');
  bbW = Math.max(0, Number((bbW - bbStep).toFixed(2)));
  assert(bbW === 20, 'Barbell 25kg - 5kg = 20kg');

  // 7d. Barbell: 25 ± 5kg
  let bbW25 = 25;
  assert(Number((bbW25 + bbStep).toFixed(2)) === 30, 'Barbell 25kg + 5kg = 30kg');
  assert(Math.max(0, Number((bbW25 - bbStep).toFixed(2))) === 20, 'Barbell 25kg - 5kg = 20kg');

  // 7e. Cable: 7 -> 11.5 -> 7
  const cableEx: Partial<Exercise> = { id: 'seated-row', equipment: 'CABLE' };
  const cableStep = getWeightStep(cableEx);
  assert(cableStep === 4.5, 'Cable step is 4.5kg');
  let cableW = 7;
  cableW = Number((cableW + cableStep).toFixed(2));
  assert(cableW === 11.5, 'Cable 7kg + 4.5kg = 11.5kg');
  cableW = Math.max(0, Number((cableW - cableStep).toFixed(2)));
  assert(cableW === 7, 'Cable 11.5kg - 4.5kg = 7kg');

  // 7f. Cable: 4.5 ± 4.5kg
  let cableW45 = 4.5;
  assert(Number((cableW45 + cableStep).toFixed(2)) === 9.0, 'Cable 4.5kg + 4.5kg = 9.0kg');
  assert(Math.max(0, Number((cableW45 - cableStep).toFixed(2))) === 0, 'Cable 4.5kg - 4.5kg = 0kg');

  // 7g. Direct input preservation (Side Lateral Raise 6kg, Barbell 21kg)
  const lateralRaiseEx: Partial<Exercise> = { id: 'lateral-raise', name: '사이드 레터럴 레이즈' };
  const lateralStep = getWeightStep(lateralRaiseEx);
  assert(lateralStep === 2.5, 'Side lateral raise default step is 2.5kg');
  let latW = 6; // User directly types 6kg
  latW = Number((latW + lateralStep).toFixed(2));
  assert(latW === 8.5, 'Direct input 6kg + 2.5kg = 8.5kg (preserved, not rounded to 2.5 multiple)');
  latW = Math.max(0, Number((latW - lateralStep).toFixed(2)));
  assert(latW === 6, 'Direct input 8.5kg - 2.5kg = 6kg (preserved)');

  let bbDirectW = 21; // User directly types 21kg on barbell
  bbDirectW = Number((bbDirectW + bbStep).toFixed(2));
  assert(bbDirectW === 26, 'Barbell direct input 21kg + 5kg = 26kg (preserved, not rounded to 5 multiple)');
  bbDirectW = Math.max(0, Number((bbDirectW - bbStep).toFixed(2)));
  assert(bbDirectW === 21, 'Barbell direct input 26kg - 5kg = 21kg (preserved)');

  // 7h. 0kg lower bound clamps
  let nearZeroBb = 5;
  nearZeroBb = Math.max(0, Number((nearZeroBb - bbStep).toFixed(2)));
  assert(nearZeroBb === 0, 'Barbell 5kg - 5kg = 0kg');
  nearZeroBb = Math.max(0, Number((nearZeroBb - bbStep).toFixed(2)));
  assert(nearZeroBb === 0, 'Barbell 0kg - 5kg clamped to 0kg');

  let nearZeroCable = 4.5;
  nearZeroCable = Math.max(0, Number((nearZeroCable - cableStep).toFixed(2)));
  assert(nearZeroCable === 0, 'Cable 4.5kg - 4.5kg = 0kg');
  nearZeroCable = Math.max(0, Number((nearZeroCable - cableStep).toFixed(2)));
  assert(nearZeroCable === 0, 'Cable 0kg - 4.5kg clamped to 0kg');

  let nearZeroDb = 2;
  nearZeroDb = Math.max(0, Number((nearZeroDb - dbStep).toFixed(2)));
  assert(nearZeroDb === 0, 'Dumbbell 2kg - 2kg = 0kg');
  nearZeroDb = Math.max(0, Number((nearZeroDb - dbStep).toFixed(2)));
  assert(nearZeroDb === 0, 'Dumbbell 0kg - 2kg clamped to 0kg');

  // 8. Other log types safely default to 2.5kg step
  const pullUp: Partial<Exercise> = { id: 'pull-up', name: '풀업 (Pull-Up)', logType: 'BODYWEIGHT_REPS' };
  assert(isDumbbellExercise(pullUp) === false, 'Pull-up is not a dumbbell exercise');
  assert(isBarbellExercise(pullUp) === false, 'Pull-up is not a barbell exercise');
  assert(getWeightStep(pullUp) === 2.5, 'Pull-up defaults safely to 2.5');

  const running: Partial<Exercise> = { id: 'treadmill', name: '트레드밀 (Treadmill)', logType: 'CARDIO' };
  assert(isDumbbellExercise(running) === false, 'Running is not a dumbbell exercise');
  assert(getWeightStep(running) === 2.5, 'Running defaults safely to 2.5');

  const plank: Partial<Exercise> = { id: 'plank', name: '플랭크 (Plank)', logType: 'TIME_BASED' };
  assert(isDumbbellExercise(plank) === false, 'Plank is not a dumbbell exercise');
  assert(getWeightStep(plank) === 2.5, 'Plank defaults safely to 2.5');

  // 9. Audit Suite: Equipment metadata priority and conflict handling
  const c1: Partial<Exercise> = { id: 'custom-db-bench', name: '덤벨 벤치프레스', equipment: 'DUMBBELL' };
  assert(getWeightStep(c1) === 2, 'Audit Case 1: 덤벨 벤치프레스 (equipment: DUMBBELL) -> 2kg');

  const c2: Partial<Exercise> = { id: 'custom-db-row', name: '덤벨 로우', equipment: 'DUMBBELL' };
  assert(getWeightStep(c2) === 2, 'Audit Case 2: 덤벨 로우 (equipment: DUMBBELL) -> 2kg');

  const c3: Partial<Exercise> = { id: 'dumbbell-hammer-curl', name: '해머 컬 (Hammer Curl)', equipment: 'DUMBBELL' };
  assert(getWeightStep(c3) === 2, 'Audit Case 3: 해머 컬 (equipment: DUMBBELL) -> 2kg');

  const c4: Partial<Exercise> = { id: 'barbell-row', name: '바벨 로우 (Barbell Row)', equipment: 'BARBELL' };
  assert(getWeightStep(c4) === 5, 'Audit Case 4: 바벨 로우 (equipment: BARBELL) -> 5kg');

  const c5: Partial<Exercise> = { id: 'bench-press', name: '벤치프레스 (Bench Press)', equipment: 'BARBELL' };
  assert(getWeightStep(c5) === 5, 'Audit Case 5: 벤치프레스 (equipment: BARBELL) -> 5kg');

  // Legacy dumbbell without metadata -> name fallback yields 2kg
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

  // Conflict: name = "덤벨 로우", equipment = "BARBELL" -> equipment metadata takes precedence
  const c7: Partial<Exercise> = { id: 'conflict-test', name: '덤벨 로우', equipment: 'BARBELL' };
  assert(
    isDumbbellExercise(c7) === false,
    'Audit Case 7: name="덤벨 로우", equipment="BARBELL" -> metadata takes precedence (isDumbbell: false)'
  );
  assert(
    isBarbellExercise(c7) === true,
    'Audit Case 7: name="덤벨 로우", equipment="BARBELL" -> metadata takes precedence (isBarbell: true)'
  );
  assert(
    getWeightStep(c7) === 5,
    'Audit Case 7: name="덤벨 로우", equipment="BARBELL" -> getWeightStep returns 5kg'
  );

  // Reverse Conflict: name = "바벨 로우", equipment = "DUMBBELL"
  const c8: Partial<Exercise> = { id: 'conflict-reverse', name: '바벨 로우', equipment: 'DUMBBELL' };
  assert(isDumbbellExercise(c8) === true, 'Reverse conflict: equipment="DUMBBELL" overrides barbell name');
  assert(isBarbellExercise(c8) === false, 'Reverse conflict: isBarbellExercise is false');
  assert(getWeightStep(c8) === 2, 'Reverse conflict: getWeightStep returns 2kg');

  // Conflict with CABLE: name = "바벨 컬", equipment = "CABLE"
  const c9: Partial<Exercise> = { id: 'conflict-cable', name: '바벨 컬', equipment: 'CABLE' };
  assert(isCableExercise(c9) === true, 'Cable conflict: equipment="CABLE" overrides barbell name');
  assert(getWeightStep(c9) === 4.5, 'Cable conflict: getWeightStep returns 4.5kg');

  // Conflict with MACHINE: name = "스쿼트", equipment = "MACHINE"
  const c10: Partial<Exercise> = { id: 'smith-squat', name: '스쿼트', equipment: 'MACHINE' };
  assert(isBarbellExercise(c10) === false, 'Machine conflict: equipment="MACHINE" overrides squat name');
  assert(getWeightStep(c10) === 2.5, 'Machine conflict: getWeightStep returns 2.5kg (DEFAULT)');

  // 10. Diagnostics function (inspectWeightStepResolution) consistency
  const diagNull = inspectWeightStepResolution(null);
  assert(diagNull.step === 2.5, 'Inspect null returns step 2.5');
  assert(diagNull.source === 'DEFAULT', 'Inspect null returns source DEFAULT');

  const diagUndefined = inspectWeightStepResolution(undefined);
  assert(diagUndefined.step === 2.5, 'Inspect undefined returns step 2.5');
  assert(diagUndefined.source === 'DEFAULT', 'Inspect undefined returns source DEFAULT');

  const diagFallbackBarbell = inspectWeightStepResolution(null, '바벨 로우');
  assert(diagFallbackBarbell.step === 5, 'Inspect fallbackName 바벨 로우 returns 5');
  assert(diagFallbackBarbell.source === 'NAME_FALLBACK', 'Inspect fallbackName source is NAME_FALLBACK');

  const diagFallbackDumbbell = inspectWeightStepResolution(null, '덤벨 로우');
  assert(diagFallbackDumbbell.step === 2, 'Inspect fallbackName 덤벨 로우 returns 2');
  assert(diagFallbackDumbbell.isDumbbell === true, 'Inspect fallbackName isDumbbell is true');

  const diagFallbackCable = inspectWeightStepResolution(null, '시티드 케이블 로우');
  assert(diagFallbackCable.step === 4.5, 'Inspect fallbackName 시티드 케이블 로우 returns 4.5');

  const diagCanonicalBench = inspectWeightStepResolution({ id: 'bench-press' });
  assert(diagCanonicalBench.step === 5, 'Inspect canonical bench-press returns 5');
  assert(diagCanonicalBench.source === 'CANONICAL_ID', 'Inspect canonical bench-press source is CANONICAL_ID');

  const diagCanonicalSeatedRow = inspectWeightStepResolution({ id: 'seated-row' });
  assert(diagCanonicalSeatedRow.step === 4.5, 'Inspect canonical seated-row returns 4.5');
  assert(diagCanonicalSeatedRow.source === 'CANONICAL_ID', 'Inspect canonical seated-row source is CANONICAL_ID');

  const diagConflict = inspectWeightStepResolution({ id: 'test', name: '덤벨 로우', equipment: 'BARBELL' });
  assert(diagConflict.step === 5, 'Inspect conflict returns actual step 5');
  assert(diagConflict.source === 'EQUIPMENT_METADATA', 'Inspect conflict source is EQUIPMENT_METADATA');
  assert(Boolean(diagConflict.conflict), 'Inspect conflict reports conflict message');

  // 11. Direct Input Validation Rules (Testing production isValidWeightInput)
  assert(isValidWeightInput(0) === true, 'Direct input: 0 is valid');
  assert(isValidWeightInput('0') === true, 'Direct input: "0" is valid');
  assert(isValidWeightInput(6) === true, 'Direct input: 6 is valid (Side Lateral Raise 6kg)');
  assert(isValidWeightInput('6') === true, 'Direct input: "6" is valid');
  assert(isValidWeightInput(6.75) === true, 'Direct input: 6.75 is valid');
  assert(isValidWeightInput(21) === true, 'Direct input: 21 is valid (Barbell 21kg non-multiple)');
  assert(isValidWeightInput('') === false, 'Direct input: empty string is blocked on submit');
  assert(isValidWeightInput('   ') === false, 'Direct input: whitespace is blocked on submit');
  assert(isValidWeightInput(null) === false, 'Direct input: null is blocked on submit');
  assert(isValidWeightInput(undefined) === false, 'Direct input: undefined is blocked on submit');
  assert(isValidWeightInput(-1) === false, 'Direct input: negative is blocked on submit');
  assert(isValidWeightInput('-5') === false, 'Direct input: negative string is blocked on submit');
  assert(isValidWeightInput(NaN) === false, 'Direct input: NaN is blocked on submit');
  assert(isValidWeightInput('abc') === false, 'Direct input: invalid text is blocked on submit');
  assert(isValidWeightInput(Infinity) === false, 'Direct input: Infinity is blocked on submit');

  // 12. Non-number types rejected by isValidWeightInput (boolean, array, object)
  assert(isValidWeightInput(true) === false, 'Direct input: boolean true is rejected');
  assert(isValidWeightInput(false) === false, 'Direct input: boolean false is rejected');
  assert(isValidWeightInput([]) === false, 'Direct input: empty array is rejected');
  assert(isValidWeightInput([6]) === false, 'Direct input: array [6] is rejected');
  assert(isValidWeightInput({}) === false, 'Direct input: object is rejected');
  assert(isValidWeightInput({ weight: 20 }) === false, 'Direct input: object with properties is rejected');
  assert(isValidWeightInput(() => 10) === false, 'Direct input: function is rejected');
  assert(isValidWeightInput('-Infinity') === false, 'Direct input: "-Infinity" is rejected');

  // 13. Reproduction Case 1 & 2: Unified classification and ID vs Name precedence
  // Case 1: {id:'dumbbell-row', name:'케이블 로우'} (No metadata) -> ID takes precedence: Dumbbell 2kg
  const repro1 = { id: 'dumbbell-row', name: '케이블 로우' };
  assert(getWeightStep(repro1) === 2, 'Repro 1: {id: "dumbbell-row", name: "케이블 로우"} yields 2kg (ID takes precedence over name)');
  const repro1Diag = inspectWeightStepResolution(repro1);
  assert(repro1Diag.step === 2, 'Repro 1: Diagnostics step matches getWeightStep (2kg)');
  assert(repro1Diag.resolvedEquipment === 'DUMBBELL', 'Repro 1: Diagnostics resolvedEquipment is DUMBBELL');
  assert(repro1Diag.source === 'CANONICAL_ID', 'Repro 1: Diagnostics source is CANONICAL_ID');
  assert(isDumbbellExercise(repro1) === true, 'Repro 1: isDumbbellExercise is true');
  assert(isCableExercise(repro1) === false, 'Repro 1: isCableExercise is false');
  assert(isBarbellExercise(repro1) === false, 'Repro 1: isBarbellExercise is false');

  // Case 2: {id:'bench-press', name:'덤벨 벤치프레스'} (No metadata) -> ID takes precedence: Barbell 5kg
  const repro2 = { id: 'bench-press', name: '덤벨 벤치프레스' };
  assert(getWeightStep(repro2) === 5, 'Repro 2: {id: "bench-press", name: "덤벨 벤치프레스"} yields 5kg (ID takes precedence over name)');
  const repro2Diag = inspectWeightStepResolution(repro2);
  assert(repro2Diag.step === 5, 'Repro 2: Diagnostics step matches getWeightStep (5kg)');
  assert(repro2Diag.resolvedEquipment === 'BARBELL', 'Repro 2: Diagnostics resolvedEquipment is BARBELL');
  assert(repro2Diag.source === 'CANONICAL_ID', 'Repro 2: Diagnostics source is CANONICAL_ID');
  assert(isBarbellExercise(repro2) === true, 'Repro 2: isBarbellExercise is true');
  assert(isDumbbellExercise(repro2) === false, 'Repro 2: isDumbbellExercise is false');
  assert(isCableExercise(repro2) === false, 'Repro 2: isCableExercise is false');

  // Explicit metadata overrides canonical ID:
  const repro1WithMeta = { id: 'dumbbell-row', name: '케이블 로우', equipment: 'CABLE' };
  assert(getWeightStep(repro1WithMeta) === 4.5, 'Metadata overrides ID: equipment="CABLE" on dumbbell-row yields 4.5kg');
  assert(inspectWeightStepResolution(repro1WithMeta).step === 4.5, 'Metadata overrides ID: Diagnostics step is 4.5kg');
  assert(inspectWeightStepResolution(repro1WithMeta).source === 'EQUIPMENT_METADATA', 'Metadata overrides ID: source is EQUIPMENT_METADATA');
  assert(isCableExercise(repro1WithMeta) === true, 'Metadata overrides ID: isCableExercise is true');
  assert(isDumbbellExercise(repro1WithMeta) === false, 'Metadata overrides ID: isDumbbellExercise is false');

  const repro2WithMeta = { id: 'bench-press', name: '덤벨 벤치프레스', equipment: 'DUMBBELL' };
  assert(getWeightStep(repro2WithMeta) === 2, 'Metadata overrides ID: equipment="DUMBBELL" on bench-press yields 2kg');
  assert(inspectWeightStepResolution(repro2WithMeta).step === 2, 'Metadata overrides ID: Diagnostics step is 2kg');
  assert(inspectWeightStepResolution(repro2WithMeta).source === 'EQUIPMENT_METADATA', 'Metadata overrides ID: source is EQUIPMENT_METADATA');
  assert(isDumbbellExercise(repro2WithMeta) === true, 'Metadata overrides ID: isDumbbellExercise is true');
  assert(isBarbellExercise(repro2WithMeta) === false, 'Metadata overrides ID: isBarbellExercise is false');

  // 14. Single Classification and Disjoint Guarantee across all sample cases
  const sampleCases: (Partial<Exercise> | string | null | undefined)[] = [
    repro1,
    repro2,
    repro1WithMeta,
    repro2WithMeta,
    { id: 'lat-pulldown', name: '랫 풀 다운' },
    { id: 'lateral-raise', name: '사이드 레터럴 레이즈' },
    { id: 'leg-press', equipment: 'MACHINE' },
    null,
    undefined,
    '케이블 컬',
    '바벨 스쿼트',
    '덤벨 컬',
  ];

  for (const sc of sampleCases) {
    const isDb = isDumbbellExercise(sc);
    const isCable = isCableExercise(sc);
    const isBb = isBarbellExercise(sc);
    const activeCount = [isDb, isCable, isBb].filter(Boolean).length;
    assert(activeCount <= 1, `Mutually exclusive classification: at most one equipment type is true for ${JSON.stringify(sc)}`);
    const diag = inspectWeightStepResolution(sc);
    const actual = getWeightStep(sc);
    assert(diag.step === actual, `Diagnostics step exactly matches getWeightStep (${actual}kg) for ${JSON.stringify(sc)}`);
  }

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
