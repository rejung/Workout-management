/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { DEFAULT_EXERCISES } from '../../constants';
import { WorkoutLog } from '../../types';
import {
  CANONICAL_MUSCLE_DISPLAY_GROUPS,
  CANONICAL_MUSCLE_REGIONS,
} from '../../domain/recommendationVNext/types/exerciseMusculoskeletalProfile.types';
import { RecommendationResult } from '../../domain/recommendationVNext/types/recommendationPresentation.types';
import { evaluateVNextProduction } from '../../domain/recommendationVNext/production/productionRecommendationService';
import { deriveMuscleDisplayEvidence } from '../../domain/recommendationVNext/musculoskeletal/muscleDisplayEvidence';
import {
  MuscleDisplayEvidenceList,
  formatMuscleInvolvementRole,
} from './MuscleDisplayEvidenceList';
import { RecommendedWorkoutCard } from './CardioMileage';

export function runMuscleDisplayEvidenceListTests(): {
  readonly passed: boolean;
  readonly details: readonly string[];
} {
  const details: string[] = [];
  let allPassed = true;

  function assert(condition: boolean, desc: string) {
    if (!condition) {
      allPassed = false;
      details.push(`[FAIL] ${desc}`);
    } else {
      details.push(`[PASS] ${desc}`);
    }
  }

  const defBench = DEFAULT_EXERCISES.find((e) => e.id === 'bench-press')!;
  const defTreadmill = DEFAULT_EXERCISES.find((e) => e.id === 'treadmill')!;
  const defDeadlift = DEFAULT_EXERCISES.find((e) => e.id === 'deadlift')!;
  const defCableFly = DEFAULT_EXERCISES.find((e) => e.id === 'cable-fly')!;

  const evalOptions = {
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    calendarDate: '2026-08-20',
    timezone: 'Asia/Seoul',
  };
  const evalContextInput = {
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    evaluationTimezone: 'Asia/Seoul',
  };

  // =========================================================================
  // 1. Mixed session (Bench Press + Treadmill): pec & calves + 3 independent shoulder heads
  // =========================================================================
  const mixedLog: WorkoutLog = {
    id: 'ui-mixed-bench-treadmill',
    date: '2026-08-19',
    startTime: '18:00',
    routineName: '가슴 + 트레드밀',
    notes: '',
    exercises: [
      {
        exerciseId: defBench.id,
        exerciseName: defBench.name,
        category: defBench.category,
        sets: [{ id: 's1', weight: 80, reps: 5, isWarmup: false }],
      },
      {
        exerciseId: defTreadmill.id,
        exerciseName: defTreadmill.name,
        category: defTreadmill.category,
        sets: [{ id: 's2', weight: 0, reps: 0, distanceKm: 5, timeSeconds: 1500 }],
      },
    ],
  };

  const mixedProd = evaluateVNextProduction([mixedLog], evalOptions);
  const mixedMuscle = mixedProd.presentation.muscleDisplayEvidence!;

  // Default collapsed rows: muscle name + status only (no exercise detail before expanding)
  const mixedCollapsedHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList muscleDisplayEvidence={mixedMuscle} idPrefix="ui-mixed" />
  );

  for (const groupId of CANONICAL_MUSCLE_DISPLAY_GROUPS) {
    assert(
      mixedCollapsedHtml.includes(`data-muscle-group="${groupId}"`),
      `Renders canonical display group: ${groupId}`
    );
  }
  for (const regionId of CANONICAL_MUSCLE_REGIONS) {
    assert(
      mixedCollapsedHtml.includes(`data-muscle-region="${regionId}"`),
      `Renders canonical muscle region: ${regionId}`
    );
  }

  assert(
    mixedCollapsedHtml.includes('근육별 기록 근거'),
    'Section heading "근육별 기록 근거" is rendered'
  );
  assert(
    !mixedCollapsedHtml.includes(defBench.name) && !mixedCollapsedHtml.includes(defTreadmill.name),
    'Default collapsed rows show muscle name and status only (exercise details hidden until expanded)'
  );

  // Shoulders group header has NO collapsed/aggregated status
  const shoulderHeaderMatch = mixedCollapsedHtml.match(
    /data-muscle-group-header="shoulders"[^>]*>([^<]+)<\/div>/
  );
  assert(
    Boolean(shoulderHeaderMatch && shoulderHeaderMatch[1].trim() === '어깨'),
    'Shoulders group header shows only "어깨" without merging 3 shoulder head statuses'
  );

  // Expanded details for pectoralis-major, calves, anterior-deltoid, lateral-deltoid, posterior-deltoid
  const mixedExpandedHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList
      muscleDisplayEvidence={mixedMuscle}
      idPrefix="ui-mixed-open"
      defaultExpandedRegionIds={[
        'pectoralis-major',
        'calves',
        'anterior-deltoid',
        'lateral-deltoid',
        'posterior-deltoid',
      ]}
    />
  );

  const pecDetailStart = mixedExpandedHtml.indexOf('data-muscle-detail="pectoralis-major"');
  const pecDetailChunk =
    pecDetailStart !== -1 ? mixedExpandedHtml.slice(pecDetailStart, pecDetailStart + 900) : '';
  assert(
    pecDetailStart !== -1 &&
      pecDetailChunk.includes(defBench.name) &&
      pecDetailChunk.includes('2026-08-19 18:00') &&
      pecDetailChunk.includes('주된 대상'),
    'Expanded pectoralis-major shows Bench Press name, date, and role "주된 대상"'
  );

  const calvesDetailStart = mixedExpandedHtml.indexOf('data-muscle-detail="calves"');
  const calvesDetailChunk =
    calvesDetailStart !== -1 ? mixedExpandedHtml.slice(calvesDetailStart, calvesDetailStart + 900) : '';
  assert(
    calvesDetailStart !== -1 &&
      calvesDetailChunk.includes(defTreadmill.name) &&
      calvesDetailChunk.includes('2026-08-19 18:00') &&
      calvesDetailChunk.includes('주된 대상'),
    'Expanded calves shows Treadmill name, date, and role "주된 대상"'
  );

  // 3 shoulder heads maintain independent states: anterior=최근 부하(협력), lateral/posterior=판단 정보 부족(non-expandable)
  const antDetailStart = mixedExpandedHtml.indexOf('data-muscle-detail="anterior-deltoid"');
  const antDetailChunk =
    antDetailStart !== -1 ? mixedExpandedHtml.slice(antDetailStart, antDetailStart + 900) : '';
  const latRegionStart = mixedExpandedHtml.indexOf('data-muscle-region="lateral-deltoid"');
  const latRegionChunk =
    latRegionStart !== -1 ? mixedExpandedHtml.slice(latRegionStart, latRegionStart + 450) : '';
  const postRegionStart = mixedExpandedHtml.indexOf('data-muscle-region="posterior-deltoid"');
  const postRegionChunk =
    postRegionStart !== -1 ? mixedExpandedHtml.slice(postRegionStart, postRegionStart + 450) : '';

  assert(
    antDetailStart !== -1 &&
      antDetailChunk.includes(defBench.name) &&
      antDetailChunk.includes('협력') &&
      latRegionChunk.includes('판단 정보 부족') &&
      !mixedExpandedHtml.includes('data-muscle-detail="lateral-deltoid"') &&
      postRegionChunk.includes('판단 정보 부족') &&
      !mixedExpandedHtml.includes('data-muscle-detail="posterior-deltoid"'),
    'Shoulders group preserves 3 independent states (anterior=최근 부하/협력, lateral & posterior=판단 정보 부족 without empty detail)'
  );

  // Role mapping covers stabilizer -> '자세 유지'
  const dlMuscle = deriveMuscleDisplayEvidence(
    [
      {
        sourceLogId: 'ui-dl-1',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defDeadlift.id,
        exerciseName: defDeadlift.name,
      },
    ],
    evalContextInput
  );
  const dlHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList
      muscleDisplayEvidence={dlMuscle}
      idPrefix="ui-dl"
      defaultExpandedRegionIds={['erector-spinae']}
    />
  );
  assert(
    formatMuscleInvolvementRole('stabilizer') === '자세 유지' &&
      dlHtml.includes('data-muscle-detail="erector-spinae"') &&
      dlHtml.includes('자세 유지'),
    'Deadlift erector-spinae detail renders stabilizer role as "자세 유지"'
  );

  // =========================================================================
  // 2. Coexisting confirmed + uncertain evidence renders BOTH sections separately
  // =========================================================================
  const coexistMuscle = deriveMuscleDisplayEvidence(
    [
      {
        sourceLogId: 'ui-bench-residual',
        date: '2026-08-19',
        startTime: '00:00', // 36h ago -> confirmed residual
        exerciseId: defBench.id,
        exerciseName: defBench.name,
      },
      {
        sourceLogId: 'ui-bench-today-notime',
        date: '2026-08-20', // same-day missing time -> uncertain
        exerciseId: defBench.id,
        exerciseName: defBench.name,
      },
    ],
    evalContextInput
  );

  const coexistHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList
      muscleDisplayEvidence={coexistMuscle}
      idPrefix="ui-coexist"
      defaultExpandedRegionIds={['pectoralis-major']}
    />
  );
  const coexistPecStart = coexistHtml.indexOf('data-muscle-region="pectoralis-major"');
  const coexistPecChunk = coexistHtml.slice(coexistPecStart, coexistPecStart + 2500);

  assert(
    coexistPecChunk.includes('잔여 부하') &&
      coexistPecChunk.includes('data-evidence-section="confirmed"') &&
      coexistPecChunk.includes('확정 근거') &&
      coexistPecChunk.includes('2026-08-19 00:00') &&
      coexistPecChunk.includes('data-evidence-section="uncertain"') &&
      coexistPecChunk.includes('불확실 근거') &&
      coexistPecChunk.includes('당일 시간 미지정'),
    'Coexisting confirmed residual + same-day uncertain renders BOTH "확정 근거" and "불확실 근거" distinctly'
  );

  // =========================================================================
  // 3. Uninterpreted & invalid date/time shown via summary notice only; never says '회복 완료'
  // =========================================================================
  const scopedMuscle = deriveMuscleDisplayEvidence(
    [
      {
        sourceLogId: 'ui-bench-hist',
        date: '2026-08-15',
        startTime: '10:00', // >=72h -> 최근 부하 근거 없음
        exerciseId: defBench.id,
        exerciseName: defBench.name,
      },
      {
        sourceLogId: 'ui-cable-fly',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defCableFly.id,
        exerciseName: defCableFly.name,
      },
      {
        sourceLogId: 'ui-invalid-time',
        date: '2026-08-19',
        startTime: '25:00',
        exerciseId: defDeadlift.id,
        exerciseName: defDeadlift.name,
      },
    ],
    evalContextInput
  );

  const scopedHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList muscleDisplayEvidence={scopedMuscle} idPrefix="ui-scoped" />
  );
  assert(
    scopedHtml.includes('최근 부하 근거 없음') &&
      scopedHtml.includes('판단 정보 부족') &&
      !scopedHtml.includes('회복 완료') &&
      scopedHtml.includes('data-testid="muscle-evidence-scope-notice"') &&
      scopedHtml.includes('미해석 기록 1건') &&
      scopedHtml.includes('잘못된 날짜·시각 기록 1건') &&
      !scopedHtml.includes(defCableFly.name),
    'Displays "최근 부하 근거 없음" without rewriting to "회복 완료", and communicates uninterpreted/invalid items via summary notice only'
  );

  // =========================================================================
  // 4. RecommendedWorkoutCard: missing field vs empty valid result vs normal result
  // =========================================================================
  // 4a. Missing muscleDisplayEvidence -> new section hidden, existing card preserved
  const missingRec: RecommendationResult = {
    ...mixedProd.presentation,
    muscleDisplayEvidence: undefined,
  };
  const missingCardHtml = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={missingRec} defaultExpanded={true} />
  );
  assert(
    !missingCardHtml.includes('근육별 기록 근거') &&
      missingCardHtml.includes('신체 부하 추정 맵') &&
      missingCardHtml.includes('수행 가능한 훈련') &&
      missingCardHtml.includes('최근 부하 (&lt;24h)'),
    'When muscleDisplayEvidence is missing, new list is hidden while existing 7-dim BodyLoadMap, legend, and candidates stay intact'
  );

  // 4b. Valid empty result -> shows '판단 정보 부족' for all regions with ZERO expandable detail buttons
  const emptyProd = evaluateVNextProduction([], evalOptions);
  const emptyListHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList
      muscleDisplayEvidence={emptyProd.presentation.muscleDisplayEvidence}
      idPrefix="ui-empty"
      defaultExpandedRegionIds={['pectoralis-major']}
    />
  );
  const emptyCardHtml = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={emptyProd.presentation} defaultExpanded={true} />
  );
  assert(
    emptyListHtml.includes('판단 정보 부족') &&
      !emptyListHtml.includes('<button') &&
      !emptyListHtml.includes('data-muscle-detail=') &&
      emptyCardHtml.includes('근육별 기록 근거') &&
      emptyCardHtml.includes('신체 부하 추정 맵') &&
      emptyCardHtml.includes('수행 가능한 훈련'),
    'Valid empty result displays "판단 정보 부족" with zero expand buttons and preserves existing card sections'
  );

  // 4c. Normal result inside RecommendedWorkoutCard preserves BodyLoadMap, legend, candidates, and muscle list
  const normalCardHtml = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={mixedProd.presentation} defaultExpanded={true} />
  );
  assert(
    normalCardHtml.includes('신체 부하 추정 맵') &&
      normalCardHtml.includes('최근 부하 (&lt;24h)') &&
      normalCardHtml.includes('수행 가능한 훈련') &&
      normalCardHtml.includes('근육별 기록 근거') &&
      normalCardHtml.includes('data-muscle-group="shoulders"'),
    'Normal result renders muscle list inside existing accordion alongside preserved 7-dim map, legend, and candidates'
  );

  // =========================================================================
  // 5. Keyboard accessibility & narrow-screen overflow safety for long exercise names
  // =========================================================================
  const longNameMuscle = deriveMuscleDisplayEvidence(
    [
      {
        sourceLogId: 'ui-long-bench',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defBench.id,
        exerciseName: defBench.name,
      },
    ],
    evalContextInput
  );
  // Inject a very long display exercise name strictly to test narrow-screen wrapping CSS
  const patchedLongMuscle = {
    ...longNameMuscle,
    displayGroups: longNameMuscle.displayGroups.map((g) => ({
      ...g,
      regions: g.regions.map((r) =>
        r.regionId === 'pectoralis-major'
          ? {
              ...r,
              immediateEvidence: r.immediateEvidence.map((item) => ({
                ...item,
                sourceExerciseName:
                  '초장문_벤치프레스_연속문자열_NarrowViewportOverflowCheck_WithoutSpaces_20260819',
              })),
              evidence: r.evidence.map((item) => ({
                ...item,
                sourceExerciseName:
                  '초장문_벤치프레스_연속문자열_NarrowViewportOverflowCheck_WithoutSpaces_20260819',
              })),
            }
          : r
      ),
    })),
  };

  const longHtml = renderToStaticMarkup(
    <MuscleDisplayEvidenceList
      muscleDisplayEvidence={patchedLongMuscle}
      idPrefix="ui-long"
      defaultExpandedRegionIds={['pectoralis-major']}
    />
  );

  assert(
    longHtml.includes('id="ui-long-pectoralis-major-btn"') &&
      longHtml.includes('type="button"') &&
      longHtml.includes('aria-expanded="true"') &&
      longHtml.includes('aria-controls="ui-long-pectoralis-major-panel"') &&
      longHtml.includes('id="ui-long-pectoralis-major-panel"') &&
      longHtml.includes('role="region"') &&
      longHtml.includes('aria-labelledby="ui-long-pectoralis-major-btn"') &&
      longHtml.includes('focus-visible:ring-2'),
    'Expand toggle uses native keyboard-accessible button with aria-expanded, aria-controls, linked region, and focus-visible ring'
  );

  assert(
    longHtml.includes('초장문_벤치프레스_연속문자열_NarrowViewportOverflowCheck_WithoutSpaces_20260819') &&
      longHtml.includes('min-w-0') &&
      longHtml.includes('break-words') &&
      longHtml.includes('[overflow-wrap:anywhere]'),
    'Long exercise names and muscle list containers apply min-w-0 + break-words + [overflow-wrap:anywhere] to prevent horizontal overflow on narrow viewports'
  );

  // =========================================================================
  // 6. Presentation-only purity check (zero repository/engine/Date calls in UI component)
  // =========================================================================
  const componentSrc = fs.readFileSync(
    'src/components/dashboard/MuscleDisplayEvidenceList.tsx',
    'utf8'
  );
  assert(
    !componentSrc.includes('workoutRepository') &&
      !componentSrc.includes('deriveMuscleDisplayEvidence') &&
      !componentSrc.includes('evaluateVNextProduction') &&
      !componentSrc.includes('parseWallClockInTimezone') &&
      !componentSrc.includes('new Date('),
    'MuscleDisplayEvidenceList.tsx is strictly presentation-only (no storage reads, no time/state recalculation)'
  );

  return { passed: allPassed, details };
}

if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1]?.includes('MuscleDisplayEvidenceList.test')
) {
  const result = runMuscleDisplayEvidenceListTests();
  console.log('=== Muscle Display Evidence List UI Tests ===');
  for (const line of result.details) {
    console.log(line);
  }
  console.log(`\nOverall Result: ${result.passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  if (!result.passed) process.exit(1);
}
