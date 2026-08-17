/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RecordedExerciseStressEvidence,
  RecordedStrengthStressEvidence,
  RecordedRunningStressEvidence
} from '../types/stressEvidence.types';
import { SessionPeakE1RMObservation } from '../types/sessionPeakE1RM.types';
import { SessionLoadVolumeObservation } from '../types/sessionLoadVolume.types';
import { SessionWorkCapacityObservation } from '../types/workCapacity.types';
import { PerformanceObservationInterpretability } from '../types/performanceInterpretability.types';
import {
  StressMagnitudeInputResult,
  StrengthStressMagnitudeInput,
  RunningStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';

/**
 * Optional bundle of CU2 Performance Observations for a single Strength exercise session.
 */
export interface StrengthPerformanceFactsBundle {
  readonly peakE1RM?: SessionPeakE1RMObservation;
  readonly loadVolume?: SessionLoadVolumeObservation;
  readonly workCapacity?: SessionWorkCapacityObservation;
  readonly interpretability?: PerformanceObservationInterpretability;
}

/**
 * Validates that an observation shares identical identity (sourceLogId, exerciseId, date) with the stress evidence.
 */
function assertMatchingIdentity(
  evidence: RecordedStrengthStressEvidence,
  observation: { readonly sourceLogId: string; readonly exerciseId: string; readonly date: string },
  observationType: string
): void {
  if (observation.sourceLogId !== evidence.sourceLogId) {
    throw new Error(
      `Contract violation in ${observationType}: sourceLogId mismatch. Evidence=${evidence.sourceLogId}, Observation=${observation.sourceLogId}`
    );
  }
  if (observation.exerciseId !== evidence.exerciseId) {
    throw new Error(
      `Contract violation in ${observationType}: exerciseId mismatch. Evidence=${evidence.exerciseId}, Observation=${observation.exerciseId}`
    );
  }
  if (observation.date !== evidence.date) {
    throw new Error(
      `Contract violation in ${observationType}: date mismatch. Evidence=${evidence.date}, Observation=${observation.date}`
    );
  }
}

/**
 * Projects a RecordedStrengthStressEvidence and optional CU2 facts into a StrengthStressMagnitudeInput.
 * 
 * Strict Invariants:
 * - Does NOT compute stress scores, tonnage magnitude, or relative percentages.
 * - Enforces identity match (sourceLogId, exerciseId, date) between evidence and performance facts.
 * - Preserves high vs. limited provenance and set roles without alteration.
 */
export function deriveStrengthStressMagnitudeInput(
  evidence: RecordedStrengthStressEvidence,
  facts?: StrengthPerformanceFactsBundle
): StressMagnitudeInputResult {
  const { performanceEvidenceAvailable } = evidence;

  // Basic availability check: must have at least one set recorded
  if (performanceEvidenceAvailable.totalRawSetCount <= 0) {
    return Object.freeze({
      status: 'input-insufficient',
      sourceLogId: evidence.sourceLogId,
      exerciseId: evidence.exerciseId,
      exerciseName: evidence.exerciseName,
      reason: 'No raw sets recorded for strength exercise'
    });
  }

  // Validate identity and consistency if facts are supplied
  if (facts?.peakE1RM) {
    if (!performanceEvidenceAvailable.hasEstimated1RM) {
      throw new Error(
        `Contract violation: peakE1RM supplied but performanceEvidenceAvailable.hasEstimated1RM is false for ${evidence.exerciseId}`
      );
    }
    assertMatchingIdentity(evidence, facts.peakE1RM, 'SessionPeakE1RMObservation');
  }
  if (facts?.loadVolume) {
    if (!performanceEvidenceAvailable.hasLoadVolume) {
      throw new Error(
        `Contract violation: loadVolume supplied but performanceEvidenceAvailable.hasLoadVolume is false for ${evidence.exerciseId}`
      );
    }
    assertMatchingIdentity(evidence, facts.loadVolume, 'SessionLoadVolumeObservation');
  }
  if (facts?.workCapacity) {
    if (!performanceEvidenceAvailable.hasWorkCapacity) {
      throw new Error(
        `Contract violation: workCapacity supplied but performanceEvidenceAvailable.hasWorkCapacity is false for ${evidence.exerciseId}`
      );
    }
    assertMatchingIdentity(evidence, facts.workCapacity, 'SessionWorkCapacityObservation');
  }
  if (facts?.interpretability) {
    assertMatchingIdentity(evidence, facts.interpretability, 'PerformanceObservationInterpretability');
  }

  // Construct e1RM input projection
  const e1RMEvidence = facts?.peakE1RM
    ? Object.freeze({
        numericalPeakEstimated1RMKg: facts.peakE1RM.numericalPeakEstimated1RMKg,
        selectedPeakEstimated1RMKg: facts.peakE1RM.selectedPeakEstimated1RMKg,
        selectedEvidenceQuality: facts.peakE1RM.selectedEvidenceQuality
      })
    : undefined;

  // Construct Load-Volume input projection
  const loadVolumeEvidence = facts?.loadVolume
    ? Object.freeze({
        totalLoadVolumeKgReps: facts.loadVolume.totalLoadVolumeKgReps,
        highEvidenceLoadVolumeKgReps: facts.loadVolume.highEvidenceLoadVolumeKgReps,
        limitedEvidenceLoadVolumeKgReps: facts.loadVolume.limitedEvidenceLoadVolumeKgReps,
        observationCount: facts.loadVolume.observationCount
      })
    : undefined;

  // Construct Work-Capacity input projection
  const workCapacityEvidence = facts?.workCapacity
    ? Object.freeze({
        totalSetCount: facts.workCapacity.totalSetCount,
        totalReps: facts.workCapacity.totalReps,
        loadGroups: Object.freeze(
          facts.workCapacity.loadObservations.map((lo) =>
            Object.freeze({
              observedLoadKg: lo.observedLoadKg,
              setCount: lo.setCount,
              repsSeries: Object.freeze([...lo.repsSeries]),
              totalRepsAtLoad: lo.totalRepsAtLoad,
              highEvidenceSetCount: lo.highEvidenceSetCount,
              limitedEvidenceSetCount: lo.limitedEvidenceSetCount
            })
          )
        )
      })
    : undefined;

  // Construct Interpretability input projection
  const interpretability = facts?.interpretability
    ? Object.freeze({
        chronologyInterpretability: facts.interpretability.chronologyInterpretability,
        contextCompleteness: facts.interpretability.contextCompleteness,
        hasOtherSameDayWorkoutLogs: facts.interpretability.hasOtherSameDayWorkoutLogs,
        hasOtherExercisesInWorkoutLog: facts.interpretability.hasOtherExercisesInWorkoutLog
      })
    : undefined;

  const input: StrengthStressMagnitudeInput = Object.freeze({
    kind: 'strength',
    sourceLogId: evidence.sourceLogId,
    date: evidence.date,
    startTime: evidence.startTime,
    exerciseId: evidence.exerciseId,
    exerciseName: evidence.exerciseName,
    category: evidence.category,
    dimensions: Object.freeze([...evidence.dimensions]),
    setEvidence: Object.freeze({
      totalRawSetCount: performanceEvidenceAvailable.totalRawSetCount,
      explicitWorkingSetCount: performanceEvidenceAvailable.explicitWorkingSetCount,
      unknownSetRoleCount: performanceEvidenceAvailable.unknownSetRoleCount,
      explicitWarmupCount: performanceEvidenceAvailable.explicitWarmupCount
    }),
    e1RMEvidence,
    loadVolumeEvidence,
    workCapacityEvidence,
    interpretability
  });

  return Object.freeze({
    status: 'input-ready',
    input
  });
}

/**
 * Projects a RecordedRunningStressEvidence into a RunningStressMagnitudeInput.
 * 
 * Strict Invariants:
 * - Uses only CU1 canonical running metrics.
 * - Does NOT compute pace scores or fatigue values.
 * - Preserves provenance and legacy conflict flags without alteration.
 * - Permits partial observations (e.g. distance only or duration only).
 */
export function deriveRunningStressMagnitudeInput(
  evidence: RecordedRunningStressEvidence
): StressMagnitudeInputResult {
  const { runningMetrics } = evidence;

  // Check if at least one valid observation channel exists for running
  const hasValidDistance =
    typeof runningMetrics.distanceKm === 'number' &&
    Number.isFinite(runningMetrics.distanceKm) &&
    runningMetrics.distanceKm > 0;
  const hasValidDuration =
    typeof runningMetrics.durationSeconds === 'number' &&
    Number.isFinite(runningMetrics.durationSeconds) &&
    runningMetrics.durationSeconds > 0;

  if (!hasValidDistance && !hasValidDuration) {
    return Object.freeze({
      status: 'input-insufficient',
      sourceLogId: evidence.sourceLogId,
      exerciseId: evidence.exerciseId,
      exerciseName: evidence.exerciseName,
      reason: 'No valid positive distance or duration observed for running session'
    });
  }

  const input: RunningStressMagnitudeInput = Object.freeze({
    kind: 'running',
    sourceLogId: evidence.sourceLogId,
    date: evidence.date,
    startTime: evidence.startTime,
    exerciseId: evidence.exerciseId,
    exerciseName: evidence.exerciseName,
    dimensions: Object.freeze([...evidence.dimensions]),
    distanceKm: runningMetrics.distanceKm,
    durationSeconds: runningMetrics.durationSeconds,
    paceSecondsPerKm: runningMetrics.paceSecondsPerKm,
    metricProvenance: Object.freeze({
      distanceProvenance: runningMetrics.provenance.distance,
      durationProvenance: runningMetrics.provenance.duration,
      distanceLegacyConflict: runningMetrics.provenance.distanceLegacyConflict,
      durationLegacyConflict: runningMetrics.provenance.durationLegacyConflict,
      hasLegacyConflict: runningMetrics.provenance.hasLegacyConflict,
      sourceConfidence: runningMetrics.sourceConfidence
    })
  });

  return Object.freeze({
    status: 'input-ready',
    input
  });
}

/**
 * Universal projection entry point from any RecordedExerciseStressEvidence to a StressMagnitudeInputResult.
 */
export function deriveStressMagnitudeInput(
  evidence: RecordedExerciseStressEvidence,
  strengthFacts?: StrengthPerformanceFactsBundle
): StressMagnitudeInputResult {
  if (evidence.kind === 'unmapped') {
    return Object.freeze({
      status: 'unmapped',
      sourceLogId: evidence.sourceLogId,
      exerciseId: evidence.exerciseId,
      exerciseName: evidence.exerciseName,
      reason: evidence.unmappedReason || 'Exercise is not mapped to any stress profile'
    });
  }

  if (evidence.kind === 'running') {
    return deriveRunningStressMagnitudeInput(evidence);
  }

  if (evidence.kind === 'strength') {
    return deriveStrengthStressMagnitudeInput(evidence, strengthFacts);
  }

  throw new Error(`Unhandled stress evidence kind: ${(evidence as any).kind}`);
}

/**
 * Audit result interface for CU3.3 validation suite.
 */
export interface StressMagnitudeInputAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}

/**
 * Comprehensive programmatic audit suite for CU3.3 Stress Magnitude Input Contract.
 */
export function auditStressMagnitudeInputs(): readonly StressMagnitudeInputAuditResult[] {
  const results: StressMagnitudeInputAuditResult[] = [];

  // 1. REAL Sample A: 2026-08-07 Squat Full Input Contract
  const realSquatEvidence: RecordedStrengthStressEvidence = {
    kind: 'strength',
    sourceLogId: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
    date: '2026-08-07',
    startTime: '18:21',
    exerciseId: 'squat',
    exerciseName: '스쿼트 (Squat)',
    category: 'Legs',
    mappingStatus: 'mapped',
    dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
    performanceEvidenceAvailable: {
      hasEstimated1RM: true,
      hasLoadVolume: true,
      hasWorkCapacity: true,
      eligibleObservationCount: 7,
      totalRawSetCount: 7,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 2
    }
  };

  const realSquatFacts: StrengthPerformanceFactsBundle = {
    peakE1RM: {
      sourceLogId: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
      date: '2026-08-07',
      startTime: '18:21',
      exerciseId: 'squat',
      exerciseName: '스쿼트 (Squat)',
      numericalPeakEstimated1RMKg: 128.333,
      numericalPeakObservations: [],
      selectedPeakEstimated1RMKg: 128.333,
      selectedEvidenceQuality: 'high',
      selectedPeakObservations: []
    },
    loadVolume: {
      sourceLogId: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
      date: '2026-08-07',
      startTime: '18:21',
      exerciseId: 'squat',
      exerciseName: '스쿼트 (Squat)',
      totalLoadVolumeKgReps: 2395,
      highEvidenceLoadVolumeKgReps: 2395,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5,
      highEvidenceObservationCount: 5,
      limitedEvidenceObservationCount: 0,
      observations: []
    },
    workCapacity: {
      sourceLogId: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
      date: '2026-08-07',
      startTime: '18:21',
      exerciseId: 'squat',
      exerciseName: '스쿼트 (Squat)',
      category: 'Legs',
      totalSetCount: 5,
      totalReps: 23,
      loadObservations: [
        {
          observedLoadKg: 115,
          firstSetIndex: 2,
          setCount: 1,
          repsSeries: [3],
          totalRepsAtLoad: 3,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 3,
          limitedEvidenceReps: 0,
          observations: []
        },
        {
          observedLoadKg: 110,
          firstSetIndex: 3,
          setCount: 1,
          repsSeries: [5],
          totalRepsAtLoad: 5,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 5,
          limitedEvidenceReps: 0,
          observations: []
        },
        {
          observedLoadKg: 100,
          firstSetIndex: 4,
          setCount: 3,
          repsSeries: [5, 5, 5],
          totalRepsAtLoad: 15,
          highEvidenceSetCount: 3,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 15,
          limitedEvidenceReps: 0,
          observations: []
        }
      ]
    }
  };

  const squatRes = deriveStressMagnitudeInput(realSquatEvidence, realSquatFacts);
  results.push({
    auditName: 'REAL Squat (2026-08-07 working 5, e1RM, volume, work capacity preserved)',
    passed:
      squatRes.status === 'input-ready' &&
      squatRes.input.kind === 'strength' &&
      squatRes.input.setEvidence.explicitWorkingSetCount === 5 &&
      squatRes.input.setEvidence.explicitWarmupCount === 2 &&
      squatRes.input.e1RMEvidence?.selectedPeakEstimated1RMKg === 128.333 &&
      squatRes.input.loadVolumeEvidence?.totalLoadVolumeKgReps === 2395 &&
      squatRes.input.workCapacityEvidence?.loadGroups.length === 3 &&
      squatRes.input.dimensions.length === 3,
    details: 'Squat input contract preserves working/warmup sets, e1RM, load-volume, and load-group reps series without magnitude computation.'
  });

  // 2. REAL Sample B: 2026-08-09 Running Full Input Contract
  const realRunningEvidence: RecordedRunningStressEvidence = {
    kind: 'running',
    sourceLogId: '19946e03-ae98-405d-97cc-6e03edffeb3c',
    date: '2026-08-09',
    startTime: '13:56',
    exerciseId: 'v1-custom----11',
    exerciseName: '야외 러닝',
    mappingStatus: 'mapped',
    dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
    runningMetrics: {
      distanceKm: 3,
      durationSeconds: 870,
      paceSecondsPerKm: 290,
      sourceFormat: 'explicit-cardio-fields',
      provenance: {
        distance: 'explicit',
        duration: 'explicit',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false
      },
      sourceConfidence: 'high',
      runIntent: 'unknown'
    }
  };

  const runningRes = deriveStressMagnitudeInput(realRunningEvidence);
  results.push({
    auditName: 'REAL Running (2026-08-09 3km, 870s, 290s/km canonical metrics and provenance)',
    passed:
      runningRes.status === 'input-ready' &&
      runningRes.input.kind === 'running' &&
      runningRes.input.distanceKm === 3 &&
      runningRes.input.durationSeconds === 870 &&
      runningRes.input.paceSecondsPerKm === 290 &&
      runningRes.input.metricProvenance.distanceProvenance === 'explicit' &&
      runningRes.input.dimensions.includes('knee-dominant-lower-body') &&
      !runningRes.input.dimensions.includes('axial-systemic-loading'),
    details: 'Running input contract preserves canonical distance/duration/pace and provenance without axial load or strength cross-wiring.'
  });

  // 3. REAL Sample C: 2026-08-09 OHP Full Input Contract
  const realOHPEvidence: RecordedStrengthStressEvidence = {
    kind: 'strength',
    sourceLogId: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
    date: '2026-08-09',
    startTime: '15:56',
    exerciseId: 'overhead-press',
    exerciseName: '오버헤드 프레스 (Overhead Press)',
    category: 'Shoulders',
    mappingStatus: 'mapped',
    dimensions: ['vertical-push', 'axial-systemic-loading'],
    performanceEvidenceAvailable: {
      hasEstimated1RM: true,
      hasLoadVolume: true,
      hasWorkCapacity: true,
      eligibleObservationCount: 9,
      totalRawSetCount: 9,
      explicitWorkingSetCount: 7,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 2
    }
  };

  const ohpFacts: StrengthPerformanceFactsBundle = {
    peakE1RM: {
      sourceLogId: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
      date: '2026-08-09',
      startTime: '15:56',
      exerciseId: 'overhead-press',
      exerciseName: '오버헤드 프레스 (Overhead Press)',
      numericalPeakEstimated1RMKg: 58.333,
      numericalPeakObservations: [],
      selectedPeakEstimated1RMKg: 58.333,
      selectedEvidenceQuality: 'high',
      selectedPeakObservations: []
    },
    loadVolume: {
      sourceLogId: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
      date: '2026-08-09',
      startTime: '15:56',
      exerciseId: 'overhead-press',
      exerciseName: '오버헤드 프레스 (Overhead Press)',
      totalLoadVolumeKgReps: 1575,
      highEvidenceLoadVolumeKgReps: 1575,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 7,
      highEvidenceObservationCount: 7,
      limitedEvidenceObservationCount: 0,
      observations: []
    },
    workCapacity: {
      sourceLogId: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
      date: '2026-08-09',
      startTime: '15:56',
      exerciseId: 'overhead-press',
      exerciseName: '오버헤드 프레스 (Overhead Press)',
      category: 'Shoulders',
      totalSetCount: 7,
      totalReps: 35,
      loadObservations: [
        {
          observedLoadKg: 50,
          firstSetIndex: 2,
          setCount: 2,
          repsSeries: [5, 5],
          totalRepsAtLoad: 10,
          highEvidenceSetCount: 2,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 10,
          limitedEvidenceReps: 0,
          observations: []
        },
        {
          observedLoadKg: 45,
          firstSetIndex: 4,
          setCount: 3,
          repsSeries: [5, 5, 5],
          totalRepsAtLoad: 15,
          highEvidenceSetCount: 3,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 15,
          limitedEvidenceReps: 0,
          observations: []
        },
        {
          observedLoadKg: 40,
          firstSetIndex: 7,
          setCount: 2,
          repsSeries: [5, 5],
          totalRepsAtLoad: 10,
          highEvidenceSetCount: 2,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 10,
          limitedEvidenceReps: 0,
          observations: []
        }
      ]
    }
  };

  const ohpRes = deriveStressMagnitudeInput(realOHPEvidence, ohpFacts);
  results.push({
    auditName: 'REAL OHP (2026-08-09 working 7, vertical-push & axial dimensions)',
    passed:
      ohpRes.status === 'input-ready' &&
      ohpRes.input.kind === 'strength' &&
      ohpRes.input.setEvidence.explicitWorkingSetCount === 7 &&
      ohpRes.input.setEvidence.explicitWarmupCount === 2 &&
      ohpRes.input.dimensions.includes('vertical-push') &&
      ohpRes.input.dimensions.includes('axial-systemic-loading') &&
      ohpRes.input.e1RMEvidence?.selectedPeakEstimated1RMKg === 58.333 &&
      ohpRes.input.loadVolumeEvidence?.totalLoadVolumeKgReps === 1575 &&
      ohpRes.input.workCapacityEvidence?.totalReps === 35,
    details: 'OHP preserves 7 working sets and vertical-push + axial dimensions.'
  });

  // 4. REAL Sample D: 2026-08-12 Bench Press Full Input Contract
  const realBenchEvidence: RecordedStrengthStressEvidence = {
    kind: 'strength',
    sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
    date: '2026-08-12',
    startTime: '18:21',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    mappingStatus: 'mapped',
    dimensions: ['horizontal-push'],
    performanceEvidenceAvailable: {
      hasEstimated1RM: true,
      hasLoadVolume: true,
      hasWorkCapacity: true,
      eligibleObservationCount: 10,
      totalRawSetCount: 10,
      explicitWorkingSetCount: 6,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 4
    }
  };

  const benchFacts: StrengthPerformanceFactsBundle = {
    peakE1RM: {
      sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
      date: '2026-08-12',
      startTime: '18:21',
      exerciseId: 'bench-press',
      exerciseName: '벤치프레스 (Bench Press)',
      numericalPeakEstimated1RMKg: 81.666,
      numericalPeakObservations: [],
      selectedPeakEstimated1RMKg: 81.666,
      selectedEvidenceQuality: 'high',
      selectedPeakObservations: []
    },
    loadVolume: {
      sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
      date: '2026-08-12',
      startTime: '18:21',
      exerciseId: 'bench-press',
      exerciseName: '벤치프레스 (Bench Press)',
      totalLoadVolumeKgReps: 1830,
      highEvidenceLoadVolumeKgReps: 1830,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 6,
      highEvidenceObservationCount: 6,
      limitedEvidenceObservationCount: 0,
      observations: []
    },
    workCapacity: {
      sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
      date: '2026-08-12',
      startTime: '18:21',
      exerciseId: 'bench-press',
      exerciseName: '벤치프레스 (Bench Press)',
      category: 'Chest',
      totalSetCount: 6,
      totalReps: 26,
      loadObservations: [
        {
          observedLoadKg: 80,
          firstSetIndex: 4,
          setCount: 1,
          repsSeries: [1],
          totalRepsAtLoad: 1,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 1,
          limitedEvidenceReps: 0,
          observations: []
        },
        {
          observedLoadKg: 70,
          firstSetIndex: 5,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0,
          highEvidenceReps: 25,
          limitedEvidenceReps: 0,
          observations: []
        }
      ]
    }
  };

  const benchRes = deriveStressMagnitudeInput(realBenchEvidence, benchFacts);
  results.push({
    auditName: 'REAL Bench Press (2026-08-12 working 6, warmup 4, horizontal-push)',
    passed:
      benchRes.status === 'input-ready' &&
      benchRes.input.kind === 'strength' &&
      benchRes.input.setEvidence.explicitWorkingSetCount === 6 &&
      benchRes.input.setEvidence.explicitWarmupCount === 4 &&
      benchRes.input.dimensions.includes('horizontal-push') &&
      !benchRes.input.dimensions.includes('vertical-push') &&
      benchRes.input.e1RMEvidence?.selectedPeakEstimated1RMKg === 81.666 &&
      benchRes.input.loadVolumeEvidence?.totalLoadVolumeKgReps === 1830 &&
      benchRes.input.workCapacityEvidence?.totalReps === 26,
    details: 'Bench Press preserves 6 working sets and horizontal-push dimension.'
  });

  // 5. Synthetic High-Rep Without e1RM (e.g. 50kg x 30 reps)
  const highRepEvidence: RecordedStrengthStressEvidence = {
    kind: 'strength',
    sourceLogId: 'synth-high-rep-1',
    date: '2026-08-16',
    exerciseId: 'leg-press',
    exerciseName: '레그 프레스 (Leg Press)',
    mappingStatus: 'mapped',
    dimensions: ['knee-dominant-lower-body'],
    performanceEvidenceAvailable: {
      hasEstimated1RM: false, // 30 reps ineligible for e1RM formula (1-10 reps)
      hasLoadVolume: true,
      hasWorkCapacity: true,
      eligibleObservationCount: 1,
      totalRawSetCount: 1,
      explicitWorkingSetCount: 1,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    }
  };

  const highRepFacts: StrengthPerformanceFactsBundle = {
    loadVolume: {
      sourceLogId: 'synth-high-rep-1',
      date: '2026-08-16',
      exerciseId: 'leg-press',
      exerciseName: '레그 프레스 (Leg Press)',
      totalLoadVolumeKgReps: 1500,
      highEvidenceLoadVolumeKgReps: 1500,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 1,
      highEvidenceObservationCount: 1,
      limitedEvidenceObservationCount: 0,
      observations: []
    }
  };

  const highRepRes = deriveStressMagnitudeInput(highRepEvidence, highRepFacts);
  results.push({
    auditName: 'Synthetic High-rep Set without e1RM (Input-Ready with volume and no e1RM failure)',
    passed:
      highRepRes.status === 'input-ready' &&
      highRepRes.input.kind === 'strength' &&
      highRepRes.input.e1RMEvidence === undefined &&
      highRepRes.input.loadVolumeEvidence?.totalLoadVolumeKgReps === 1500,
    details: 'Absence of e1RM on high-rep set does not discard input; volume and set evidence are preserved.'
  });

  // 6. Synthetic Legacy Unknown-set-role (Limited provenance preserved without upgrade)
  const legacyEvidence: RecordedStrengthStressEvidence = {
    kind: 'strength',
    sourceLogId: 'synth-legacy-1',
    date: '2026-08-16',
    exerciseId: 'lat-pulldown',
    exerciseName: '랫 풀다운 (Lat Pulldown)',
    mappingStatus: 'mapped',
    dimensions: ['vertical-pull'],
    performanceEvidenceAvailable: {
      hasEstimated1RM: true,
      hasLoadVolume: true,
      hasWorkCapacity: true,
      eligibleObservationCount: 3,
      totalRawSetCount: 3,
      explicitWorkingSetCount: 0,
      unknownSetRoleCount: 3,
      explicitWarmupCount: 0
    }
  };

  const legacyFacts: StrengthPerformanceFactsBundle = {
    peakE1RM: {
      sourceLogId: 'synth-legacy-1',
      date: '2026-08-16',
      exerciseId: 'lat-pulldown',
      exerciseName: '랫 풀다운 (Lat Pulldown)',
      numericalPeakEstimated1RMKg: 70,
      numericalPeakObservations: [],
      selectedPeakEstimated1RMKg: 70,
      selectedEvidenceQuality: 'limited',
      selectedPeakObservations: []
    }
  };

  const legacyRes = deriveStressMagnitudeInput(legacyEvidence, legacyFacts);
  results.push({
    auditName: 'Synthetic Legacy Unknown-role Sets (Limited provenance preserved)',
    passed:
      legacyRes.status === 'input-ready' &&
      legacyRes.input.kind === 'strength' &&
      legacyRes.input.setEvidence.unknownSetRoleCount === 3 &&
      legacyRes.input.setEvidence.explicitWorkingSetCount === 0 &&
      legacyRes.input.e1RMEvidence?.selectedEvidenceQuality === 'limited',
    details: 'Legacy unknown set roles preserve limited evidence quality without artificial promotion or demotion.'
  });

  // 7. Synthetic Unmapped Exercise Handling
  const unmappedEvidence: RecordedExerciseStressEvidence = {
    kind: 'unmapped',
    sourceLogId: 'synth-unmapped-1',
    date: '2026-08-16',
    exerciseId: 'weird-flying-drill',
    exerciseName: '특이한 운동',
    mappingStatus: 'unmapped',
    dimensions: [],
    unmappedReason: 'Exercise not registered in canonical stress profile database'
  };

  const unmappedRes = deriveStressMagnitudeInput(unmappedEvidence);
  results.push({
    auditName: 'Synthetic Unmapped Exercise (Explicit unmapped result without fake input)',
    passed:
      unmappedRes.status === 'unmapped' &&
      unmappedRes.exerciseId === 'weird-flying-drill',
    details: 'Unmapped exercise produces explicit unmapped result status and does not generate fake magnitude input.'
  });

  // 8. Synthetic Running with Legacy Fallback Metric Source
  const runningFallbackEvidence: RecordedRunningStressEvidence = {
    kind: 'running',
    sourceLogId: 'synth-run-fallback-1',
    date: '2026-08-16',
    exerciseId: 'running',
    exerciseName: '트레드밀 러닝',
    mappingStatus: 'mapped',
    dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
    runningMetrics: {
      distanceKm: 5,
      durationSeconds: 1500,
      paceSecondsPerKm: 300,
      sourceFormat: 'legacy-weight-reps',
      provenance: {
        distance: 'legacy',
        duration: 'explicit',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false
      },
      sourceConfidence: 'high',
      runIntent: 'unknown'
    }
  };

  const runningFallbackRes = deriveStressMagnitudeInput(runningFallbackEvidence);
  results.push({
    auditName: 'Synthetic Running Legacy Fallback (Input-Ready with legacy-fallback provenance)',
    passed:
      runningFallbackRes.status === 'input-ready' &&
      runningFallbackRes.input.kind === 'running' &&
      runningFallbackRes.input.metricProvenance.distanceProvenance === 'legacy' &&
      runningFallbackRes.input.metricProvenance.durationProvenance === 'explicit',
    details: 'Legacy fallback running metric is accepted with provenance preserved.'
  });

  // 9. Contract Violation Guard: Mismatched sourceLogId
  let mismatchCaught = false;
  try {
    const mismatchedFacts: StrengthPerformanceFactsBundle = {
      peakE1RM: {
        sourceLogId: 'completely-different-log-id',
        date: '2026-08-07',
        exerciseId: 'squat',
        exerciseName: '스쿼트 (Squat)',
        numericalPeakEstimated1RMKg: 100,
        numericalPeakObservations: [],
        selectedPeakEstimated1RMKg: 100,
        selectedEvidenceQuality: 'high',
        selectedPeakObservations: []
      }
    };
    deriveStressMagnitudeInput(realSquatEvidence, mismatchedFacts);
  } catch (err: any) {
    mismatchCaught = err.message.includes('Contract violation');
  }

  results.push({
    auditName: 'Contract Violation Guard (Cross-session ID mismatch throws error)',
    passed: mismatchCaught,
    details: 'Mismatch between stress evidence sourceLogId and CU2 performance fact sourceLogId strictly triggers contract error.'
  });

  // 10. Contract Violation Guard: Object supplied when flag is false
  let flagMismatchCaught = false;
  try {
    const invalidFacts: StrengthPerformanceFactsBundle = {
      peakE1RM: {
        sourceLogId: 'synth-high-rep-1',
        date: '2026-08-16',
        exerciseId: 'leg-press',
        exerciseName: '레그 프레스 (Leg Press)',
        numericalPeakEstimated1RMKg: 100,
        numericalPeakObservations: [],
        selectedPeakEstimated1RMKg: 100,
        selectedEvidenceQuality: 'high',
        selectedPeakObservations: []
      }
    };
    // highRepEvidence has hasEstimated1RM: false!
    deriveStressMagnitudeInput(highRepEvidence, invalidFacts);
  } catch (err: any) {
    flagMismatchCaught = err.message.includes('Contract violation');
  }

  results.push({
    auditName: 'Contract Violation Guard (Object supplied when availability flag is false)',
    passed: flagMismatchCaught,
    details: 'Supplying e1RM object when evidence states hasEstimated1RM is false triggers contract error.'
  });

  return Object.freeze(results);
}
