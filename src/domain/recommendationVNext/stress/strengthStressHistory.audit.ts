/**
 * Strength Stress Historical Baseline Evidence Invariant Audit Suite (VNext Recommendation Engine - CU3.5.3A)
 *
 * Dedicated validation & audit module isolated from production domain logic.
 *
 * Scope & Freeze Boundary:
 * "CU3.5 Freeze는 Historical Collection Semantics에 대한 판정이며,
 * Actual Full Backup Exhaustive Coverage를 의미하지 않는다."
 *
 * Validation Hierarchy:
 * - Section A: REAL WORKOUT RECORD HISTORICAL VALIDATION (Known-Answer Cases: Squat, Bench, OHP, Legacy Squat, Same-Day Context)
 * - Section B: SYNTHETIC FIXTURE VALIDATION (Edge Cases, Ordering, Error Guards, Exclusions)
 *
 * Invariant Guarantees Verified:
 * 1. Strict chronological ordering (newest strictly-earlier first).
 * 2. Same-day minute ordering resolution and missing-startTime uncertainty exclusion.
 * 3. Future session exclusion.
 * 4. Different exercise exclusion.
 * 5. Current-session evaluation target exclusion.
 * 6. Modality isolation (Running candidates excluded without cross-modality contamination).
 * 7. Legacy provenance preservation (unknown-set-role records retained with limited evidence quality).
 * 8. Partial factor preservation (High-rep without e1RM retains volume and work-capacity).
 * 9. Zero silent drop / pool conservation invariant across all evaluated targets.
 * 10. Contract violation guard on duplicate candidate inputs.
 * 11. Complete immutability of returned collections and records.
 */

import { StressMagnitudeInput, StrengthStressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import {
  StrengthHistoryAuditResult
} from '../types/strengthStressHistory.types';
import {
  deriveStrengthHistoricalEvidence
} from './strengthStressHistory';
import {
  deriveControlledCandidateStressMagnitudeInputs
} from './controlledWorkoutValidationFixture';

/**
 * Comprehensive invariant audit suite for Strength Stress Historical Baseline Evidence (CU3.5.3A).
 *
 * Divided cleanly into:
 * Section A: REAL WORKOUT RECORD HISTORICAL VALIDATION (Known-Answer Cases)
 * Section B: SYNTHETIC / CONTROLLED FIXTURE VALIDATION (Edge Cases, Ordering, Error Guards)
 */
export function auditStrengthStressHistory(): readonly StrengthHistoryAuditResult[] {
  const results: StrengthHistoryAuditResult[] = [];

  // =========================================================================
  // SECTION A: REAL WORKOUT RECORD HISTORICAL VALIDATION (Known-Answer Cases)
  // =========================================================================

  const controlledCandidatePool = deriveControlledCandidateStressMagnitudeInputs();

  // Audit A1: Case 1 - Squat (Current: 2026-08-07 18:21, Prior: 2026-07-31 18:44)
  const controlledSquatTarget = controlledCandidatePool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledSquatHistory = deriveStrengthHistoricalEvidence(controlledSquatTarget, controlledCandidatePool);
  const includedPriorSquat = controlledSquatHistory.historicalSessions.find(
    s => s.sourceLogId === '70cbdc8a-605f-4423-89d3-155dbaeac482' && s.date === '2026-07-31'
  );

  results.push({
    auditName: 'KNOWN CASE 1: Squat (Current: 2026-08-07, Prior: 2026-07-31)',
    passed:
      includedPriorSquat !== undefined &&
      includedPriorSquat.exerciseId === 'squat' &&
      includedPriorSquat.date === '2026-07-31' &&
      includedPriorSquat.startTime === '18:44' &&
      includedPriorSquat.setEvidence.explicitWorkingSetCount === 3 &&
      includedPriorSquat.loadVolumeEvidence?.totalLoadVolumeKgReps === 1550 &&
      includedPriorSquat.workCapacityEvidence?.totalSetCount === 3 &&
      includedPriorSquat.workCapacityEvidence?.totalReps === 15,
    details: `Squat target includes strictly earlier 2026-07-31 Squat (${includedPriorSquat?.sourceLogId}) with volume 1550 kg·reps and work capacity 3 sets / 15 reps.`
  });

  // Audit A2: Case 2 - Bench Press (Current: 2026-08-12, Prior: 2026-08-05, 2026-07-29)
  const controlledBenchTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledBenchHistory = deriveStrengthHistoricalEvidence(controlledBenchTarget, controlledCandidatePool);
  const priorBench20260805 = controlledBenchHistory.historicalSessions.find(
    s => s.sourceLogId === '59c40332-959f-4318-910f-71da50937a01' && s.date === '2026-08-05'
  );
  const priorBench20260729 = controlledBenchHistory.historicalSessions.find(
    s => s.sourceLogId === '4f1b2c3d-e5f6-47a8-9b0c-1d2e3f4a5b6c' && s.date === '2026-07-29'
  );

  const benchIsNewestFirst =
    controlledBenchHistory.historicalSessions.length >= 2 &&
    controlledBenchHistory.historicalSessions[0].date === '2026-08-05' &&
    controlledBenchHistory.historicalSessions[1].date === '2026-07-29';

  results.push({
    auditName: 'KNOWN CASE 2: Bench Press (Current: 2026-08-12, Prior: 2026-08-05 & 2026-07-29)',
    passed:
      priorBench20260805 !== undefined &&
      priorBench20260729 !== undefined &&
      benchIsNewestFirst &&
      priorBench20260805.loadVolumeEvidence?.totalLoadVolumeKgReps === 1750 &&
      priorBench20260729.loadVolumeEvidence?.totalLoadVolumeKgReps === 1625,
    details: `Bench target includes both prior sessions in newest-first order (2026-08-05 before 2026-07-29) preserving volume 1750 and 1625 kg·reps.`
  });

  // Audit A3: Case 3 - OHP (Current: 2026-08-09, Prior: 2026-08-02)
  const controlledOHPTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && i.exerciseId === 'overhead-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledOHPHistory = deriveStrengthHistoricalEvidence(controlledOHPTarget, controlledCandidatePool);
  const includedPriorOHP = controlledOHPHistory.historicalSessions.find(
    s => s.sourceLogId === '3a8f9e1d-4c2b-4567-89ab-cdef01234567' && s.date === '2026-08-02'
  );

  results.push({
    auditName: 'KNOWN CASE 3: OHP (Current: 2026-08-09, Prior: 2026-08-02)',
    passed:
      includedPriorOHP !== undefined &&
      includedPriorOHP.exerciseId === 'overhead-press' &&
      includedPriorOHP.date === '2026-08-02' &&
      includedPriorOHP.startTime === '16:30' &&
      includedPriorOHP.setEvidence.explicitWorkingSetCount === 5 &&
      includedPriorOHP.loadVolumeEvidence?.totalLoadVolumeKgReps === 1075,
    details: `OHP target includes strictly earlier 2026-08-02 OHP (${includedPriorOHP?.sourceLogId}) with 5 working sets and volume 1075 kg·reps.`
  });

  // Audit A4: Case 4 - Legacy Squat (v1-log-2026-02-14-92)
  const legacySquatSession = controlledSquatHistory.historicalSessions.find(
    s => s.sourceLogId === 'v1-log-2026-02-14-92' && s.date === '2026-02-14'
  );

  const legacyLoadGroup60 = legacySquatSession?.workCapacityEvidence?.loadGroups.find(g => g.observedLoadKg === 60);
  const legacyLoadGroup80 = legacySquatSession?.workCapacityEvidence?.loadGroups.find(g => g.observedLoadKg === 80);

  results.push({
    auditName: 'KNOWN CASE 4: Legacy Squat (v1-log-2026-02-14-92 with unknown-set-role)',
    passed:
      legacySquatSession !== undefined &&
      legacySquatSession.setEvidence.unknownSetRoleCount === 4 &&
      legacySquatSession.setEvidence.explicitWorkingSetCount === 0 &&
      legacySquatSession.loadVolumeEvidence?.totalLoadVolumeKgReps === 2800 &&
      legacySquatSession.loadVolumeEvidence?.limitedEvidenceLoadVolumeKgReps === 2800 &&
      legacySquatSession.loadVolumeEvidence?.highEvidenceLoadVolumeKgReps === 0 &&
      legacySquatSession.workCapacityEvidence?.totalSetCount === 4 &&
      legacySquatSession.workCapacityEvidence?.totalReps === 40 &&
      legacySquatSession.e1RMEvidence?.selectedEvidenceQuality === 'limited' &&
      Math.abs((legacySquatSession.e1RMEvidence?.selectedPeakEstimated1RMKg ?? 0) - 106.6667) < 0.01 &&
      legacyLoadGroup60 !== undefined &&
      legacyLoadGroup60.setCount === 2 &&
      JSON.stringify(legacyLoadGroup60.repsSeries) === JSON.stringify([10, 10]) &&
      legacyLoadGroup80 !== undefined &&
      legacyLoadGroup80.setCount === 2 &&
      JSON.stringify(legacyLoadGroup80.repsSeries) === JSON.stringify([10, 10]),
    details: `Legacy Squat v1-log-2026-02-14-92 is retained in historical evidence with limited provenance intact, providing e1RM ~106.67 kg, volume 2800 kg·reps, and work capacity 60kg [10,10], 80kg [10,10] (total 4 sets / 40 reps).`
  });

  // Audit A5: Case 5 - Same-day Actual Context (2026-08-09 Running 13:56 vs OHP 15:56)
  const sameDayRunningExcluded = controlledOHPHistory.excludedCandidates.find(
    e => e.sourceLogId === '19946e03-ae98-405d-97cc-6e03edffeb3c' && e.date === '2026-08-09'
  );
  const runningInOHPHistory = controlledOHPHistory.historicalSessions.some(
    s => s.sourceLogId === '19946e03-ae98-405d-97cc-6e03edffeb3c'
  );

  results.push({
    auditName: 'KNOWN CASE 5: Same-day Actual Context (2026-08-09 Running 13:56 vs OHP 15:56)',
    passed:
      !runningInOHPHistory &&
      sameDayRunningExcluded !== undefined &&
      sameDayRunningExcluded.reason === 'invalid-modality' &&
      sameDayRunningExcluded.startTime === '13:56',
    details: `Running at 13:56 is chronology-earlier than OHP at 15:56, but is cleanly excluded with reason "invalid-modality" and zero contamination into Strength history.`
  });

  // Audit A6: Controlled Candidate Pool Conservation & Zero Silent Drops
  const controlledTargets = [controlledSquatTarget, controlledOHPTarget, controlledBenchTarget];
  const allConservationPassed = controlledTargets.every(target => {
    const hist = deriveStrengthHistoricalEvidence(target, controlledCandidatePool);
    const sumExclusions = hist.excludedCandidates.length;
    return hist.historicalSessionCount + sumExclusions === controlledCandidatePool.length;
  });

  results.push({
    auditName: 'CONTROLLED Section A6: Controlled Candidate Pool Conservation & Zero Silent Drops',
    passed: allConservationPassed,
    details: `For all evaluation targets, historicalSessionCount + sum(excludedCandidates) === ${controlledCandidatePool.length} with zero unclassified or dropped records in controlled pool.`
  });

  // =========================================================================
  // SECTION B: SYNTHETIC / CONTROLLED FIXTURE VALIDATION
  // =========================================================================

  const currentBench: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
    date: '2026-08-12',
    startTime: '18:21',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 10,
      explicitWorkingSetCount: 6,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 4
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 81.667,
      selectedPeakEstimated1RMKg: 81.667,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1830,
      highEvidenceLoadVolumeKgReps: 1830,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 6
    },
    workCapacityEvidence: {
      totalSetCount: 6,
      totalReps: 26,
      loadGroups: [
        {
          observedLoadKg: 80,
          setCount: 1,
          repsSeries: [1],
          totalRepsAtLoad: 1,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 70,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };

  const priorBench1: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'bench-hist-1',
    date: '2026-08-05',
    startTime: '18:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 5,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 78.333,
      selectedPeakEstimated1RMKg: 78.333,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1750,
      highEvidenceLoadVolumeKgReps: 1750,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: [
        {
          observedLoadKg: 70,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };

  const priorBench2: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'bench-hist-2',
    date: '2026-07-29',
    startTime: '19:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 5,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 75.0,
      selectedPeakEstimated1RMKg: 75.0,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1625,
      highEvidenceLoadVolumeKgReps: 1625,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: [
        {
          observedLoadKg: 65,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };

  const futureBench: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'bench-future-1',
    date: '2026-08-19',
    startTime: '18:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 5,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 1800,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: []
    }
  };

  const differentExerciseCandidate: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'deadlift-hist-1',
    date: '2026-08-04',
    startTime: '18:00',
    exerciseId: 'deadlift',
    exerciseName: '데드리프트 (Deadlift)',
    category: 'Back',
    dimensions: ['hip-posterior-chain'],
    setEvidence: {
      totalRawSetCount: 5,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 2000,
      highEvidenceLoadVolumeKgReps: 2000,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: []
    }
  };

  // Audit B1: Synthetic — Same-Day Earlier Session by Minute
  const sameDayEarlierBench: StrengthStressMagnitudeInput = {
    ...priorBench1,
    sourceLogId: 'bench-same-day-early',
    date: '2026-08-12',
    startTime: '09:00'
  };
  const sameDayCollection = deriveStrengthHistoricalEvidence(currentBench, [sameDayEarlierBench]);
  results.push({
    auditName: 'SYNTHETIC Section B1: Same-Day Earlier Session by Minute Ordering',
    passed:
      sameDayCollection.historicalSessionCount === 1 &&
      sameDayCollection.historicalSessions[0].sourceLogId === 'bench-same-day-early',
    details: 'Same-day session occurring at 09:00 is strictly earlier than session at 18:21 and included.'
  });

  // Audit B2: Synthetic — Same-Day Missing StartTime Ordering Uncertain
  const sameDayNoTimeBench: StrengthStressMagnitudeInput = {
    ...priorBench1,
    sourceLogId: 'bench-same-day-no-time',
    date: '2026-08-12',
    startTime: undefined
  };
  const sameDayNoTimeCollection = deriveStrengthHistoricalEvidence(currentBench, [sameDayNoTimeBench]);
  results.push({
    auditName: 'SYNTHETIC Section B2: Same-Day Missing StartTime Yields ordering-uncertain Exclusion',
    passed:
      sameDayNoTimeCollection.historicalSessionCount === 0 &&
      sameDayNoTimeCollection.excludedCandidates.some(e => e.reason === 'ordering-uncertain'),
    details: 'Same-day candidate lacking startTime cannot establish strict precedence and is excluded.'
  });

  // Audit B3: Synthetic — Future Session Exclusion
  const futureCollection = deriveStrengthHistoricalEvidence(currentBench, [futureBench]);
  results.push({
    auditName: 'SYNTHETIC Section B3: Strictly Future Session Exclusion',
    passed:
      futureCollection.historicalSessionCount === 0 &&
      futureCollection.excludedCandidates.some(e => e.reason === 'future-session'),
    details: 'Future session on 2026-08-19 relative to 2026-08-12 is strictly excluded.'
  });

  // Audit B4: Synthetic — Different Exercise Exclusion
  const diffExCollection = deriveStrengthHistoricalEvidence(currentBench, [differentExerciseCandidate]);
  results.push({
    auditName: 'SYNTHETIC Section B4: Different Exercise Exclusion (not-same-exercise)',
    passed:
      diffExCollection.historicalSessionCount === 0 &&
      diffExCollection.excludedCandidates.some(e => e.reason === 'not-same-exercise' && e.exerciseId === 'deadlift'),
    details: 'Candidate with different exerciseId ("deadlift") is cleanly excluded with reason "not-same-exercise".'
  });

  // Audit B5: Synthetic — Current Session Exclusion
  const currentSelfCollection = deriveStrengthHistoricalEvidence(currentBench, [currentBench]);
  results.push({
    auditName: 'SYNTHETIC Section B5: Current Session Self-Exclusion (current-session)',
    passed:
      currentSelfCollection.historicalSessionCount === 0 &&
      currentSelfCollection.excludedCandidates.some(e => e.reason === 'current-session' && e.sourceLogId === currentBench.sourceLogId),
    details: 'Evaluation target session is strictly excluded from its own historical baseline evidence.'
  });

  // Audit B6: Synthetic — Contract Violation Guard on Duplicate Candidates (sourceLogId + exerciseId composite identity)
  let duplicateThrew = false;
  try {
    deriveStrengthHistoricalEvidence(currentBench, [priorBench1, priorBench1]);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Duplicate sourceLogId')) {
      duplicateThrew = true;
    }
  }
  results.push({
    auditName: 'SYNTHETIC Section B6: Contract Guard — Duplicate (sourceLogId + exerciseId) Candidate Throws Error',
    passed: duplicateThrew,
    details: 'Supplying duplicate candidate entries with identical (sourceLogId, exerciseId) composite identity strictly throws Contract Violation error.'
  });

  // Audit B7: Synthetic — Running Modality in Candidate Excluded cleanly
  const runningCandidate: StressMagnitudeInput = {
    kind: 'running',
    sourceLogId: '19946e03-ae98-405d-97cc-6e03edffeb3c',
    date: '2026-08-09',
    startTime: '13:56',
    exerciseId: 'v1-custom----11',
    exerciseName: '야외 러닝',
    dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
    distanceKm: 3,
    durationSeconds: 870,
    paceSecondsPerKm: 290,
    metricProvenance: {
      distanceProvenance: 'explicit',
      durationProvenance: 'explicit',
      distanceLegacyConflict: false,
      durationLegacyConflict: false,
      hasLegacyConflict: false,
      sourceConfidence: 'high'
    }
  };
  const collectionWithRunning = deriveStrengthHistoricalEvidence(currentBench, [runningCandidate, priorBench1]);
  results.push({
    auditName: 'SYNTHETIC Section B7: Modality Guard — Running Candidate Excluded with invalid-modality',
    passed:
      collectionWithRunning.historicalSessionCount === 1 &&
      collectionWithRunning.excludedCandidates.some(e => e.reason === 'invalid-modality' && e.sourceLogId === runningCandidate.sourceLogId),
    details: 'Running modality candidate is cleanly excluded without cross-modality contamination.'
  });

  // Audit B8: Synthetic — Partial Factor Evidence (High-Rep without e1RM) Preserved
  const highRepBench: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'bench-high-rep-1',
    date: '2026-08-01',
    startTime: '10:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 1,
      explicitWorkingSetCount: 1,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1200,
      highEvidenceLoadVolumeKgReps: 1200,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 1
    },
    workCapacityEvidence: {
      totalSetCount: 1,
      totalReps: 30,
      loadGroups: [
        {
          observedLoadKg: 40,
          setCount: 1,
          repsSeries: [30],
          totalRepsAtLoad: 30,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const collectionPartial = deriveStrengthHistoricalEvidence(currentBench, [highRepBench]);
  results.push({
    auditName: 'SYNTHETIC Section B8: Partial Factor Evidence (High-Rep without e1RM) Preserved',
    passed:
      collectionPartial.historicalSessionCount === 1 &&
      collectionPartial.historicalSessions[0].e1RMEvidence === undefined &&
      collectionPartial.historicalSessions[0].loadVolumeEvidence?.totalLoadVolumeKgReps === 1200,
    details: 'Historical session lacking e1RM is preserved with full volume and work-capacity evidence.'
  });

  // Audit B9: Synthetic — Deep Immutability Guard (Object.freeze on all outputs)
  const collection1 = deriveStrengthHistoricalEvidence(currentBench, [priorBench1, priorBench2]);
  results.push({
    auditName: 'SYNTHETIC Section B9: Immutability Guard — Returned Collection & Arrays Deeply Frozen',
    passed:
      Object.isFrozen(collection1) &&
      Object.isFrozen(collection1.historicalSessions) &&
      Object.isFrozen(collection1.excludedCandidates) &&
      (collection1.historicalSessions.length === 0 || Object.isFrozen(collection1.historicalSessions[0])) &&
      (collection1.excludedCandidates.length === 0 || Object.isFrozen(collection1.excludedCandidates[0])),
    details: 'Returned collection, session lists, individual records, and exclusions are completely frozen.'
  });

  return Object.freeze(results);
}
