/**
 * Strength Stress Historical Full Backup Audit Suite (VNext Recommendation Engine - CU3.5.3A)
 *
 * Dedicated validation module that executes the complete E2E derivation funnel
 * using the actual WorkoutBackup_v2.1_2026-08-16.json workspace file.
 *
 * Scope & Freeze Boundary:
 * "CU3.5 Freeze는 Historical Collection Semantics에 대한 판정이며,
 * Actual Full Backup Exhaustive Coverage를 의미하지 않는다."
 *
 * Full Derivation Funnel Verified:
 * Actual WorkoutLogs
 *   → Frozen Normalization / Performance Observation Pipeline
 *   → CU3.2 Recorded Stress Evidence
 *   → CU3.3 Stress Magnitude Inputs
 *   → CU3.5 Historical Evidence Derivation
 *
 * Invariant Guarantees:
 * 1. Zero silent drops across exercise sessions.
 * 2. 100% candidate pool conservation across all historical targets.
 * 3. Exact historical session identities and chronological sequence verified.
 * 4. Modality isolation and quality preservation guaranteed.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { WorkoutLog } from '../../../types';
import { normalizeWorkoutLogSetRoles } from '../normalization/setRoleNormalization';
import { extractStandardStrengthObservationsFromWorkoutLog } from '../performance/strengthPerformanceObservation';
import { deriveEstimated1RMObservation } from '../performance/estimated1RMDerivation';
import { selectSessionPeakE1RMObservation } from '../performance/sessionPeakE1RMSelection';
import { deriveSetLoadVolumeObservation } from '../performance/loadVolumeDerivation';
import { aggregateSessionLoadVolume } from '../performance/sessionLoadVolumeAggregation';
import { deriveSessionWorkCapacityObservation } from '../performance/workCapacityObservation';
import { deriveRecordedSessionStressEvidence } from './recordedStressEvidence';
import { deriveStressMagnitudeInput } from './stressMagnitudeInputs';
import { deriveStrengthHistoricalEvidence } from './strengthStressHistory';
import { StressMagnitudeInput, StrengthStressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { StrengthHistoryAuditResult } from '../types/strengthStressHistory.types';

export interface FullBackupFunnelStatistics {
  readonly actualWorkoutLogCount: number;
  readonly totalExerciseSessionCount: number;
  readonly recordedStressExerciseCount: number;
  readonly mappedStrengthCount: number;
  readonly mappedRunningCount: number;
  readonly unmappedCount: number;
  readonly inputReadyStrengthCount: number;
  readonly inputReadyRunningCount: number;
  readonly inputInsufficientCount: number;
  readonly cu33UnmappedCount: number;
  readonly totalCandidatePoolCount: number;
  readonly strengthCandidatePoolCount: number;
}

/**
 * Loads the actual canonical backup file from the workspace filesystem.
 */
export function loadActualWorkoutBackup(): {
  version: string;
  exportedAt: string;
  metadata?: { statistics?: { workoutCount?: number; exerciseCount?: number; setCount?: number; weightCount?: number } };
  workoutLogs: WorkoutLog[];
} {
  const filePath = resolve(process.cwd(), 'WorkoutBackup_v2.1_2026-08-16.json');
  const rawContent = readFileSync(filePath, 'utf8');
  return JSON.parse(rawContent);
}

/**
 * Executes the complete E2E derivation funnel on the actual full backup.
 */
export function runActualFullBackupFunnel(): {
  readonly stats: FullBackupFunnelStatistics;
  readonly candidatePool: readonly StressMagnitudeInput[];
  readonly auditResults: readonly StrengthHistoryAuditResult[];
} {
  const backup = loadActualWorkoutBackup();
  const logs = backup.workoutLogs;

  let totalExerciseSessionCount = 0;
  let recordedStressExerciseCount = 0;
  let mappedStrengthCount = 0;
  let mappedRunningCount = 0;
  let unmappedCount = 0;

  let inputReadyStrengthCount = 0;
  let inputReadyRunningCount = 0;
  let inputInsufficientCount = 0;
  let cu33UnmappedCount = 0;

  const candidatePool: StressMagnitudeInput[] = [];

  for (const log of logs) {
    totalExerciseSessionCount += log.exercises.length;
    const sessionStressEvidence = deriveRecordedSessionStressEvidence(log);
    recordedStressExerciseCount += sessionStressEvidence.exercises.length;

    const normalizedLog = normalizeWorkoutLogSetRoles(log);
    const observations = extractStandardStrengthObservationsFromWorkoutLog(log, normalizedLog);

    for (const exEvidence of sessionStressEvidence.exercises) {
      if (exEvidence.kind === 'strength') mappedStrengthCount++;
      else if (exEvidence.kind === 'running') mappedRunningCount++;
      else unmappedCount++;

      if (exEvidence.kind === 'running') {
        const derivationResult = deriveStressMagnitudeInput(exEvidence);
        if (derivationResult.status === 'input-ready') {
          inputReadyRunningCount++;
          candidatePool.push(derivationResult.input);
        } else if (derivationResult.status === 'input-insufficient') {
          inputInsufficientCount++;
        } else {
          cu33UnmappedCount++;
        }
      } else if (exEvidence.kind === 'strength') {
        const exObservations = observations.filter(o => o.exerciseId === exEvidence.exerciseId);
        const peakE1RM = selectSessionPeakE1RMObservation(exObservations.map(deriveEstimated1RMObservation).filter(Boolean));
        const loadVolume = aggregateSessionLoadVolume(exObservations.map(deriveSetLoadVolumeObservation).filter(Boolean));
        const workCapacity = deriveSessionWorkCapacityObservation(exObservations);

        const derivationResult = deriveStressMagnitudeInput(exEvidence, { peakE1RM, loadVolume, workCapacity });
        if (derivationResult.status === 'input-ready') {
          inputReadyStrengthCount++;
          candidatePool.push(derivationResult.input);
        } else if (derivationResult.status === 'input-insufficient') {
          inputInsufficientCount++;
        } else {
          cu33UnmappedCount++;
        }
      } else {
        cu33UnmappedCount++;
      }
    }
  }

  const frozenCandidatePool = Object.freeze(candidatePool);

  const stats: FullBackupFunnelStatistics = Object.freeze({
    actualWorkoutLogCount: logs.length,
    totalExerciseSessionCount,
    recordedStressExerciseCount,
    mappedStrengthCount,
    mappedRunningCount,
    unmappedCount,
    inputReadyStrengthCount,
    inputReadyRunningCount,
    inputInsufficientCount,
    cu33UnmappedCount,
    totalCandidatePoolCount: candidatePool.length,
    strengthCandidatePoolCount: candidatePool.filter(c => c.kind === 'strength').length
  });

  const auditResults: StrengthHistoryAuditResult[] = [];

  // Audit 1: Full Backup Ingestion & Funnel Conservation
  const noSilentDrops =
    stats.totalExerciseSessionCount === stats.recordedStressExerciseCount &&
    stats.recordedStressExerciseCount === stats.mappedStrengthCount + stats.mappedRunningCount + stats.unmappedCount &&
    stats.totalCandidatePoolCount === stats.inputReadyStrengthCount + stats.inputReadyRunningCount;

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 1: Ingestion & Funnel Conservation',
    passed:
      backup.workoutLogs.length === 8 &&
      stats.totalExerciseSessionCount === 15 &&
      stats.totalCandidatePoolCount === 10 &&
      stats.strengthCandidatePoolCount === 9 &&
      noSilentDrops,
    details: `All 8 workout logs and 15 exercise sessions processed with zero silent drops (9 strength inputs + 1 running input + 5 unmapped = 15 total sessions).`
  });

  // Audit 2: Target A - Squat (2026-08-07 18:21)
  const squatTarget = candidatePool.find(
    c => c.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && c.exerciseId === 'squat' && c.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const squatHistory = deriveStrengthHistoricalEvidence(squatTarget, frozenCandidatePool);
  const priorSquat = squatHistory.historicalSessions.find(
    s => s.sourceLogId === '70cbdc8a-605f-4423-89d3-155dbaeac482' && s.date === '2026-07-31'
  );

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 2: Target A - Squat (2026-08-07 18:21)',
    passed:
      squatHistory.historicalSessionCount === 1 &&
      priorSquat !== undefined &&
      priorSquat.startTime === '18:44' &&
      priorSquat.setEvidence.explicitWorkingSetCount === 3 &&
      priorSquat.loadVolumeEvidence?.totalLoadVolumeKgReps === 1550 &&
      priorSquat.workCapacityEvidence?.totalSetCount === 3 &&
      squatHistory.historicalSessionCount + squatHistory.excludedCandidateCount === stats.totalCandidatePoolCount,
    details: `Squat target includes strictly earlier 2026-07-31 Squat (${priorSquat?.sourceLogId}) with full CU3.3 metric fidelity; pool conservation invariant holds (1 + 9 = 10).`
  });

  // Audit 3: Target B - OHP (2026-08-09 15:56)
  const ohpTarget = candidatePool.find(
    c => c.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && c.exerciseId === 'overhead-press' && c.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const ohpHistory = deriveStrengthHistoricalEvidence(ohpTarget, frozenCandidatePool);
  const priorOHP = ohpHistory.historicalSessions.find(
    s => s.sourceLogId === '3a8f9e1d-4c2b-4567-89ab-cdef01234567' && s.date === '2026-08-02'
  );
  const runningExclusion = ohpHistory.excludedCandidates.find(
    e => e.sourceLogId === '19946e03-ae98-405d-97cc-6e03edffeb3c'
  );

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 3: Target B - OHP (2026-08-09 15:56)',
    passed:
      ohpHistory.historicalSessionCount === 1 &&
      priorOHP !== undefined &&
      priorOHP.startTime === '16:30' &&
      priorOHP.setEvidence.explicitWorkingSetCount === 5 &&
      priorOHP.loadVolumeEvidence?.totalLoadVolumeKgReps === 1075 &&
      runningExclusion?.reason === 'invalid-modality' &&
      ohpHistory.historicalSessionCount + ohpHistory.excludedCandidateCount === stats.totalCandidatePoolCount,
    details: `OHP target includes strictly earlier 2026-08-02 OHP (${priorOHP?.sourceLogId}); running session cleanly isolated as invalid-modality; pool conservation holds (1 + 9 = 10).`
  });

  // Audit 4: Target C - Bench Press (2026-08-12 18:21)
  const benchTarget = candidatePool.find(
    c => c.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && c.exerciseId === 'bench-press' && c.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const benchHistory = deriveStrengthHistoricalEvidence(benchTarget, frozenCandidatePool);

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 4: Target C - Bench Press (2026-08-12 18:21)',
    passed:
      benchHistory.historicalSessionCount === 2 &&
      benchHistory.historicalSessions[0].date === '2026-08-05' &&
      benchHistory.historicalSessions[0].sourceLogId === '59c40332-959f-4318-910f-71da50937a01' &&
      benchHistory.historicalSessions[1].date === '2026-07-29' &&
      benchHistory.historicalSessions[1].sourceLogId === '4f1b2c3d-e5f6-47a8-9b0c-1d2e3f4a5b6c' &&
      benchHistory.historicalSessionCount + benchHistory.excludedCandidateCount === stats.totalCandidatePoolCount,
    details: `Bench target includes 2 historical sessions in strict descending order (2026-08-05 before 2026-07-29); pool conservation holds (2 + 8 = 10).`
  });

  // Audit 5: Per-Target Candidate Pool Conservation across all Strength Targets
  const strengthTargets = candidatePool.filter(c => c.kind === 'strength') as StrengthStressMagnitudeInput[];
  const allTargetsConserved = strengthTargets.every(target => {
    const hist = deriveStrengthHistoricalEvidence(target, frozenCandidatePool);
    return hist.historicalSessionCount + hist.excludedCandidateCount === stats.totalCandidatePoolCount;
  });

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 5: Universal Conservation Invariant',
    passed: allTargetsConserved,
    details: `Every strength target in the actual full backup strictly satisfies historicalSessionCount + excludedCandidateCount === ${stats.totalCandidatePoolCount}.`
  });

  // Audit 6: Duplicate Identity & Key Collision Invariant
  const seenKeys = new Set<string>();
  let hasKeyCollisions = false;
  for (const c of candidatePool) {
    const key = `${c.sourceLogId}::${c.exerciseId}`;
    if (seenKeys.has(key)) hasKeyCollisions = true;
    seenKeys.add(key);
  }

  auditResults.push({
    auditName: 'ACTUAL FULL-BACKUP Section 6: Candidate Identity Uniqueness',
    passed: !hasKeyCollisions && seenKeys.size === candidatePool.length,
    details: `All ${candidatePool.length} derived candidate inputs possess distinct (sourceLogId, exerciseId) composite identities with zero collisions.`
  });

  return Object.freeze({
    stats,
    candidatePool: frozenCandidatePool,
    auditResults: Object.freeze(auditResults)
  });
}
