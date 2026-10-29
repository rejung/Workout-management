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
import {
  BODY_FRONT_VIEW_BOX,
  BODY_BACK_VIEW_BOX,
  BODY_OUTLINE_PATHS,
  FRONT_BODY_PATHS,
  BACK_BODY_PATHS,
  NECK_FINISH_PATHS,
} from './bodyModelPaths';
import fs from 'fs';

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

  // 3. Render BodyLoadMap with mock data
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

  // 3a. Verify all 7 canonical dimensions are wired via canonical ID
  for (const dim of CANONICAL_STRESS_DIMENSIONS) {
    assert(
      renderedMap.includes(`data-dimension="${dim}"`) || renderedMap.includes(`data-dimension-row="${dim}"`),
      `BodyLoadMap wires canonical dimension ID: ${dim}`
    );
  }

  // 3b. Verify specific element color inside its data-dimension
  // knee-dominant-lower-body (status: 최근 부하) -> orange fill #f97316 inside its g
  const kneeGIndex = renderedMap.indexOf('data-dimension="knee-dominant-lower-body"');
  assert(kneeGIndex !== -1, 'knee-dominant-lower-body group exists');
  const kneeChunk = renderedMap.substring(kneeGIndex, kneeGIndex + 300);
  assert(kneeChunk.includes('fill="#f97316"'), 'knee-dominant-lower-body SVG element has orange fill (#f97316)');

  // hip-posterior-chain (status: 잔여 부하) -> yellow fill #eab308 inside its g
  const hipGIndex = renderedMap.indexOf('data-dimension="hip-posterior-chain"');
  assert(hipGIndex !== -1, 'hip-posterior-chain group exists');
  const hipChunk = renderedMap.substring(hipGIndex, hipGIndex + 300);
  assert(hipChunk.includes('fill="#eab308"'), 'hip-posterior-chain SVG element has yellow fill (#eab308)');

  // horizontal-push (status: 최근 부하 근거 없음) -> teal fill #14b8a6 inside its g
  const hPushGIndex = renderedMap.indexOf('data-dimension="horizontal-push"');
  assert(hPushGIndex !== -1, 'horizontal-push group exists');
  const hPushChunk = renderedMap.substring(hPushGIndex, hPushGIndex + 300);
  assert(hPushChunk.includes('fill="#14b8a6"'), 'horizontal-push SVG element has teal fill (#14b8a6)');

  // vertical-push (status: 판단 정보 부족) -> slate fill #64748b inside its g
  const vPushGIndex = renderedMap.indexOf('data-dimension="vertical-push"');
  assert(vPushGIndex !== -1, 'vertical-push group exists');
  const vPushChunk = renderedMap.substring(vPushGIndex, vPushGIndex + 300);
  assert(vPushChunk.includes('fill="#64748b"'), 'vertical-push SVG element has slate fill (#64748b)');

  // 3c. Axial item is displayed once and not duplicated in the list below
  const axialMatches = renderedMap.split('data-dimension="axial-systemic-loading"').length - 1;
  assert(axialMatches === 1, 'axial-systemic-loading is rendered exactly once as a dedicated item');
  assert(!renderedMap.includes('data-dimension-row="axial-systemic-loading"'), 'axial is NOT duplicated in bottom list');

  // 3d. Simplified Korean labels '정면' and '후면' (no '(FRONT)', '(BACK)')
  assert(renderedMap.includes('>정면<') && renderedMap.includes('>후면<'), 'Labels are simplified to "정면" and "후면"');
  assert(!renderedMap.includes('(Front)') && !renderedMap.includes('(Back)'), 'No uppercase or English "(Front)" / "(Back)"');

  // 3e. Disclaimer and single summary
  assert(
    renderedMap.includes('기록 기반 추정 · 실제 근육 피로 측정값 아님'),
    'Disclaimer "기록 기반 추정 · 실제 근육 피로 측정값 아님" is rendered'
  );
  assert(
    renderedMap.includes('최근 직접 부하 2개 영역, 잔여 부하 2개 영역 감지'),
    'Existing bodyLoad.summary is rendered'
  );

  // 3f. Excluded session notice (concise, without arbitrary body part assignment)
  assert(
    renderedMap.includes('당일 시간 미지정 기록 2건 제외 (신체 부위 미배정)'),
    'Excluded session notice displayed concisely'
  );

  // 3g. No biological pseudo-measurements
  assert(
    !renderedMap.includes('중추신경계 부담') && !renderedMap.includes('중추 신경계 복합 부하'),
    'No speculative CNS / biological measurement claims'
  );

  // 3h. Uncertainty note in bottom list
  assert(
    renderedMap.includes('경계 시점(24h/72h) 불확실성 포함'),
    'Uncertainty note is displayed for knee-dominant'
  );

  // 3i. Accessibility attributes on SVGs
  assert(renderedMap.includes('role="img"') && renderedMap.includes('<title'), 'SVGs include role="img" and <title>');
  assert(
    renderedMap.includes('aria-labelledby="test-map-front-title test-map-front-desc"'),
    'Front SVG links title and desc via idPrefix'
  );

  // 4. Missing / Undefined bodyLoad fallback
  const renderedEmpty = renderToStaticMarkup(<BodyLoadMap bodyLoad={undefined} idPrefix="empty-map" />);
  assert(
    renderedEmpty.includes('판단 정보 부족'),
    'Undefined bodyLoad renders "판단 정보 부족" for dimensions'
  );
  assert(
    !renderedEmpty.includes('#14b8a6') && !renderedEmpty.includes('완전 회복'),
    'Missing bodyLoad does NOT default to teal/recovered'
  );

  // 5. RecommendedWorkoutCard integration tests
  // 5a. Train Recommendation (스쿼트) with reasons and bodyLoad
  const fullRec: RecommendationResult = {
    mainLift: '스쿼트',
    reasons: ['✓ 하체 회복 완료', '✓ 주동근 준비 상태 양호'],
    representativeExercises: ['바벨 스쿼트'],
    date: '2026. 10. 28',
    bodyLoad: fullBodyLoad,
    topCandidates: [
      { lift: '스쿼트', isCurrent: true, statusType: 'preferred' },
      { lift: '벤치프레스', isCurrent: false, statusType: 'viable' },
      { lift: '데드리프트', isCurrent: false, statusType: 'caution' },
    ],
  };

  const trainCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={fullRec} defaultExpanded={true} />
  );

  // Unified ordering
  const viableIndex = trainCard.indexOf('수행 가능한 훈련');
  const accordionIndex = trainCard.indexOf('추천 근거 · 신체 부하 보기');
  assert(
    viableIndex !== -1 && accordionIndex !== -1 && viableIndex < accordionIndex,
    'Unified order: viable candidates section comes BEFORE reasons accordion'
  );

  // Train recommendation preserves '분석 기반 추천 사유'
  assert(trainCard.includes('분석 기반 추천 사유'), 'Train recommendation preserves "분석 기반 추천 사유"');
  assert(trainCard.includes('하체 회복 완료'), 'Train recommendation preserves reason text');
  assert(trainCard.includes('운동 시작'), 'CTA button "운동 시작" is rendered for Train recommendation');

  // Verify accordion aria-expanded state
  assert(trainCard.includes('aria-expanded="true"'), 'Opened accordion has aria-expanded="true"');
  const collapsedCard = renderToStaticMarkup(<RecommendedWorkoutCard nextRecommendation={fullRec} />);
  assert(collapsedCard.includes('aria-expanded="false"'), 'Default accordion has aria-expanded="false"');

  // 5b. Rest Recommendation with bodyLoad and reasons
  const restRecWithBodyLoad: RecommendationResult = {
    mainLift: '휴식',
    reasons: ['✓ 마지막 훈련 완료', '✓ 피로도 보통'],
    representativeExercises: ['충분한 수면', '가벼운 산책'],
    date: '2026. 10. 28',
    bodyLoad: fullBodyLoad,
    topCandidates: [
      { lift: '스쿼트', isCurrent: false, statusType: 'viable' },
    ],
  };

  const restCardWithBodyLoad = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={restRecWithBodyLoad} defaultExpanded={true} />
  );

  // In Rest state: '휴식 결정 사유' and bullet list MUST BE HIDDEN even when expanded
  assert(
    !restCardWithBodyLoad.includes('휴식 결정 사유'),
    'Rest recommendation completely hides "휴식 결정 사유" title'
  );
  assert(
    !restCardWithBodyLoad.includes('피로도 보통'),
    'Rest recommendation completely hides reasons bullet text'
  );
  // But accordion IS shown because bodyLoad exists
  assert(
    restCardWithBodyLoad.includes('추천 근거 · 신체 부하 보기'),
    'Rest recommendation shows accordion when bodyLoad exists'
  );
  assert(
    !restCardWithBodyLoad.includes('운동 시작'),
    'Rest recommendation does NOT render "운동 시작" CTA'
  );

  // 5c. Rest Recommendation with NO bodyLoad and reasons
  const restRecNoBodyLoad: RecommendationResult = {
    mainLift: '휴식',
    reasons: ['✓ 피로도 보통'],
    representativeExercises: ['충분한 수면'],
    date: '2026. 10. 28',
    bodyLoad: undefined,
  };
  const restCardNoBodyLoad = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={restRecNoBodyLoad} />
  );
  // Since reasons are hidden for Rest and bodyLoad is missing, NO empty accordion should be rendered
  assert(
    !restCardNoBodyLoad.includes('추천 근거 · 신체 부하 보기'),
    'Rest recommendation without bodyLoad renders NO empty accordion'
  );

  // 5d. Train recommendation with NO bodyLoad but reasons present
  const trainNoBodyLoadRec: RecommendationResult = {
    mainLift: '벤치프레스',
    reasons: ['✓ 상체 충분한 휴식 경과'],
    representativeExercises: ['바벨 벤치프레스'],
    date: '2026. 10. 28',
    bodyLoad: undefined,
  };
  const trainNoBodyLoadCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={trainNoBodyLoadRec} defaultExpanded={true} />
  );
  assert(
    trainNoBodyLoadCard.includes('추천 근거 · 신체 부하 보기'),
    'Train recommendation with reasons renders accordion even without bodyLoad'
  );
  assert(
    trainNoBodyLoadCard.includes('분석 기반 추천 사유'),
    'Train recommendation displays "분석 기반 추천 사유"'
  );

  // 5e. Multiple component instance ID collision test
  const card1 = renderToStaticMarkup(<RecommendedWorkoutCard nextRecommendation={fullRec} />);
  const card2 = renderToStaticMarkup(<RecommendedWorkoutCard nextRecommendation={fullRec} />);
  // Verify aria-controls is present in both
  assert(card1.includes('aria-controls="') && card2.includes('aria-controls="'), 'Both cards have aria-controls');

  // Verify BodyLoadMap with custom prefixes creates unique title/desc IDs
  const mapA = renderToStaticMarkup(<BodyLoadMap bodyLoad={fullBodyLoad} idPrefix="inst-A" />);
  const mapB = renderToStaticMarkup(<BodyLoadMap bodyLoad={fullBodyLoad} idPrefix="inst-B" />);
  assert(mapA.includes('id="inst-A-front-title"'), 'Map A has inst-A-front-title');
  assert(mapB.includes('id="inst-B-front-title"'), 'Map B has inst-B-front-title');
  assert(!mapA.includes('inst-B'), 'Map A does not contain inst-B prefix');

  // 6. Open-source High-Fidelity SVG Paths and Headless Diagram Tests
  // 6a. Balanced Headless Front and Back ViewBoxes (vertically centered, shoulders & feet intact)
  assert(
    BODY_FRONT_VIEW_BOX === '0 200 724 1180',
    'BODY_FRONT_VIEW_BOX uses headless adjusted "0 200 724 1180"'
  );
  assert(
    BODY_BACK_VIEW_BOX === '724 200 724 1180',
    'BODY_BACK_VIEW_BOX uses headless adjusted "724 200 724 1180"'
  );
  assert(
    renderedMap.includes('viewBox="0 200 724 1180"'),
    'Rendered front SVG specifies headless viewBox="0 200 724 1180"'
  );
  assert(
    renderedMap.includes('viewBox="724 200 724 1180"'),
    'Rendered back SVG specifies headless viewBox="724 200 724 1180"'
  );

  // 6b. Intentionally headless: no head/hair paths and clean neck top cap finish
  assert(
    !renderedMap.includes('data-dimension="head"') && !renderedMap.includes('head-'),
    'No head dimension or head path added'
  );
  assert(
    !renderedMap.includes('hair'),
    'No hair paths added'
  );
  assert(
    renderedMap.includes('id="test-map-neck-clip-front"') &&
    renderedMap.includes('id="test-map-neck-clip-back"'),
    'Unique clipPath definitions exist for front and back neck clipping'
  );
  assert(
    renderedMap.includes('data-testid="neck-finish-front"') &&
    renderedMap.includes('data-testid="neck-finish-back"'),
    'Neck top finish curved caps are rendered for front and back'
  );
  assert(
    NECK_FINISH_PATHS.frontCap.includes('236') && NECK_FINISH_PATHS.backCap.includes('236'),
    'Neck finish curve heights start symmetrically at Y = 236 for front and back'
  );

  // 6b. Continuous body outline paths preserved from SvgMaleWrapper
  assert(
    typeof BODY_OUTLINE_PATHS.front === 'string' && BODY_OUTLINE_PATHS.front.length > 5000,
    'Front body outline is a non-trivial continuous SVG path'
  );
  assert(
    typeof BODY_OUTLINE_PATHS.back === 'string' && BODY_OUTLINE_PATHS.back.length > 5000,
    'Back body outline is a non-trivial continuous SVG path'
  );
  assert(
    renderedMap.includes(BODY_OUTLINE_PATHS.front.slice(0, 50)),
    'Rendered Front SVG includes actual open-source front outline'
  );
  assert(
    renderedMap.includes(BODY_OUTLINE_PATHS.back.slice(0, 50)),
    'Rendered Back SVG includes actual open-source back outline'
  );

  // 6c. Mid-back (horizontal-pull) and Outer-back / Lats (vertical-pull) isolation
  const hPullIndex = renderedMap.indexOf('data-dimension="horizontal-pull"');
  const vPullIndex = renderedMap.indexOf('data-dimension="vertical-pull"');
  assert(hPullIndex !== -1 && vPullIndex !== -1, 'Both horizontal-pull and vertical-pull groups exist');
  assert(hPullIndex !== vPullIndex, 'horizontal-pull and vertical-pull are separate groups');

  const hPullChunk = renderedMap.substring(hPullIndex, hPullIndex + 300);
  const vPullChunk = renderedMap.substring(vPullIndex, vPullIndex + 300);
  assert(
    hPullChunk.includes('fill="#f97316"'),
    'horizontal-pull group has orange fill (#f97316) for 최근 부하'
  );
  assert(
    vPullChunk.includes('fill="#14b8a6"'),
    'vertical-pull group has teal fill (#14b8a6) for 최근 부하 근거 없음'
  );
  assert(
    !hPullChunk.includes('fill="#14b8a6"'),
    'horizontal-pull does not bleed into vertical-pull color'
  );
  assert(
    !vPullChunk.includes('fill="#f97316"'),
    'vertical-pull does not bleed into horizontal-pull color'
  );

  // 6d. Targeted dimension muscle path counts
  assert(FRONT_BODY_PATHS.verticalPush.length > 0, 'verticalPush (deltoids) has valid paths');
  assert(FRONT_BODY_PATHS.horizontalPush.length > 0, 'horizontalPush (chest) has valid paths');
  assert(FRONT_BODY_PATHS.kneeDominant.length > 0, 'kneeDominant (quadriceps) has valid paths');
  assert(BACK_BODY_PATHS.horizontalPull.length > 0, 'horizontalPull (trapezius + upper back) has valid paths');
  assert(BACK_BODY_PATHS.verticalPull.length > 0, 'verticalPull (lats) has valid paths');
  assert(BACK_BODY_PATHS.hipPosteriorChain.length > 0, 'hipPosteriorChain (gluteal + hamstrings) has valid paths');

  // 6e. Neutral non-targeted body parts remain dark slate background
  assert(FRONT_BODY_PATHS.neutral.length > 0, 'Front has neutral non-targeted paths (core, calves, arms)');
  assert(BACK_BODY_PATHS.neutral.length > 0, 'Back has neutral non-targeted paths (erectors, calves, arms)');
  assert(
    renderedMap.includes(FRONT_BODY_PATHS.neutral[0].slice(0, 30)),
    'Neutral front muscles rendered in SVG'
  );
  assert(
    renderedMap.includes(BACK_BODY_PATHS.neutral[0].slice(0, 30)),
    'Neutral back muscles rendered in SVG'
  );

  // 6f. Third-Party Licenses Notice verification
  assert(
    fs.existsSync('THIRD_PARTY_LICENSES.md'),
    'THIRD_PARTY_LICENSES.md file exists in root'
  );
  const licenseContent = fs.readFileSync('THIRD_PARTY_LICENSES.md', 'utf8');
  assert(
    licenseContent.includes('ELABBASSI Hicham') &&
    licenseContent.includes('react-native-body-highlighter') &&
    licenseContent.includes('8ed39ac2ae9cb46fb79d77eedec7e5b029a75174'),
    'THIRD_PARTY_LICENSES.md attributes ELABBASSI Hicham with commit 8ed39ac2ae9cb46fb79d77eedec7e5b029a75174'
  );

  // 7. Mobile Layout & Two-Line Uncertainty Note Tests
  // 7a. Data with long uncertainty notes
  const longNoteDimensions: DimensionLoadPresentation[] = [
    {
      dimension: 'knee-dominant-lower-body',
      displayName: '무릎 중심 하체',
      status: '최근 부하',
      uncertainty: {
        hasUncertainty: true,
        hasBracketTraces: true,
        hasUncertainTraces: false,
        bracketTraceCount: 1,
        uncertainTraceCount: 0,
        note: '경계 시점(24h/72h) 불확실성 포함 및 당일 복합 세션 추적 지연으로 인한 추가 평가',
      },
      isImmediate: true,
      isResidual: false,
      isHistorical: false,
      isInsufficient: false,
    },
    {
      dimension: 'axial-systemic-loading',
      displayName: '전신 및 축성 부하',
      status: '최근 부하',
      uncertainty: {
        hasUncertainty: true,
        hasBracketTraces: false,
        hasUncertainTraces: true,
        bracketTraceCount: 0,
        uncertainTraceCount: 2,
        note: '시간 미지정 기록 2건으로 인한 전신 축성 부하 불확실성 포함',
      },
      isImmediate: true,
      isResidual: false,
      isHistorical: false,
      isInsufficient: false,
    },
  ];

  const longNoteBodyLoad: BodyLoadPresentation = {
    dimensions: longNoteDimensions,
    uncertainSameDaySessionCount: 2,
    hasUncertainty: true,
    summary: '확인 가능한 영역에서 최근 직접 부하 근거가 감지되었습니다. 일부 영역은 불확실성을 포함합니다.',
  };

  const renderedLongNoteMap = renderToStaticMarkup(<BodyLoadMap bodyLoad={longNoteBodyLoad} idPrefix="long-note-map" />);

  // 7b. Movement row layout: 2-line structure without truncation
  const kneeRowIndex = renderedLongNoteMap.indexOf('data-dimension-row="knee-dominant-lower-body"');
  assert(kneeRowIndex !== -1, 'knee-dominant row exists in long-note render');
  const kneeRowChunk = renderedLongNoteMap.substring(kneeRowIndex, kneeRowIndex + 600);

  assert(
    kneeRowChunk.includes('flex flex-col gap-1'),
    'Movement dimension row uses vertical flex column for 2-line layout'
  );
  assert(
    kneeRowChunk.includes('flex items-center justify-between gap-2'),
    'Movement dimension row line 1 contains name and status badge in justify-between flex'
  );
  assert(
    !kneeRowChunk.includes('truncate') &&
    !kneeRowChunk.includes('line-clamp') &&
    !kneeRowChunk.includes('overflow-hidden'),
    'Movement dimension name and uncertainty note are NOT truncated, line-clamped, or overflow-hidden'
  );
  assert(
    kneeRowChunk.includes('break-words leading-tight'),
    'Uncertainty note wraps naturally with break-words leading-tight on line 2'
  );
  assert(
    kneeRowChunk.includes('경계 시점(24h/72h) 불확실성 포함 및 당일 복합 세션 추적 지연으로 인한 추가 평가'),
    'Full long uncertainty note text is completely preserved and rendered'
  );

  // 7c. Coexistence of active load color and uncertainty note
  assert(
    renderedLongNoteMap.includes('data-dimension="knee-dominant-lower-body"') &&
    kneeRowChunk.includes('최근 부하') &&
    kneeRowChunk.includes('text-orange-400') &&
    renderedLongNoteMap.includes('fill="#f97316"'),
    'Active load color (#f97316) and uncertainty note coexist properly'
  );

  // 7d. Axial item mobile layout (stacked on small screens)
  const axialIndex = renderedLongNoteMap.indexOf('data-dimension="axial-systemic-loading"');
  assert(axialIndex !== -1, 'axial-systemic-loading item exists in long-note render');
  const axialChunk = renderedLongNoteMap.substring(axialIndex, axialIndex + 900);
  assert(
    axialChunk.includes('flex flex-col sm:flex-row sm:items-center sm:justify-between'),
    'Axial item uses flex-col on mobile and sm:flex-row on larger screens'
  );
  assert(
    axialChunk.includes('break-words leading-tight'),
    'Axial uncertainty note wraps naturally with break-words'
  );

  // 7e. Header layout for small screens
  assert(
    renderedLongNoteMap.includes('flex flex-col sm:flex-row sm:items-center sm:justify-between'),
    'Header title and disclaimer stack vertically on mobile (flex-col sm:flex-row)'
  );

  // 8. Accordion Accessibility & useId Unique ID Prefix Tests
  // 8a. BodyLoadMap auto-generated unique ID prefix when idPrefix is omitted
  const twoMaps = renderToStaticMarkup(
    <div>
      <BodyLoadMap bodyLoad={fullBodyLoad} />
      <BodyLoadMap bodyLoad={fullBodyLoad} />
    </div>
  );
  assert(
    twoMaps.includes('body-load-'),
    'BodyLoadMap generates fallback idPrefix containing body-load- when omitted'
  );
  const clipMatches = [...twoMaps.matchAll(/id="(body-load-[^"]+-neck-clip-front)"/g)].map((m) => m[1]);
  assert(
    clipMatches.length >= 2,
    'Both auto-generated instances in the tree render valid clipPath IDs'
  );
  assert(
    clipMatches[0] !== clipMatches[1],
    'Two BodyLoadMap instances in the same tree generate distinct clipPath IDs without collision'
  );

  // 8b. Explicit idPrefix is strictly preserved
  const customPrefixMap = renderToStaticMarkup(<BodyLoadMap bodyLoad={fullBodyLoad} idPrefix="my-custom-prefix" />);
  assert(
    customPrefixMap.includes('id="my-custom-prefix-front-title"') &&
    customPrefixMap.includes('id="my-custom-prefix-neck-clip-front"'),
    'Explicit idPrefix="my-custom-prefix" is strictly preserved'
  );

  // 8c. Accordion button and container accessibility attributes
  const expandedCard = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={fullRec} defaultExpanded={true} />
  );
  assert(
    expandedCard.includes('role="region"'),
    'Accordion content container has role="region"'
  );
  assert(
    expandedCard.includes('aria-labelledby="rec-accordion-') &&
    expandedCard.includes('-btn"'),
    'Accordion content container has aria-labelledby linked to button'
  );
  assert(
    expandedCard.includes('aria-controls="rec-accordion-'),
    'Accordion button has aria-controls linked to content container'
  );
  assert(
    expandedCard.includes('aria-expanded="true"') &&
    expandedCard.includes('aria-hidden="false"'),
    'Expanded card has aria-expanded="true" and aria-hidden="false"'
  );

  const collapsedCardState = renderToStaticMarkup(
    <RecommendedWorkoutCard nextRecommendation={fullRec} defaultExpanded={false} />
  );
  assert(
    collapsedCardState.includes('aria-expanded="false"'),
    'Collapsed card button has aria-expanded="false"'
  );

  // 8d. Mobile padding check on RecommendedWorkoutCard
  assert(
    expandedCard.includes('p-4 sm:p-6 lg:p-7'),
    'RecommendedWorkoutCard applies responsive padding p-4 sm:p-6 lg:p-7 to prevent mobile overflow'
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
