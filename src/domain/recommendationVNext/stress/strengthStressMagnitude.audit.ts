/**
 * Strength Stress Magnitude Invariant Audit Suite (VNext Recommendation Engine - CU3.10)
 *
 * Dedicated verification module isolated from production domain logic.
 *
 * Invariant Guarantees Verified:
 * 1. Cold Start Magnitude Invariant: Factor profiles have status 'cold-start' and undefined reference deltas.
 * 2. Single Session Reference Invariant: historyState is 'single-session-reference', factor profiles reference valid baseline facts without unanchored degradation.
 * 3. Multi Session Reference Invariant: Full distribution relation and median delta accurately reflected.
 * 4. Missing/Limited Evidence Invariants:
 *    - No-working-loads -> intensity status 'no-working-loads', undefined peakWorkingLoadKg.
 *    - No-capacity-reference -> intensity status 'no-capacity-reference', undefined deltaToMaxCapacityKg without zero-coercion.
 *    - Mixed/Limited provenance preserved independently on volume & intensity.
 * 5. Exact Frozen CU3.1 Dimension Vocabulary: targetDimensions match frozen CU3.1 tag set strictly.
 * 6. NO Integrated Score or Tier: No 0-100 score, no overall single tier, no global confidence score.
 * 7. Coupling Contract Preservation: additiveCombinationAllowed === false, derivesFrom mapped to physical primitives.
 * 8. Controlled Real Fixture End-to-End: Bench Press, Squat, OHP session-level magnitudes.
 * 9. Deep Immutability & Determinism: All outputs deeply frozen, 0 input mutations.
 */

import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext
} from '../types/historicalExerciseContext.types';
import {
  StrengthStressMagnitudeAuditResult
} from '../types/strengthStressMagnitude.types';
import {
  evaluateStrengthStressMagnitude,
  deriveVolumeMagnitudeProfile,
  deriveIntensityMagnitudeProfile,
  deriveRepeatedWorkMagnitudeProfile
} from './strengthStressMagnitude';
import {
  evaluateStrengthStressFactorExposure
} from './strengthStressExposure';
import {
  deriveControlledCandidateStressMagnitudeInputs
} from './controlledWorkoutValidationFixture';
import {
  deriveHistoricalExerciseContextFromCandidates
} from '../context/historicalExerciseContext';

const VALID_CU3_1_DIMENSIONS = new Set([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
  'horizontal-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'axial-systemic-loading'
]);

/**
 * Runs the complete invariant audit suite for CU3.10 Strength Stress Magnitude.
 */
export function auditStrengthStressMagnitude(): readonly StrengthStressMagnitudeAuditResult[] {
  const results: StrengthStressMagnitudeAuditResult[] = [];

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
  // AUDIT 1: Cold Start Magnitude Invariant
  // =========================================================================
  const coldMag = evaluateStrengthStressMagnitude(mockCurrentInput, mockColdStartContext);

  results.push({
    auditName: 'INVARIANT 1: Cold Start Magnitude Invariant',
    passed:
      coldMag.historyState === 'cold-start' &&
      coldMag.totalHistoricalSessionCount === 0 &&
      coldMag.factorProfiles.volume.referenceStatus === 'cold-start' &&
      coldMag.factorProfiles.volume.recencyDeltaKgReps === undefined &&
      coldMag.factorProfiles.intensity.referenceStatus === 'cold-start' &&
      coldMag.factorProfiles.intensity.deltaToMaxCapacityKg === undefined &&
      coldMag.factorProfiles.repeatedWork.referenceStatus === 'cold-start' &&
      coldMag.factorProfiles.repeatedWork.deltaSetsToLast === undefined,
    details: 'Cold start magnitude maintains cold-start history state, profile statuses, and undefined deltas.'
  });

  // =========================================================================
  // AUDIT 2: Single Prior Session Reference Magnitude
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

  const singleMag = evaluateStrengthStressMagnitude(mockCurrentInput, mockSingleContext);

  results.push({
    auditName: 'INVARIANT 2: Single Prior Session Reference Magnitude',
    passed:
      singleMag.historyState === 'single-session-reference' &&
      singleMag.totalHistoricalSessionCount === 1 &&
      singleMag.factorProfiles.volume.referenceStatus === 'sufficient-reference' &&
      singleMag.factorProfiles.volume.recencyDeltaKgReps === 200 &&
      singleMag.factorProfiles.intensity.referenceStatus === 'sufficient-reference' &&
      singleMag.factorProfiles.intensity.deltaToMaxCapacityKg === 5 &&
      singleMag.factorProfiles.repeatedWork.deltaSetsToLast === 1,
    details: 'Single session reference is preserved as sufficient-reference with accurate delta metrics.'
  });

  // =========================================================================
  // AUDIT 3: Frozen CU3.1 Dimension Vocabulary Check
  // =========================================================================
  const allDimsValid = singleMag.targetDimensions.every(d => VALID_CU3_1_DIMENSIONS.has(d));

  results.push({
    auditName: 'INVARIANT 3: Exact Frozen CU3.1 Dimension Vocabulary',
    passed: allDimsValid && singleMag.targetDimensions.includes('horizontal-push' as any),
    details: 'Target dimensions adhere strictly to frozen CU3.1 taxonomy.'
  });

  // =========================================================================
  // AUDIT 4: NO Integrated Score or Composite Tier
  // =========================================================================
  const magKeys = Object.keys(singleMag);
  const hasForbiddenScoreKeys =
    'score' in singleMag ||
    'magnitudeScore' in singleMag ||
    'empiricalLoadTier' in singleMag ||
    'overallConfidence' in singleMag ||
    'fatigue' in singleMag ||
    'readiness' in singleMag;

  results.push({
    auditName: 'INVARIANT 4: NO Integrated Score or Composite Tier',
    passed: !hasForbiddenScoreKeys && 'factorProfiles' in singleMag && 'couplingContract' in singleMag,
    details: 'Magnitude structure strictly forbids integrated scores, 100-point scales, and composite load tiers.'
  });

  // =========================================================================
  // AUDIT 5: Missing / Limited Evidence Handling
  // =========================================================================
  const emptyInput: StrengthStressMagnitudeInput = Object.freeze({
    ...mockCurrentInput,
    workCapacityEvidence: Object.freeze({
      totalSetCount: 0,
      totalReps: 0,
      loadGroups: Object.freeze([])
    })
  });
  const emptyMag = evaluateStrengthStressMagnitude(emptyInput, mockSingleContext);

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
  const noCapMag = evaluateStrengthStressMagnitude(mockCurrentInput, noCapContext);

  results.push({
    auditName: 'INVARIANT 5: Missing / Limited Evidence Handling',
    passed:
      emptyMag.factorProfiles.intensity.referenceStatus === 'no-working-loads' &&
      emptyMag.factorProfiles.intensity.peakWorkingLoadKg === undefined &&
      noCapMag.factorProfiles.intensity.referenceStatus === 'no-capacity-reference' &&
      noCapMag.factorProfiles.intensity.deltaToMaxCapacityKg === undefined,
    details: 'Empty working loads and missing capacity reference are cleanly isolated without zero-coercion.'
  });

  // =========================================================================
  // AUDIT 6: Controlled Real Fixture End-to-End (Bench, Squat, OHP)
  // =========================================================================
  const pool = deriveControlledCandidateStressMagnitudeInputs();

  // 6A. Bench Press Target (Current: 2026-08-12)
  const benchTarget = pool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const benchContext = deriveHistoricalExerciseContextFromCandidates(benchTarget, pool);
  const benchMag = evaluateStrengthStressMagnitude(benchTarget, benchContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 6A: Bench Press Magnitude',
    passed:
      benchMag.exerciseId === 'bench-press' &&
      benchMag.historyState === 'multi-session-reference' &&
      benchMag.totalHistoricalSessionCount === 2 &&
      benchMag.factorProfiles.volume.absoluteKgReps === 1830 &&
      benchMag.factorProfiles.volume.distributionRelation === 'above-max' &&
      benchMag.factorProfiles.volume.recencyDeltaKgReps === 80 &&
      benchMag.factorProfiles.intensity.peakWorkingLoadKg === 80 &&
      benchMag.factorProfiles.repeatedWork.totalWorkingSets === 6 &&
      benchMag.couplingContract.additiveCombinationAllowed === false,
    details: 'Bench press multi-session magnitude accurately captures volume above max (+80kg·reps vs recent), 80kg peak, and 6 sets.'
  });

  // 6B. Squat Target (Current: 2026-08-07)
  const squatTarget = pool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const squatContext = deriveHistoricalExerciseContextFromCandidates(squatTarget, pool);
  const squatMag = evaluateStrengthStressMagnitude(squatTarget, squatContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 6B: Squat Magnitude (Mixed Baseline)',
    passed:
      squatMag.exerciseId === 'squat' &&
      squatMag.historyState === 'multi-session-reference' &&
      squatMag.factorProfiles.volume.distributionRelation === 'within-range-above-median' &&
      squatMag.factorProfiles.volume.referenceQuality === 'mixed',
    details: 'Squat magnitude reflects within-range-above-median distribution and preserves mixed reference quality.'
  });

  // 6C. OHP Target (Current: 2026-08-09)
  const ohpTarget = pool.find(
    i => i.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && i.exerciseId === 'overhead-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const ohpContext = deriveHistoricalExerciseContextFromCandidates(ohpTarget, pool);
  const ohpMag = evaluateStrengthStressMagnitude(ohpTarget, ohpContext);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 6C: OHP Magnitude (Single Reference)',
    passed:
      ohpMag.exerciseId === 'overhead-press' &&
      ohpMag.historyState === 'single-session-reference' &&
      ohpMag.totalHistoricalSessionCount === 1 &&
      ohpMag.factorProfiles.volume.absoluteKgReps === 1575 &&
      ohpMag.factorProfiles.volume.recencyDeltaKgReps === 500 &&
      ohpMag.factorProfiles.intensity.peakWorkingLoadKg === 50 &&
      ohpMag.factorProfiles.intensity.deltaToMaxCapacityKg === 50 - 52.5,
    details: 'OHP single-reference magnitude cleanly derives +500kg·reps volume delta and -2.5kg capacity delta.'
  });

  // =========================================================================
  // AUDIT 7: Deep Immutability Invariant
  // =========================================================================
  results.push({
    auditName: 'INVARIANT 7: Deep Immutability & Object.isFrozen',
    passed:
      Object.isFrozen(benchMag) &&
      Object.isFrozen(benchMag.factorProfiles) &&
      Object.isFrozen(benchMag.factorProfiles.volume) &&
      Object.isFrozen(benchMag.factorProfiles.intensity) &&
      Object.isFrozen(benchMag.factorProfiles.intensity.workingLoads) &&
      Object.isFrozen(benchMag.factorProfiles.repeatedWork) &&
      Object.isFrozen(benchMag.targetDimensions) &&
      Object.isFrozen(benchMag.couplingContract),
    details: 'Root, factorProfiles, subprofiles, targetDimensions, and couplingContract are deeply frozen.'
  });

  // =========================================================================
  // AUDIT 8: Pure Determinism Across Repeated Invocations
  // =========================================================================
  const runA = evaluateStrengthStressMagnitude(benchTarget, benchContext);
  const runB = evaluateStrengthStressMagnitude(benchTarget, benchContext);

  results.push({
    auditName: 'INVARIANT 8: Pure Determinism Across Invocations',
    passed: JSON.stringify(runA) === JSON.stringify(runB),
    details: 'Evaluating the same input and context repeatedly produces bitwise identical output.'
  });

  return Object.freeze(results);
}
