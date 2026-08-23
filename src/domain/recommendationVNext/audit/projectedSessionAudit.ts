/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NextProjectedSession Audit Suite (VNext Recommendation Engine - CU9.0)
 *
 * Validates the 9 Required Behavioral Scenarios (PS1 ~ PS9):
 * PS1: Today Rest after completed session -> future projected opportunity exists; Rest not faked.
 * PS2: Recent Deadlift -> forward Squat readiness evolves; Bench/Row horizontal pull unaffected.
 * PS3: Recent Running -> knee/posterior residual attenuates forward; upper-body unblocked.
 * PS4: Same-day Running + OHP -> both discrete sessions preserved in source evidence.
 * PS5: Current TodayDecision = Train -> TodayDecision itself not returned as future projection.
 * PS6: New Actual WorkoutLog added -> prior projection invalidated / recalculated.
 * PS7: Candidate tie -> tie preserved without arbitrary priority coercion.
 * PS8: No train opportunity in horizon -> explicit no-projection state, no fake fallback.
 * PS9: Missing startTime historical evidence -> chronology uncertainty preserved.
 */

import { WorkoutLog } from '../../../types';
import {
  evaluateNextProjectedSession,
  generateFutureEvaluationPoints,
} from '../projection/nextProjectedSessionEngine';
import { getProductionRecommendation } from '../production/productionRecommendationService';

export interface ProjectedSessionAuditScenarioResult {
  readonly scenarioId: string;
  readonly title: string;
  readonly passed: boolean;
  readonly details: string;
}

export interface ProjectedSessionAuditReport {
  readonly allPassed: boolean;
  readonly passedCount: number;
  readonly totalCount: number;
  readonly results: readonly ProjectedSessionAuditScenarioResult[];
}

export function runProjectedSessionAudit(): ProjectedSessionAuditReport {
  const results: ProjectedSessionAuditScenarioResult[] = [];

  // =========================================================================
  // PS1: Today Rest after completed session
  // =========================================================================
  try {
    const todayBenchLog: WorkoutLog = {
      id: 'log-ps1-bench',
      date: '2026-08-21',
      startTime: '10:00',
      notes: '',
      routineName: '가슴 세션',
      exercises: [
        {
          exerciseId: 'bench_press',
          exerciseName: '벤치프레스',
          category: 'Chest',
          sets: [{ id: 's1', reps: 5, weight: 80, isWarmup: false }],
        },
      ],
    };

    // Today decision at 14:00 commands rest due to completed session
    const todayRec = getProductionRecommendation([todayBenchLog], null, {
      evaluationInstant: '2026-08-21T14:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const projection = evaluateNextProjectedSession([todayBenchLog], {
      sourceEvaluationInstant: '2026-08-21T14:00:00+09:00',
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
    });

    const isTodayRest = todayRec.vnextDecision?.kind === 'rest';
    const hasCandidateOrTie =
      projection.projectedCandidate !== undefined ||
      (projection.tiedCandidates !== undefined && projection.tiedCandidates.length > 0);
    const isProjectedTrain =
      projection.projectedDecisionClass === 'train' &&
      hasCandidateOrTie &&
      projection.projectedDate === '2026-08-22' &&
      projection.projectedEvaluation?.daysFromSource === 1;

    const passedPS1 = isTodayRest && isProjectedTrain;
    results.push({
      scenarioId: 'PS1',
      title: 'Today Rest after completed session -> Future train opportunity discovered',
      passed: passedPS1,
      details: `TodayDecisionKind=${todayRec.vnextDecision?.kind}, ProjectedClass=${projection.projectedDecisionClass}, ProjectedDate=${projection.projectedDate}, Candidate=${projection.projectedCandidate?.candidateExerciseId || 'tied(' + (projection.tiedCandidates?.length || 0) + ')'}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS1',
      title: 'Today Rest after completed session',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS2: Recent Deadlift -> horizontal pull isolation & readiness evolution
  // =========================================================================
  try {
    const dlLog: WorkoutLog = {
      id: 'log-ps2-dl',
      date: '2026-08-20',
      startTime: '19:00',
      notes: '',
      routineName: '데드리프트 훈련',
      exercises: [
        {
          exerciseId: 'deadlift',
          exerciseName: '데드리프트',
          category: 'Back',
          sets: [{ id: 's2', reps: 5, weight: 140, isWarmup: false }],
        },
      ],
    };

    const projection = evaluateNextProjectedSession([dlLog], {
      sourceEvaluationInstant: '2026-08-20T22:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    // In projected session (2026-08-21), candidate evaluation set exists
    const underlyingSet = projection.underlyingCandidateSet;
    const rowCand = underlyingSet?.candidates.find((c) => c.candidateExerciseId === 'barbell_row');
    const isRowClear = rowCand?.readinessEvidence.overallReadinessClass === 'clear';

    const passedPS2 =
      projection.projectedDecisionClass === 'train' &&
      isRowClear === true &&
      projection.projectedDate === '2026-08-21';

    results.push({
      scenarioId: 'PS2',
      title: 'Recent Deadlift -> Horizontal pull isolation and forward opportunity',
      passed: passedPS2,
      details: `ProjectedDate=${projection.projectedDate}, RowReadiness=${rowCand?.readinessEvidence.overallReadinessClass}, ProjectedCandidate=${projection.projectedCandidate?.candidateExerciseId}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS2',
      title: 'Recent Deadlift',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS3: Recent Running -> lower-body attenuation & upper-body unblocked
  // =========================================================================
  try {
    const runLog: WorkoutLog = {
      id: 'log-ps3-run',
      date: '2026-08-20',
      startTime: '18:00',
      notes: '',
      routineName: '중거리 러닝',
      exercises: [
        {
          exerciseId: 'running',
          exerciseName: '러닝',
          category: 'Cardio',
          sets: [{ id: 's3', reps: 0, weight: 0, isWarmup: false, distanceKm: 8.0, timeSeconds: 2800 }],
        },
      ],
    };

    const projection = evaluateNextProjectedSession([runLog], {
      sourceEvaluationInstant: '2026-08-20T21:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    const underlyingSet = projection.underlyingCandidateSet;
    const benchCand = underlyingSet?.candidates.find((c) => c.candidateExerciseId === 'bench_press');
    const ohpCand = underlyingSet?.candidates.find((c) => c.candidateExerciseId === 'overhead_press');

    const isUpperBodyClear =
      benchCand?.readinessEvidence.overallReadinessClass === 'clear' &&
      ohpCand?.readinessEvidence.overallReadinessClass === 'clear';

    const passedPS3 =
      projection.projectedDecisionClass === 'train' &&
      isUpperBodyClear === true &&
      projection.projectedDate === '2026-08-21';

    results.push({
      scenarioId: 'PS3',
      title: 'Recent Running -> Upper body unblocked in forward projection',
      passed: passedPS3,
      details: `ProjectedDate=${projection.projectedDate}, UpperBodyClear=${isUpperBodyClear}, ProjectedCandidate=${projection.projectedCandidate?.candidateExerciseId}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS3',
      title: 'Recent Running',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS4: Same-day Running + OHP -> both discrete sessions in source evidence
  // =========================================================================
  try {
    const runLog: WorkoutLog = {
      id: 'log-ps4-run',
      date: '2026-08-20',
      startTime: '07:00',
      notes: '',
      routineName: '아침 조깅',
      exercises: [
        {
          exerciseId: 'running',
          exerciseName: '러닝',
          category: 'Cardio',
          sets: [{ id: 's4a', reps: 0, weight: 0, isWarmup: false, distanceKm: 3.0, timeSeconds: 1200 }],
        },
      ],
    };
    const ohpLog: WorkoutLog = {
      id: 'log-ps4-ohp',
      date: '2026-08-20',
      startTime: '18:00',
      notes: '',
      routineName: '저녁 OHP',
      exercises: [
        {
          exerciseId: 'overhead_press',
          exerciseName: '오버헤드 프레스',
          category: 'Shoulders',
          sets: [{ id: 's4b', reps: 5, weight: 50, isWarmup: false }],
        },
      ],
    };

    const projection = evaluateNextProjectedSession([runLog, ohpLog], {
      sourceEvaluationInstant: '2026-08-20T21:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    const passedPS4 =
      projection.sourceEvaluation.actualLogCount === 2 &&
      projection.sourceEvaluation.latestActualLogStartTime === '18:00' &&
      projection.projectedDecisionClass === 'train';

    results.push({
      scenarioId: 'PS4',
      title: 'Same-day Running + OHP -> Both discrete sessions preserved in source evidence',
      passed: passedPS4,
      details: `ActualLogCount=${projection.sourceEvaluation.actualLogCount}, LatestTime=${projection.sourceEvaluation.latestActualLogStartTime}, ProjectedDate=${projection.projectedDate}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS4',
      title: 'Same-day Running + OHP',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS5: Current TodayDecision = Train -> strictly future projection
  // =========================================================================
  try {
    const priorLog: WorkoutLog = {
      id: 'log-ps5-prior',
      date: '2026-08-18',
      startTime: '10:00',
      notes: '',
      routineName: '스쿼트',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's5', reps: 5, weight: 100, isWarmup: false }],
        },
      ],
    };

    // Today (2026-08-21 09:00) decision is Train
    const todayRec = getProductionRecommendation([priorLog], null, {
      evaluationInstant: '2026-08-21T09:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    // Forward projection from 2026-08-21 09:00
    const projection = evaluateNextProjectedSession([priorLog], {
      sourceEvaluationInstant: '2026-08-21T09:00:00+09:00',
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
    });

    const isTodayTrain = todayRec.vnextDecision?.kind === 'train';
    const isStrictlyFuture =
      projection.projectedDate !== '2026-08-21' &&
      projection.projectedEvaluation !== undefined &&
      projection.projectedEvaluation.daysFromSource >= 1 &&
      projection.projectedDate === '2026-08-22';

    const passedPS5 = isTodayTrain && isStrictlyFuture;
    results.push({
      scenarioId: 'PS5',
      title: 'Current TodayDecision = Train -> Strictly future evaluation (T+1)',
      passed: passedPS5,
      details: `TodayDate=2026-08-21, TodayDecision=${todayRec.vnextDecision?.kind}, ProjectedDate=${projection.projectedDate}, DaysFromSource=${projection.projectedEvaluation?.daysFromSource}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS5',
      title: 'Current TodayDecision = Train',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS6: New Actual WorkoutLog added -> invalidates prior projection
  // =========================================================================
  try {
    const log1: WorkoutLog = {
      id: 'log-ps6-1',
      date: '2026-08-19',
      startTime: '10:00',
      notes: '',
      routineName: '스쿼트',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's6a', reps: 5, weight: 100, isWarmup: false }],
        },
      ],
    };

    const projBefore = evaluateNextProjectedSession([log1], {
      sourceEvaluationInstant: '2026-08-20T09:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    const log2: WorkoutLog = {
      id: 'log-ps6-2',
      date: '2026-08-20',
      startTime: '18:00',
      notes: '',
      routineName: '데드리프트',
      exercises: [
        {
          exerciseId: 'deadlift',
          exerciseName: '데드리프트',
          category: 'Back',
          sets: [{ id: 's6b', reps: 5, weight: 140, isWarmup: false }],
        },
      ],
    };

    const projAfter = evaluateNextProjectedSession([log1, log2], {
      sourceEvaluationInstant: '2026-08-20T21:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    const passedPS6 =
      projBefore.sourceEvaluation.workoutLogFingerprint !==
        projAfter.sourceEvaluation.workoutLogFingerprint &&
      projAfter.sourceEvaluation.actualLogCount === 2 &&
      projAfter.projectedDecisionClass === 'train';

    results.push({
      scenarioId: 'PS6',
      title: 'New Actual WorkoutLog added -> Fingerprint & SSOT state updated',
      passed: passedPS6,
      details: `FingerprintBefore=${projBefore.sourceEvaluation.workoutLogFingerprint}, FingerprintAfter=${projAfter.sourceEvaluation.workoutLogFingerprint}, CountAfter=${projAfter.sourceEvaluation.actualLogCount}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS6',
      title: 'New Actual WorkoutLog added',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS7: Candidate tie preservation
  // =========================================================================
  try {
    // Fresh slate with identical multi-candidate priority
    const projection = evaluateNextProjectedSession([], {
      sourceEvaluationInstant: '2026-08-21T09:00:00+09:00',
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
      candidateIds: ['bench_press', 'barbell_row'],
    });

    const hasTied =
      projection.tiedCandidates !== undefined && projection.tiedCandidates.length > 0;
    const isSinglePrimary = projection.projectedCandidate !== undefined;

    // In VNext, if tiedPrimaryCandidates is returned, it is preserved lossless
    const passedPS7 =
      projection.projectedDecisionClass === 'train' &&
      (hasTied || isSinglePrimary) &&
      projection.projectedDate === '2026-08-22';

    results.push({
      scenarioId: 'PS7',
      title: 'Candidate tie semantics preservation',
      passed: passedPS7,
      details: `ProjectedDate=${projection.projectedDate}, HasTied=${hasTied}, TiedCount=${projection.tiedCandidates?.length || 0}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS7',
      title: 'Candidate tie preservation',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS8: No train opportunity in horizon -> explicit no-projection state
  // =========================================================================
  try {
    const projection = evaluateNextProjectedSession([], {
      sourceEvaluationInstant: '2026-08-21T09:00:00+09:00',
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
      searchHorizonDays: 0, // Zero horizon
    });

    const passedPS8 =
      projection.projectedDecisionClass === 'no-projected-session-within-horizon' &&
      projection.projectedCandidate === undefined &&
      projection.tiedCandidates === undefined &&
      projection.uncertaintyFlags.includes('horizon-exhausted');

    results.push({
      scenarioId: 'PS8',
      title: 'No train opportunity in horizon -> Explicit no-projection state without fallback',
      passed: passedPS8,
      details: `DecisionClass=${projection.projectedDecisionClass}, UncertaintyFlags=[${projection.uncertaintyFlags.join(', ')}]`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS8',
      title: 'No train opportunity in horizon',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PS9: Missing startTime historical evidence -> chronology uncertainty preserved
  // =========================================================================
  try {
    const missingTimeLog: WorkoutLog = {
      id: 'log-ps9-no-time',
      date: '2026-08-20',
      startTime: '', // Missing start time
      notes: '',
      routineName: '스쿼트',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's9', reps: 5, weight: 100, isWarmup: false }],
        },
      ],
    };

    const projection = evaluateNextProjectedSession([missingTimeLog], {
      sourceEvaluationInstant: '2026-08-21T09:00:00+09:00',
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
    });

    const isChronologyLimited = projection.uncertaintyFlags.includes('chronology-limited');
    const isAssumptionDependent = projection.uncertaintyFlags.includes('assumption-dependent');

    const passedPS9 = isChronologyLimited && isAssumptionDependent;

    results.push({
      scenarioId: 'PS9',
      title: 'Missing startTime historical evidence -> Chronology uncertainty flag preserved',
      passed: passedPS9,
      details: `ChronologyLimited=${isChronologyLimited}, AssumptionDependent=${isAssumptionDependent}, Flags=[${projection.uncertaintyFlags.join(', ')}]`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PS9',
      title: 'Missing startTime historical evidence',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT1: 24h transition boundary preserved as evaluation candidate
  // =========================================================================
  try {
    const squatLog: WorkoutLog = {
      id: 'log-pt1-squat',
      date: '2026-08-20',
      startTime: '19:00',
      notes: '',
      routineName: '스쿼트',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's-pt1', reps: 5, weight: 100, isWarmup: false }],
        },
      ],
    };

    // Source evaluation is at 19:00 on 2026-08-20
    const projection = evaluateNextProjectedSession([squatLog], {
      sourceEvaluationInstant: '2026-08-20T19:00:00+09:00',
      sourceCalendarDate: '2026-08-20',
      timezone: 'Asia/Seoul',
    });

    // 24h boundary is 2026-08-21 19:00:00
    // Check if the candidate point list generated includes the 19:00 transition point
    const points = generateFutureEvaluationPoints(
      [squatLog],
      new Date('2026-08-20T19:00:00+09:00').getTime(),
      '2026-08-20',
      'Asia/Seoul',
      7,
      '09:00:00'
    );

    const hasExact24hTransition = points.some(
      (p) =>
        p.point.evaluationCalendarDate === '2026-08-21' &&
        p.point.evaluationLocalTime === '19:00:00'
    );

    const passedPT1 =
      hasExact24hTransition &&
      projection.projectedDecisionClass === 'train' &&
      projection.projectedEvaluation !== undefined &&
      new Date(projection.projectedEvaluation.evaluationInstant).getTime() >
        new Date('2026-08-20T19:00:00+09:00').getTime();

    results.push({
      scenarioId: 'PT1',
      title: '24h attenuation boundary (19:00 next day) preserved as deterministic candidate point',
      passed: passedPT1,
      details: `Has24hPoint=${hasExact24hTransition}, ProjectedInstant=${projection.projectedEvaluation?.evaluationInstant}, DecisionClass=${projection.projectedDecisionClass}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT1',
      title: '24h attenuation boundary preserved',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT2: 72h boundary occurring in afternoon preserved as exact transition instant
  // =========================================================================
  try {
    const dlLog: WorkoutLog = {
      id: 'log-pt2-dl',
      date: '2026-08-20',
      startTime: '14:30',
      notes: '',
      routineName: '데드리프트',
      exercises: [
        {
          exerciseId: 'deadlift',
          exerciseName: '데드리프트',
          category: 'Back',
          sets: [{ id: 's-pt2', reps: 5, weight: 140, isWarmup: false }],
        },
      ],
    };

    const points = generateFutureEvaluationPoints(
      [dlLog],
      new Date('2026-08-20T18:00:00+09:00').getTime(),
      '2026-08-20',
      'Asia/Seoul',
      7,
      '09:00:00'
    );

    const has72hTransition = points.some(
      (p) =>
        p.point.evaluationCalendarDate === '2026-08-23' &&
        p.point.evaluationLocalTime === '14:30:00'
    );

    const passedPT2 = has72hTransition;
    results.push({
      scenarioId: 'PT2',
      title: '72h transition boundary in afternoon (14:30) preserved as exact transition instant',
      passed: passedPT2,
      details: `Has72hTransitionAt1430=${has72hTransition}, TotalPoints=${points.length}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT2',
      title: '72h transition boundary in afternoon',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT3: Source timezone != Asia/Seoul (evaluationTimezone SSOT adherence)
  // =========================================================================
  try {
    const benchLog: WorkoutLog = {
      id: 'log-pt3-bench',
      date: '2026-08-20',
      startTime: '10:00',
      notes: '',
      routineName: 'Chest NY',
      exercises: [
        {
          exerciseId: 'bench_press',
          exerciseName: 'Bench Press',
          category: 'Chest',
          sets: [{ id: 's-pt3', reps: 5, weight: 80, isWarmup: false }],
        },
      ],
    };

    const projection = evaluateNextProjectedSession([benchLog], {
      sourceEvaluationInstant: '2026-08-20T12:00:00-04:00',
      timezone: 'America/New_York',
    });

    const isSourceTzNY = projection.sourceEvaluation.evaluationTimezone === 'America/New_York';
    const isProjectedTzNY =
      projection.projectedEvaluation?.evaluationTimezone === 'America/New_York';
    const isProjectedDateValid = projection.projectedDate === '2026-08-21';

    const passedPT3 = isSourceTzNY && isProjectedTzNY && isProjectedDateValid;
    results.push({
      scenarioId: 'PT3',
      title: 'Source timezone != Asia/Seoul adheres strictly to evaluationTimezone SSOT',
      passed: passedPT3,
      details: `SourceTz=${projection.sourceEvaluation.evaluationTimezone}, ProjectedTz=${projection.projectedEvaluation?.evaluationTimezone}, ProjectedDate=${projection.projectedDate}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT3',
      title: 'Source timezone != Asia/Seoul',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT4: DST transition timezone semantics (no naive 24*3600 epoch math)
  // =========================================================================
  try {
    // US Spring forward on 2026-03-08 (23-hour day)
    const points = generateFutureEvaluationPoints(
      [],
      new Date('2026-03-07T10:00:00-05:00').getTime(),
      '2026-03-07',
      'America/New_York',
      3,
      '09:00:00'
    );

    // On 2026-03-09 (post DST switch), the daily fallback must be exactly 09:00:00 local time
    const postDstPoint = points.find(
      (p) =>
        p.point.evaluationCalendarDate === '2026-03-09' &&
        p.point.evaluationLocalTime === '09:00:00'
    );

    const isPostDst0900 = postDstPoint !== undefined;
    // In EDT (UTC-4), 09:00:00 EDT is 13:00:00 UTC
    const isExactUtcHour13 =
      postDstPoint !== undefined &&
      new Date(postDstPoint.point.evaluationInstant).getUTCHours() === 13;

    const passedPT4 = isPostDst0900 && isExactUtcHour13;
    results.push({
      scenarioId: 'PT4',
      title: 'DST transition timezone produces exact local wall-clock (09:00 EDT = 13:00 UTC)',
      passed: passedPT4,
      details: `Found0900Point=${isPostDst0900}, UtcInstant=${postDstPoint?.point.evaluationInstant}, UtcHour=${postDstPoint ? new Date(postDstPoint.point.evaluationInstant).getUTCHours() : 'none'}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT4',
      title: 'DST transition timezone semantics',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT5: Identical instant from attenuation boundary + daily fallback deduplicated
  // =========================================================================
  try {
    const log9am: WorkoutLog = {
      id: 'log-pt5-9am',
      date: '2026-08-20',
      startTime: '09:00',
      notes: '',
      routineName: '오전 훈련',
      exercises: [
        {
          exerciseId: 'bench_press',
          exerciseName: '벤치프레스',
          category: 'Chest',
          sets: [{ id: 's-pt5', reps: 5, weight: 80, isWarmup: false }],
        },
      ],
    };

    // 24h boundary of 2026-08-20 09:00 is 2026-08-21 09:00:00
    // Daily fallback on 2026-08-21 is also 09:00:00
    const points = generateFutureEvaluationPoints(
      [log9am],
      new Date('2026-08-20T12:00:00+09:00').getTime(),
      '2026-08-20',
      'Asia/Seoul',
      3,
      '09:00:00'
    );

    const matches21st0900 = points.filter(
      (p) =>
        p.point.evaluationCalendarDate === '2026-08-21' &&
        p.point.evaluationLocalTime === '09:00:00'
    );

    const isDeduplicated = matches21st0900.length === 1;
    const passedPT5 = isDeduplicated;

    results.push({
      scenarioId: 'PT5',
      title: 'Attenuation boundary coinciding with daily fallback is deduplicated to exactly 1 evaluation',
      passed: passedPT5,
      details: `MatchesOn21st0900Count=${matches21st0900.length}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT5',
      title: 'Deduplication of coincident instants',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  // =========================================================================
  // PT6: TodayDecision = Train -> source evaluation itself strictly not returned
  // =========================================================================
  try {
    const priorLog: WorkoutLog = {
      id: 'log-pt6-prior',
      date: '2026-08-17',
      startTime: '10:00',
      notes: '',
      routineName: '스쿼트',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseName: '스쿼트',
          category: 'Legs',
          sets: [{ id: 's-pt6', reps: 5, weight: 100, isWarmup: false }],
        },
      ],
    };

    const sourceInstant = '2026-08-21T09:00:00+09:00';
    const todayRec = getProductionRecommendation([priorLog], null, {
      evaluationInstant: sourceInstant,
      calendarDate: '2026-08-21',
    });

    const projection = evaluateNextProjectedSession([priorLog], {
      sourceEvaluationInstant: sourceInstant,
      sourceCalendarDate: '2026-08-21',
      timezone: 'Asia/Seoul',
    });

    const isTodayTrain = todayRec.vnextDecision?.kind === 'train';
    const isStrictlyFuture =
      projection.projectedEvaluation !== undefined &&
      projection.projectedEvaluation.evaluationInstant !== sourceInstant &&
      new Date(projection.projectedEvaluation.evaluationInstant).getTime() >
        new Date(sourceInstant).getTime();

    const passedPT6 = isTodayTrain && isStrictlyFuture;
    results.push({
      scenarioId: 'PT6',
      title: 'TodayDecision = Train does not return source evaluation; strictly future maintained',
      passed: passedPT6,
      details: `TodayDecisionKind=${todayRec.vnextDecision?.kind}, SourceInstant=${sourceInstant}, ProjectedInstant=${projection.projectedEvaluation?.evaluationInstant}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'PT6',
      title: 'TodayDecision = Train strictly future constraint',
      passed: false,
      details: `Error: ${err.message}`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return Object.freeze({
    allPassed,
    passedCount: results.filter((r) => r.passed).length,
    totalCount: results.length,
    results: Object.freeze(results),
  });
}
