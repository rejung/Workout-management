/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Production Wiring Integration Tests for Muscle Display Evidence
 *
 * Verifies:
 * 1. Real evaluateVNextProduction with a Bench Press + Treadmill mixed WorkoutLog
 *    attaches both pectoralis-major and calves evidence with 1 distinct source log.
 * 2. Same-day missing-time and future records share the exact evaluation instant & timezone
 *    used by the recommendation evaluation.
 * 3. Attaching muscleDisplayEvidence introduces ZERO drift in mainLift, candidate order,
 *    rest decision, or existing 7-dimension bodyLoad.
 * 4. Empty valid logs retain the valid '판단 정보 부족' MuscleDisplayEvidenceResult.
 * 5. Unexpected display transformation errors omit only muscleDisplayEvidence while returning
 *    the intact existing recommendation result.
 * 6. Display evidence is derived exactly once for today's final presentation (never repeated
 *    during replay, per-candidate evaluation, or forward session projection).
 */

import { DEFAULT_EXERCISES } from '../../../constants';
import { WorkoutLog } from '../../../types';
import {
  evaluateVNextProduction,
  getProductionRecommendation,
} from './productionRecommendationService';
import { evaluateSingleHistoricalPoint } from '../replay/historicalReplayEngine';
import { getNextProjectedSession } from './projectedSessionService';
import { mapBodyLoadFromReplayResult } from './bodyLoadPresentationMapper';
import { mapVNextToPresentationModel } from './vnextPresentationMapper';
import { HistoricalEvaluationPoint } from '../types/historicalReplay.types';
import { deriveMuscleDisplayEvidence } from '../musculoskeletal/muscleDisplayEvidence';

interface IntegrationTestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export function runMuscleDisplayProductionWiringTestSuite(): {
  readonly allPassed: boolean;
  readonly results: readonly IntegrationTestResult[];
} {
  const results: IntegrationTestResult[] = [];
  function assert(name: string, condition: boolean, details: string) {
    results.push({ name, passed: condition, details });
  }

  const defBench = DEFAULT_EXERCISES.find((e) => e.id === 'bench-press')!;
  const defTreadmill = DEFAULT_EXERCISES.find((e) => e.id === 'treadmill')!;
  const defDeadlift = DEFAULT_EXERCISES.find((e) => e.id === 'deadlift')!;
  const defSquat = DEFAULT_EXERCISES.find((e) => e.id === 'squat')!;

  const evalOptions = Object.freeze({
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    calendarDate: '2026-08-20',
    timezone: 'Asia/Seoul',
  });

  // =========================================================================
  // W01: Mixed Bench Press + Treadmill log through real evaluateVNextProduction
  // =========================================================================
  {
    const mixedLog: WorkoutLog = {
      id: 'log-prod-mixed-bench-treadmill',
      date: '2026-08-19',
      startTime: '18:00', // 18h ago -> immediate
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

    const prod = evaluateVNextProduction([mixedLog], evalOptions);
    const viaGetter = getProductionRecommendation([mixedLog], null, evalOptions);
    const muscle = prod.presentation.muscleDisplayEvidence;

    const pec = muscle?.regionMap['pectoralis-major'];
    const calves = muscle?.regionMap.calves;

    const ok =
      muscle !== undefined &&
      viaGetter.muscleDisplayEvidence !== undefined &&
      JSON.stringify(muscle) === JSON.stringify(viaGetter.muscleDisplayEvidence) &&
      pec?.status === '최근 부하' &&
      pec.evidence.length === 1 &&
      pec.evidence[0].sourceLogId === 'log-prod-mixed-bench-treadmill' &&
      pec.evidence[0].sourceExerciseId === 'bench-press' &&
      pec.evidence[0].role === 'primary-target' &&
      calves?.status === '최근 부하' &&
      calves.evidence.length === 1 &&
      calves.evidence[0].sourceLogId === 'log-prod-mixed-bench-treadmill' &&
      calves.evidence[0].sourceExerciseId === 'treadmill' &&
      calves.evidence[0].canonicalExerciseId === 'running' &&
      calves.evidence[0].role === 'primary-target' &&
      muscle.provenanceSummary.interpretableExerciseCount === 2 &&
      muscle.provenanceSummary.distinctInterpretableLogCount === 1;

    assert(
      'W01: evaluateVNextProduction with Bench + Treadmill mixed log exposes both pec and calves evidence with 1 distinct source log',
      ok,
      `pec=${pec?.status}(${pec?.evidence[0]?.sourceExerciseId}), calves=${calves?.status}(${calves?.evidence[0]?.sourceExerciseId}), interpretable=${muscle?.provenanceSummary.interpretableExerciseCount}, logs=${muscle?.provenanceSummary.distinctInterpretableLogCount}`
    );
  }

  // =========================================================================
  // W02: Same-day missing-time & future records follow the exact evaluation instant/timezone
  // =========================================================================
  {
    const logs: WorkoutLog[] = [
      {
        id: 'log-past-dl',
        date: '2026-08-19',
        startTime: '18:00', // 18h ago -> immediate
        routineName: '데드리프트',
        notes: '',
        exercises: [
          {
            exerciseId: defDeadlift.id,
            exerciseName: defDeadlift.name,
            category: defDeadlift.category,
            sets: [{ id: 'd1', weight: 140, reps: 5, isWarmup: false }],
          },
        ],
      },
      {
        id: 'log-today-notime-squat',
        date: '2026-08-20', // same day, missing startTime -> uncertain
        routineName: '스쿼트',
        notes: '',
        exercises: [
          {
            exerciseId: defSquat.id,
            exerciseName: defSquat.name,
            category: defSquat.category,
            sets: [{ id: 'sq1', weight: 100, reps: 5, isWarmup: false }],
          },
        ],
      },
      {
        id: 'log-future-bench',
        date: '2026-08-20',
        startTime: '18:00', // 6h after 12:00 eval -> future excluded
        routineName: '저녁 벤치프레스',
        notes: '',
        exercises: [
          {
            exerciseId: defBench.id,
            exerciseName: defBench.name,
            category: defBench.category,
            sets: [{ id: 'b1', weight: 80, reps: 5, isWarmup: false }],
          },
        ],
      },
    ];

    const prod = evaluateVNextProduction(logs, evalOptions);
    const muscle = prod.presentation.muscleDisplayEvidence;

    const evalAligned =
      muscle !== undefined &&
      muscle.evaluationContext.evaluationInstant === evalOptions.evaluationInstant &&
      muscle.evaluationContext.evaluationTimezone === evalOptions.timezone &&
      muscle.evaluationContext.evaluationCalendarDate === evalOptions.calendarDate;

    const temporalAligned =
      muscle !== undefined &&
      muscle.excludedFutureExercises.length === 1 &&
      muscle.excludedFutureExercises[0].sourceLogId === 'log-future-bench' &&
      muscle.regionMap['pectoralis-major'].evidence.length === 0 &&
      muscle.regionMap['pectoralis-major'].status === '판단 정보 부족' &&
      muscle.regionMap.quadriceps.uncertainEvidence.length === 1 &&
      muscle.regionMap.quadriceps.uncertainEvidence[0].sourceLogId === 'log-today-notime-squat' &&
      muscle.regionMap['erector-spinae'].immediateEvidence.some(
        (e) => e.sourceLogId === 'log-past-dl'
      ) &&
      muscle.provenanceSummary.sameDayUncertainExerciseCount === 1 &&
      // Confirm existing replay excluded the exact same future record and same-day uncertain session
      prod.replayResult.evaluationContext.evaluationInstant ===
        muscle.evaluationContext.evaluationInstant &&
      prod.replayResult.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount === 1 &&
      prod.replayResult.availableHistoricalEvidenceCount.uncertainSameDaySessionCount === 1;

    assert(
      'W02: Same-day missing-time and future records share the exact evaluation instant & timezone with recommendation evaluation',
      evalAligned && temporalAligned,
      `evalInstant=${muscle?.evaluationContext.evaluationInstant}, futureExcluded=${muscle?.excludedFutureExercises.length}, replayFutureExcluded=${prod.replayResult.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount}, sameDayUncertain=${muscle?.provenanceSummary.sameDayUncertainExerciseCount}`
    );
  }

  // =========================================================================
  // W03: Zero behavioral drift in recommendation, candidate order, rest decision, and 7-dim bodyLoad
  // =========================================================================
  {
    const scenarios: Array<{ label: string; logs: WorkoutLog[] }> = [
      {
        label: 'mixed-train',
        logs: [
          {
            id: 'log-drift-mixed',
            date: '2026-08-19',
            startTime: '18:00',
            routineName: '가슴+런닝',
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
                sets: [{ id: 's2', weight: 0, reps: 0, distanceKm: 4, timeSeconds: 1200 }],
              },
            ],
          },
        ],
      },
      {
        label: 'today-completed-rest',
        logs: [
          {
            id: 'log-drift-rest',
            date: '2026-08-20',
            startTime: '09:00',
            routineName: '데드리프트',
            notes: '',
            exercises: [
              {
                exerciseId: defDeadlift.id,
                exerciseName: defDeadlift.name,
                category: defDeadlift.category,
                sets: [{ id: 's3', weight: 140, reps: 5, isWarmup: false }],
              },
            ],
          },
        ],
      },
    ];

    let allIdentical = true;
    const summaryParts: string[] = [];

    for (const sc of scenarios) {
      const prod = evaluateVNextProduction(sc.logs, evalOptions);

      // Independent baseline computation without muscleDisplayEvidence
      const baselinePoint: HistoricalEvaluationPoint = Object.freeze({
        pointId: `prod-eval-${evalOptions.evaluationInstant}`,
        kind: 'pre-session',
        evaluationInstant: evalOptions.evaluationInstant,
        evaluationCalendarDate: evalOptions.calendarDate,
        evaluationLocalTime: '12:00:00',
        evaluationTimezone: evalOptions.timezone,
        hasChronologyUncertainty: false,
      });
      const baselineReplay = evaluateSingleHistoricalPoint(sc.logs, baselinePoint);
      const baselineProjected = getNextProjectedSession(sc.logs, {
        sourceEvaluationInstant: evalOptions.evaluationInstant,
        sourceCalendarDate: evalOptions.calendarDate,
        timezone: evalOptions.timezone,
      });
      const baselineBodyLoad = mapBodyLoadFromReplayResult(baselineReplay);
      const baselinePresentation = mapVNextToPresentationModel(
        baselineReplay.todayDecision,
        baselineReplay.candidateDecisionSet,
        baselineReplay.restDecisionEvidence,
        {
          calendarDate: evalOptions.calendarDate,
          nextProjectedSession: baselineProjected,
          bodyLoad: baselineBodyLoad,
        }
      );

      const identical =
        prod.presentation.mainLift === baselinePresentation.mainLift &&
        JSON.stringify(prod.decision) === JSON.stringify(baselineReplay.todayDecision) &&
        JSON.stringify(prod.presentation.topCandidates) ===
          JSON.stringify(baselinePresentation.topCandidates) &&
        JSON.stringify(prod.presentation.bodyLoad) ===
          JSON.stringify(baselinePresentation.bodyLoad) &&
        JSON.stringify(prod.presentation.reasons) === JSON.stringify(baselinePresentation.reasons) &&
        JSON.stringify(prod.presentation.executionInfo) ===
          JSON.stringify(baselinePresentation.executionInfo) &&
        prod.presentation.bodyLoad?.dimensions.length === 7 &&
        prod.presentation.muscleDisplayEvidence !== undefined;

      if (!identical) {
        allIdentical = false;
      }
      summaryParts.push(`${sc.label}:${prod.presentation.mainLift}(eq=${identical})`);
    }

    assert(
      'W03: Wiring muscleDisplayEvidence preserves identical mainLift, candidate order, rest decision, and 7-dimension bodyLoad',
      allIdentical,
      summaryParts.join(', ')
    );
  }

  // =========================================================================
  // W04: Valid empty logs return the standard '판단 정보 부족' MuscleDisplayEvidenceResult
  // =========================================================================
  {
    const prodEmpty = evaluateVNextProduction([], evalOptions);
    const muscleEmpty = prodEmpty.presentation.muscleDisplayEvidence;

    const ok =
      muscleEmpty !== undefined &&
      muscleEmpty.regions.length === 13 &&
      muscleEmpty.displayGroups.length === 11 &&
      muscleEmpty.regions.every((r) => r.status === '판단 정보 부족' && r.isInsufficient) &&
      muscleEmpty.provenanceSummary.totalInputExerciseCount === 0 &&
      prodEmpty.presentation.bodyLoad?.dimensions.length === 7;

    assert(
      'W04: Valid empty logs preserve full 판단 정보 부족 MuscleDisplayEvidenceResult (not omitted)',
      ok,
      `defined=${muscleEmpty !== undefined}, regions=${muscleEmpty?.regions.length}, allInsufficient=${muscleEmpty?.regions.every((r) => r.status === '판단 정보 부족')}`
    );
  }

  // =========================================================================
  // W05 & W06: Fail-safe omission on unexpected error + single invocation count
  // =========================================================================
  {
    const sampleLogs: WorkoutLog[] = [
      {
        id: 'log-failsafe-bench',
        date: '2026-08-19',
        startTime: '18:00',
        routineName: '벤치프레스',
        notes: '',
        exercises: [
          {
            exerciseId: defBench.id,
            exerciseName: defBench.name,
            category: defBench.category,
            sets: [{ id: 'fs1', weight: 80, reps: 5, isWarmup: false }],
          },
        ],
      },
    ];

    let invokeCount = 0;
    const spyDeriver: typeof deriveMuscleDisplayEvidence = (sourceExercises, ctx) => {
      invokeCount += 1;
      return deriveMuscleDisplayEvidence(sourceExercises, ctx);
    };

    const normalProd = evaluateVNextProduction(sampleLogs, {
      ...evalOptions,
      muscleDisplayEvidenceDeriver: spyDeriver,
    });

    const failingProd = evaluateVNextProduction(sampleLogs, {
      ...evalOptions,
      muscleDisplayEvidenceDeriver: () => {
        throw new Error('Simulated unexpected muscle display failure');
      },
    });

    const failSafeOk =
      failingProd.presentation.muscleDisplayEvidence === undefined &&
      failingProd.presentation.mainLift === normalProd.presentation.mainLift &&
      JSON.stringify(failingProd.decision) === JSON.stringify(normalProd.decision) &&
      JSON.stringify(failingProd.presentation.topCandidates) ===
        JSON.stringify(normalProd.presentation.topCandidates) &&
      JSON.stringify(failingProd.presentation.bodyLoad) ===
        JSON.stringify(normalProd.presentation.bodyLoad) &&
      JSON.stringify(failingProd.projectedSession) ===
        JSON.stringify(normalProd.projectedSession);

    const singleInvokeOk = invokeCount === 1 && normalProd.presentation.muscleDisplayEvidence !== undefined;

    assert(
      'W05: Unexpected display transform failure omits only muscleDisplayEvidence while returning intact recommendation',
      failSafeOk,
      `mainLift=${failingProd.presentation.mainLift}, muscleOmitted=${failingProd.presentation.muscleDisplayEvidence === undefined}, bodyLoadDims=${failingProd.presentation.bodyLoad?.dimensions.length}`
    );

    assert(
      'W06: Muscle display evidence is derived exactly once for today final presentation (not during replay or projection)',
      singleInvokeOk,
      `invokeCount=${invokeCount}`
    );
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Standalone execution support
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1]?.includes('muscleDisplayProductionWiring.test')
) {
  console.log('===========================================================');
  console.log('RUNNING MUSCLE DISPLAY PRODUCTION WIRING INTEGRATION TESTS');
  console.log('===========================================================');
  const { allPassed, results } = runMuscleDisplayProductionWiringTestSuite();
  for (const r of results) {
    console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.details}`);
  }
  console.log(
    `\nAll Muscle Display Production Wiring Tests Passed: ${allPassed} (${results.filter((r) => r.passed).length}/${results.length})`
  );
  if (!allPassed) {
    process.exit(1);
  }
}
