/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Production Cutover Sanity Verification Suite (CU7.0 - Sole Production Engine)
 *
 * Validates the Production Recommendation Integration & Safety invariants:
 * Case A: No logs -> Valid VNext exploratory behavior
 * Case B: Recent Running -> Lower-body residual reflected
 * Case C: Recent Deadlift -> Horizontal pull contamination absent
 * Case D: Same-day Running + OHP -> Two discrete sessions / one unique day
 * Case E: Completed session today -> Rest boundary preserved (completed-session-boundary)
 * Case F: Actual new WorkoutLog added -> Previous decision invalidated / recalculated
 * Case G: Rest decision -> No fake Squat fallback
 * Case H: Top Candidate Presentation -> Multi-candidate viability mapped cleanly
 * Case I: CU5.1 10 Golden Scenarios Suite -> Full passing sanity
 */

import { WorkoutLog } from '../../../types';
import {
  getProductionRecommendation,
  evaluateVNextProduction,
} from './productionRecommendationService';
import { runCU51Validation } from '../audit/realReplayValidation.cu51';

export interface ProductionSanityResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export function runProductionCutoverSanitySuite(): {
  readonly allPassed: boolean;
  readonly results: readonly ProductionSanityResult[];
} {
  const results: ProductionSanityResult[] = [];

  // ----------------------------------------------------
  // Case A: No logs -> valid VNext exploratory behavior
  // ----------------------------------------------------
  try {
    const recEmpty = getProductionRecommendation([], null, {
      evaluationInstant: '2026-08-21T12:00:00+09:00',
      calendarDate: '2026-08-21',
    });
    const passedA =
      Boolean(recEmpty.mainLift) &&
      recEmpty.mainLift !== '휴식' &&
      recEmpty.vnextDecision?.kind === 'train';

    results.push({
      name: 'Case A: No logs exploratory behavior',
      passed: passedA,
      details: `MainLift=${recEmpty.mainLift}, Decision=${recEmpty.vnextDecision?.kind}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case A: No logs exploratory behavior',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case B: Recent Running -> lower-body residual reflected
  // ----------------------------------------------------
  try {
    const runningLog: WorkoutLog = {
      id: 'log-run-test-1',
      date: '2026-08-21',
      startTime: '08:00',
      notes: '',
      routineName: '야외 러닝',
      exercises: [
        {
          exerciseId: 'ex-run-1',
          exerciseName: '러닝',
          category: 'Cardio',
          sets: [{ id: 's1', reps: 0, weight: 0, isWarmup: false, distanceKm: 5.0, timeSeconds: 1800 }],
        },
      ],
    };

    const evalB = evaluateVNextProduction([runningLog], {
      evaluationInstant: '2026-08-21T15:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const traces = evalB.replayResult.dimensionBehaviorSnapshot;
    const isLowerBodyActive =
      traces.activeImmediateDimensions.includes('knee-dominant-lower-body') ||
      traces.activeImmediateDimensions.includes('hip-posterior-chain');

    results.push({
      name: 'Case B: Recent Running lower-body residual',
      passed: isLowerBodyActive,
      details: `ImmediateDimensions=[${traces.activeImmediateDimensions.join(', ')}]`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case B: Recent Running lower-body residual',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case C: Recent Deadlift -> horizontal pull contamination absent
  // ----------------------------------------------------
  try {
    const dlLog: WorkoutLog = {
      id: 'log-dl-test-1',
      date: '2026-08-20',
      startTime: '19:00',
      notes: '',
      routineName: '데드리프트 훈련',
      exercises: [
        {
          exerciseId: 'ex-dl-1',
          exerciseName: '데드리프트',
          category: 'Back',
          sets: [{ id: 's2', reps: 5, weight: 140, isWarmup: false }],
        },
      ],
    };

    const evalC = evaluateVNextProduction([dlLog], {
      evaluationInstant: '2026-08-21T10:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const tracesC = evalC.replayResult.dimensionBehaviorSnapshot;
    const isHpContaminated =
      tracesC.activeImmediateDimensions.includes('horizontal-pull') ||
      tracesC.activeResidualDimensions.includes('horizontal-pull');

    const rowCand = evalC.replayResult.candidateDecisionSet.candidates.find(
      (c) => c.candidateExerciseId === 'barbell_row'
    );
    const isRowClear = rowCand?.readinessEvidence.overallReadinessClass === 'clear';

    results.push({
      name: 'Case C: Recent Deadlift horizontal pull isolation',
      passed: !isHpContaminated && isRowClear,
      details: `HorizontalPullContaminated=${isHpContaminated}, BarbellRowReadiness=${rowCand?.readinessEvidence.overallReadinessClass}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case C: Recent Deadlift horizontal pull isolation',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case D: Same-day Running + OHP -> two sessions / one unique day
  // ----------------------------------------------------
  try {
    const runLogD: WorkoutLog = {
      id: 'log-run-same-day',
      date: '2026-08-20',
      startTime: '07:00',
      notes: '',
      routineName: '아침 조깅',
      exercises: [{ exerciseId: 'running', exerciseName: '러닝', category: 'Cardio', sets: [{ id: 's3', reps: 0, weight: 0, isWarmup: false, distanceKm: 3.0, timeSeconds: 1200 }] }],
    };
    const ohpLogD: WorkoutLog = {
      id: 'log-ohp-same-day',
      date: '2026-08-20',
      startTime: '18:00',
      notes: '',
      routineName: '저녁 OHP',
      exercises: [{ exerciseId: 'overhead_press', exerciseName: '오버헤드 프레스', category: 'Shoulders', sets: [{ id: 's4', reps: 5, weight: 50, isWarmup: false }] }],
    };

    const evalD = evaluateVNextProduction([runLogD, ohpLogD], {
      evaluationInstant: '2026-08-21T09:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const restEvD = evalD.replayResult.restDecisionEvidence;
    const passedD =
      restEvD.recentTrainingContext.recentSessionCount === 2 &&
      restEvD.recentTrainingContext.recentUniqueTrainingDays === 1;

    results.push({
      name: 'Case D: Same-day multi-session distinct preservation',
      passed: passedD,
      details: `Sessions=${restEvD.recentTrainingContext.recentSessionCount}, UniqueDays=${restEvD.recentTrainingContext.recentUniqueTrainingDays}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case D: Same-day multi-session distinct preservation',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case E: Completed session today -> Rest boundary preserved
  // ----------------------------------------------------
  try {
    const todayLog: WorkoutLog = {
      id: 'log-bench-today',
      date: '2026-08-21',
      startTime: '10:00',
      notes: '',
      routineName: '벤치프레스 세션',
      exercises: [{ exerciseId: 'bench_press', exerciseName: '벤치프레스', category: 'Chest', sets: [{ id: 's5', reps: 5, weight: 80, isWarmup: false }] }],
    };

    const recE = getProductionRecommendation([todayLog], null, {
      evaluationInstant: '2026-08-21T14:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const passedE =
      recE.mainLift === '휴식' &&
      recE.vnextDecision?.kind === 'rest' &&
      recE.vnextDecision?.restCategory === 'completed-session-boundary';

    results.push({
      name: 'Case E: Completed session today Rest boundary',
      passed: passedE,
      details: `MainLift=${recE.mainLift}, DecisionKind=${recE.vnextDecision?.kind}, RestCategory=${recE.vnextDecision?.restCategory}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case E: Completed session today Rest boundary',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case F: Actual new WorkoutLog added -> Decision recalculated
  // ----------------------------------------------------
  try {
    const priorLogs: WorkoutLog[] = [
      {
        id: 'log-hist-1',
        date: '2026-08-15',
        startTime: '10:00',
        notes: '',
        routineName: '스쿼트',
        exercises: [{ exerciseId: 'squat', exerciseName: '스쿼트', category: 'Legs', sets: [{ id: 's6', reps: 5, weight: 100, isWarmup: false }] }],
      },
    ];

    const recBefore = getProductionRecommendation(priorLogs, null, {
      evaluationInstant: '2026-08-21T09:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const newLog: WorkoutLog = {
      id: 'log-hist-2',
      date: '2026-08-21',
      startTime: '10:00',
      notes: '',
      routineName: '데드리프트',
      exercises: [{ exerciseId: 'deadlift', exerciseName: '데드리프트', category: 'Back', sets: [{ id: 's7', reps: 5, weight: 130, isWarmup: false }] }],
    };

    const recAfter = getProductionRecommendation([...priorLogs, newLog], null, {
      evaluationInstant: '2026-08-21T11:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const passedF = recBefore.mainLift !== '휴식' && recAfter.mainLift === '휴식';

    results.push({
      name: 'Case F: Real-time recalculation upon new log arrival',
      passed: passedF,
      details: `Before=${recBefore.mainLift}, After=${recAfter.mainLift}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case F: Real-time recalculation upon new log arrival',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case G: Rest decision -> No fake Squat fallback
  // ----------------------------------------------------
  try {
    const intenseLogs: WorkoutLog[] = [
      {
        id: 'log-heavy-1',
        date: '2026-08-19',
        startTime: '18:00',
        notes: '',
        routineName: '스쿼트',
        exercises: [{ exerciseId: 'squat', exerciseName: '스쿼트', category: 'Legs', sets: [{ id: 'sg1', reps: 5, weight: 120, isWarmup: false }] }],
      },
      {
        id: 'log-heavy-2',
        date: '2026-08-20',
        startTime: '18:00',
        notes: '',
        routineName: '데드리프트',
        exercises: [{ exerciseId: 'deadlift', exerciseName: '데드리프트', category: 'Back', sets: [{ id: 'sg2', reps: 5, weight: 150, isWarmup: false }] }],
      },
      {
        id: 'log-heavy-3',
        date: '2026-08-21',
        startTime: '10:00',
        notes: '',
        routineName: '벤치프레스',
        exercises: [{ exerciseId: 'bench_press', exerciseName: '벤치프레스', category: 'Chest', sets: [{ id: 'sg3', reps: 5, weight: 90, isWarmup: false }] }],
      },
    ];

    const recG = getProductionRecommendation(intenseLogs, null, {
      evaluationInstant: '2026-08-21T14:00:00+09:00',
      calendarDate: '2026-08-21',
    });

    const passedG = recG.mainLift === '휴식' && (recG.mainLift as string) !== '스쿼트';

    results.push({
      name: 'Case G: Rest decision preserves first-class Rest without fake Squat',
      passed: passedG,
      details: `MainLift=${recG.mainLift}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case G: Rest decision preserves first-class Rest without fake Squat',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case H: Top Candidate Presentation Mapping
  // ----------------------------------------------------
  try {
    const testLogsH: WorkoutLog[] = [
      {
        id: 'log-hist-h',
        date: '2026-08-10',
        startTime: '10:00',
        notes: '',
        routineName: '스쿼트',
        exercises: [{ exerciseId: 'squat', exerciseName: '스쿼트', category: 'Legs', sets: [{ id: 'sh1', reps: 5, weight: 100, isWarmup: false }] }],
      },
    ];

    const vnextRec = getProductionRecommendation(testLogsH, null);
    const passedH =
      vnextRec.topCandidates !== undefined &&
      vnextRec.topCandidates.length > 0 &&
      vnextRec.vnextDecision !== undefined;

    results.push({
      name: 'Case H: Top Candidate Presentation Mapping',
      passed: passedH,
      details: `TopCandidateCount=${vnextRec.topCandidates?.length || 0}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case H: Top Candidate Presentation Mapping',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Case I: 10 Golden Scenarios Replay Suite
  // ----------------------------------------------------
  try {
    const validationReport = runCU51Validation();
    const passedI = validationReport.goldenScenariosPassed;

    results.push({
      name: 'Case I: 10 Golden Scenarios Replay Suite',
      passed: passedI,
      details: `AllGoldenPassed=${validationReport.goldenScenariosPassed}, ModernEvaluations=${validationReport.modernReport.results.length}`,
    });
  } catch (err: any) {
    results.push({
      name: 'Case I: 10 Golden Scenarios Replay Suite',
      passed: false,
      details: `Threw error: ${err.message}`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return Object.freeze({
    allPassed,
    results: Object.freeze(results),
  });
}
