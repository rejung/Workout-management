/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VNext Presentation Compatibility Mapper (CU6.0 - Production Cutover & Semantic Polish)
 *
 * Single Responsibility:
 * Translates VNext FinalTodayDecision, CandidateDecisionSet, and RestDecisionEvidence
 * into the presentation-compatible `RecommendationResult` contract required by
 * dashboard cards and UI components with pure Korean presentation semantics.
 *
 * Invariants & Negative Constraints:
 * 1. ZERO Legacy Score Fabrication: Never generates artificial legacy 5-factor scores,
 *    recovery percentages, fatigue scores, or rotation bonuses.
 * 2. ZERO Fake Pending Items: Never generates artificial legacy pending recommendation overdue state.
 * 3. First-Class Rest Preservation: When decision is 'rest', mainLift is strictly '휴식'.
 * 4. Zero Raw Domain Enums: Exposes only user-friendly Korean terminology.
 * 5. Transparent VNext Attachment: Attaches the raw `FinalTodayDecision` directly as `vnextDecision`
 *    for modern consumers.
 */

import { FinalTodayDecision } from '../types/finalTodayDecision.types';
import { CandidateDecisionEvaluationSet, CandidateDecisionEvidence } from '../types/candidateDecision.types';
import { RestDecisionEvidence } from '../types/restDecision.types';
import { NextProjectedSession } from '../types/projectedSession.types';
import {
  RecommendationResult,
  MainLift,
  TopCandidatePresentation,
  CandidateStatusType,
} from '../types/recommendationPresentation.types';
import { getFriendlyRecommendationDate } from '../../../utils/dateUtils';

export const CANDIDATE_ID_TO_KOREAN_LIFT_MAP: Record<string, MainLift> = Object.freeze({
  barbell_row: '바벨 로우',
  bench_press: '벤치프레스',
  squat: '스쿼트',
  deadlift: '데드리프트',
  overhead_press: 'OHP',
  running: '러닝',
});

export const KOREAN_LIFT_TO_CANDIDATE_ID_MAP: Record<string, string> = Object.freeze({
  '바벨로우': 'barbell_row',
  '바벨 로우': 'barbell_row',
  '벤치프레스': 'bench_press',
  '스쿼트': 'squat',
  '데드리프트': 'deadlift',
  'OHP': 'overhead_press',
  '오버헤드 프레스': 'overhead_press',
  '러닝': 'running',
  '유산소': 'running',
});

const ACTION_TAGS_MAP: Record<string, readonly string[]> = Object.freeze({
  barbell_row: ['바벨 로우', '등', '이두', '코어'],
  bench_press: ['벤치프레스', '가슴', '삼두', '어깨'],
  squat: ['스쿼트', '하체', '둔근', '코어'],
  deadlift: ['데드리프트', '후면사슬', '등', '전신'],
  overhead_press: ['오버헤드 프레스', '어깨', '삼두', '코어'],
  running: ['러닝', '유산소', '심폐지구력', '하체 회복'],
  rest: ['충분한 수면', '가벼운 산책', '동적 스트레칭', '수분 섭취'],
});

const ACTION_CHECKLIST_MAP: Record<string, readonly string[]> = Object.freeze({
  barbell_row: ['견갑골 후인 및 하강 고정', '상체 각도 45도 유지', '코어 텐션 및 바벨 궤적 통제'],
  bench_press: ['견갑 후인 하강 숄더 패킹', '그립 너비 점검 및 손목 중립', '가슴 아치 및 레그 드라이브'],
  squat: ['복압 형성 및 브레이싱', '골반 힌지 및 고관절 개방', '발바닥 3점 지지 및 무릎 정렬'],
  deadlift: ['정강이 바벨 밀착', '광배근 텐션 및 락아웃 준비', '지면 밀어내기 레그 프레스 감각'],
  overhead_press: ['둔근 및 복근 최대 수축', '수직 바 궤적 및 팔꿈치 전방', '상단 완전 락아웃 및 헤드스루'],
  running: ['규칙적인 호흡 리듬 유지', '미드풋 착지 및 케이던스 170+', '무리한 가속 지양 및 자세 안정'],
  rest: ['충분한 단백질 섭취', '8시간 양질의 수면 확보', '가벼운 모빌리티 스트레칭 진행'],
});

/**
 * Maps raw stress dimensions to user-friendly Korean terminology.
 */
export function translateStressDimension(dim: string): string {
  const map: Record<string, string> = {
    'axial-systemic-loading': '전신 및 척추 부하',
    'hip-posterior-chain': '둔근 및 후면사슬',
    'knee-dominant-lower-body': '대퇴사두 및 하체 전면',
    'horizontal-push': '수평 밀기 (가슴/삼두)',
    'vertical-push': '수직 밀기 (어깨/삼두)',
    'horizontal-pull': '수평 당기기 (등/이두)',
    'vertical-pull': '수직 당기기 (광배/이두)',
  };
  return map[dim] || dim;
}

/**
 * Maps raw RestDecisionCategory to user-friendly Korean descriptions.
 */
export function translateRestCategory(cat: string): string {
  const map: Record<string, string> = {
    'completed-session-boundary': '당일 운동 완료로 인한 회복',
    'hardblocked-boundary': '안전 기준상 회복 권장',
    'no-viable-candidates': '후보 운동 잔여 부하로 인한 회복',
    'session-level-rest-supported': '전신 훈련 부하로 인한 회복 권장',
  };
  return map[cat] || '회복 권장';
}

/**
 * Translates domain engine reasons to natural, factual Korean presentation sentences.
 */
export function translateDomainReason(reason: string): string {
  if (!reason) return '';

  let cleaned = reason.trim().replace(/^✓\s*/, '');

  // 1. Session boundary / Completed session
  if (/Workout session\s*\((.*?)\)\s*was already completed/i.test(cleaned) || /completed on/i.test(cleaned)) {
    const match = cleaned.match(/Workout session\s*\((.*?)\)\s*was already completed/i);
    const exercise = match && match[1] ? match[1] : '운동';
    return `오늘 ${exercise} 훈련을 이미 완료하여 당일 회복 세션이 활성화되었습니다.`;
  }
  if (/Completed Session:\s*Rest/i.test(cleaned)) {
    return '오늘 세션을 완료하여 추가 훈련 대신 회복을 진행합니다.';
  }
  if (/A workout session\s*\((.*?)\)\s*was already performed/i.test(cleaned)) {
    return '오늘 훈련이 이미 완료되어 당일 남은 시간 동안 회복을 유지합니다.';
  }

  // 2. Consecutive days
  const consecMatch = cleaned.match(/(\d+)\s*consecutive training days recorded/i);
  if (consecMatch) {
    return `최근 ${consecMatch[1]}일 연속으로 훈련을 진행하여 회복이 필요합니다.`;
  }

  // 3. High training frequency
  const freqMatch = cleaned.match(/High training frequency with\s*(\d+)\s*unique training days in the past\s*(\d+)/i);
  if (freqMatch) {
    return `최근 ${freqMatch[2]}일 동안 ${freqMatch[1]}일의 높은 훈련 빈도가 기록되었습니다.`;
  }

  // 4. Residual stress & Demand
  if (/Active immediate residual stress\s*\((.*?)\)\s*across multiple dimensions/i.test(cleaned)) {
    return '24시간 이내의 직접적인 잔여 부하가 관련 움직임 영역에 활성화되어 있습니다.';
  }
  if (/Broad residual stress\s*\(24h-72h\)/i.test(cleaned)) {
    return '최근 훈련으로 인한 잔여 부하가 관련 움직임 영역에 남아 있습니다.';
  }
  if (/Elevated systemic training demand/i.test(cleaned)) {
    return '반복적인 복합 다관절 운동 및 고부하 훈련으로 전신 회복 필요도가 높습니다.';
  }
  if (/All evaluated candidate exercises are currently constrained/i.test(cleaned) || /All evaluated candidate exercises are currently deferred/i.test(cleaned)) {
    return '모든 후보 운동이 최근 수행되었거나 관련 부하 영향으로 휴식을 권장합니다.';
  }
  if (/All candidate exercises are contraindicated/i.test(cleaned)) {
    return '모든 후보 운동이 현재 안전 기준상 제외되었습니다.';
  }
  if (/No candidate exercises currently have preferred recommendation/i.test(cleaned)) {
    return '현재 우선적으로 권장되거나 주기가 임박한 후보 운동이 없습니다.';
  }

  // 5. Training candidate reasons
  if (/Readiness is completely clear/i.test(cleaned)) {
    return '필요한 모든 움직임 영역에서 훈련 준비도가 양호합니다.';
  }
  const cadenceMatch = cleaned.match(/Training cadence is due\s*\((\d+)d since last session/i);
  if (cadenceMatch) {
    return `마지막 수행 후 ${cadenceMatch[1]}일이 경과하여 해당 훈련 자극이 필요한 주기입니다.`;
  }
  if (/Historical performance records support progression/i.test(cleaned)) {
    return '최근 수행 기록을 바탕으로 다음 점진적 과부하 자극을 시도할 수 있습니다.';
  }
  if (/Readiness has manageable residual\/overlap caution/i.test(cleaned)) {
    return '일부 잔여 부하가 있으나, 훈련 필요 주기와 점진적 과부하 기회를 고려할 때 최적의 추천입니다.';
  }
  if (/Readiness is clear and candidate is available in regular training rotation/i.test(cleaned)) {
    return '훈련 준비도가 양호하며 정기 훈련 로테이션에 적합합니다.';
  }
  if (/Manageable residual stress/i.test(cleaned)) {
    return '관련 부위에 일부 잔여 부하 영향이 남아 있으나 정상 수행 가능합니다.';
  }
  if (/Initial exploratory baseline candidate/i.test(cleaned)) {
    return '기록 축적을 위한 기초 세션으로 수행 가능합니다.';
  }
  if (/Candidate satisfies general training feasibility/i.test(cleaned)) {
    return '일반적인 훈련 적합성 기준을 충족합니다.';
  }

  // 6. Rest Category Reason
  if (cleaned.startsWith('회복 분류:')) {
    const rawCat = cleaned.replace('회복 분류:', '').trim();
    return `회복 사유: ${translateRestCategory(rawCat)}`;
  }

  // Clean raw enums inside string if any
  cleaned = cleaned
    .replace(/axial-systemic-loading/g, '전신 및 척추 부하')
    .replace(/hip-posterior-chain/g, '둔근 및 후면사슬')
    .replace(/knee-dominant-lower-body/g, '대퇴사두 및 하체 전면')
    .replace(/horizontal-push/g, '수평 밀기')
    .replace(/vertical-push/g, '수직 밀기')
    .replace(/horizontal-pull/g, '수평 당기기')
    .replace(/vertical-pull/g, '수직 당기기')
    .replace(/completed-session-boundary/g, '당일 운동 완료')
    .replace(/hardblocked-boundary/g, '안전 제한')
    .replace(/no-viable-candidates/g, '적합 후보 없음')
    .replace(/session-level-rest-supported/g, '전신 회복 권장');

  return cleaned;
}

/**
 * Translates candidate-specific decision or rejection reasons to natural Korean.
 */
export function translateCandidateReason(cand: CandidateDecisionEvidence, isCurrent: boolean): string | undefined {
  if (isCurrent) return undefined;

  const rawReason = cand.decisionReasons[0] || '';
  const daysAgo = cand.trainingNeedEvidence?.recency?.calendarDaysSinceLastPerformed;

  if (cand.decisionClass === 'deferred') {
    if (cand.comparisonFacts?.needClass === 'recently-addressed' || /recently addressed/i.test(rawReason)) {
      const days = daysAgo !== undefined ? daysAgo : 1;
      return `${days}일 전에 수행해 최근 훈련 필요도가 낮습니다.`;
    }
    if (cand.comparisonFacts?.readinessClass === 'constrained' || /acute residual stress/i.test(rawReason)) {
      return '최근 훈련으로 인한 잔여 부하가 높아 회복이 권장됩니다.';
    }
    return '최근 세션의 잔여 부하로 인해 다음 세션으로 연기되었습니다.';
  }

  if (cand.decisionClass === 'viable') {
    if (cand.comparisonFacts?.readinessClass === 'caution' || /Manageable residual stress/i.test(rawReason)) {
      return '최근 관련 부하의 영향이 일부 남아 있습니다.';
    }
    return '수행 가능하나 다른 부위의 훈련 필요도가 더 높습니다.';
  }

  if (cand.decisionClass === 'unsupported') {
    return '현재 안전 및 추천 지원 기준 미충족';
  }

  return translateDomainReason(rawReason);
}

/**
 * Derives user-facing status label and category for a candidate.
 */
export function deriveCandidateStatus(
  cand: CandidateDecisionEvidence,
  isCurrent: boolean
): { statusLabel: string; statusType: CandidateStatusType } {
  if (isCurrent) {
    return { statusLabel: '최적 추천', statusType: 'preferred' };
  }

  if (cand.decisionClass === 'preferred') {
    return { statusLabel: '수행 가능', statusType: 'preferred' };
  }

  if (cand.decisionClass === 'viable') {
    if (cand.comparisonFacts?.readinessClass === 'caution' || cand.decisionReasons.some((r) => /Manageable residual/i.test(r) || /caution/i.test(r))) {
      return { statusLabel: '주의', statusType: 'caution' };
    }
    return { statusLabel: '수행 가능', statusType: 'viable' };
  }

  if (cand.decisionClass === 'deferred') {
    if (cand.comparisonFacts?.needClass === 'recently-addressed' || cand.decisionReasons.some((r) => /recently addressed/i.test(r))) {
      return { statusLabel: '최근 수행', statusType: 'recent' };
    }
    if (cand.comparisonFacts?.readinessClass === 'constrained' || cand.decisionReasons.some((r) => /acute residual/i.test(r))) {
      return { statusLabel: '주의', statusType: 'caution' };
    }
    return { statusLabel: '순환 연기', statusType: 'deferred' };
  }

  return { statusLabel: '제한됨', statusType: 'unsupported' };
}

export interface MapVNextOptions {
  readonly calendarDate?: string;
  readonly nextProjectedSession?: NextProjectedSession;
}

/**
 * Maps VNext Decision to presentation-compatible RecommendationResult.
 */
export function mapVNextToPresentationModel(
  decision: FinalTodayDecision,
  candidateSet?: CandidateDecisionEvaluationSet,
  restEvidence?: RestDecisionEvidence,
  options?: MapVNextOptions
): RecommendationResult {
  const isRest = decision.kind === 'rest';
  const calendarDate = options?.calendarDate || new Date().toISOString().substring(0, 10);
  const formattedDate = calendarDate.replace(/-/g, '. ');
  const projectedSession = options?.nextProjectedSession;

  // 1. Determine mainLift
  let mainLift: MainLift = '휴식';
  let primaryCandidateId: string | undefined;
  const isTie = Boolean(
    !isRest &&
    decision.tiedPrimaryCandidates &&
    decision.tiedPrimaryCandidates.length > 1
  );

  if (!isRest) {
    if (isTie && decision.tiedPrimaryCandidates) {
      mainLift = decision.tiedPrimaryCandidates
        .map((c) => CANDIDATE_ID_TO_KOREAN_LIFT_MAP[c.candidateExerciseId] || c.candidateExerciseName)
        .join(' / ') as MainLift;
    } else if (decision.primaryCandidate) {
      primaryCandidateId = decision.primaryCandidate.candidateExerciseId;
      mainLift = CANDIDATE_ID_TO_KOREAN_LIFT_MAP[primaryCandidateId] || (decision.primaryCandidate.candidateExerciseName as MainLift);
    } else if (decision.tiedPrimaryCandidates && decision.tiedPrimaryCandidates.length === 1) {
      primaryCandidateId = decision.tiedPrimaryCandidates[0].candidateExerciseId;
      mainLift = CANDIDATE_ID_TO_KOREAN_LIFT_MAP[primaryCandidateId] || (decision.tiedPrimaryCandidates[0].candidateExerciseName as MainLift);
    }
  }

  // 2. Map Reasons
  const reasons: string[] = [];
  if (isRest) {
    if (decision.decisionRationale) {
      const translated = translateDomainReason(decision.decisionRationale);
      if (translated) reasons.push(translated);
    }
    if (restEvidence && restEvidence.supportingReasons) {
      for (const reason of restEvidence.supportingReasons) {
        const translated = translateDomainReason(reason);
        if (translated && !reasons.includes(translated)) {
          reasons.push(`✓ ${translated}`);
        }
      }
    }
    if (decision.restCategory) {
      const catReason = `회복 사유: ${translateRestCategory(decision.restCategory)}`;
      if (!reasons.includes(catReason) && !reasons.includes(`✓ ${catReason}`)) {
        reasons.push(`✓ ${catReason}`);
      }
    }
  } else {
    if (decision.decisionRationale) {
      const translated = translateDomainReason(decision.decisionRationale);
      if (translated) reasons.push(translated);
    }
    if (decision.primaryCandidate?.decisionReasons) {
      for (const reason of decision.primaryCandidate.decisionReasons) {
        const translated = translateDomainReason(reason);
        if (translated && !reasons.includes(translated)) {
          reasons.push(`✓ ${translated}`);
        }
      }
    } else if (decision.tiedPrimaryCandidates && decision.tiedPrimaryCandidates.length > 0) {
      for (const cand of decision.tiedPrimaryCandidates) {
        for (const reason of cand.decisionReasons) {
          const translated = translateDomainReason(reason);
          if (translated && !reasons.includes(translated)) {
            reasons.push(`✓ ${translated}`);
          }
        }
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(isRest ? '당일 회복 세션을 권장합니다.' : '다차원 훈련 분석 기반 권장 세션입니다.');
  }

  // 3. Representative exercises & action checklist
  const actionKey = isRest
    ? 'rest'
    : primaryCandidateId || (decision.tiedPrimaryCandidates && decision.tiedPrimaryCandidates.length > 0 ? decision.tiedPrimaryCandidates[0].candidateExerciseId : 'rest');
  const representativeExercises = [...(ACTION_TAGS_MAP[actionKey] || ACTION_TAGS_MAP.rest)];
  const actionChecklist = [...(ACTION_CHECKLIST_MAP[actionKey] || ACTION_CHECKLIST_MAP.rest)];

  // 4. Top Candidates presentation mapping
  let topCandidates: TopCandidatePresentation[] | undefined;
  const tiedIdSet = new Set(decision.tiedPrimaryCandidates?.map((c) => c.candidateExerciseId) || []);

  if (candidateSet && Array.isArray(candidateSet.candidates)) {
    topCandidates = candidateSet.candidates.map((cand) => {
      const lift = CANDIDATE_ID_TO_KOREAN_LIFT_MAP[cand.candidateExerciseId] || (cand.candidateExerciseName as MainLift);
      const isCurrent = !isRest && (
        cand.candidateExerciseId === primaryCandidateId ||
        tiedIdSet.has(cand.candidateExerciseId)
      );
      const { statusLabel, statusType } = deriveCandidateStatus(cand, isCurrent);
      const rejectionReason = translateCandidateReason(cand, isCurrent);

      return {
        lift,
        isCurrent,
        rejectionReason,
        statusLabel: isCurrent ? '최적 추천' : statusLabel,
        statusType: isCurrent ? 'preferred' : statusType,
      };
    });
  }

  // 5. Execution info (Next Projected Session Presentation Wiring)
  let nextUp: string;
  let nextTiming: string;

  if (projectedSession) {
    if (projectedSession.projectedDecisionClass === 'train') {
      if (projectedSession.tiedCandidates && projectedSession.tiedCandidates.length > 0) {
        nextUp = projectedSession.tiedCandidates
          .map((c) => CANDIDATE_ID_TO_KOREAN_LIFT_MAP[c.candidateExerciseId] || c.candidateExerciseName)
          .join(' / ');
      } else if (projectedSession.projectedCandidate) {
        const pId = projectedSession.projectedCandidate.candidateExerciseId;
        nextUp = CANDIDATE_ID_TO_KOREAN_LIFT_MAP[pId] || (projectedSession.projectedCandidate.candidateExerciseName as MainLift);
      } else {
        nextUp = '스트렝스/유산소';
      }

      if (projectedSession.projectedDate) {
        nextTiming = getFriendlyRecommendationDate(projectedSession.projectedDate);
      } else {
        nextTiming = '회복 후 세션 예정';
      }
    } else {
      // projectedDecisionClass === 'no-projected-session-within-horizon'
      nextUp = '충분한 회복 필요';
      nextTiming = `${projectedSession.searchHorizonDays}일 내 추천 없음`;
    }
  } else {
    // Default fallback if projectedSession is not provided
    if (isRest) {
      nextUp = '회복 후 상태 점검';
      nextTiming = '내일 컨디션 평가 후 세션 진행';
    } else {
      nextUp = mainLift;
      nextTiming = '오늘 세션 수행 가능';
    }
  }

  const executionInfo = {
    expectedDuration: isRest ? '휴식 및 회복' : '약 60~75분',
    workoutType: isRest ? '휴식' : '스트렝스/유산소',
    nextUp,
    nextTiming,
    lastWorkoutDate: calendarDate,
  };

  const rawOneLine = decision.decisionRationale || decision.explainability?.headline || '';
  const translatedOneLine = translateDomainReason(rawOneLine);

  return Object.freeze({
    mainLift,
    reasons: Object.freeze(reasons),
    representativeExercises: Object.freeze(representativeExercises),
    date: formattedDate,
    friendlyDate: formattedDate,
    actionChecklist: Object.freeze(actionChecklist),
    executionInfo: Object.freeze(executionInfo),
    oneLineReason: translatedOneLine,
    topCandidates: topCandidates ? Object.freeze(topCandidates) : undefined,
    vnextDecision: decision,
    nextProjectedSession: projectedSession,
  });
}

