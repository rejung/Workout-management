/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Muscle Display Evidence Unit Tests (VNext Recommendation Engine - Phase 3)
 *
 * Verifies pure transformation from pre-dimension-projection exercise evidence
 * into per-muscle display evidence across all 13 canonical regions and 11 display groups.
 *
 * Fixed evaluation anchor across all cases:
 * - evaluationInstant: '2026-08-20T12:00:00+09:00'
 * - evaluationTimezone: 'Asia/Seoul'
 */

import { DEFAULT_EXERCISES } from '../../../constants';
import { WorkoutLog } from '../../../types';
import { deriveRecordedSessionStressEvidence } from '../stress/recordedStressEvidence';
import {
  CANONICAL_MUSCLE_DISPLAY_GROUPS,
  CANONICAL_MUSCLE_REGIONS,
} from '../types/exerciseMusculoskeletalProfile.types';
import { MuscleDisplaySourceExerciseEvidence } from '../types/muscleDisplayEvidence.types';
import { deriveMuscleDisplayEvidence } from './muscleDisplayEvidence';

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export function runMuscleDisplayEvidenceTestSuite(): {
  readonly allPassed: boolean;
  readonly results: readonly TestResult[];
} {
  const results: TestResult[] = [];
  function assert(name: string, condition: boolean, details: string) {
    results.push({ name, passed: condition, details });
  }

  const fixedEvalContext = Object.freeze({
    evaluationInstant: '2026-08-20T12:00:00+09:00',
    evaluationTimezone: 'Asia/Seoul',
  });

  const defBench = DEFAULT_EXERCISES.find((e) => e.id === 'bench-press')!;
  const defDeadlift = DEFAULT_EXERCISES.find((e) => e.id === 'deadlift')!;
  const defBarbellRow = DEFAULT_EXERCISES.find((e) => e.id === 'barbell-row')!;
  const defOhp = DEFAULT_EXERCISES.find((e) => e.id === 'overhead-press')!;
  const defTreadmill = DEFAULT_EXERCISES.find((e) => e.id === 'treadmill')!;
  const defRdl = DEFAULT_EXERCISES.find((e) => e.id === 'romanian-deadlift')!;
  const defSeatedRow = DEFAULT_EXERCISES.find((e) => e.id === 'seated-row')!;
  const defCableFly = DEFAULT_EXERCISES.find((e) => e.id === 'cable-fly')!;
  const defBicepsCurl = DEFAULT_EXERCISES.find((e) => e.id === 'biceps-curl')!;

  // =========================================================================
  // T01: Bench Press — primary-target vs synergist & shoulder head isolation
  // =========================================================================
  {
    const inputs: MuscleDisplaySourceExerciseEvidence[] = [
      {
        sourceLogId: 'log-bench-1',
        date: '2026-08-19',
        startTime: '18:00', // 18h ago -> immediate
        exerciseId: defBench.id, // 'bench-press'
        exerciseName: defBench.name, // '벤치프레스 (Bench Press)'
      },
    ];

    const out = deriveMuscleDisplayEvidence(inputs, fixedEvalContext);
    const pec = out.regionMap['pectoralis-major'];
    const antDelt = out.regionMap['anterior-deltoid'];
    const latDelt = out.regionMap['lateral-deltoid'];
    const postDelt = out.regionMap['posterior-deltoid'];
    const triceps = out.regionMap['triceps-brachii'];
    const shouldersGroup = out.displayGroupMap.shoulders;

    const pecOk =
      pec.status === '최근 부하' &&
      pec.evidence.length === 1 &&
      pec.evidence[0].role === 'primary-target' &&
      pec.evidence[0].sourceLogId === 'log-bench-1' &&
      pec.evidence[0].sourceExerciseId === 'bench-press' &&
      pec.evidence[0].sourceExerciseName === defBench.name &&
      pec.evidence[0].canonicalExerciseId === 'bench_press';

    const synergistsOk =
      antDelt.status === '최근 부하' &&
      antDelt.evidence.length === 1 &&
      antDelt.evidence[0].role === 'synergist' &&
      triceps.status === '최근 부하' &&
      triceps.evidence.length === 1 &&
      triceps.evidence[0].role === 'synergist';

    const shoulderIsolationOk =
      latDelt.status === '판단 정보 부족' &&
      latDelt.evidence.length === 0 &&
      postDelt.status === '판단 정보 부족' &&
      postDelt.evidence.length === 0 &&
      shouldersGroup.regions.length === 3 &&
      shouldersGroup.regions[0].status === '최근 부하' &&
      shouldersGroup.regions[1].status === '판단 정보 부족' &&
      shouldersGroup.regions[2].status === '판단 정보 부족';

    assert(
      'T01: Bench Press distinguishes primary-target (pec) vs synergist (ant-delt, triceps) without copying to lateral/posterior deltoid',
      pecOk && synergistsOk && shoulderIsolationOk,
      `pec=${pec.status}(${pec.rolesPresent.join(',')}), antDelt=${antDelt.status}(${antDelt.rolesPresent.join(',')}), latDelt=${latDelt.status}, postDelt=${postDelt.status}, triceps=${triceps.status}(${triceps.rolesPresent.join(',')})`
    );
  }

  // =========================================================================
  // T02: Deadlift — erector-spinae stabilizer provenance (not copied from axial dimension)
  // =========================================================================
  {
    const inputs: MuscleDisplaySourceExerciseEvidence[] = [
      {
        sourceLogId: 'log-dl-provenance-001',
        date: '2026-08-19',
        startTime: '20:00', // 16h ago -> immediate
        exerciseId: defDeadlift.id,
        exerciseName: defDeadlift.name,
      },
    ];

    const out = deriveMuscleDisplayEvidence(inputs, fixedEvalContext);
    const erector = out.regionMap['erector-spinae'];
    const glutes = out.regionMap.gluteals;
    const hams = out.regionMap.hamstrings;
    const quads = out.regionMap.quadriceps;
    const pec = out.regionMap['pectoralis-major'];

    const erectorOk =
      erector.status === '최근 부하' &&
      erector.evidence.length === 1 &&
      erector.evidence[0].role === 'stabilizer' &&
      erector.evidence[0].sourceLogId === 'log-dl-provenance-001' &&
      erector.evidence[0].sourceExerciseId === 'deadlift' &&
      erector.evidence[0].sourceExerciseName === defDeadlift.name &&
      erector.evidence[0].temporalState === 'immediate';

    const othersOk =
      glutes.rolesPresent.includes('primary-target') &&
      hams.rolesPresent.includes('primary-target') &&
      quads.rolesPresent.includes('synergist') &&
      pec.status === '판단 정보 부족' &&
      pec.evidence.length === 0;

    assert(
      'T02: Deadlift maps erector-spinae as stabilizer with preserved sourceLogId and exact provenance',
      erectorOk && othersOk,
      `erector=${erector.status}(role=${erector.evidence[0]?.role}, logId=${erector.evidence[0]?.sourceLogId}), glutes=${glutes.rolesPresent.join(',')}, quads=${quads.rolesPresent.join(',')}`
    );
  }

  // =========================================================================
  // T03: Running (both canonical 'running' and constants.ts 'treadmill') -> calves
  // =========================================================================
  {
    const canonicalRunOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-run-1',
          date: '2026-08-19',
          startTime: '18:00',
          exerciseId: 'running',
          exerciseName: '러닝 (Running)',
        },
      ],
      fixedEvalContext
    );

    const treadmillOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-treadmill-1',
          date: '2026-08-19',
          startTime: '18:00',
          exerciseId: defTreadmill.id, // 'treadmill'
          exerciseName: defTreadmill.name, // '트레드밀 (Treadmill)'
        },
      ],
      fixedEvalContext
    );

    const runCalves = canonicalRunOut.regionMap.calves;
    const treadCalves = treadmillOut.regionMap.calves;

    const ok =
      runCalves.status === '최근 부하' &&
      runCalves.evidence[0]?.role === 'primary-target' &&
      canonicalRunOut.regionMap.quadriceps.evidence[0]?.role === 'synergist' &&
      canonicalRunOut.regionMap['erector-spinae'].status === '판단 정보 부족' &&
      treadCalves.status === '최근 부하' &&
      treadCalves.evidence[0]?.role === 'primary-target' &&
      treadCalves.evidence[0]?.sourceExerciseId === 'treadmill' &&
      treadCalves.evidence[0]?.canonicalExerciseId === 'running';

    assert(
      'T03: Running and default treadmill ID reflect calves (primary-target) and lower-body synergists without erector-spinae leakage',
      ok,
      `runningCalves=${runCalves.status}(${runCalves.rolesPresent.join(',')}), treadmillCalves=${treadCalves.status}(src=${treadCalves.evidence[0]?.sourceExerciseId}->${treadCalves.evidence[0]?.canonicalExerciseId})`
    );
  }

  // =========================================================================
  // T04: Default IDs / bilingual names supported; variations & conflicts quarantined
  // =========================================================================
  {
    const inputs: MuscleDisplaySourceExerciseEvidence[] = [
      // Supported default ID + bilingual name
      {
        sourceLogId: 'log-row-default',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defBarbellRow.id, // 'barbell-row'
        exerciseName: defBarbellRow.name, // '바벨 로우 (Barbell Row)'
      },
      {
        sourceLogId: 'log-ohp-default',
        date: '2026-08-18',
        startTime: '10:00', // 50h -> residual
        exerciseId: defOhp.id, // 'overhead-press'
        exerciseName: defOhp.name, // '오버헤드 프레스 (Overhead Press)'
      },
      // Unconfirmed variations -> MUST be quarantined
      {
        sourceLogId: 'log-rdl',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defRdl.id, // 'romanian-deadlift'
        exerciseName: defRdl.name,
      },
      {
        sourceLogId: 'log-seated-row',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defSeatedRow.id, // 'seated-row'
        exerciseName: defSeatedRow.name,
      },
      {
        sourceLogId: 'log-chest-row',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: 'barbell_row(chest supported)',
        exerciseName: '바벨 로우(체스트 서포티드)',
      },
      // ID/name conflicts -> MUST be quarantined
      {
        sourceLogId: 'log-conflict-cross',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defDeadlift.id,
        exerciseName: defBarbellRow.name,
      },
      {
        sourceLogId: 'log-conflict-custom-id',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: 'custom-unmapped-row-id',
        exerciseName: defBarbellRow.name,
      },
      {
        sourceLogId: 'log-conflict-modifier',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defBarbellRow.id,
        exerciseName: '바벨 로우 (템포)',
      },
      // Unsupported exercises -> MUST be quarantined
      {
        sourceLogId: 'log-cable-fly',
        date: '2026-08-19',
        startTime: '18:00',
        exerciseId: defCableFly.id,
        exerciseName: defCableFly.name,
      },
    ];

    const out = deriveMuscleDisplayEvidence(inputs, fixedEvalContext);
    const lats = out.regionMap['latissimus-dorsi'];
    const pec = out.regionMap['pectoralis-major'];

    const mappedOk =
      out.provenanceSummary.interpretableExerciseCount === 2 &&
      lats.status === '최근 부하' &&
      lats.evidence.length === 1 &&
      lats.evidence[0].sourceLogId === 'log-row-default' &&
      lats.evidence[0].sourceExerciseId === 'barbell-row' &&
      out.regionMap['anterior-deltoid'].status === '잔여 부하' &&
      out.regionMap['anterior-deltoid'].evidence[0].sourceLogId === 'log-ohp-default';

    const quarantinedOk =
      out.provenanceSummary.uninterpretedExerciseCount === 7 &&
      out.provenanceSummary.unconfirmedVariationCount === 3 &&
      out.provenanceSummary.idNameConflictCount === 3 &&
      out.provenanceSummary.unsupportedExerciseCount === 1 &&
      // cable-fly must NOT touch pectoralis-major
      pec.status === '판단 정보 부족' &&
      pec.evidence.length === 0;

    assert(
      'T04: Default IDs/bilingual names map cleanly while variations, ID/name conflicts, and unsupported exercises are strictly quarantined',
      mappedOk && quarantinedOk,
      `Interpretable=${out.provenanceSummary.interpretableExerciseCount}, Uninterpreted=${out.provenanceSummary.uninterpretedExerciseCount} (var=${out.provenanceSummary.unconfirmedVariationCount}, conflict=${out.provenanceSummary.idNameConflictCount}, unsup=${out.provenanceSummary.unsupportedExerciseCount}), pec=${pec.status}`
    );
  }

  // =========================================================================
  // T05: Future exclusion & exact 24h / 72h temporal boundaries
  // =========================================================================
  {
    // Future records (same-day later & next day without time)
    const futureOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-future-same-day',
          date: '2026-08-20',
          startTime: '12:00:01', // 1 second in the future
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
        {
          sourceLogId: 'log-future-next-day',
          date: '2026-08-21',
          exerciseId: defDeadlift.id,
          exerciseName: defDeadlift.name,
        },
      ],
      fixedEvalContext
    );

    // 23h 59m 59s -> immediate ('최근 부하')
    const justUnder24h = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-23h59m59s',
          date: '2026-08-19',
          startTime: '12:00:01',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // Exact 24h 00m 00s -> residual ('잔여 부하')
    const exact24h = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-24h',
          date: '2026-08-19',
          startTime: '12:00:00',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // 71h 59m 59s -> residual ('잔여 부하')
    const justUnder72h = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-71h59m59s',
          date: '2026-08-17',
          startTime: '12:00:01',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // Exact 72h 00m 00s -> historical ('최근 부하 근거 없음')
    const exact72h = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-72h',
          date: '2026-08-17',
          startTime: '12:00:00',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    const ok =
      futureOut.excludedFutureExercises.length === 2 &&
      futureOut.provenanceSummary.interpretableExerciseCount === 0 &&
      futureOut.regions.every((r) => r.status === '판단 정보 부족' && r.evidence.length === 0) &&
      justUnder24h.regionMap['pectoralis-major'].status === '최근 부하' &&
      exact24h.regionMap['pectoralis-major'].status === '잔여 부하' &&
      justUnder72h.regionMap['pectoralis-major'].status === '잔여 부하' &&
      exact72h.regionMap['pectoralis-major'].status === '최근 부하 근거 없음';

    assert(
      'T05: Future records excluded and exact 24h/72h thresholds partition immediate / residual / historical accurately',
      ok,
      `futureExcluded=${futureOut.excludedFutureExercises.length}, <24h=${justUnder24h.regionMap['pectoralis-major'].status}, =24h=${exact24h.regionMap['pectoralis-major'].status}, <72h=${justUnder72h.regionMap['pectoralis-major'].status}, =72h=${exact72h.regionMap['pectoralis-major'].status}`
    );
  }

  // =========================================================================
  // T06: Uncertain-only, bracket-only, and confirmed + uncertain coexistence
  // =========================================================================
  {
    // 1. Same-day missing startTime only -> '판단 정보 부족' (NEVER promoted to 최근/잔여 부하)
    const uncertainOnly = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-today-notime',
          date: '2026-08-20',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // 2. Yesterday missing startTime (12h..36h crossing 24h) -> bracket -> '판단 정보 부족'
    const bracketOnly = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-yesterday-notime',
          date: '2026-08-19',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // 3. Confirmed residual (36h ago) + same-day uncertain -> preserves '잔여 부하' + uncertainty flag
    const residualPlusUncertain = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-36h',
          date: '2026-08-19',
          startTime: '00:00',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
        {
          sourceLogId: 'log-bench-today-notime',
          date: '2026-08-20',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // 4. Confirmed immediate (6h ago) + bracket (yesterday no time) -> preserves '최근 부하' + uncertainty flag
    const immediatePlusBracket = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-6h',
          date: '2026-08-20',
          startTime: '06:00',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
        {
          sourceLogId: 'log-bench-yesterday-notime',
          date: '2026-08-19',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    // 5. Confirmed historical (5d ago) + same-day uncertain -> '판단 정보 부족' (NOT '최근 부하 근거 없음')
    const historicalPlusUncertain = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-5d',
          date: '2026-08-15',
          startTime: '10:00',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
        {
          sourceLogId: 'log-bench-today-notime',
          date: '2026-08-20',
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
      ],
      fixedEvalContext
    );

    const uPec = uncertainOnly.regionMap['pectoralis-major'];
    const bPec = bracketOnly.regionMap['pectoralis-major'];
    const ruPec = residualPlusUncertain.regionMap['pectoralis-major'];
    const ibPec = immediatePlusBracket.regionMap['pectoralis-major'];
    const huPec = historicalPlusUncertain.regionMap['pectoralis-major'];

    const ok =
      uPec.status === '판단 정보 부족' &&
      uPec.uncertainty.hasUncertainty &&
      uPec.uncertainty.hasUncertainTraces &&
      uPec.uncertainEvidence.length === 1 &&
      bPec.status === '판단 정보 부족' &&
      bPec.uncertainty.hasUncertainty &&
      bPec.uncertainty.hasBracketTraces &&
      bPec.uncertainty.potentialPersistence === 'immediate' &&
      bPec.bracketEvidence[0]?.potentialPersistenceBounds?.lowerBoundState === 'residual' &&
      bPec.bracketEvidence[0]?.potentialPersistenceBounds?.upperBoundState === 'immediate' &&
      ruPec.status === '잔여 부하' &&
      ruPec.confirmedPersistence === 'residual' &&
      ruPec.uncertainty.hasUncertainty &&
      ruPec.uncertainty.hasUncertainTraces &&
      ibPec.status === '최근 부하' &&
      ibPec.confirmedPersistence === 'immediate' &&
      ibPec.uncertainty.hasUncertainty &&
      ibPec.uncertainty.hasBracketTraces &&
      huPec.status === '판단 정보 부족' &&
      huPec.confirmedPersistence === 'historical' &&
      huPec.uncertainty.hasUncertainty;

    assert(
      'T06: Uncertain/bracket-only stays 판단 정보 부족; confirmed active + uncertain preserves confirmed status with separate uncertainty metadata',
      ok,
      `uncertainOnly=${uPec.status}, bracketOnly=${bPec.status}(pot=${bPec.uncertainty.potentialPersistence}), res+unc=${ruPec.status}(unc=${ruPec.uncertainty.hasUncertainty}), imm+brk=${ibPec.status}(unc=${ibPec.uncertainty.hasUncertainty}), hist+unc=${huPec.status}(conf=${huPec.confirmedPersistence})`
    );
  }

  // =========================================================================
  // T07: Empty & unsupported-only records NEVER report zero-load/recovered; scope notice preserved
  // =========================================================================
  {
    const emptyOut = deriveMuscleDisplayEvidence([], fixedEvalContext);
    const unsupportedOnlyOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-unsup-1',
          date: '2026-08-19',
          startTime: '18:00',
          exerciseId: defBicepsCurl.id,
          exerciseName: defBicepsCurl.name,
        },
        {
          sourceLogId: 'log-unsup-2',
          date: '2026-08-19',
          startTime: '18:30',
          exerciseId: defRdl.id,
          exerciseName: defRdl.name,
        },
      ],
      fixedEvalContext
    );

    const historicalPlusUnsupportedOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-bench-old',
          date: '2026-08-15',
          startTime: '10:00', // 5d ago -> historical
          exerciseId: defBench.id,
          exerciseName: defBench.name,
        },
        {
          sourceLogId: 'log-cable-fly-recent',
          date: '2026-08-19',
          startTime: '20:00', // 16h ago -> unsupported
          exerciseId: defCableFly.id,
          exerciseName: defCableFly.name,
        },
      ],
      fixedEvalContext
    );

    const emptyOk =
      emptyOut.regions.every((r) => r.status === '판단 정보 부족' && r.isInsufficient) &&
      !emptyOut.hasUninterpretedExercises;

    const unsupOk =
      unsupportedOnlyOut.regions.every((r) => r.status === '판단 정보 부족' && r.evidence.length === 0) &&
      unsupportedOnlyOut.hasUninterpretedExercises &&
      unsupportedOnlyOut.uninterpretedExercises.length === 2;

    const scopedOk =
      historicalPlusUnsupportedOut.regionMap['pectoralis-major'].status === '최근 부하 근거 없음' &&
      historicalPlusUnsupportedOut.regionMap['lateral-deltoid'].status === '판단 정보 부족' &&
      historicalPlusUnsupportedOut.hasUninterpretedExercises &&
      historicalPlusUnsupportedOut.uninterpretedExercises.length === 1 &&
      historicalPlusUnsupportedOut.uninterpretedExercises[0].sourceExerciseId === 'cable-fly' &&
      historicalPlusUnsupportedOut.interpretationScopeNotice.includes('한정') &&
      historicalPlusUnsupportedOut.interpretationScopeNotice.includes('임의 배정하지 않고');

    assert(
      'T07: Empty and unsupported-only inputs stay 판단 정보 부족; historical-only status is scoped to interpretable records with uninterpreted notice',
      emptyOk && unsupOk && scopedOk,
      `emptyAllInsufficient=${emptyOk}, unsupAllInsufficient=${unsupOk}, scopedHistPec=${historicalPlusUnsupportedOut.regionMap['pectoralis-major'].status}, uninterpreted=${historicalPlusUnsupportedOut.uninterpretedExercises.length}`
    );
  }

  // =========================================================================
  // T08: Single record -> multiple muscles (no recounting) vs distinct same-day records preserved
  // =========================================================================
  {
    // Case A: Single Deadlift record connects to 6 muscles, provenance counts remain 1
    const singleDlOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-dl-single',
          date: '2026-08-19',
          startTime: '18:00',
          exerciseId: defDeadlift.id,
          exerciseName: defDeadlift.name,
        },
      ],
      fixedEvalContext
    );

    const connectedMuscleCount = singleDlOut.regions.filter((r) => r.evidence.length > 0).length;

    // Case B: Two separate Deadlift records on the same calendar day ('2026-08-19')
    // 09:00 -> 27h ago (residual), 19:00 -> 17h ago (immediate)
    const twoSameDayOut = deriveMuscleDisplayEvidence(
      [
        {
          sourceLogId: 'log-dl-morning',
          date: '2026-08-19',
          startTime: '09:00',
          exerciseId: defDeadlift.id,
          exerciseName: defDeadlift.name,
        },
        {
          sourceLogId: 'log-dl-evening',
          date: '2026-08-19',
          startTime: '19:00',
          exerciseId: defDeadlift.id,
          exerciseName: defDeadlift.name,
        },
      ],
      fixedEvalContext
    );

    const erectorTwo = twoSameDayOut.regionMap['erector-spinae'];

    const singleOk =
      connectedMuscleCount === 6 &&
      singleDlOut.provenanceSummary.interpretableExerciseCount === 1 &&
      singleDlOut.provenanceSummary.distinctInterpretableLogCount === 1;

    const twoSameDayOk =
      twoSameDayOut.provenanceSummary.interpretableExerciseCount === 2 &&
      twoSameDayOut.provenanceSummary.distinctInterpretableLogCount === 2 &&
      erectorTwo.evidence.length === 2 &&
      erectorTwo.immediateEvidence.length === 1 &&
      erectorTwo.immediateEvidence[0].sourceLogId === 'log-dl-evening' &&
      erectorTwo.residualEvidence.length === 1 &&
      erectorTwo.residualEvidence[0].sourceLogId === 'log-dl-morning' &&
      erectorTwo.status === '최근 부하';

    assert(
      'T08: Single record linking to 6 muscles does not recount sessions; two distinct same-day records are both preserved separately',
      singleOk && twoSameDayOk,
      `singleConnectedMuscles=${connectedMuscleCount} (interpretableCount=${singleDlOut.provenanceSummary.interpretableExerciseCount}), sameDayTwoLogs=${erectorTwo.evidence.map((e) => `${e.sourceLogId}:${e.temporalState}`).join(', ')}`
    );
  }

  // =========================================================================
  // T09: Pre-dimension RecordedSessionStressEvidence compatibility, 13/11 registry & immutability
  // =========================================================================
  {
    const rawLog: WorkoutLog = {
      id: 'log-mixed-session',
      date: '2026-08-19',
      startTime: '18:00',
      routineName: '등 혼합 세션',
      notes: '',
      exercises: [
        {
          exerciseId: defBarbellRow.id,
          exerciseName: defBarbellRow.name,
          category: defBarbellRow.category,
          sets: [{ id: 's1', reps: 8, weight: 70, isWarmup: false }],
        },
        {
          exerciseId: defSeatedRow.id,
          exerciseName: defSeatedRow.name,
          category: defSeatedRow.category,
          sets: [{ id: 's2', reps: 10, weight: 50, isWarmup: false }],
        },
      ],
    };

    const recordedEvidence = deriveRecordedSessionStressEvidence(rawLog);
    const out1 = deriveMuscleDisplayEvidence(recordedEvidence.exercises, fixedEvalContext);
    const out2 = deriveMuscleDisplayEvidence(recordedEvidence.exercises, fixedEvalContext);

    const registryOk =
      out1.regions.length === CANONICAL_MUSCLE_REGIONS.length &&
      out1.regions.length === 13 &&
      out1.displayGroups.length === CANONICAL_MUSCLE_DISPLAY_GROUPS.length &&
      out1.displayGroups.length === 11 &&
      out1.regionMap['latissimus-dorsi'].status === '최근 부하' &&
      out1.regionMap['erector-spinae'].evidence[0]?.role === 'stabilizer' &&
      out1.uninterpretedExercises.length === 1 &&
      out1.uninterpretedExercises[0].sourceExerciseId === 'seated-row' &&
      out1.uninterpretedExercises[0].category === 'unconfirmed-variation';

    const frozenAndDeterministic =
      Object.isFrozen(out1) &&
      Object.isFrozen(out1.regions) &&
      Object.isFrozen(out1.displayGroups) &&
      Object.isFrozen(out1.regionMap) &&
      Object.isFrozen(out1.uninterpretedExercises) &&
      JSON.stringify(out1) === JSON.stringify(out2);

    assert(
      'T09: Directly consumes RecordedExerciseStressEvidence with 13 regions, 11 groups, deep immutability, and determinism',
      registryOk && frozenAndDeterministic,
      `regions=${out1.regions.length}, groups=${out1.displayGroups.length}, uninterpreted=${out1.uninterpretedExercises.length}, frozen=${Object.isFrozen(out1)}`
    );
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Standalone execution support
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1]?.includes('muscleDisplayEvidence.test')
) {
  console.log('==================================================');
  console.log('RUNNING MUSCLE DISPLAY EVIDENCE TEST SUITE (PHASE 3)');
  console.log('==================================================');
  const { allPassed, results } = runMuscleDisplayEvidenceTestSuite();
  for (const r of results) {
    console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.details}`);
  }
  console.log(
    `\nAll Muscle Display Evidence Tests Passed: ${allPassed} (${results.filter((r) => r.passed).length}/${results.length})`
  );
  if (!allPassed) {
    process.exit(1);
  }
}
