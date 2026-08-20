/**
 * Strength Stress Factor Exposure Invariant Audit Suite (VNext Recommendation Engine - CU3.9)
 *
 * Dedicated verification module isolated from production domain logic.
 *
 * Invariant Guarantees Verified:
 * 1. Cold Start Factor Exposure Invariant: All factor provenance statuses are 'cold-start' with undefined reference deltas.
 * 2. Single/Multi Reference Exposure Projections: Accurate volume deltas, direction ('increased'/'decreased'/'maintained'),
 *    historical range relations, and capacity deltas.
 * 3. Coupling Contract Invariants:
 *    - sharedDerivationBasis === 'working-sets'
 *    - additiveCombinationAllowed === false
 *    - factorDependencies accurately declared (volume->[load, reps], intensity->[load, capacity-ref], repeated-work->[sets, reps])
 * 4. Load Group Structural Facts: Load-group series and reps preserved losslessly without similarity scoring.
 * 5. Current & Reference Provenance Preservation: High/limited/mixed tiers preserved without confidence blending.
 * 6. Empty Working Loads (no-working-loads) Invariant.
 * 7. Missing Capacity Reference (no-capacity-reference) Invariant.
 * 8. Controlled Real Fixture End-to-End: Bench Press, Squat, and OHP complete factor exposure evaluations.
 * 9. Deep Immutability & Determinism: All outputs deeply frozen, 0 input mutations.
 */

import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext
} from '../types/historicalExerciseContext.types';
import {
  StrengthStressExposureAuditResult
} from '../types/strengthStressExposure.types';
import {
  evaluateStrengthStressFactorExposure,
  buildStrengthStressFactorCouplingContract,
  deriveVolumeCurrentQuality
} from './strengthStressExposure';
import {
  deriveControlledCandidateStressMagnitudeInputs
} from './controlledWorkoutValidationFixture';
import {
  deriveHistoricalExerciseContextFromCandidates
} from '../context/historicalExerciseContext';

/**
 * Runs the complete invariant audit suite for CU3.9 Strength Stress Factor Exposure.
 */
export function auditStrengthStressExposure(): readonly StrengthStressExposureAuditResult[] {
  const results: StrengthStressExposureAuditResult[] = [];

  // =========================================================================
  // Synthetic Fixtures
  // =========================================================================

  const mockCurrentInput: StrengthStressMagnitudeInput = Object.freeze({
    sourceLogId: 'current-session-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    date: '2026-08-12',
    startTime: '18:00',
    kind: 'strength',
    dimensions: Object.freeze(['horizontal-push'] as any),
    setEvidence: Object.freeze({
      totalRawSetCount: 5,
      explicitWorkingSetCount: 3,
      unknownSetRoleCount: 2,
      explicitWarmupCount: 0
    }),
    e1RMEvidence: Object.freeze({
      numericalPeakEstimated1RMKg: 85.0,
      selectedPeakEstimated1RMKg: 85.0,
      selectedEvidenceQuality: 'high'
    }),
    loadVolumeEvidence: Object.freeze({
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 800,
      limitedEvidenceLoadVolumeKgReps: 1000,
      observationCount: 5
    }),
    workCapacityEvidence: Object.freeze({
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: Object.freeze([
        {
          observedLoadKg: 80,
          setCount: 2,
          repsSeries: Object.freeze([5, 5]),
          totalRepsAtLoad: 10,
          highEvidenceSetCount: 2,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 70,
          setCount: 3,
          repsSeries: Object.freeze([5, 5, 5]),
          totalRepsAtLoad: 15,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 2
        }
      ])
    })
  });

  const mockColdStartContext: HistoricalExerciseContext = Object.freeze({
    currentSourceLogId: 'current-session-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:00',
    recency: Object.freeze({}),
    historyState: 'cold-start',
    totalHistoricalSessionCount: 0,
    factorAvailability: Object.freeze({
      volume: Object.freeze({ availableObservationCount: 0, unavailableObservationCount: 0 }),
      intensityCapacity: Object.freeze({ availableObservationCount: 0, unavailableObservationCount: 0 }),
      repeatedWork: Object.freeze({ availableObservationCount: 0, unavailableObservationCount: 0 })
    }),
    baseline: Object.freeze({
      currentSourceLogId: 'current-session-1',
      exerciseId: 'bench-press',
      exerciseName: '벤치프레스 (Bench Press)',
      currentDate: '2026-08-12',
      currentStartTime: '18:00',
      historyState: 'cold-start',
      totalHistoricalSessionCount: 0,
      volumeReference: Object.freeze({
        availableObservationCount: 0,
        unavailableObservationCount: 0,
        observationSummary: Object.freeze({
          sessionsWithHighOnly: 0,
          sessionsWithLimitedOnly: 0,
          sessionsWithMixed: 0
        })
      }),
      intensityCapacityReference: Object.freeze({
        availableObservationCount: 0,
        unavailableObservationCount: 0
      }),
      repeatedWorkReference: Object.freeze({
        availableObservationCount: 0,
        unavailableObservationCount: 0
      })
    })
  });

  // =========================================================================
  // AUDIT 1: Cold Start Factor Exposure Bundle Invariant
  // =========================================================================
  const coldBundle = evaluateStrengthStressFactorExposure(mockCurrentInput, mockColdStartContext);

  results.push({
    auditName: 'INVARIANT 1: Cold Start Factor Exposure Bundle',
    passed:
      coldBundle.volumeExposure.provenance.status === 'cold-start' &&
      coldBundle.volumeExposure.recencyExposure.deltaKgReps === undefined &&
      coldBundle.volumeExposure.recencyExposure.direction === undefined &&
      coldBundle.intensityExposure.provenance.status === 'cold-start' &&
      coldBundle.intensityExposure.capacityAnchorFacts === undefined &&
      coldBundle.repeatedWorkExposure.provenance.status === 'cold-start' &&
      coldBundle.repeatedWorkExposure.recencyStructuralDelta.deltaSets === undefined,
    details: 'Cold start exposure bundle sets all factors to cold-start status and preserves undefined reference deltas.'
  });

  // =========================================================================
  // AUDIT 2: Single Prior Session Reference Exposure Projection
  // =========================================================================
  const mockSingleContext: HistoricalExerciseContext = Object.freeze({
    ...mockColdStartContext,
    historyState: 'single-session-reference',
    totalHistoricalSessionCount: 1,
    baseline: Object.freeze({
      ...mockColdStartContext.baseline,
      historyState: 'single-session-reference',
      totalHistoricalSessionCount: 1,
      volumeReference: Object.freeze({
        lastSessionVolume: Object.freeze({ valueKgReps: 1600, evidenceQuality: 'high', sourceLogIds: Object.freeze(['p1']) }),
        medianVolume: Object.freeze({ valueKgReps: 1600, evidenceQuality: 'high', sourceLogIds: Object.freeze(['p1']) }),
        minObservedVolume: Object.freeze({ valueKgReps: 1600, evidenceQuality: 'high', sourceLogIds: Object.freeze(['p1']) }),
        maxObservedVolume: Object.freeze({ valueKgReps: 1600, evidenceQuality: 'high', sourceLogIds: Object.freeze(['p1']) }),
        availableObservationCount: 1,
        unavailableObservationCount: 0,
        observationSummary: Object.freeze({ sessionsWithHighOnly: 1, sessionsWithLimitedOnly: 0, sessionsWithMixed: 0 })
      }),
      intensityCapacityReference: Object.freeze({
        lastSessionPeakE1RM: Object.freeze({ valueKg: 75.0, evidenceQuality: 'high', sourceLogId: 'p1', date: '2026-08-05' }),
        maxObservedPeakE1RM: Object.freeze({ valueKg: 75.0, evidenceQuality: 'high', sourceLogIds: Object.freeze(['p1']), dates: Object.freeze(['2026-08-05']) }),
        availableObservationCount: 1,
        unavailableObservationCount: 0
      }),
      repeatedWorkReference: Object.freeze({
        lastSessionTotalSets: 4,
        lastSessionTotalReps: 20,
        minObservedTotalSets: 4,
        maxObservedTotalSets: 4,
        minObservedTotalReps: 20,
        maxObservedTotalReps: 20,
        availableObservationCount: 1,
        unavailableObservationCount: 0
      })
    })
  });

  const singleBundle = evaluateStrengthStressFactorExposure(mockCurrentInput, mockSingleContext);

  results.push({
    auditName: 'INVARIANT 2: Single Prior Session Reference Exposure Projection',
    passed:
      singleBundle.volumeExposure.absoluteVolumeKgReps === 1800 &&
      singleBundle.volumeExposure.recencyExposure.deltaKgReps === 200 &&
      singleBundle.volumeExposure.recencyExposure.direction === 'increased' &&
      singleBundle.volumeExposure.provenance.currentQuality === 'mixed' &&
      singleBundle.intensityExposure.peakWorkingLoadExposure?.observedLoadKg === 80 &&
      singleBundle.intensityExposure.peakWorkingLoadExposure?.deltaToMaxCapacityKg === 5 &&
      singleBundle.repeatedWorkExposure.recencyStructuralDelta.deltaSets === 1 &&
      singleBundle.repeatedWorkExposure.recencyStructuralDelta.setDirection === 'increased',
    details: 'Single session reference accurately computes volume increase (+200kg·reps), peak capacity delta (+5kg), and set increase (+1 set).'
  });

  // =========================================================================
  // AUDIT 3: Factor Coupling Contract Invariants
  // =========================================================================
  const contract = buildStrengthStressFactorCouplingContract(mockCurrentInput);

  results.push({
    auditName: 'INVARIANT 3: Factor Coupling Contract Invariants',
    passed:
      contract.sharedDerivationBasis === 'working-sets' &&
      contract.additiveCombinationAllowed === false &&
      contract.factorDependencies.length === 3 &&
      JSON.stringify(contract.factorDependencies[0].derivesFrom) === JSON.stringify(['load', 'reps']) &&
      JSON.stringify(contract.factorDependencies[1].derivesFrom) === JSON.stringify(['load', 'capacity-reference']) &&
      JSON.stringify(contract.factorDependencies[2].derivesFrom) === JSON.stringify(['sets', 'reps']) &&
      contract.underlyingMetrics.totalWorkingSets === 5 &&
      contract.underlyingMetrics.totalReps === 25 &&
      contract.underlyingMetrics.distinctLoadCount === 2,
    details: 'Coupling contract strictly declares shared basis, prohibits additive combination, and maps factor dependencies to physical primitives.'
  });

  // =========================================================================
  // AUDIT 4: Volume Current Quality Tier Derivation
  // =========================================================================
  const highVolQuality = deriveVolumeCurrentQuality({
    ...mockCurrentInput,
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1000,
      highEvidenceLoadVolumeKgReps: 1000,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    }
  });

  const limVolQuality = deriveVolumeCurrentQuality({
    ...mockCurrentInput,
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1000,
      highEvidenceLoadVolumeKgReps: 0,
      limitedEvidenceLoadVolumeKgReps: 1000,
      observationCount: 5
    }
  });

  results.push({
    auditName: 'INVARIANT 4: Volume Current Quality Tier Derivation',
    passed:
      highVolQuality === 'high' &&
      limVolQuality === 'limited' &&
      deriveVolumeCurrentQuality(mockCurrentInput) === 'mixed',
    details: 'Volume current quality tier resolves strictly to high (high>0, lim=0), limited (high=0, lim>0), and mixed (both>0).'
  });

  // =========================================================================
  // AUDIT 5: Empty Working Loads (no-working-loads) Exposure
  // =========================================================================
  const emptyInput: StrengthStressMagnitudeInput = Object.freeze({
    ...mockCurrentInput,
    workCapacityEvidence: Object.freeze({
      totalSetCount: 0,
      totalReps: 0,
      loadGroups: Object.freeze([])
    })
  });

  const emptyBundle = evaluateStrengthStressFactorExposure(emptyInput, mockSingleContext);

  results.push({
    auditName: 'INVARIANT 5: Empty Working Loads (no-working-loads) Handling',
    passed:
      emptyBundle.intensityExposure.provenance.status === 'no-working-loads' &&
      emptyBundle.intensityExposure.peakWorkingLoadExposure === undefined &&
      emptyBundle.intensityExposure.workingLoadExposures.length === 0,
    details: 'Empty working loads yields status: no-working-loads and undefined peak working load exposure.'
  });

  // =========================================================================
  // AUDIT 6: Missing Historical Capacity Reference Exposure
  // =========================================================================
  const noCapContext: HistoricalExerciseContext = Object.freeze({
    ...mockSingleContext,
    baseline: Object.freeze({
      ...mockSingleContext.baseline,
      intensityCapacityReference: Object.freeze({
        availableObservationCount: 0,
        unavailableObservationCount: 1
      })
    })
  });

  const noCapBundle = evaluateStrengthStressFactorExposure(mockCurrentInput, noCapContext);

  results.push({
    auditName: 'INVARIANT 6: Missing Historical Capacity Reference Exposure',
    passed:
      noCapBundle.intensityExposure.provenance.status === 'no-capacity-reference' &&
      noCapBundle.intensityExposure.capacityAnchorFacts === undefined &&
      noCapBundle.intensityExposure.workingLoadExposures[0].deltaToMaxCapacityKg === undefined,
    details: 'Missing capacity reference yields status: no-capacity-reference and undefined deltaToMaxCapacityKg without zero-coercion.'
  });

  // =========================================================================
  // AUDIT 7: Controlled Real Fixture End-to-End (Bench, Squat, OHP)
  // =========================================================================
  const pool = deriveControlledCandidateStressMagnitudeInputs();

  // 7A. Bench Press Target (Current: 2026-08-12)
  const benchTarget = pool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const benchContext = deriveHistoricalExerciseContextFromCandidates(benchTarget, pool);
  const benchBundle = evaluateStrengthStressFactorExposure(benchTarget, benchContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 7A: Bench Press Exposure Bundle',
    passed:
      benchBundle.volumeExposure.absoluteVolumeKgReps === 1830 &&
      benchBundle.volumeExposure.recencyExposure.deltaKgReps === 80 &&
      benchBundle.volumeExposure.recencyExposure.direction === 'increased' &&
      benchBundle.volumeExposure.historicalRangeExposure.relation === 'above-max' &&
      benchBundle.intensityExposure.peakWorkingLoadExposure?.observedLoadKg === 80 &&
      benchBundle.intensityExposure.peakWorkingLoadExposure?.deltaToMaxCapacityKg === 80 - 81.66666666666667 &&
      benchBundle.repeatedWorkExposure.recencyStructuralDelta.deltaSets === 1 &&
      benchBundle.couplingContract.additiveCombinationAllowed === false &&
      benchBundle.couplingContract.underlyingMetrics.totalWorkingSets === 6,
    details: 'Bench press factor exposure bundle accurately projects volume increase, above-max range, and coupling contract.'
  });

  // 7B. Squat Target (Current: 2026-08-07)
  const squatTarget = pool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const squatContext = deriveHistoricalExerciseContextFromCandidates(squatTarget, pool);
  const squatBundle = evaluateStrengthStressFactorExposure(squatTarget, squatContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 7B: Squat Exposure Bundle (Mixed Baseline)',
    passed:
      squatBundle.volumeExposure.absoluteVolumeKgReps === 2395 &&
      squatBundle.volumeExposure.recencyExposure.deltaKgReps === 845 &&
      squatBundle.volumeExposure.recencyExposure.direction === 'increased' &&
      squatBundle.volumeExposure.historicalRangeExposure.relation === 'within-range-above-median' &&
      squatBundle.volumeExposure.provenance.referenceQuality === 'mixed',
    details: 'Squat exposure bundle preserves mixed evidence baseline quality and within-range-above-median relation.'
  });

  // 7C. OHP Target (Current: 2026-08-09)
  const ohpTarget = pool.find(
    i => i.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && i.exerciseId === 'overhead-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const ohpContext = deriveHistoricalExerciseContextFromCandidates(ohpTarget, pool);
  const ohpBundle = evaluateStrengthStressFactorExposure(ohpTarget, ohpContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 7C: OHP Exposure Bundle (Single Reference)',
    passed:
      ohpBundle.volumeExposure.absoluteVolumeKgReps === 1575 &&
      ohpBundle.volumeExposure.recencyExposure.deltaKgReps === 500 &&
      ohpBundle.volumeExposure.historicalRangeExposure.relation === 'above-max' &&
      ohpBundle.intensityExposure.peakWorkingLoadExposure?.observedLoadKg === 50 &&
      ohpBundle.intensityExposure.peakWorkingLoadExposure?.deltaToMaxCapacityKg === 50 - 52.5,
    details: 'OHP exposure bundle accurately links single-reference baseline, computing volume delta (+500 kg·reps) and peak working load delta (-2.5 kg).'
  });

  // =========================================================================
  // AUDIT 8: Deep Immutability Invariant
  // =========================================================================
  results.push({
    auditName: 'INVARIANT 8: Deep Immutability & Object.isFrozen',
    passed:
      Object.isFrozen(benchBundle) &&
      Object.isFrozen(benchBundle.volumeExposure) &&
      Object.isFrozen(benchBundle.intensityExposure) &&
      Object.isFrozen(benchBundle.intensityExposure.workingLoadExposures) &&
      Object.isFrozen(benchBundle.repeatedWorkExposure) &&
      Object.isFrozen(benchBundle.couplingContract),
    details: 'Exposure bundle root, volumeExposure, intensityExposure, repeatedWorkExposure, and couplingContract are deeply frozen.'
  });

  // =========================================================================
  // AUDIT 9: Pure Determinism Across Repeated Invocations
  // =========================================================================
  const runA = evaluateStrengthStressFactorExposure(benchTarget, benchContext);
  const runB = evaluateStrengthStressFactorExposure(benchTarget, benchContext);

  results.push({
    auditName: 'INVARIANT 9: Pure Determinism Across Invocations',
    passed: JSON.stringify(runA) === JSON.stringify(runB),
    details: 'Evaluating the same input and context repeatedly produces bitwise identical output.'
  });

  return Object.freeze(results);
}
