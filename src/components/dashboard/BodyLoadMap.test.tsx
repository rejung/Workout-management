/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BodyLoadMap, getStatusColor, CANONICAL_DIMENSION_CONFIGS } from './BodyLoadMap';
import { RecommendedWorkoutCard } from './CardioMileage';
import {
  BodyLoadPresentation,
  DimensionLoadPresentation,
  RecommendationResult,
} from '../../domain/recommendationVNext/types/recommendationPresentation.types';
import { CANONICAL_STRESS_DIMENSIONS } from '../../domain/recommendationVNext/stress/stressVocabulary';
import { StressDimension } from '../../domain/recommendationVNext/types/stressModel.types';

export function runBodyLoadMapTests(): { passed: boolean; details: string[] } {
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

  // 1. Color mapping function unit test
  const orange = getStatusColor('최근 부하');
  assert(orange.fill === '#f97316' && orange.label === '최근 부하', '최근 부하 maps to orange (#f97316)');
  const yellow = getStatusColor('잔여 부하');
  assert(yellow.fill === '#eab308' && yellow.label === '잔여 부하', '잔여 부하 maps to yellow (#eab308)');
  const teal = getStatusColor('최근 부하 근거 없음');
  assert(teal.fill === '#14b8a6' && teal.label === '최근 부하 근거 없음', '최근 부하 근거 없음 maps to teal (#14b8a6)');
  const slate = getStatusColor('판단 정보 부족');
  assert(slate.fill === '#64748b' && slate.label === '판단 정보 부족', '판단 정보 부족 maps to slate (#64748b)');

  // 2. Canonical dimensions count and config
  assert(CANONICAL_DIMENSION_CONFIGS.length === 7, 'CANONICAL_DIMENSION_CONFIGS has exactly 7 dimensions');
  assert(
    CANONICAL_STRESS_DIMENSIONS.every((d) => CANONICAL_DIMENSION_CONFIGS.some((c) => c.id === d)),
    'All CANONICAL_STRESS_DIMENSIONS exist in CANONICAL_DIMENSION_CONFIGS'
  );

  // 3. Render BodyLoadMap with full mock data
  const mockDimensions: DimensionLoadPresentation[] = [
    {
      dimension: 'knee-dominant-lower-body',
      displayName: '대퇴사두 및 하체 전면',
      status: '최근 부하',
      uncertainty: {
        hasUncertainty: true,
        hasBracketTraces: true,
        hasUncertainTraces: false,
        bracketTraceCount: 1,
        uncertainTraceCount: 0,
        note: '경계 시점(24h/72h) 불확실성 포함',
      },
      isImmediate: true,
      isResidual: false,
      isHistorical: false,
      isInsufficient: false,
    },
    {
      dimension: 'hip-posterior-chain',
      displayName: '둔근 및 후면사슬',
      status: '잔여 부하',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
      },
      isImmediate: false,
      isResidual: true,
      isHistorical: false,
      isInsufficient: false,
    },
    {
      dimension: 'horizontal-push',
      displayName: '수평 밀기 (가슴/삼두)',
      status: '최근 부하 근거 없음',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
      },
      isImmediate: false,
      isResidual: false,
      isHistorical: true,
      isInsufficient: false,
    },
    {
      dimension: 'vertical-push',
      displayName: '수직 밀기 (어깨/삼두)',
      status: '판단 정보 부족',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
      },
      isImmediate: false,
      isResidual: false,
      isHistorical: false,
      isInsufficient: true,
    },
    {
      dimension: 'horizontal-pull',
      displayName: '수평 당기기 (등/이두)',
      status: '최근 부하',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
      },
      isImmediate: true,
      isResidual: false,
      isHistorical: false,
      isInsufficient: false,
    },
    {
      dimension: 'vertical-pull',
      displayName: '수직 당기기 (광배/이두)',
      status: '최근 부하 근거 없음',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
      },
      isImmediate: false,
      isResidual: false,
      isHistorical: true,
      isInsufficient: false,
    },
    {
      dimension: 'axial-systemic-loading',
      displayName: '전신 및 척추 부하',
      status: '잔여 부하',
      uncertainty: {
        hasUncertainty: true,
        hasBracketTraces: false,
        hasUncertainTraces: true,
        bracketTraceCount: 0,
        uncertainTraceCount: 1,
        note: '시간 미지정 기록으로 인한 불확실성 포함',
      },
      isImmediate: false,
      isResidual: true,
      isHistorical: false,
      isInsufficient: false,
    },
  ];

  const fullBodyLoad: BodyLoadPresentation = {
    dimensions: mockDimensions,
    uncertainSameDaySessionCount: 2,
    hasUncertainty: true,
    summary: '최근 직접 부하 2개 영역, 잔여 부하 2개 영역 감지 (당일 시간 미지정 기록 2건 제외)',
  };

  const renderedMap = renderToStaticMarkup(<BodyLoadMap bodyLoad={fullBodyLoad} idPrefix="test-map" />);

  // Verify all 7 canonical dimensions are wired via canonical ID
  for (const dim of CANONICAL_STRESS_DIMENSIONS) {
    assert(
      renderedMap.includes(`data-dimension="${dim}"`) || renderedMap.includes(`data-dimension-card="${dim}"`),
      `BodyLoadMap wires canonical dimension ID: ${dim}`
    );
  }

  // Verify disclaimer text
  assert(
    renderedMap.includes('기록 기반 추정 · 실제 근육 피로 측정값 아님'),
    'Disclaimer "기록 기반 추정 · 실제 근육 피로 측정값 아님" is rendered'
  );

  // Verify summary text rendered
  assert(
    renderedMap.includes('최근 직접 부하 2개 영역, 잔여 부하 2개 영역 감지'),
    'Existing bodyLoad.summary is rendered'
  );

  // Verify excluded session notice
  assert(
    renderedMap.includes('당일 시간 미지정 기록 2건은 특정 신체 부위에 임의 배정하지 않고 제외했습니다'),
    'Excluded session notice displayed with correct count'
  );

  // Verify coexisting uncertainty on knee-dominant-lower-body
  // Status is 최근 부하 (orange #f97316), and note is displayed
  assert(
    renderedMap.includes('fill="#f97316"') && renderedMap.includes('경계 시점(24h/72h) 불확실성 포함'),
    'Knee dominant maintains confirmed orange fill AND displays uncertainty note'
  );

  // Verify axial-systemic-loading is rendered as side item
  assert(
    renderedMap.includes('data-dimension="axial-systemic-loading"') && renderedMap.includes('전신 및 축성 부하'),
    'Axial systemic loading is rendered as a distinct item beside silhouettes'
  );

  // Verify accessibility attributes on SVGs
  assert(renderedMap.includes('role="img"') && renderedMap.includes('<title'), 'SVGs include role="img" and <title>');

  // 4. Missing / Undefined bodyLoad fallback
  const renderedEmpty = renderToStaticMarkup(<BodyLoadMap bodyLoad={undefined} idPrefix="empty-map" />);
  assert(
    renderedEmpty.includes('판단 정보 부족'),
    'Undefined bodyLoad renders "판단 정보 부족" for all dimensions'
  );
  assert(
    !renderedEmpty.includes('#14b8a6') && !renderedEmpty.includes('완전 회복'),
    'Missing bodyLoad does NOT default to teal/recovered'
  );

  // 5. RecommendedWorkoutCard integration tests
  // 5a. Both reasons and bodyLoad present
  const fullRec: RecommendationResult = {
    mainLift: '스쿼트',
    reasons: ['✓ 하체 회복 완료', '✓ 주동근 준비 상태 양호'],
    representativeExercises: ['바벨 스쿼트'],
    date: '2026. 10. 28',
    bodyLoad: fullBodyLoad,
    topCandidates: [
      { lift: '스쿼트', isCurrent: true, statusType: 'preferred' },
      { lift: '벤치프레스', isCurrent: false, statusType: 'viable' },
      { lift: '데드리프트', isCurrent: false, statusType: 'caution' }, // caution should NOT appear
    ],
  };

  const fullCard = renderToStaticMarkup(<RecommendedWorkoutCard nextRecommendation={fullRec} />);

  // Check section ordering: '수행 가능한 훈련' must appear before '추천 근거 · 신체 부하 보기'
  const viableIndex = fullCard.indexOf('수행 가능한 훈련');
  const accordionIndex = fullCard.indexOf('추천 근거 · 신체 부하 보기');
  assert(
    viableIndex !== -1 && accordionIndex !== -1 && viableIndex < accordionIndex,
    'Unified order: viable candidates section comes BEFORE reasons accordion'
  );

  // Check viable candidates filtering: preferred and viable are present, caution is absent
  assert(fullCard.includes('최적 추천') && fullCard.includes('스쿼트'), 'Preferred candidate has "최적 추천" badge');
  assert(fullCard.includes('벤치프레스'), 'Viable candidate "벤치프레스" is rendered');
  assert(!fullCard.includes('데드리프트'), 'Caution candidate "데드리프트" is excluded from viable list');

  // Check CTA button present for Train state
  assert(fullCard.includes('운동 시작'), 'CTA button "운동 시작" is rendered for Train recommendation');

  // Check accordion accessibility attributes
  assert(fullCard.includes('aria-expanded="false"'), 'Accordion button has aria-expanded="false" by default');
  assert(fullCard.includes('aria-controls='), 'Accordion button has aria-controls linked');
  assert(fullCard.includes('type="button"'), 'Accordion button has type="button"');

  // 5b. Reasons empty, bodyLoad present
  const bodyLoadOnlyRec: RecommendationResult = {
    mainLift: '휴식',
    reasons: [],
    representativeExercises: ['충분한 수면'],
    date: '2026. 10. 28',
    bodyLoad: fullBodyLoad,
  };
  const bodyLoadOnlyCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={bodyLoadOnlyRec} />
  );
  assert(
    bodyLoadOnlyCard.includes('추천 근거 · 신체 부하 보기'),
    'Accordion button is rendered even when reasons is empty if bodyLoad exists'
  );
  assert(!bodyLoadOnlyCard.includes('운동 시작'), 'Rest recommendation does NOT render "운동 시작" CTA');

  // 5c. bodyLoad absent, reasons present
  const reasonsOnlyRec: RecommendationResult = {
    mainLift: '벤치프레스',
    reasons: ['✓ 상체 충분한 휴식 경과'],
    representativeExercises: ['바벨 벤치프레스'],
    date: '2026. 10. 28',
  };
  const reasonsOnlyCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={reasonsOnlyRec} />
  );
  assert(
    reasonsOnlyCard.includes('추천 근거 · 신체 부하 보기'),
    'Accordion button is rendered when bodyLoad is absent if reasons exist'
  );

  // 5d. Both absent -> accordion returns null
  const neitherRec: RecommendationResult = {
    mainLift: '휴식',
    reasons: [],
    representativeExercises: [],
    date: '2026. 10. 28',
  };
  const neitherCard = renderToStaticMarkup(<RecommendedWorkoutCard nextRecommendation={neitherRec} />);
  assert(
    !neitherCard.includes('추천 근거 · 신체 부하 보기'),
    'Accordion returns null when both reasons and bodyLoad are absent'
  );

  // 5e. Empty topCandidates array vs undefined
  const emptyCandidatesRec: RecommendationResult = {
    mainLift: '휴식',
    reasons: ['✓ 휴식일'],
    representativeExercises: [],
    date: '2026. 10. 28',
    topCandidates: [],
  };
  const emptyCandidatesCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={emptyCandidatesRec} />
  );
  assert(
    emptyCandidatesCard.includes('현재 수행 가능한 후보가 없습니다'),
    'Empty topCandidates array displays "현재 수행 가능한 후보가 없습니다"'
  );

  const undefinedCandidatesRec: RecommendationResult = {
    mainLift: '휴식',
    reasons: ['✓ 휴식일'],
    representativeExercises: [],
    date: '2026. 10. 28',
    topCandidates: undefined,
  };
  const undefinedCandidatesCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={undefinedCandidatesRec} />
  );
  assert(
    undefinedCandidatesCard.includes('후보 정보를 확인할 수 없습니다'),
    'Undefined topCandidates displays "후보 정보를 확인할 수 없습니다"'
  );

  return { passed: allPassed, details };
}

// Run if executed directly
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1]?.includes('BodyLoadMap.test')
) {
  const result = runBodyLoadMapTests();
  console.log('=== Body Load Map & Recommendation Card Unit Tests ===');
  for (const line of result.details) {
    console.log(line);
  }
  console.log(`\nOverall Result: ${result.passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  if (!result.passed) process.exit(1);
}
