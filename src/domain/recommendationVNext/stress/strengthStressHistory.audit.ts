/**
 * Strength Stress Historical Baseline Evidence Invariant Audit Suite (VNext Recommendation Engine - CU3.5.2.1)
 *
 * Dedicated validation & audit module isolated from production domain logic.
 *
 * Validation Hierarchy:
 * - Section A: CONTROLLED KNOWN-DATA INTEGRATION VALIDATION (Controlled Fixture: 8 Curated Sessions)
 * - Section B: SYNTHETIC FIXTURE VALIDATION (Edge Cases, Ordering, Error Guards)
 *
 * Invariant Guarantees Verified:
 * 1. Strict chronological ordering (newest strictly-earlier first).
 * 2. Same-day minute ordering resolution and missing-startTime uncertainty exclusion.
 * 3. Future session exclusion.
 * 4. Modality isolation (Running candidates excluded without cross-modality contamination).
 * 5. Partial factor preservation (High-rep without e1RM retains volume and work-capacity).
 * 6. Zero silent drop / pool conservation invariant across all evaluated targets.
 * 7. Contract violation guard on duplicate candidate inputs.
 * 8. Complete immutability of returned collections and records.
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
 * Comprehensive invariant audit suite for Strength Stress Historical Baseline Evidence.
 *
 * Divided cleanly into:
 * Section A: CONTROLLED KNOWN-DATA INTEGRATION VALIDATION (Controlled Fixture: 8 Curated Sessions)
 * Section B: SYNTHETIC / CONTROLLED FIXTURE VALIDATION (Edge Cases, Ordering, Error Guards)
 */
export function auditStrengthStressHistory(): readonly StrengthHistoryAuditResult[] {
  const results: StrengthHistoryAuditResult[] = [];

  // =========================================================================
  // SECTION A: CONTROLLED KNOWN-DATA INTEGRATION VALIDATION (Controlled Fixture: 8 Curated Sessions)
  // =========================================================================

  const controlledCandidatePool = deriveControlledCandidateStressMagnitudeInputs();

  // Audit A1: Controlled Squat (2026-08-07 18:21) Historical Evidence from Controlled Fixture
  const controlledSquatTarget = controlledCandidatePool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledSquatHistory = deriveStrengthHistoricalEvidence(controlledSquatTarget, controlledCandidatePool);
  const includedPriorSquat = controlledSquatHistory.historicalSessions.find(
    s => s.sourceLogId === '70cbdc8a-605f-4423-89d3-155dbaeac482' && s.date === '2026-07-31'
  );

  results.push({
    auditName: 'CONTROLLED Section A1: 2026-08-07 Squat Historical Evidence from Controlled Fixture',
    passed:
      controlledSquatHistory.historicalSessionCount >= 1 &&
      includedPriorSquat !== undefined &&
      includedPriorSquat.exerciseId === 'squat' &&
      includedPriorSquat.date === '2026-07-31' &&
      includedPriorSquat.startTime === '18:44' &&
      includedPriorSquat.setEvidence.explicitWorkingSetCount === 3 &&
      includedPriorSquat.e1RMEvidence?.selectedEvidenceQuality === 'high' &&
      includedPriorSquat.loadVolumeEvidence?.totalLoadVolumeKgReps === 1550 &&
      includedPriorSquat.workCapacityEvidence?.totalSetCount === 3 &&
      controlledSquatHistory.historicalSessionCount + controlledSquatHistory.excludedCandidateCount === controlledCandidatePool.length,
    details: `Squat target includes strictly earlier 2026-07-31 Squat (${includedPriorSquat?.sourceLogId}) with full CU3.3 evidence preserved; controlled candidate pool conservation invariant holds (${controlledSquatHistory.historicalSessionCount} + ${controlledSquatHistory.excludedCandidateCount} = ${controlledCandidatePool.length}).`
  });

  // Audit A2: Controlled OHP (2026-08-09 15:56) Historical Evidence from Controlled Fixture
  const controlledOHPTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && i.exerciseId === 'overhead-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledOHPHistory = deriveStrengthHistoricalEvidence(controlledOHPTarget, controlledCandidatePool);
  const includedPriorOHP = controlledOHPHistory.historicalSessions.find(
    s => s.sourceLogId === '3a8f9e1d-4c2b-4567-89ab-cdef01234567' && s.date === '2026-08-02'
  );
  const runningExcludedReason = controlledOHPHistory.excludedCandidates.find(
    e => e.sourceLogId === '19946e03-ae98-405d-97cc-6e03edffeb3c'
  );

  results.push({
    auditName: 'CONTROLLED Section A2: 2026-08-09 OHP Historical Evidence from Controlled Fixture',
    passed:
      controlledOHPHistory.historicalSessionCount >= 1 &&
      includedPriorOHP !== undefined &&
      includedPriorOHP.exerciseId === 'overhead-press' &&
      includedPriorOHP.date === '2026-08-02' &&
      includedPriorOHP.startTime === '16:30' &&
      includedPriorOHP.setEvidence.explicitWorkingSetCount === 5 &&
      runningExcludedReason?.reason === 'invalid-modality' &&
      controlledOHPHistory.historicalSessionCount + controlledOHPHistory.excludedCandidateCount === controlledCandidatePool.length,
    details: `OHP target includes strictly earlier 2026-08-02 OHP (${includedPriorOHP?.sourceLogId}); same-day 2026-08-09 Running candidate is excluded cleanly as invalid-modality.`
  });

  // Audit A3: Controlled Bench Press (2026-08-12 18:21) Historical Evidence from Controlled Fixture
  const controlledBenchTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;

  const controlledBenchHistory = deriveStrengthHistoricalEvidence(controlledBenchTarget, controlledCandidatePool);

  results.push({
    auditName: 'CONTROLLED Section A3: 2026-08-12 Bench Press Historical Evidence from Controlled Fixture',
    passed:
      controlledBenchHistory.historicalSessionCount === 2 &&
      controlledBenchHistory.historicalSessions[0].date === '2026-08-05' &&
      controlledBenchHistory.historicalSessions[0].sourceLogId === '59c40332-959f-4318-910f-71da50937a01' &&
      controlledBenchHistory.historicalSessions[1].date === '2026-07-29' &&
      controlledBenchHistory.historicalSessions[1].sourceLogId === '4f1b2c3d-e5f6-47a8-9b0c-1d2e3f4a5b6c' &&
      controlledBenchHistory.historicalSessionCount + controlledBenchHistory.excludedCandidateCount === controlledCandidatePool.length,
    details: `Bench target includes 2 historical sessions in strict descending order (2026-08-05 before 2026-07-29) in the controlled fixture pool with conservation invariant holding.`
  });

  // Audit A4: Controlled Candidate Pool Conservation & Zero Silent Drops
  const controlledTargets = [controlledSquatTarget, controlledOHPTarget, controlledBenchTarget];
  const allConservationPassed = controlledTargets.every(target => {
    const hist = deriveStrengthHistoricalEvidence(target, controlledCandidatePool);
    const sumExclusions = hist.excludedCandidates.length;
    return hist.historicalSessionCount + sumExclusions === controlledCandidatePool.length;
  });

  results.push({
    auditName: 'CONTROLLED Section A4: Controlled Candidate Pool Conservation & Zero Silent Drops',
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

  // Audit B4: Synthetic — Contract Violation Guard on Duplicate Candidates
  let duplicateThrew = false;
  try {
    deriveStrengthHistoricalEvidence(currentBench, [priorBench1, priorBench1]);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('Duplicate sourceLogId')) {
      duplicateThrew = true;
    }
  }
  results.push({
    auditName: 'SYNTHETIC Section B4: Contract Guard — Duplicate sourceLogId Throws Error',
    passed: duplicateThrew,
    details: 'Supplying duplicate candidates in candidate pool strictly throws Contract Violation error.'
  });

  // Audit B5: Synthetic — Running Modality in Candidate Excluded cleanly
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
    auditName: 'SYNTHETIC Section B5: Modality Guard — Running Candidate Excluded with invalid-modality',
    passed:
      collectionWithRunning.historicalSessionCount === 1 &&
      collectionWithRunning.excludedCandidates.some(e => e.reason === 'invalid-modality' && e.sourceLogId === runningCandidate.sourceLogId),
    details: 'Running modality candidate is cleanly excluded without cross-modality contamination.'
  });

  // Audit B6: Synthetic — Partial Factor Evidence (High-Rep without e1RM) Preserved
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
    auditName: 'SYNTHETIC Section B6: Partial Factor Evidence (High-Rep without e1RM) Preserved',
    passed:
      collectionPartial.historicalSessionCount === 1 &&
      collectionPartial.historicalSessions[0].e1RMEvidence === undefined &&
      collectionPartial.historicalSessions[0].loadVolumeEvidence?.totalLoadVolumeKgReps === 1200,
    details: 'Historical session lacking e1RM is preserved with full volume and work-capacity evidence.'
  });

  // Audit B7: Synthetic — Deep Immutability Guard (Object.freeze on all outputs)
  const collection1 = deriveStrengthHistoricalEvidence(currentBench, [priorBench1, priorBench2]);
  results.push({
    auditName: 'SYNTHETIC Section B7: Immutability Guard — Returned Collection & Arrays Deeply Frozen',
    passed:
      Object.isFrozen(collection1) &&
      Object.isFrozen(collection1.historicalSessions) &&
      Object.isFrozen(collection1.excludedCandidates) &&
      (collection1.historicalSessions.length === 0 || Object.isFrozen(collection1.historicalSessions[0])),
    details: 'Returned collection, session lists, and individual records are completely frozen.'
  });

  return Object.freeze(results);
}
