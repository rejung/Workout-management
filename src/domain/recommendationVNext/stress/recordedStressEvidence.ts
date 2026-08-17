/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExerciseSession, WorkoutLog } from '../../../types';
import {
  extractCanonicalRunningMetrics,
  isRunningIdentifier
} from '../normalization/runningNormalization';
import {
  normalizeSessionSetRoles
} from '../normalization/setRoleNormalization';
import {
  buildCanonicalSessionRefs
} from '../normalization/sessionOrdering';
import {
  evaluateNormalizedSetEligibility
} from '../performance/strengthPerformanceEligibility';
import { StressDimension } from '../types/stressModel.types';
import {
  RecordedExerciseStressEvidence,
  RecordedRunningStressEvidence,
  RecordedSessionStressEvidence,
  RecordedStrengthStressEvidence,
  RecordedUnmappedStressEvidence,
  StrengthPerformanceEvidenceAvailability
} from '../types/stressEvidence.types';
import {
  getCanonicalExerciseStressProfile
} from './stressVocabulary';

const EMPTY_STRESS_DIMENSIONS: readonly [] = Object.freeze([]);

/**
 * Evaluates the performance evidence availability for a standard strength exercise.
 * Pure function: Inspects set records and CU2 eligibility without computing metrics or fatigue scores.
 */
function evaluateStrengthPerformanceAvailability(
  exercise: ExerciseSession
): StrengthPerformanceEvidenceAvailability {
  const sets = exercise.sets || [];
  const normalizedSets = normalizeSessionSetRoles(exercise);

  let explicitWorkingSetCount = 0;
  let unknownSetRoleCount = 0;
  let explicitWarmupCount = 0;

  let hasEstimated1RM = false;
  let hasLoadVolume = false;
  let hasWorkCapacity = false;
  let eligibleObservationCount = 0;

  const context = {
    exerciseId: exercise.exerciseId || '',
    exerciseName: exercise.exerciseName || '',
    category: exercise.category || '',
    logType: 'STANDARD' as const
  };

  for (const normSet of normalizedSets) {
    const role = normSet.evidence.role;
    if (role === 'explicit-working-set') {
      explicitWorkingSetCount += 1;
    } else if (role === 'unknown-set-role') {
      unknownSetRoleCount += 1;
    } else if (role === 'explicit-warmup') {
      explicitWarmupCount += 1;
    }

    const eligibility = evaluateNormalizedSetEligibility(normSet, context);
    const isEligibleForAny =
      eligibility.estimated1RM.eligible ||
      eligibility.loadVolume.eligible ||
      eligibility.workCapacity.eligible;

    if (isEligibleForAny) {
      eligibleObservationCount += 1;
    }
    if (eligibility.estimated1RM.eligible) {
      hasEstimated1RM = true;
    }
    if (eligibility.loadVolume.eligible) {
      hasLoadVolume = true;
    }
    if (eligibility.workCapacity.eligible) {
      hasWorkCapacity = true;
    }
  }

  return Object.freeze({
    hasEstimated1RM,
    hasLoadVolume,
    hasWorkCapacity,
    eligibleObservationCount,
    totalRawSetCount: sets.length,
    explicitWorkingSetCount,
    unknownSetRoleCount,
    explicitWarmupCount
  });
}

/**
 * Extracts a single RecordedExerciseStressEvidence item from a strength/accessory ExerciseSession.
 */
function extractExerciseStressEvidence(
  session: ExerciseSession,
  sourceLogId: string,
  date: string,
  startTime?: string
): RecordedExerciseStressEvidence {
  const profile = getCanonicalExerciseStressProfile(session.exerciseId || session.exerciseName);

  if (profile.mappingStatus === 'unmapped') {
    const unmappedEvidence: RecordedUnmappedStressEvidence = Object.freeze({
      kind: 'unmapped',
      sourceLogId,
      date,
      startTime,
      exerciseId: session.exerciseId || 'unknown',
      exerciseName: session.exerciseName || 'Unknown Exercise',
      category: session.category,
      mappingStatus: 'unmapped',
      dimensions: EMPTY_STRESS_DIMENSIONS,
      unmappedReason: 'Exercise profile is unmapped or unrecognized in Stress Vocabulary.',
      domainNotes: profile.domainNotes
    });
    return unmappedEvidence;
  }

  const performanceAvailability = evaluateStrengthPerformanceAvailability(session);

  const strengthEvidence: RecordedStrengthStressEvidence = Object.freeze({
    kind: 'strength',
    sourceLogId,
    date,
    startTime,
    exerciseId: session.exerciseId || profile.exerciseId,
    exerciseName: session.exerciseName || profile.exerciseName,
    category: session.category,
    mappingStatus: 'mapped',
    dimensions: profile.dimensions,
    performanceEvidenceAvailable: performanceAvailability,
    domainNotes: profile.domainNotes
  });

  return strengthEvidence;
}

/**
 * Extracts a complete RecordedSessionStressEvidence container from a single actual WorkoutLog.
 * 
 * Invariants:
 * - Pure function: `log` is never mutated.
 * - Discriminated union handling for running vs strength vs unmapped.
 * - Multiple exercises within the same WorkoutLog are preserved as distinct exercise evidence items.
 * - Does NOT merge separate same-day WorkoutLogs.
 * - Does NOT compute stress scores, decay, or readiness.
 */
export function deriveRecordedSessionStressEvidence(
  log: WorkoutLog
): RecordedSessionStressEvidence {
  const sourceLogId = log.id;
  const date = log.date;
  const startTime = log.startTime;

  // 1. Check if this is a canonical running session
  const isRunning =
    isRunningIdentifier(log.routineName) ||
    (Array.isArray(log.exercises) &&
      log.exercises.some((ex) => isRunningIdentifier(ex.exerciseName) || isRunningIdentifier(ex.exerciseId)));

  if (isRunning) {
    const runningProfile = getCanonicalExerciseStressProfile('running');
    const runningMetrics = extractCanonicalRunningMetrics(log) || {
      sourceFormat: 'unknown',
      provenance: {
        distance: 'missing',
        duration: 'missing',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false
      },
      sourceConfidence: 'low',
      runIntent: 'unknown'
    };

    const runningExercise = log.exercises?.find(
      (ex) => isRunningIdentifier(ex.exerciseName) || isRunningIdentifier(ex.exerciseId)
    );

    const exerciseName = runningExercise?.exerciseName || log.routineName || '러닝';
    const exerciseId = runningExercise?.exerciseId || 'running';

    const runningEvidence: RecordedRunningStressEvidence = Object.freeze({
      kind: 'running',
      sourceLogId,
      date,
      startTime,
      exerciseId,
      exerciseName,
      mappingStatus: 'mapped',
      dimensions: runningProfile.dimensions,
      runningMetrics: Object.freeze(runningMetrics),
      domainNotes: runningProfile.domainNotes
    });

    const exercises: readonly RecordedExerciseStressEvidence[] = Object.freeze([runningEvidence]);
    const sessionDimensions = runningProfile.dimensions;

    return Object.freeze({
      sourceLogId,
      date,
      startTime,
      isRunningSession: true,
      exercises,
      sessionDimensions,
      totalExerciseCount: 1,
      mappedExerciseCount: 1,
      unmappedExerciseCount: 0
    });
  }

  // 2. Standard strength / accessory / mixed session
  const rawExercises = Array.isArray(log.exercises) ? log.exercises : [];
  const exerciseEvidences: RecordedExerciseStressEvidence[] = [];
  const sessionDimensionSet = new Set<StressDimension>();

  let mappedCount = 0;
  let unmappedCount = 0;

  for (const ex of rawExercises) {
    const ev = extractExerciseStressEvidence(ex, sourceLogId, date, startTime);
    exerciseEvidences.push(ev);

    if (ev.mappingStatus === 'mapped') {
      mappedCount += 1;
      for (const d of ev.dimensions) {
        sessionDimensionSet.add(d);
      }
    } else {
      unmappedCount += 1;
    }
  }

  const sessionDimensions: readonly StressDimension[] = Object.freeze(
    Array.from(sessionDimensionSet)
  );

  return Object.freeze({
    sourceLogId,
    date,
    startTime,
    isRunningSession: false,
    exercises: Object.freeze(exerciseEvidences),
    sessionDimensions,
    totalExerciseCount: rawExercises.length,
    mappedExerciseCount: mappedCount,
    unmappedExerciseCount: unmappedCount
  });
}

/**
 * Extracts structured RecordedSessionStressEvidence for an array of historical WorkoutLogs.
 * 
 * Invariants:
 * - Uses CU1 canonical session ordering contract (descending chronological order).
 * - Preserves all sessions separately (does NOT merge multiple same-day sessions).
 * - Zero mutations of source data.
 */
export function deriveRecordedSessionsStressEvidence(
  logs: readonly WorkoutLog[]
): readonly RecordedSessionStressEvidence[] {
  if (!logs || logs.length === 0) {
    return Object.freeze([]);
  }

  // Canonical chronological order from CU1
  const canonicalRefs = buildCanonicalSessionRefs(logs);

  const results: RecordedSessionStressEvidence[] = canonicalRefs.map((ref) =>
    deriveRecordedSessionStressEvidence(ref.rawLog)
  );

  return Object.freeze(results);
}

/**
 * Structured audit result for CU3.2 verification.
 */
export interface StressEvidenceAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}

/**
 * Programmatic verification suite auditing CU3.2 invariants across real samples and synthetic cases.
 */
export function auditRecordedStressEvidence(): readonly StressEvidenceAuditResult[] {
  const results: StressEvidenceAuditResult[] = [];

  // 1. Real Sample A: 2026-08-07 Squat (Full 7 sets: 2 warmup, 5 working) + Calf Raise
  const realSampleA: WorkoutLog = {
    id: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
    date: '2026-08-07',
    startTime: '18:21',
    routineName: '하체 (Legs)',
    notes: '',
    exercises: [
      {
        exerciseId: 'squat',
        exerciseName: '스쿼트 (Squat)',
        category: 'Legs',
        sets: [
          { id: 'sq1', weight: 60, reps: 10, isWarmup: true },
          { id: 'sq2', weight: 80, reps: 8, isWarmup: true },
          { id: 'sq3', weight: 115, reps: 3, isWarmup: false },
          { id: 'sq4', weight: 110, reps: 5, isWarmup: false },
          { id: 'sq5', weight: 100, reps: 5, isWarmup: false },
          { id: 'sq6', weight: 100, reps: 5, isWarmup: false },
          { id: 'sq7', weight: 100, reps: 5, isWarmup: false }
        ]
      },
      {
        exerciseId: 'calf-raise-simple',
        exerciseName: '카프 레이즈',
        category: 'Legs',
        sets: [{ id: 'cr1', weight: 40, reps: 15, isWarmup: false }]
      }
    ]
  };

  const evidenceA = deriveRecordedSessionStressEvidence(realSampleA);
  const squatEv = evidenceA.exercises.find((e) => e.exerciseId === 'squat' || e.exerciseName.includes('스쿼트'));
  const hasSquatDims =
    squatEv &&
    squatEv.kind === 'strength' &&
    squatEv.dimensions.includes('knee-dominant-lower-body') &&
    squatEv.dimensions.includes('hip-posterior-chain') &&
    squatEv.dimensions.includes('axial-systemic-loading');

  results.push({
    auditName: 'Real Sample A (2026-08-07 Squat 7 raw sets + Calf Raise session)',
    passed:
      evidenceA.totalExerciseCount === 2 &&
      evidenceA.mappedExerciseCount === 1 &&
      evidenceA.unmappedExerciseCount === 1 &&
      Boolean(hasSquatDims) &&
      squatEv?.kind === 'strength' &&
      squatEv.performanceEvidenceAvailable.totalRawSetCount === 7 &&
      squatEv.performanceEvidenceAvailable.explicitWarmupCount === 2 &&
      squatEv.performanceEvidenceAvailable.explicitWorkingSetCount === 5 &&
      squatEv.performanceEvidenceAvailable.unknownSetRoleCount === 0 &&
      squatEv.performanceEvidenceAvailable.hasEstimated1RM &&
      squatEv.performanceEvidenceAvailable.hasLoadVolume &&
      squatEv.performanceEvidenceAvailable.hasWorkCapacity,
    details: 'Squat correctly mapped to 3 dimensions, warmup 2 / working 5 sets exact, calf raise preserved as unmapped.'
  });

  // 2. Real Sample B: 2026-08-09 Running (3km, 870s, pace 290s/km)
  const realSampleB: WorkoutLog = {
    id: '19946e03-ae98-405d-97cc-6e03edffeb3c',
    date: '2026-08-09',
    startTime: '13:56',
    routineName: '러닝',
    notes: '',
    exercises: [
      {
        exerciseId: 'v1-custom----11',
        exerciseName: '야외 러닝',
        category: 'Cardio',
        sets: [{ id: 'r1', weight: 0, reps: 0, distanceKm: 3, timeSeconds: 870 }]
      }
    ]
  };

  const evidenceB = deriveRecordedSessionStressEvidence(realSampleB);
  const runEv = evidenceB.exercises[0];
  const isRunCorrect =
    evidenceB.isRunningSession &&
    runEv.kind === 'running' &&
    runEv.dimensions.includes('knee-dominant-lower-body') &&
    runEv.dimensions.includes('hip-posterior-chain') &&
    !runEv.dimensions.includes('axial-systemic-loading') &&
    runEv.runningMetrics.distanceKm === 3 &&
    runEv.runningMetrics.durationSeconds === 870 &&
    runEv.runningMetrics.paceSecondsPerKm === 290;

  results.push({
    auditName: 'Real Sample B (2026-08-09 Running with canonical metrics)',
    passed: isRunCorrect,
    details: 'Running correctly classified, lower-body dimensions assigned without axial load, canonical pace 290s/km preserved.'
  });

  // 3. Real Sample C: 2026-08-09 OHP Full (9 OHP sets: 2 warmup, 7 working + 3 accessories)
  const realSampleC: WorkoutLog = {
    id: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
    date: '2026-08-09',
    startTime: '15:56',
    routineName: 'OHP',
    notes: '',
    exercises: [
      {
        exerciseId: 'overhead-press',
        exerciseName: '오버헤드 프레스 (Overhead Press)',
        category: 'Shoulders',
        sets: [
          { id: 'ohp1', weight: 20, reps: 12, isWarmup: true },
          { id: 'ohp2', weight: 30, reps: 10, isWarmup: true },
          { id: 'ohp3', weight: 50, reps: 5, isWarmup: false },
          { id: 'ohp4', weight: 50, reps: 5, isWarmup: false },
          { id: 'ohp5', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp6', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp7', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp8', weight: 40, reps: 5, isWarmup: false },
          { id: 'ohp9', weight: 40, reps: 5, isWarmup: false }
        ]
      },
      {
        exerciseId: 'face-pull',
        exerciseName: '페이스 풀 (Face Pull)',
        category: 'Shoulders',
        sets: [
          { id: 'fp1', weight: 20, reps: 15, isWarmup: false },
          { id: 'fp2', weight: 20, reps: 15, isWarmup: false },
          { id: 'fp3', weight: 20, reps: 15, isWarmup: false },
          { id: 'fp4', weight: 20, reps: 15, isWarmup: false }
        ]
      },
      {
        exerciseId: 'lateral-raise',
        exerciseName: '사이드 레터럴 레이즈 (Side Lateral Raise)',
        category: 'Shoulders',
        sets: [
          { id: 'lr1', weight: 6, reps: 15, isWarmup: false },
          { id: 'lr2', weight: 6, reps: 15, isWarmup: false },
          { id: 'lr3', weight: 6, reps: 15, isWarmup: false },
          { id: 'lr4', weight: 6, reps: 15, isWarmup: false }
        ]
      },
      {
        exerciseId: 'plank',
        exerciseName: '플랭크 (Plank)',
        category: 'Core',
        sets: [
          { id: 'pl1', weight: 0, reps: 60, isWarmup: false },
          { id: 'pl2', weight: 0, reps: 60, isWarmup: false }
        ]
      }
    ]
  };

  const evidenceC = deriveRecordedSessionStressEvidence(realSampleC);
  const ohpEv = evidenceC.exercises.find((e) => e.exerciseId === 'overhead-press' || e.exerciseName.includes('오버헤드'));
  const facePullEv = evidenceC.exercises.find((e) => e.exerciseId === 'face-pull' || e.exerciseName.includes('페이스'));

  results.push({
    auditName: 'Real Sample C (2026-08-09 OHP 9 raw sets + 3 accessories full session)',
    passed:
      evidenceC.totalExerciseCount === 4 &&
      evidenceC.mappedExerciseCount === 2 &&
      evidenceC.unmappedExerciseCount === 2 &&
      ohpEv?.kind === 'strength' &&
      ohpEv.dimensions.includes('vertical-push') &&
      ohpEv.dimensions.includes('axial-systemic-loading') &&
      !ohpEv.dimensions.includes('horizontal-push') &&
      ohpEv.performanceEvidenceAvailable.totalRawSetCount === 9 &&
      ohpEv.performanceEvidenceAvailable.explicitWarmupCount === 2 &&
      ohpEv.performanceEvidenceAvailable.explicitWorkingSetCount === 7 &&
      facePullEv?.kind === 'strength' &&
      facePullEv.dimensions.includes('horizontal-pull'),
    details: 'OHP has 9 raw sets (2 warmup, 7 working), Face Pull mapped to horizontal-pull, Lateral Raise and Plank preserved as unmapped.'
  });

  // 4. Real Sample D: 2026-08-12 Bench Full (10 Bench sets: 4 warmup, 6 working + 2 accessories)
  const realSampleD: WorkoutLog = {
    id: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
    date: '2026-08-12',
    startTime: '18:21',
    routineName: '벤치프레스',
    notes: '',
    exercises: [
      {
        exerciseId: 'bench-press',
        exerciseName: '벤치프레스 (Bench Press)',
        category: 'Chest',
        sets: [
          { id: 'bp1', weight: 20, reps: 12, isWarmup: true },
          { id: 'bp2', weight: 50, reps: 8, isWarmup: true },
          { id: 'bp3', weight: 60, reps: 5, isWarmup: true },
          { id: 'bp4', weight: 70, reps: 5, isWarmup: true },
          { id: 'bp5', weight: 80, reps: 1, isWarmup: false },
          { id: 'bp6', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp7', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp8', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp9', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp10', weight: 70, reps: 5, isWarmup: false }
        ]
      },
      {
        exerciseId: 'incline-dumbbell-press',
        exerciseName: '인클라인 덤벨 프레스 (Incline Dumbbell Press)',
        category: 'Chest',
        sets: [
          { id: 'inc1', weight: 24, reps: 10, isWarmup: false },
          { id: 'inc2', weight: 24, reps: 10, isWarmup: false },
          { id: 'inc3', weight: 24, reps: 10, isWarmup: false },
          { id: 'inc4', weight: 24, reps: 10, isWarmup: false }
        ]
      },
      {
        exerciseId: 'dumbbell-pullover',
        exerciseName: '덤벨 풀오버 (Dumbbell Pullover)',
        category: 'Chest',
        sets: [
          { id: 'po1', weight: 20, reps: 12, isWarmup: false },
          { id: 'po2', weight: 20, reps: 12, isWarmup: false },
          { id: 'po3', weight: 20, reps: 12, isWarmup: false }
        ]
      }
    ]
  };

  const evidenceD = deriveRecordedSessionStressEvidence(realSampleD);
  const benchEv = evidenceD.exercises.find((e) => e.exerciseId === 'bench-press' || e.exerciseName.includes('벤치프레스'));

  results.push({
    auditName: 'Real Sample D (2026-08-12 Bench Press 10 raw sets + 2 accessories full session)',
    passed:
      evidenceD.totalExerciseCount === 3 &&
      evidenceD.mappedExerciseCount === 1 &&
      evidenceD.unmappedExerciseCount === 2 &&
      benchEv?.kind === 'strength' &&
      benchEv.dimensions.includes('horizontal-push') &&
      !benchEv.dimensions.includes('vertical-push') &&
      benchEv.performanceEvidenceAvailable.totalRawSetCount === 10 &&
      benchEv.performanceEvidenceAvailable.explicitWarmupCount === 4 &&
      benchEv.performanceEvidenceAvailable.explicitWorkingSetCount === 6,
    details: 'Bench has 10 raw sets (4 warmup, 6 working) mapped to horizontal-push; Incline DB Press and Pullover preserved as unmapped.'
  });

  // 5. Synthetic Deadlift (Strict No Horizontal Pull)
  const deadliftLog: WorkoutLog = {
    id: 'deadlift-session-1',
    date: '2026-08-14',
    notes: '',
    exercises: [
      {
        exerciseId: 'deadlift',
        exerciseName: '데드리프트',
        category: 'Back',
        sets: [{ id: 'd1', weight: 140, reps: 5, isWarmup: false }]
      }
    ]
  };

  const dlEvidence = deriveRecordedSessionStressEvidence(deadliftLog);
  const dlEx = dlEvidence.exercises[0];

  results.push({
    auditName: 'Synthetic Deadlift (Hinge & Axial without Horizontal Pull)',
    passed:
      dlEx.kind === 'strength' &&
      dlEx.dimensions.includes('hip-posterior-chain') &&
      dlEx.dimensions.includes('axial-systemic-loading') &&
      !dlEx.dimensions.includes('horizontal-pull') &&
      !dlEx.dimensions.includes('vertical-pull'),
    details: 'Deadlift contains zero pulling dimensions, strictly satisfying the constitution invariant.'
  });

  // 6. Synthetic Barbell Row (Horizontal Pull, Distinct from Deadlift)
  const rowLog: WorkoutLog = {
    id: 'row-session-1',
    date: '2026-08-15',
    notes: '',
    exercises: [
      {
        exerciseId: 'barbell_row',
        exerciseName: '바벨 로우',
        category: 'Back',
        sets: [{ id: 'br1', weight: 70, reps: 8, isWarmup: false }]
      }
    ]
  };

  const rowEvidence = deriveRecordedSessionStressEvidence(rowLog);
  const rowEx = rowEvidence.exercises[0];

  results.push({
    auditName: 'Synthetic Barbell Row (Horizontal Pull distinct from Deadlift)',
    passed:
      rowEx.kind === 'strength' &&
      rowEx.dimensions.includes('horizontal-pull') &&
      !rowEx.dimensions.includes('axial-systemic-loading') &&
      !rowEx.dimensions.includes('hip-posterior-chain'),
    details: 'Barbell Row has horizontal-pull evidence and is distinct from Deadlift.'
  });

  // 7. Synthetic Unknown Exercise (Explicit Unmapped)
  const unknownLog: WorkoutLog = {
    id: 'unknown-session-1',
    date: '2026-08-16',
    notes: '',
    exercises: [
      {
        exerciseId: 'experimental_flying_squat',
        exerciseName: '실험적 플라잉 스쿼트',
        category: 'Legs',
        sets: [{ id: 'u1', weight: 50, reps: 10, isWarmup: false }]
      }
    ]
  };

  const unknownEvidence = deriveRecordedSessionStressEvidence(unknownLog);
  const unknownEx = unknownEvidence.exercises[0];

  results.push({
    auditName: 'Synthetic Unknown Exercise (Explicit Unmapped Fallback)',
    passed:
      unknownEx.kind === 'unmapped' &&
      unknownEx.mappingStatus === 'unmapped' &&
      unknownEx.dimensions.length === 0 &&
      unknownEvidence.unmappedExerciseCount === 1,
    details: 'Unmapped exercise preserved with empty dimensions, avoiding silent miscategorization.'
  });

  // 8. Synthetic Non-running Cardio (Stationary Bike - Strict No Running Profile)
  const bikeLog: WorkoutLog = {
    id: 'bike-session-1',
    date: '2026-08-16',
    notes: '',
    exercises: [
      {
        exerciseId: 'stationary_bike',
        exerciseName: '실내 사이클',
        category: 'Cardio',
        sets: [{ id: 'bk1', weight: 0, reps: 0, distanceKm: 10, timeSeconds: 1200 }]
      }
    ]
  };

  const bikeEvidence = deriveRecordedSessionStressEvidence(bikeLog);
  const bikeEx = bikeEvidence.exercises[0];

  results.push({
    auditName: 'Synthetic Non-running Cardio (Stationary Bike unmapped / no running profile)',
    passed:
      !bikeEvidence.isRunningSession &&
      bikeEx.kind === 'unmapped' &&
      bikeEx.dimensions.length === 0,
    details: 'Non-running cardio is not misidentified as running and does not inherit running stress dimensions.'
  });

  // 9. Same-Day Multiple Sessions Preservation
  const multiSameDayLogs: WorkoutLog[] = [realSampleB, realSampleC]; // Both 2026-08-09
  const multiEvidence = deriveRecordedSessionsStressEvidence(multiSameDayLogs);

  results.push({
    auditName: 'Same-Day Multiple Sessions (Preservation without merging)',
    passed:
      multiEvidence.length === 2 &&
      multiEvidence[0].sourceLogId !== multiEvidence[1].sourceLogId &&
      multiEvidence[0].date === '2026-08-09' &&
      multiEvidence[1].date === '2026-08-09',
    details: 'Same-day Running and OHP logs produce 2 distinct session evidence items.'
  });

  return Object.freeze(results);
}
