/**
 * Controlled Validation Fixture for Workout Management V2 (CU3.5.2)
 *
 * IMPORTANT BOUNDARY DEFINITION:
 * This is NOT the complete or actual full Backup dataset (WorkoutBackup_v2.1_2026-08-16.json).
 * It contains a curated subset of 8 known workout sessions (2026-07-29 ~ 2026-08-12) used as
 * a deterministic, controlled regression fixture for domain validation.
 *
 * ZERO claim of representing the athlete's complete lifetime or full backup history.
 * ZERO production runtime dependency (validation and audit use only).
 */

import { ApplicationSnapshot, WorkoutLog } from '../../../types';
import { normalizeWorkoutLogSetRoles } from '../normalization/setRoleNormalization';
import { extractStandardStrengthObservationsFromWorkoutLog } from '../performance/strengthPerformanceObservation';
import { deriveEstimated1RMObservation } from '../performance/estimated1RMDerivation';
import { selectSessionPeakE1RMObservation } from '../performance/sessionPeakE1RMSelection';
import { deriveSetLoadVolumeObservation } from '../performance/loadVolumeDerivation';
import { aggregateSessionLoadVolume } from '../performance/sessionLoadVolumeAggregation';
import { deriveSessionWorkCapacityObservation } from '../performance/workCapacityObservation';
import { deriveRecordedSessionStressEvidence } from './recordedStressEvidence';
import { deriveStressMagnitudeInput } from './stressMagnitudeInputs';
import { StressMagnitudeInput, StrengthStressMagnitudeInput } from '../types/stressMagnitudeInput.types';

export const WORKOUT_CONTROLLED_VALIDATION_LOGS: readonly WorkoutLog[] = Object.freeze([
  // 0. 2026-02-14 Legacy Squat (4 sets: 60kg x 10, 60kg x 10, 80kg x 10, 80kg x 10, legacy unassigned set roles)
  {
    id: 'v1-log-2026-02-14-92',
    date: '2026-02-14',
    routineName: '스쿼트',
    notes: 'Legacy V1 import record with unassigned set roles',
    exercises: [
      {
        exerciseId: 'squat',
        exerciseName: '스쿼트 (Squat)',
        category: 'Legs',
        sets: [
          { id: 'v1-sq-1', weight: 60, reps: 10 },
          { id: 'v1-sq-2', weight: 60, reps: 10 },
          { id: 'v1-sq-3', weight: 80, reps: 10 },
          { id: 'v1-sq-4', weight: 80, reps: 10 }
        ]
      }
    ]
  },
  // 1. 2026-07-29 Bench Press (7 sets: 2 warmup, 5 working)
  {
    id: '4f1b2c3d-e5f6-47a8-9b0c-1d2e3f4a5b6c',
    date: '2026-07-29',
    startTime: '19:00',
    routineName: '벤치프레스',
    notes: '',
    exercises: [
      {
        exerciseId: 'bench-press',
        exerciseName: '벤치프레스 (Bench Press)',
        category: 'Chest',
        sets: [
          { id: 'bp2-w1', weight: 20, reps: 12, isWarmup: true },
          { id: 'bp2-w2', weight: 50, reps: 8, isWarmup: true },
          { id: 'bp2-s1', weight: 65, reps: 5, isWarmup: false },
          { id: 'bp2-s2', weight: 65, reps: 5, isWarmup: false },
          { id: 'bp2-s3', weight: 65, reps: 5, isWarmup: false },
          { id: 'bp2-s4', weight: 65, reps: 5, isWarmup: false },
          { id: 'bp2-s5', weight: 65, reps: 5, isWarmup: false }
        ]
      }
    ]
  },
  // 2. 2026-07-31 Squat (5 sets: 2 warmup, 3 working)
  {
    id: '70cbdc8a-605f-4423-89d3-155dbaeac482',
    date: '2026-07-31',
    startTime: '18:44',
    routineName: '하체 (Legs)',
    notes: '',
    exercises: [
      {
        exerciseId: 'squat',
        exerciseName: '스쿼트 (Squat)',
        category: 'Legs',
        sets: [
          { id: 'sq0-w1', weight: 60, reps: 10, isWarmup: true },
          { id: 'sq0-w2', weight: 80, reps: 8, isWarmup: true },
          { id: 'sq0-s1', weight: 110, reps: 5, isWarmup: false },
          { id: 'sq0-s2', weight: 100, reps: 5, isWarmup: false },
          { id: 'sq0-s3', weight: 100, reps: 5, isWarmup: false }
        ]
      }
    ]
  },
  // 3. 2026-08-02 OHP (7 sets: 2 warmup, 5 working) + Face Pull
  {
    id: '3a8f9e1d-4c2b-4567-89ab-cdef01234567',
    date: '2026-08-02',
    startTime: '16:30',
    routineName: 'OHP',
    notes: '',
    exercises: [
      {
        exerciseId: 'overhead-press',
        exerciseName: '오버헤드 프레스 (Overhead Press)',
        category: 'Shoulders',
        sets: [
          { id: 'ohp0-w1', weight: 20, reps: 12, isWarmup: true },
          { id: 'ohp0-w2', weight: 30, reps: 8, isWarmup: true },
          { id: 'ohp0-s1', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp0-s2', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp0-s3', weight: 45, reps: 5, isWarmup: false },
          { id: 'ohp0-s4', weight: 40, reps: 5, isWarmup: false },
          { id: 'ohp0-s5', weight: 40, reps: 5, isWarmup: false }
        ]
      },
      {
        exerciseId: 'face-pull',
        exerciseName: '페이스 풀 (Face Pull)',
        category: 'Shoulders',
        sets: [
          { id: 'fp0-1', weight: 20, reps: 15, isWarmup: false }
        ]
      }
    ]
  },
  // 4. 2026-08-05 Bench Press (7 sets: 2 warmup, 5 working)
  {
    id: '59c40332-959f-4318-910f-71da50937a01',
    date: '2026-08-05',
    startTime: '18:00',
    routineName: '벤치프레스',
    notes: '',
    exercises: [
      {
        exerciseId: 'bench-press',
        exerciseName: '벤치프레스 (Bench Press)',
        category: 'Chest',
        sets: [
          { id: 'bp1-w1', weight: 20, reps: 12, isWarmup: true },
          { id: 'bp1-w2', weight: 50, reps: 8, isWarmup: true },
          { id: 'bp1-s1', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp1-s2', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp1-s3', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp1-s4', weight: 70, reps: 5, isWarmup: false },
          { id: 'bp1-s5', weight: 70, reps: 5, isWarmup: false }
        ]
      }
    ]
  },
  // 5. 2026-08-07 Squat (7 sets: 2 warmup, 5 working) + Calf Raise
  {
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
  },
  // 6. 2026-08-09 Running (3km, 870s)
  {
    id: '19946e03-ae98-405d-97cc-6e03edffeb3c',
    date: '2026-08-09',
    startTime: '13:56',
    routineName: '야외 러닝',
    notes: '',
    exercises: [
      {
        exerciseId: 'v1-custom----11',
        exerciseName: '야외 러닝',
        category: 'Cardio',
        sets: [
          {
            id: 'run1',
            weight: 3,
            reps: 870,
            distanceKm: 3,
            timeSeconds: 870,
            isWarmup: false
          }
        ]
      }
    ]
  },
  // 7. 2026-08-09 OHP (9 sets: 2 warmup, 7 working) + Face Pull + Lateral Raise + Plank
  {
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
  },
  // 8. 2026-08-12 Bench Press (10 sets: 4 warmup, 6 working) + Incline DB Press + DB Pullover
  {
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
  }
]);

export const CONTROLLED_VALIDATION_SNAPSHOT: ApplicationSnapshot = Object.freeze({
  version: '2.1-controlled-fixture',
  exportedAt: '2026-08-16T00:00:00.000Z',
  metadata: {
    appName: 'Workout Management System (Controlled Validation Fixture)',
    snapshotType: 'application',
    schemaVersion: 1,
    statistics: {
      workoutCount: WORKOUT_CONTROLLED_VALIDATION_LOGS.length, // 9 fixture logs (8 standard + 1 legacy V1)
      exerciseCount: 16,
      setCount: 69,
      weightCount: 0
    },
    healthScore: 100
  },
  workoutLogs: [...WORKOUT_CONTROLLED_VALIDATION_LOGS],
  weightLogs: [],
  routines: [],
  exercises: []
});

/**
 * Derives the candidate pool of StressMagnitudeInput objects from the controlled validation fixture (9 logs).
 * Uses frozen CU2 and CU3.3 derivation pipelines for deterministic domain regression testing.
 *
 * NOTE: This is a controlled fixture derivation, NOT a full-backup derivation.
 */
export function deriveControlledCandidateStressMagnitudeInputs(): readonly StressMagnitudeInput[] {
  const inputs: StressMagnitudeInput[] = [];

  for (const log of WORKOUT_CONTROLLED_VALIDATION_LOGS) {
    const evBundle = deriveRecordedSessionStressEvidence(log);
    const norm = normalizeWorkoutLogSetRoles(log);
    const allObs = extractStandardStrengthObservationsFromWorkoutLog(log, norm);

    for (const exEv of evBundle.exercises) {
      if (exEv.kind === 'running') {
        const res = deriveStressMagnitudeInput(exEv);
        if (res.status === 'input-ready') {
          inputs.push(res.input);
        }
      } else {
        const exObs = allObs.filter(o => o.exerciseId === exEv.exerciseId);
        const peakE1RM = selectSessionPeakE1RMObservation(exObs.map(deriveEstimated1RMObservation).filter(Boolean));
        const loadVolume = aggregateSessionLoadVolume(exObs.map(deriveSetLoadVolumeObservation).filter(Boolean));
        const workCapacity = deriveSessionWorkCapacityObservation(exObs);
        const res = deriveStressMagnitudeInput(exEv, { peakE1RM, loadVolume, workCapacity });
        if (res.status === 'input-ready') {
          inputs.push(res.input);
        }
      }
    }
  }

  return Object.freeze(inputs);
}

/**
 * Derives only the strength modality StressMagnitudeInput objects from the controlled validation fixture.
 */
export function deriveControlledStrengthStressMagnitudeInputs(): readonly StrengthStressMagnitudeInput[] {
  const all = deriveControlledCandidateStressMagnitudeInputs();
  return Object.freeze(all.filter((i): i is StrengthStressMagnitudeInput => i.kind === 'strength'));
}
